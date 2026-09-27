"""Confidence score and the answer/abstain decision.

P(correct) is a logistic model over verification features. Default weights are
a hand-set prior; `backend/eval/evaluate.py --fit` replaces them with weights
fitted on the calibration half of the evaluation data (calibration.json).
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict, List

from backend.app.verification.models import Finding

CALIBRATION_PATH = Path(__file__).with_name("calibration.json")

FEATURES = (
    "agreement",          # share of successful candidates in the top result cluster
    "single_candidate",   # 1 when only one candidate ran (no consensus evidence)
    "unresolved_blocking",
    "ambiguity",
    "warnings",
    "repairs",            # repair attempts used before the final SQL
    "empty_result",
    "semantic_invalid",   # the LLM semantic validator rejected the SQL
    "approved_definition",  # the answer applies an analyst-approved business definition
)

DEFAULT_MODEL = {
    "bias": 0.2,
    "weights": {
        "agreement": 1.8,
        "single_candidate": 1.5,
        "unresolved_blocking": -3.0,
        "ambiguity": -1.2,
        "warnings": -0.5,
        "repairs": -0.6,
        "empty_result": -1.0,
        "semantic_invalid": -1.5,
        # An approved definition removes the ambiguity behind most wrong business figures.
        # Like every weight here it is a prior, refitted per data source from reviews.
        "approved_definition": 1.2,
    },
    "source": "default prior (not yet calibrated)",
}


def load_model() -> Dict:
    try:
        return json.loads(CALIBRATION_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return DEFAULT_MODEL


def features(
    *,
    agreement: float,
    candidate_count: int,
    findings: List[Finding],
    repairs: int,
    empty_result: bool,
    semantic_invalid: bool,
    approved_definition: bool = False,
) -> Dict[str, float]:
    return {
        "agreement": agreement if candidate_count > 1 else 0.0,
        "single_candidate": 1.0 if candidate_count <= 1 else 0.0,
        "unresolved_blocking": float(any(f.severity == "blocking" for f in findings)),
        "ambiguity": float(any(f.severity == "ambiguity" for f in findings)),
        "warnings": float(sum(1 for f in findings if f.severity == "warning")),
        "repairs": float(repairs),
        "empty_result": float(empty_result),
        "semantic_invalid": float(semantic_invalid),
        "approved_definition": float(approved_definition),
    }


def probability(feature_values: Dict[str, float], model: Dict | None = None) -> float:
    model = model or load_model()
    z = float(model.get("bias", 0.0))
    for name, weight in model.get("weights", {}).items():
        z += float(weight) * float(feature_values.get(name, 0.0))
    return 1.0 / (1.0 + math.exp(-z))


def threshold(penalty: float) -> float:
    """Answer only if p - penalty * (1 - p) > 0, i.e. p > c / (1 + c)."""
    penalty = max(0.0, float(penalty))
    return penalty / (1.0 + penalty)
