"""Phase 2: score every configuration from the cached candidates (free, re-runnable).

Configurations share the same cached SQL, so differences come only from the
checking and decision logic:
  B0  baseline: the primary candidate, always answered
  B1  + deterministic checks, check-driven repair, clarify or hand off
  B2  + consensus over k candidates (majority answer; no majority -> clarify)
  B3  full trust layer: checks, repair, consensus and the calibrated decision

Usage:
  python -m backend.eval.evaluate --dataset trap
  python -m backend.eval.evaluate --dataset bird --fit     # fit calibration on the 'fit' half
Results are written to backend/eval/results/.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import subprocess
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import backend.eval  # noqa: F401  (must come first: forces the local control database)
from backend.app.config import settings
from backend.app.queries.executor import ExecutionResult
from backend.app.verification import candidate_from_result, confidence, run_checks, verify
from backend.app.verification.consensus import cluster, normalize_value
from backend.app.verification.models import result_preview
from backend.eval import metrics
from backend.eval.harness import (
    PROMPT_VERSION, RESULTS_DIR, Item, cache_path, catalog_for, load_items, make_runner, run_gold, split_of,
)

CONFIGS = ("B0", "B1", "B2", "B3")


def same_result(predicted: Optional[ExecutionResult], gold: Optional[ExecutionResult], lenient: bool = False) -> bool:
    """BIRD-style comparison: rows as sets of tuples, column names and order ignored.

    lenient (trap set only): extra columns are allowed if some choice of the
    predicted columns reproduces the gold rows, e.g. SELECT * instead of SELECT name.
    """
    if predicted is None or gold is None or predicted.error or gold.error:
        return False
    as_set = lambda rows: {tuple(normalize_value(value) for value in row) for row in rows}
    gold_rows = as_set(gold.rows)
    if as_set(predicted.rows) == gold_rows:
        return True
    if not lenient or not gold.rows or not predicted.rows:
        return False
    width = len(gold.rows[0])
    columns = len(predicted.rows[0])
    if columns <= width or columns > 12:
        return False
    from itertools import permutations
    for chosen in permutations(range(columns), width):
        if as_set([[row[i] for i in chosen] for row in predicted.rows]) == gold_rows:
            return True
    return False


def _decide(features: Dict[str, float], blocking: bool, options: int, model: Dict[str, Any], penalty: float) -> tuple[str, float]:
    p = confidence.probability(features, model)
    if blocking:
        return "handoff", p
    if options >= 2:
        return "clarify", p
    if p >= confidence.threshold(penalty):
        return "confident", p
    return "handoff", p


async def score_item(item: Item, record: Dict[str, Any], gold: Optional[ExecutionResult]) -> Dict[str, Any]:
    catalog = catalog_for(str(item.db_path))
    run = make_runner(item.db_path, catalog)
    lenient = item.dataset == "trap"

    async def execute(sql: str) -> Optional[ExecutionResult]:
        return await run(sql) if sql else None

    primary_sql = record["primary_attempts"][-1]["sql"]
    primary_result = await execute(primary_sql)
    primary_ok = primary_result is not None and not primary_result.error
    out: Dict[str, Any] = {
        "dataset": item.dataset, "id": item.id, "question": item.question, "expected": item.expected,
        "trap": item.trap, "language": item.language, "difficulty": item.difficulty, "split": split_of(item),
        "cost_usd": record.get("cost_usd", 0.0), "calls": record.get("calls", 0),
    }

    def verdict(result: Optional[ExecutionResult], outcome: str) -> Dict[str, Any]:
        answered = metrics.is_answered(outcome)
        return {"outcome": outcome, "correct": bool(answered and item.expected == "answer" and same_result(result, gold, lenient))}

    # B0: always answer the primary candidate.
    out["B0"] = {**verdict(primary_result, "answer" if primary_ok else "handoff"), "sql": primary_sql, "preview": result_preview(primary_result)}

    # B1: checks with one check-driven repair.
    b1_sql, b1_result, repaired, b1_findings, b1_options = primary_sql, primary_result, False, [], []
    if primary_ok:
        b1_findings, b1_options, _ = await run_checks(question=item.question, sql=primary_sql, dialect="sqlite", catalog=catalog, run_sql=run, result=primary_result)
        if any(f.severity == "blocking" for f in b1_findings) and record.get("check_repair") and record["check_repair"].get("sql"):
            repair_result = await execute(record["check_repair"]["sql"])
            if repair_result is not None and not repair_result.error:
                b1_sql, b1_result, repaired = record["check_repair"]["sql"], repair_result, True
                b1_findings, b1_options, _ = await run_checks(question=item.question, sql=b1_sql, dialect="sqlite", catalog=catalog, run_sql=run, result=repair_result)
    if not primary_ok:
        b1_outcome = "handoff"
    elif any(f.severity == "blocking" for f in b1_findings):
        b1_outcome = "handoff"
    elif b1_options:
        b1_outcome = "clarify"
    else:
        b1_outcome = "answer"
    out["B1"] = {**verdict(b1_result, b1_outcome), "sql": b1_sql, "repaired": repaired, "findings": [f.title for f in b1_findings]}

    # B2: consensus over the primary and the variants, without checks.
    candidates = [candidate_from_result("cand_primary", primary_sql, primary_result)]
    for index, variant in enumerate(record.get("variants") or [], start=1):
        candidates.append(candidate_from_result(f"cand_{index}", variant.get("sql", ""), await execute(variant.get("sql", ""))))
    groups = cluster(candidates)
    succeeded = sum(1 for c in candidates if c.ok)
    if not groups:
        out["B2"] = {**verdict(None, "handoff"), "agreement": 0.0}
    elif len(groups) > 1 and len(groups[0]) * 2 <= succeeded:
        out["B2"] = {**verdict(None, "clarify"), "agreement": round(len(groups[0]) / succeeded, 3)}
    else:
        top = groups[0]
        chosen = next((c for c in top if c.candidate_id == "cand_primary"), top[0])
        out["B2"] = {**verdict(chosen.result, "answer"), "agreement": round(len(top) / succeeded, 3), "sql": chosen.sql}

    # B3: the full trust layer (verify), using the check-repaired primary.
    b3_candidates = [candidate_from_result("cand_primary", b1_sql, b1_result)] + candidates[1:]
    verification = await verify(
        question=item.question, dialect="sqlite", catalog=catalog, run_sql=run, candidates=b3_candidates,
        primary_id="cand_primary", penalty=settings.VERIFY_DEFAULT_PENALTY, repairs=int(repaired),
    )
    selected = next((c for c in b3_candidates if c.candidate_id == verification.selected_candidate_id), None)
    out["B3"] = {
        **verdict(selected.result if selected else None, verification.outcome),
        "sql": selected.sql if selected else "",
        "preview": selected.preview if selected else "",
        "p": verification.probability,
        "features": verification.features,
        "blocking": any(f.severity == "blocking" for f in verification.findings),
        "options": len(verification.clarify_options),
        "findings": [{"check": f.check, "severity": f.severity, "title": f.title} for f in verification.findings],
        # correctness of the selected answer, regardless of outcome (for calibration)
        "selected_correct": bool(item.expected == "answer" and selected is not None and same_result(selected.result, gold, lenient)),
    }
    return out


def _git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return "unknown"


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", choices=["trap", "bird"], required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--k", type=int, default=3)
    parser.add_argument("--with-evidence", action="store_true")
    parser.add_argument("--model", default=settings.OPENROUTER_EXECUTION_MODEL)
    parser.add_argument("--fit", action="store_true", help="fit the confidence model on this dataset's 'fit' half (saved to results/calibration-<dataset>.json)")
    args = parser.parse_args()

    items = load_items(args.dataset, args.limit)
    scored: List[Dict[str, Any]] = []
    missing = 0
    for index, item in enumerate(items, 1):
        path = cache_path(item, args.model, args.k, args.with_evidence)
        if not path.exists():
            missing += 1
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        gold = await run_gold(item) if item.expected == "answer" else None
        scored.append(await score_item(item, record, gold))
        if len(scored) % 50 == 0 or len(scored) == len(items):
            print(f"  {len(scored)}/{len(items)} scored", flush=True)
    if missing:
        print(f"Note: {missing} questions have no cached generation yet (run generate.py).")
    if not scored:
        raise SystemExit("Nothing to evaluate.")

    penalty = settings.VERIFY_DEFAULT_PENALTY
    # Calibration is domain-specific: a model fitted on BIRD does not transfer to a
    # company's own schema. Each dataset uses its own fitted calibration if one
    # exists, otherwise the default prior; the app's calibration.json is never written here.
    calibration_file = RESULTS_DIR / f"calibration-{args.dataset}{'-evidence' if args.with_evidence else ''}.json"
    model_used = json.loads(calibration_file.read_text(encoding="utf-8")) if calibration_file.exists() else confidence.DEFAULT_MODEL
    if args.fit:
        fit_rows = [r for r in scored if r["split"] == "fit" and r["expected"] == "answer"]
        fitted = metrics.fit_logistic(
            [r["B3"]["features"] for r in fit_rows], [int(r["B3"]["selected_correct"]) for r in fit_rows], confidence.FEATURES
        )
        if fitted:
            fitted.update({"source": f"fitted on {len(fit_rows)} '{args.dataset}' fit-split questions", "fitted_at": datetime.now(timezone.utc).isoformat(), "commit": _git_commit()})
            RESULTS_DIR.mkdir(parents=True, exist_ok=True)
            calibration_file.write_text(json.dumps(fitted, indent=2), encoding="utf-8")
            model_used = fitted
            print(f"Saved calibration fitted on {len(fit_rows)} questions to {calibration_file}")
        else:
            print("Calibration not fitted: the fit split needs both correct and wrong answers.")

    # Re-decide B3 with the model in use, so reported outcomes reflect the (fitted) calibration.
    for record in scored:
        b3 = record["B3"]
        outcome, p = _decide(b3["features"], b3["blocking"], b3["options"], model_used, penalty)
        b3["p"] = round(p, 4)
        b3["outcome"] = outcome
        b3["correct"] = bool(metrics.is_answered(outcome) and b3["selected_correct"])
        # The same decision at each penalty's own threshold c / (1 + c).
        for c in metrics.PENALTIES:
            outcome_c, _ = _decide(b3["features"], b3["blocking"], b3["options"], model_used, c)
            record[f"B3_c{c}"] = {"outcome": outcome_c, "correct": bool(metrics.is_answered(outcome_c) and b3["selected_correct"])}

    report: Dict[str, Any] = {
        "dataset": args.dataset,
        "model": args.model,
        "k": args.k,
        "with_evidence": args.with_evidence,
        "prompt_version": PROMPT_VERSION,
        "penalty": penalty,
        "threshold": confidence.threshold(penalty),
        "calibration": model_used.get("source"),
        "commit": _git_commit(),
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "total_generation_cost_usd": round(sum(r["cost_usd"] for r in scored), 4),
        "splits": {},
    }
    for split in ("test", "all"):
        subset = scored if split == "all" else [r for r in scored if r["split"] == "test"]
        confidence_points = [{"p": r["B3"]["p"], "correct": r["B3"]["selected_correct"]} for r in subset if r["expected"] == "answer"]
        by_group: Dict[str, Any] = {}
        group_key = "trap" if args.dataset == "trap" else "difficulty"
        for group in sorted({r[group_key] for r in subset}):
            members = [r for r in subset if r[group_key] == group]
            by_group[group] = {config: metrics.summarize(members, config) for config in CONFIGS}
        # Report each language separately before claiming multilingual support.
        by_language = {
            language: {config: metrics.summarize([r for r in subset if r["language"] == language], config) for config in CONFIGS}
            for language in sorted({r["language"] for r in subset})
        }
        report["splits"][split] = {
            "n": len(subset),
            "configs": {config: metrics.summarize(subset, config) for config in CONFIGS + tuple(f"B3_c{c}" for c in metrics.PENALTIES)},
            "by_" + group_key: by_group,
            "by_language": by_language,
            "risk_coverage_B3": metrics.risk_coverage(confidence_points),
            "calibration_B3": metrics.expected_calibration_error(confidence_points),
        }
    report["items"] = scored

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    suffix = "-evidence" if args.with_evidence else ""
    out_path = RESULTS_DIR / f"{args.dataset}{suffix}.json"
    out_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")

    print(f"\n{args.dataset}: {len(scored)} questions (test split {report['splits']['test']['n']}), commit {report['commit']}")
    header = f"{'config':6} {'coverage':>9} {'sel.risk':>9} {'silent err':>11} {'EX':>7} {'RS c=4':>8} {'catch':>7} {'false alarm':>12}"
    for split in ("test", "all"):
        print(f"\n[{split}]\n{header}")
        for config in CONFIGS + tuple(f"B3_c{c}" for c in metrics.PENALTIES):
            m = report["splits"][split]["configs"][config]
            if not m.get("n"):
                continue
            print(f"{config:6} {m['coverage']:>9.3f} {m['selective_risk']:>9.3f} {m['silent_error_rate']:>11.3f} "
                  f"{(m['execution_accuracy'] or 0):>7.3f} {m['reliability_score_c4']:>8.3f} "
                  f"{(m.get('catch_rate') or 0):>7.3f} {(m.get('false_alarm_rate') or 0):>12.3f}")
    languages = report["splits"]["all"]["by_language"]
    if len(languages) > 1:
        print("\n[all, by language]  silent errors B0 -> B3, B3 coverage, B3 false alarms")
        for language, configs in languages.items():
            b0, b3 = configs["B0"], configs["B3"]
            print(f"  {language:6} n={b3['n']:>3}  {b0['silent_error_rate']:.3f} -> {b3['silent_error_rate']:.3f}  "
                  f"cov {b3['coverage']:.3f}  FA {(b3.get('false_alarm_rate') or 0):.3f}")
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
