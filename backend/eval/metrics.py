"""Evaluation metrics: coverage, risk, silent errors, reliability score and calibration."""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Sequence

ANSWERED = {"answer", "confident", "caveat"}
PENALTIES = (1, 4, 9)


def is_answered(outcome: str) -> bool:
    return outcome in ANSWERED


def summarize(records: Sequence[Dict[str, Any]], config: str, baseline: str = "B0") -> Dict[str, Any]:
    """Metrics for one configuration. Each record holds records[config] = {outcome, correct}."""
    n = len(records)
    if not n:
        return {"n": 0}
    answered = [r for r in records if is_answered(r[config]["outcome"])]
    correct = [r for r in answered if r[config]["correct"]]
    wrong = [r for r in answered if not r[config]["correct"]]
    answerable = [r for r in records if r["expected"] == "answer"]
    metrics: Dict[str, Any] = {
        "n": n,
        "answered": len(answered),
        "correct_answers": len(correct),
        "wrong_answers": len(wrong),
        "clarified": sum(1 for r in records if r[config]["outcome"] == "clarify"),
        "handed_off": sum(1 for r in records if r[config]["outcome"] == "handoff"),
        "coverage": round(len(answered) / n, 4),
        "selective_risk": round(len(wrong) / len(answered), 4) if answered else 0.0,
        "silent_error_rate": round(len(wrong) / n, 4),
        "execution_accuracy": round(sum(1 for r in answerable if is_answered(r[config]["outcome"]) and r[config]["correct"]) / len(answerable), 4) if answerable else None,
    }
    for c in PENALTIES:
        metrics[f"reliability_score_c{c}"] = round(reliability_score(records, config, c), 4)
    if config != baseline:
        base_wrong = [r for r in records if is_answered(r[baseline]["outcome"]) and not r[baseline]["correct"]]
        base_right = [r for r in records if is_answered(r[baseline]["outcome"]) and r[baseline]["correct"]]
        metrics["catch_rate"] = round(
            sum(1 for r in base_wrong if not (is_answered(r[config]["outcome"]) and not r[config]["correct"])) / len(base_wrong), 4
        ) if base_wrong else None
        metrics["false_alarm_rate"] = round(
            sum(1 for r in base_right if not is_answered(r[config]["outcome"])) / len(base_right), 4
        ) if base_right else None
    return metrics


def reliability_score(records: Sequence[Dict[str, Any]], config: str, penalty: float) -> float:
    """TrustSQL-style score: +1 correct answer, -c wrong answer, 0 abstaining on an
    answerable question; +1 abstaining and -c answering when the right move is to ask or hand off."""
    total = 0.0
    for record in records:
        outcome, correct = record[config]["outcome"], record[config]["correct"]
        if record["expected"] == "answer" or (is_answered(outcome) and correct):
            # (the second case: a valid reading of an ambiguous question, its assumption stated)
            if is_answered(outcome):
                total += 1.0 if correct else -penalty
        else:
            total += -penalty if is_answered(outcome) else 1.0
    return total / len(records) if records else 0.0


def risk_coverage(points: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Curve over confidence thresholds. Each point: {"p": float, "correct": bool}."""
    ranked = sorted(points, key=lambda point: -point["p"])
    curve = []
    wrong = 0
    for index, point in enumerate(ranked, start=1):
        wrong += 0 if point["correct"] else 1
        curve.append({"coverage": round(index / len(ranked), 4), "risk": round(wrong / index, 4), "threshold": round(point["p"], 4)})
    aurc = sum(point["risk"] for point in curve) / len(curve) if curve else None
    return {"curve": curve, "aurc": round(aurc, 4) if aurc is not None else None}


def expected_calibration_error(points: Sequence[Dict[str, Any]], bins: int = 10) -> Dict[str, Any]:
    buckets: List[List[Dict[str, Any]]] = [[] for _ in range(bins)]
    for point in points:
        buckets[min(bins - 1, int(point["p"] * bins))].append(point)
    ece = 0.0
    diagram = []
    for index, bucket in enumerate(buckets):
        if not bucket:
            continue
        confidence = sum(p["p"] for p in bucket) / len(bucket)
        accuracy = sum(1 for p in bucket if p["correct"]) / len(bucket)
        ece += len(bucket) / len(points) * abs(confidence - accuracy)
        diagram.append({"bin": index, "n": len(bucket), "confidence": round(confidence, 4), "accuracy": round(accuracy, 4)})
    return {"ece": round(ece, 4) if points else None, "reliability_diagram": diagram}


def fit_logistic(rows: Sequence[Dict[str, float]], labels: Sequence[int], feature_names: Sequence[str],
                 l2: float = 0.5, iterations: int = 4000, learning_rate: float = 0.2) -> Optional[Dict[str, Any]]:
    """Plain gradient-descent logistic regression with light L2, to avoid a numpy dependency."""
    if len(set(labels)) < 2:
        return None
    weights = {name: 0.0 for name in feature_names}
    bias = 0.0
    n = len(rows)
    for _ in range(iterations):
        grad_w = {name: 0.0 for name in feature_names}
        grad_b = 0.0
        for row, label in zip(rows, labels):
            z = bias + sum(weights[name] * row.get(name, 0.0) for name in feature_names)
            p = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, z))))
            error = p - label
            grad_b += error
            for name in feature_names:
                grad_w[name] += error * row.get(name, 0.0)
        bias -= learning_rate * grad_b / n
        for name in feature_names:
            weights[name] -= learning_rate * (grad_w[name] / n + l2 * weights[name] / n)
    return {"bias": round(bias, 4), "weights": {k: round(v, 4) for k, v in weights.items()}}
