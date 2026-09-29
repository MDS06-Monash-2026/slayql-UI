"""How quickly analyst reviews make SlayQL's confidence trustworthy on a new database (free).

Simulates the review queue on a scored dataset: n reviewed answers from the fit
half become labels, the workspace model is refitted exactly as the app does
(backend/app/verification/learning.py), and the held-out test half is scored.
Each n is repeated over random review orders and averaged.

Two review regimes are compared, because in the app most reviews are hand-offs:
  random     analysts spot-check a random sample of answers
  handoffs   labels come only from answers the default model would not give as fact

Usage:  python -m backend.eval.learning_curve --dataset bird
Reads results/<dataset>.json (run evaluate.py first); writes results/learning-<dataset>.json.
"""
from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timezone
from statistics import mean
from typing import Any, Dict, List, Sequence

import backend.eval  # noqa: F401  (must come first: forces the local control database)
from backend.app.verification import confidence
from backend.app.verification.learning import fit_with_prior
from backend.eval import metrics
from backend.eval.harness import RESULTS_DIR

SIZES = (0, 10, 20, 40, 80, 160, 267)
REPEATS = 20


def decide(record: Dict[str, Any], model: Dict[str, Any], penalty: float) -> Dict[str, Any]:
    b3 = record["B3"]
    p = confidence.probability(b3["features"], model)
    if b3["blocking"]:
        outcome = "handoff"
    elif b3["options"] >= 2:
        outcome = "clarify"
    else:
        outcome = "confident" if p >= confidence.threshold(penalty) else "handoff"
    return {"outcome": outcome, "correct": bool(metrics.is_answered(outcome) and b3["selected_correct"]), "p": p}


def score(test: Sequence[Dict[str, Any]], model: Dict[str, Any]) -> Dict[str, float]:
    points = [{"p": confidence.probability(r["B3"]["features"], model), "correct": r["B3"]["selected_correct"]} for r in test]
    out = {
        "ece": metrics.expected_calibration_error(points)["ece"],
        "brier": round(mean((pt["p"] - (1.0 if pt["correct"] else 0.0)) ** 2 for pt in points), 4),
        "aurc": metrics.risk_coverage(points)["aurc"],
        "mean_confidence": round(mean(pt["p"] for pt in points), 4),
        "accuracy": round(mean(1.0 if pt["correct"] else 0.0 for pt in points), 4),
    }
    for c in metrics.PENALTIES:
        records = [{**r, "D": decide(r, model, c)} for r in test]
        summary = metrics.summarize(records, "D")
        out[f"coverage_c{c}"] = summary["coverage"]
        out[f"silent_error_c{c}"] = summary["silent_error_rate"]
        out[f"selective_risk_c{c}"] = summary["selective_risk"]
        out[f"rs_c{c}"] = summary[f"reliability_score_c{c}"]
    return out


def average(runs: List[Dict[str, float]]) -> Dict[str, float]:
    return {key: round(mean(run[key] for run in runs if run[key] is not None), 4) for key in runs[0]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset", choices=["trap", "bird", "distributor"], default="bird")
    parser.add_argument("--repeats", type=int, default=REPEATS)
    args = parser.parse_args()

    report = json.loads((RESULTS_DIR / f"{args.dataset}.json").read_text(encoding="utf-8"))
    items = [r for r in report["items"] if r["expected"] == "answer" and r["B3"].get("features")]
    fit = [r for r in items if r["split"] == "fit"]
    test = [r for r in items if r["split"] == "test"]
    prior = confidence.DEFAULT_MODEL
    penalty = 4
    handoff_pool = [r for r in fit if not metrics.is_answered(decide(r, prior, penalty)["outcome"])]

    regimes: Dict[str, Any] = {}
    for regime, pool in (("random", fit), ("handoffs", handoff_pool)):
        curve = []
        for size in SIZES:
            if size > len(pool):
                break
            runs = []
            for seed in range(args.repeats if 0 < size < len(pool) else 1):
                sample = random.Random(seed).sample(pool, size)
                labels = [int(r["B3"]["selected_correct"]) for r in sample]
                model = fit_with_prior([r["B3"]["features"] for r in sample], labels, prior) if sample else prior
                runs.append(score(test, model))
            curve.append({"reviews": size, **average(runs)})
        regimes[regime] = curve

    out = {
        "dataset": args.dataset,
        "fit_pool": len(fit),
        "handoff_pool": len(handoff_pool),
        "test": len(test),
        "repeats": args.repeats,
        "prior": prior.get("source"),
        "source_results": {"commit": report.get("commit"), "evaluated_at": report.get("evaluated_at"), "model": report.get("model")},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "regimes": regimes,
    }
    path = RESULTS_DIR / f"learning-{args.dataset}.json"
    path.write_text(json.dumps(out, indent=2), encoding="utf-8")

    print(f"{args.dataset}: {len(test)} test questions, accuracy of selected answers {out['regimes']['random'][0]['accuracy']:.3f}")
    for regime, curve in regimes.items():
        print(f"\n[{regime}]  reviews   ECE    Brier  mean p   cov c=1  silent c=1  cov c=4  silent c=4  RS c=4")
        for point in curve:
            print(f"  {point['reviews']:>13}  {point['ece']:.3f}  {point['brier']:.3f}  {point['mean_confidence']:.3f}   "
                  f"{point['coverage_c1']:.3f}    {point['silent_error_c1']:.3f}      {point['coverage_c4']:.3f}    "
                  f"{point['silent_error_c4']:.3f}     {point['rs_c4']:.3f}")
    print(f"\nWrote {path}")


if __name__ == "__main__":
    main()
