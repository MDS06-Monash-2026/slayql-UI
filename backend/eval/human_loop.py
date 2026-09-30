"""End-to-end accuracy with a person in the loop, simulated by a second model.

The trust layer asks (clarify) or escalates (hand-off) instead of guessing. Those
questions still need an answer, so this measures what happens after a person responds:

- no human: clarify and hand-off stay unanswered (today's published numbers);
- simulated human: a second model plays two roles, kept apart on purpose.
  The user who asked picks a clarify option. They know what they meant: a plain
  sentence describing the intended answer, never the SQL. The analyst reviews a
  hand-off with the schema, SlayQL's SQL and findings, and read-only SQL access.
  The analyst never sees the right answer and can confirm, correct or decline.
- perfect human: every clarify and hand-off resolved correctly (the upper bound).

Everything is still scored against the gold SQL; the simulated analyst's own accuracy
is reported, since a wrong analyst decision is a real risk and not ground truth.

Run after evaluate.py (it replays the B3 outcomes stored in results/<dataset>.json):
    python -m backend.eval.human_loop --dataset distributor --human-model moonshotai/Kimi-K3
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from typing import Any, Dict, List, Optional

import backend.eval  # noqa: F401  (forces the local control database)
from backend.app.providers.llm_client import ProviderError, llm_client
from backend.eval.harness import CACHE_DIR, RESULTS_DIR, Item, catalog_for, load_items, make_runner, run_readings, with_definitions
from backend.eval.evaluate import same_result
from backend.app.workbench.trusted_report import schema_text

MAX_ANALYST_STEPS = 6

INTENT_RULES = """You describe what a business user meant by a question, given the SQL that computes the answer they
wanted. Write ONE plain sentence a manager would say, naming every choice the SQL makes that the question leaves
open (which records count, which amount column, which period). No SQL, no table or column names in code form.
Return JSON: {"intent": "..."}"""

USER_RULES = """You are the business user who asked the question below. You know exactly what you meant (your intent).
SlayQL could not tell which meaning you intended and offers these readings, each with its result. Pick the one that
matches your intent. If none matches, answer "none". Return JSON: {"choice": <option number or "none">, "why": "..."}"""

ANALYST_RULES = """You are the data analyst at this company. SlayQL was not confident enough to answer a colleague's
question and sent it to you, with the SQL it wrote and what its checks found. You can run read-only SQL (SQLite) to
inspect the data. Decide one of:
- "confirm": SlayQL's SQL answers the question correctly as it stands;
- "correct": the right answer needs different SQL (give it);
- "unanswerable": this database cannot answer the question (say why).
Each turn return exactly one JSON object:
{"action": "run_sql", "sql": "SELECT ..."}  to look at the data, or
{"action": "final", "decision": "confirm" | "correct" | "unanswerable", "sql": "SELECT ... (for correct)", "why": "..."}
You have at most %d turns, so decide by then.""" % MAX_ANALYST_STEPS


async def _ask(model: str, messages: List[Dict[str, str]], max_tokens: int = 1500) -> Optional[Dict[str, Any]]:
    for attempt in range(6):
        content: List[str] = []
        try:
            async for event in llm_client._stream_completion(
                requested_model_id=model, messages=messages, session_id=None, max_tokens=max_tokens,
                reasoning_effort="minimal", fallback_text="", use_requested_model=True,
            ):
                if event.get("type") == "content_delta":
                    content.append(event.get("delta", ""))
            break
        except ProviderError:
            # Rate limits come and go; a provider error is never recorded as the person's answer.
            if attempt == 5:
                raise
            await asyncio.sleep(20 * (attempt + 1))
    text = "".join(content)
    # Read the first complete JSON object: models sometimes repeat it or add text after it.
    decoder = json.JSONDecoder()
    start = text.find("{")
    while start >= 0:
        try:
            value, _ = decoder.raw_decode(text, start)
            if isinstance(value, dict):
                return value
        except ValueError:
            pass
        start = text.find("{", start + 1)
    return None


def _cache(kind: str, model: str, key: str) -> Any:
    digest = hashlib.sha1(f"{kind}|{model}|{key}".encode()).hexdigest()[:20]
    path = CACHE_DIR / "human" / f"{kind}-{digest}.json"
    return path


async def _cached(kind: str, model: str, key: str, compute) -> Any:
    path = _cache(kind, model, key)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    value = await compute()
    if value is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, default=str), encoding="utf-8")
    return value


async def intent_of(item: Item, model: str, sql: Optional[str] = None) -> str:
    sql = sql or item.gold_sql
    value = await _cached("intent", model, f"{item.dataset}|{item.id}|{sql}", lambda: _ask(model, [
        {"role": "system", "content": INTENT_RULES},
        {"role": "user", "content": json.dumps({"question": item.question, "sql": sql})},
    ], 400))
    return (value or {}).get("intent", "")


async def simulated_user(item: Item, options: List[Dict[str, Any]], model: str, meant_sql: Optional[str] = None) -> Optional[int]:
    intent = await intent_of(item, model, meant_sql)
    shown = [{"option": i + 1, "reading": o["label"], "result": o["preview"]} for i, o in enumerate(options)]
    value = await _cached("user", model, f"{item.dataset}|{item.id}|{meant_sql or ''}|{json.dumps(shown)}", lambda: _ask(model, [
        {"role": "system", "content": USER_RULES},
        {"role": "user", "content": json.dumps({"question": item.question, "your_intent": intent, "options": shown})},
    ], 400))
    choice = (value or {}).get("choice")
    try:
        index = int(choice) - 1
    except (TypeError, ValueError):
        return None
    return index if 0 <= index < len(options) else None


async def simulated_analyst(item: Item, b3: Dict[str, Any], model: str) -> Dict[str, Any]:
    catalog = catalog_for(str(item.db_path))
    run = make_runner(item.db_path, catalog)

    async def review() -> Dict[str, Any]:
        brief = {
            "question": item.question,
            "slayql_sql": b3.get("sql") or "(no query ran)",
            "slayql_result": b3.get("preview") or "",
            "checks": [f"{f.get('title')}: {f.get('detail', '')}" for f in b3.get("findings", [])],
            "schema": schema_text(catalog, list(catalog.tables)[:40]),
        }
        messages = [{"role": "system", "content": ANALYST_RULES}, {"role": "user", "content": json.dumps(brief, default=str)}]
        steps = []
        for _ in range(MAX_ANALYST_STEPS):
            reply = await _ask(model, messages)
            if not reply:
                reply = await _ask(model, messages + [{"role": "user", "content": "Reply with exactly one JSON object as described."}])
            if not reply:
                break
            messages.append({"role": "assistant", "content": json.dumps(reply)})
            if reply.get("action") == "final":
                return {"decision": reply.get("decision"), "sql": reply.get("sql") or "", "why": reply.get("why", ""), "steps": steps}
            result = await run(str(reply.get("sql") or ""))
            shown = {"error": result.error} if result.error else {"columns": result.columns, "rows": result.rows[:20], "row_count": result.row_count}
            steps.append(reply.get("sql"))
            messages.append({"role": "user", "content": json.dumps({"result": shown}, default=str)})
        return {"decision": "undecided", "sql": "", "why": "no decision within the turn limit", "steps": steps}

    return await _cached("analyst", model, f"v2|{item.dataset}|{item.id}|{b3.get('sql')}", review)


async def resolve(item: Item, record: Dict[str, Any], golds, model: str) -> Dict[str, Any]:
    """What happens to one question with the simulated person in the loop."""
    catalog = catalog_for(str(item.db_path))
    run = make_runner(item.db_path, catalog)
    b3, default = record["B3"], record.get("B3_c4") or record["B3"]
    intended = [g for g in golds[:1]]  # the asker meant the gold reading

    async def matches(sql: str, readings) -> bool:
        if not sql:
            return False
        result = await run(sql)
        return not result.error and any(same_result(result, gold, True) for gold in readings)

    outcome = default["outcome"]
    if outcome in {"confident", "caveat", "answer"}:
        return {"path": "answered", "correct": bool(default["correct"]), "person": False}
    if outcome == "clarify" and b3.get("clarify_options"):
        choice = await simulated_user(item, b3["clarify_options"], model)
        if choice is not None:
            sql = b3["clarify_options"][choice]["sql"]
            right = await matches(sql, intended) if item.expected != "handoff" else False
            return {"path": "clarified", "correct": right, "person": True, "choice": choice}
        # "None of these": the question goes to the analyst.
    review = await simulated_analyst(item, b3, model)
    decision = review.get("decision")
    if item.expected == "handoff":
        right = decision == "unanswerable"
    elif decision == "confirm":
        right = await matches(b3.get("sql") or "", golds)
    elif decision == "correct":
        right = await matches(review.get("sql") or "", golds)
    else:
        right = False
    return {"path": "analyst", "correct": right, "person": True, "decision": decision,
            "delivered_wrong": decision in {"confirm", "correct"} and not right, "steps": len(review.get("steps", []))}


async def reading_picks(item: Item, record: Dict[str, Any], model: str) -> List[Dict[str, Any]]:
    """For a clarify question, simulate a user meaning each valid reading in turn."""
    options = record["B3"].get("clarify_options") or []
    if (record.get("B3_c4") or record["B3"])["outcome"] != "clarify" or not options:
        return []
    catalog = catalog_for(str(item.db_path))
    run = make_runner(item.db_path, catalog)
    option_results = [await run(o["sql"]) for o in options]
    picks = []
    for reading in [item.gold_sql] + list(item.alternatives):
        meant = await run(reading)
        if meant.error:
            continue
        matching = [i for i, r in enumerate(option_results) if not r.error and same_result(r, meant, True)]
        if not matching:
            continue  # SlayQL did not offer this reading; nothing to pick.
        choice = await simulated_user(item, options, model, reading)
        picks.append({"id": item.id, "reading": reading, "matching": matching, "choice": choice, "right": choice in matching})
    return picks


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", choices=["trap", "distributor"], required=True)
    parser.add_argument("--human-model", required=True, help="the model that plays the user and the analyst")
    parser.add_argument("--definitions", choices=["", "pack"], default="")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--label", default="", help="the --label used with evaluate.py")
    args = parser.parse_args()

    suffix = (f"-{args.definitions}" if args.definitions else "") + (f"-{args.label}" if args.label else "")
    report = json.loads((RESULTS_DIR / f"{args.dataset}{suffix}.json").read_text(encoding="utf-8"))
    records = {r["id"]: r for r in report["items"]}
    items = load_items(args.dataset)
    if args.definitions:
        items = with_definitions(items)
    items = [item for item in items if item.id in records]
    semaphore = asyncio.Semaphore(args.concurrency)

    async def one(item: Item) -> Dict[str, Any]:
        async with semaphore:
            golds = await run_readings(item) if item.expected in ("answer", "clarify") else []
            outcome = await resolve(item, records[item.id], golds, args.human_model)
            return {"id": item.id, "expected": item.expected, "language": item.language, **outcome}

    rows = await asyncio.gather(*(one(item) for item in items))

    async def picks_for(item: Item) -> List[Dict[str, Any]]:
        async with semaphore:
            return await reading_picks(item, records[item.id], args.human_model)

    picks = [p for group in await asyncio.gather(*(picks_for(item) for item in items)) for p in group]
    n = len(rows)
    answered = [r for r in rows if r["path"] == "answered"]
    involved = [r for r in rows if r["person"]]
    analyst = [r for r in rows if r["path"] == "analyst"]
    summary = {
        "no_human": {
            "correct": sum(r["correct"] for r in answered) / n,
            "wrong_delivered": sum(not r["correct"] for r in answered) / n,
            "unanswered": len(involved) / n,
        },
        "simulated_human": {
            "correct": sum(r["correct"] for r in rows) / n,
            "wrong_delivered_by_slayql": sum(not r["correct"] for r in answered) / n,
            # A person signed off on a wrong answer: a clarify pick that was not what they meant, or an
            # analyst's confirm or correction that is wrong. "Undecided" delivers nothing, so it is unresolved.
            "wrong_after_review": sum(1 for r in rows if r["person"] and not r["correct"]
                                      and (r["path"] == "clarified" or r.get("decision") in {"confirm", "correct"})) / n,
            "unresolved": sum(1 for r in rows if r["person"] and not r["correct"] and r.get("decision") in {"undecided", None}
                              and r["path"] == "analyst") / n,
            "needed_a_person": len(involved) / n,
            "analyst_accuracy": (sum(r["correct"] for r in analyst) / len(analyst)) if analyst else None,
        },
        "perfect_human": {
            "correct": (sum(r["correct"] for r in answered) + len(involved)) / n,
            "needed_a_person": len(involved) / n,
        },
    }
    summary["clarify_readings"] = {
        "tested": len(picks),
        "picked_the_meant_option": (sum(p["right"] for p in picks) / len(picks)) if picks else None,
    }
    out = {"dataset": args.dataset, "definitions": args.definitions or "none", "human_model": args.human_model,
           "generation_model": report.get("model"), "n": n, "summary": summary, "items": rows, "reading_picks": picks}
    path = RESULTS_DIR / f"human-loop-{args.dataset}{suffix}.json"
    path.write_text(json.dumps(out, indent=2, default=str), encoding="utf-8")

    print(f"\n{args.dataset}{suffix}: {n} questions, person simulated by {args.human_model}")
    print(f"{'':22} {'correct':>8} {'wrong shown':>12} {'needed a person':>16}")
    s = summary
    print(f"{'No human':22} {s['no_human']['correct']:8.1%} {s['no_human']['wrong_delivered']:12.1%} {'(unanswered ' + format(s['no_human']['unanswered'], '.0%') + ')':>16}")
    sh = s["simulated_human"]
    print(f"{'Simulated human':22} {sh['correct']:8.1%} {sh["wrong_delivered_by_slayql"] + sh["wrong_after_review"]:12.1%} {sh['needed_a_person']:16.1%}")
    if sh["unresolved"]:
        print(f"{'':22} (unresolved by the simulated analyst: {sh['unresolved']:.1%})")
    print(f"{'Perfect human':22} {s['perfect_human']['correct']:8.1%} {s['no_human']['wrong_delivered']:12.1%} {s['perfect_human']['needed_a_person']:16.1%}")
    if picks:
        print(f"Clarify: for {len(picks)} (question, meaning) pairs, the simulated user picked the option giving that meaning "
              f"{summary['clarify_readings']['picked_the_meant_option']:.0%} of the time.")
    if sh["analyst_accuracy"] is not None:
        print(f"Simulated analyst right on {sh['analyst_accuracy']:.0%} of {len(analyst)} reviews.")
    print(f"Wrote {path}")


if __name__ == "__main__":
    asyncio.run(main())
