"""Phase 1: generate and cache candidate SQL for every question (the only paid phase).

For each question it records, like the live pipeline at medium effort:
- the primary candidate, with up to one repair after a validation or execution error;
- a check-repair candidate, when the trust-layer checks found a blocking problem;
- k-1 independent variant candidates for consensus.

Usage:
  python -m backend.eval.generate --dataset trap
  python -m backend.eval.generate --dataset bird --limit 50 --budget 20
Cached questions are skipped, so an interrupted run resumes where it stopped.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time
from typing import Any, Dict, List

import backend.eval  # noqa: F401  (must come first: forces the local control database)
from backend.app.agent.candidates import generate_variants
from backend.app.config import settings
from backend.app.providers.openrouter_client import openrouter_client
from backend.app.queries.validator import SqlValidator
from backend.app.verification import repair_feedback, run_checks
from backend.eval.harness import MAX_ROWS, Item, cache_path, catalog_for, context_for, load_items, make_runner

EFFORT = "medium"
REASONING_EFFORT = "medium"
MAX_TOKENS = 1500
CALL_TIMEOUT_SECONDS = 180


class Budget:
    def __init__(self, cap_usd: float) -> None:
        self.cap = cap_usd
        self.spent = 0.0

    def add(self, usage: Dict[str, Any]) -> None:
        self.spent += float((usage or {}).get("cost") or 0.0)

    @property
    def exhausted(self) -> bool:
        return self.spent >= self.cap


async def _one_sql(ctx: Dict[str, Any], model: str, feedback: str = "") -> Dict[str, Any]:
    usage: Dict[str, Any] = {}
    completed: Dict[str, Any] = {}
    started = time.perf_counter()

    async def consume() -> None:
        nonlocal usage, completed
        async for event in openrouter_client.stream_sql(
            requested_model_id=model,
            question=ctx["question"],
            dialect="sqlite",
            schema_context=ctx["schema_context"],
            grounding_hints=ctx["grounding_hints"],
            retrieval_context=ctx["retrieval_context"],
            repair_feedback=feedback,
            reasoning_effort=REASONING_EFFORT,
            max_tokens=MAX_TOKENS,
        ):
            if event["type"] == "usage":
                usage = event.get("usage") or usage
            elif event["type"] == "completed":
                completed = event

    try:
        # A provider stream can stall without closing; never let one call hang the run.
        await asyncio.wait_for(consume(), timeout=CALL_TIMEOUT_SECONDS)
    except Exception as error:
        return {"sql": "", "usage": usage, "error": str(error)[:300], "latency_ms": int((time.perf_counter() - started) * 1000)}
    return {
        "sql": (completed.get("extracted_sql") or "").strip(),
        "usage": completed.get("usage") or usage,
        "error": None,
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }


async def generate_item(item: Item, model: str, k: int, with_evidence: bool, budget: Budget) -> Dict[str, Any]:
    catalog = catalog_for(str(item.db_path))
    ctx = context_for(item, catalog, with_evidence)
    run = make_runner(item.db_path, catalog)
    calls: List[Dict[str, Any]] = []

    primary = await _one_sql(ctx, model)
    calls.append(primary)
    attempts = [primary]
    validation = SqlValidator.validate_and_sanitize(sql=primary["sql"], dialect="sqlite", catalog=catalog, max_rows=MAX_ROWS)
    result = await run(primary["sql"]) if validation.is_valid else None
    if not validation.is_valid or (result is not None and result.error):
        error = validation.error_message if not validation.is_valid else result.error
        feedback = f"The previous SQL failed. Correct it using only the verified schema. Feedback: {error}"
        repaired = await _one_sql(ctx, model, feedback)
        calls.append(repaired)
        attempts.append(repaired)
        result = await run(repaired["sql"])
    final_primary = attempts[-1]

    check_repair = None
    if result is not None and not result.error:
        findings, _, _ = await run_checks(
            question=item.question, sql=final_primary["sql"], dialect="sqlite",
            catalog=catalog, run_sql=run, result=result,
        )
        hint = repair_feedback(findings)
        if hint:
            check_repair = await _one_sql(ctx, model, "The previous SQL ran, but SlayQL's answer checks found a problem. " + hint)
            check_repair["feedback"] = hint
            calls.append(check_repair)

    variants = await generate_variants(
        count=max(0, k - 1), requested_model_id=model, question=ctx["question"], dialect="sqlite",
        schema_context=ctx["schema_context"], grounding_hints=ctx["grounding_hints"],
        retrieval_context=ctx["retrieval_context"], reasoning_effort=REASONING_EFFORT, max_tokens=MAX_TOKENS,
    )
    calls.extend(variants)
    for call in calls:
        budget.add(call.get("usage") or {})
    return {
        "dataset": item.dataset,
        "id": item.id,
        "question": item.question,
        "model": model,
        "k": k,
        "with_evidence": with_evidence,
        "primary_attempts": attempts,
        "check_repair": check_repair,
        "variants": variants,
        "cost_usd": sum(float((c.get("usage") or {}).get("cost") or 0) for c in calls),
        "tokens": sum(int((c.get("usage") or {}).get("total_tokens") or 0) for c in calls),
        "calls": len(calls),
        "generation_latency_ms": sum(int(c.get("latency_ms") or 0) for c in calls),
    }


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", choices=["trap", "bird"], required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--k", type=int, default=3, help="candidates per question (primary + k-1 variants)")
    parser.add_argument("--budget", type=float, default=20.0, help="stop once this many USD have been spent in this run")
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--with-evidence", action="store_true", help="append BIRD's evidence hint to each question")
    parser.add_argument("--model", default=settings.OPENROUTER_EXECUTION_MODEL)
    args = parser.parse_args()

    if not openrouter_client.api_key:
        raise SystemExit("No OpenRouter key configured.")
    items = load_items(args.dataset, args.limit)
    todo = [item for item in items if not cache_path(item, args.model, args.k, args.with_evidence).exists()]
    print(f"{len(items)} questions, {len(items) - len(todo)} cached, {len(todo)} to generate with {args.model} (k={args.k})")

    budget = Budget(args.budget)
    semaphore = asyncio.Semaphore(args.concurrency)
    done = 0

    async def worker(item: Item) -> None:
        nonlocal done
        async with semaphore:
            if budget.exhausted:
                return
            record = await generate_item(item, args.model, args.k, args.with_evidence, budget)
            path = cache_path(item, args.model, args.k, args.with_evidence)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(record, default=str), encoding="utf-8")
            done += 1
            if done % 10 == 0 or done == len(todo):
                print(f"  {done}/{len(todo)} generated, USD {budget.spent:.4f} spent, {budget.spent / done:.5f} per question")

    await asyncio.gather(*(worker(item) for item in todo))
    if budget.exhausted:
        print(f"Stopped at the USD {args.budget} budget cap; re-run to resume.")
    print(f"Finished: {done} generated, USD {budget.spent:.4f} spent this run.")


if __name__ == "__main__":
    asyncio.run(main())
