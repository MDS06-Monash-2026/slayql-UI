"""Learn each workspace's confidence model from analysts' review decisions.

Calibration does not transfer between databases (a model fitted on BIRD made the
demo hand off almost everything), so every data source starts from the default
prior and is refitted from its own review queue. An analyst who confirms an
answer labels it correct; one who corrects it labels it wrong. The fit is pulled
towards the default prior, so a handful of reviews cannot swing it far.
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

from sqlalchemy import delete, insert, select

from backend.app.control_database import ControlDatabase, control_database
from backend.app.verification import confidence

# Refit only once there is evidence of both kinds.
MIN_LABELS = 20
MIN_EACH = 5
# How many reviewed answers the default prior is worth.
PRIOR_STRENGTH = 10.0


def fit_with_prior(
    rows: Sequence[Dict[str, float]],
    labels: Sequence[int],
    prior: Dict[str, Any],
    strength: float = PRIOR_STRENGTH,
    iterations: int = 3000,
    learning_rate: float = 0.2,
) -> Dict[str, Any]:
    """Logistic regression with a Gaussian prior centred on `prior` (MAP estimate)."""
    names = list(confidence.FEATURES)
    prior_weights = {name: float(prior.get("weights", {}).get(name, 0.0)) for name in names}
    prior_bias = float(prior.get("bias", 0.0))
    weights = dict(prior_weights)
    bias = prior_bias
    n = max(1, len(rows))
    penalty = strength / n
    for _ in range(iterations):
        grad_w = {name: 0.0 for name in names}
        grad_b = 0.0
        for row, label in zip(rows, labels):
            z = bias + sum(weights[name] * float(row.get(name, 0.0)) for name in names)
            p = 1.0 / (1.0 + math.exp(-max(-30.0, min(30.0, z))))
            error = p - label
            grad_b += error
            for name in names:
                grad_w[name] += error * float(row.get(name, 0.0))
        bias -= learning_rate * (grad_b / n + penalty * (bias - prior_bias))
        for name in names:
            weights[name] -= learning_rate * (grad_w[name] / n + penalty * (weights[name] - prior_weights[name]))
    return {"bias": round(bias, 4), "weights": {name: round(value, 4) for name, value in weights.items()}}


def label_for(resolution: Optional[str]) -> Optional[int]:
    return {"confirmed": 1, "corrected": 0}.get(resolution or "")


class WorkspaceLearning:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.reviews = database.review_items
        self.calibrations = database.workspace_calibrations

    def examples(self, connection_id: str) -> List[Tuple[Dict[str, float], int, Dict[str, Any]]]:
        """(features, label, item) for every reviewed answer on this data source."""
        statement = select(self.reviews).where(
            self.reviews.c.connection_id == connection_id,
            self.reviews.c.status == "resolved",
        )
        found = []
        with self.database.engine.connect() as conn:
            for row in conn.execute(statement).mappings():
                label = label_for(row["resolution"])
                try:
                    verification = json.loads(row["verification"] or "{}")
                except ValueError:
                    continue
                features = verification.get("features") or {}
                if label is None or not features:
                    continue
                found.append((features, label, {"source": row["source"], "outcome": row["outcome"]}))
        return found

    def refit(self, connection_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """Refit after a review; returns the stored model, or None while evidence is short."""
        if not connection_id:
            return None
        examples = self.examples(connection_id)
        correct = sum(label for _, label, _ in examples)
        wrong = len(examples) - correct
        with self.database.engine.begin() as conn:
            conn.execute(delete(self.calibrations).where(self.calibrations.c.connection_id == connection_id))
            if len(examples) < MIN_LABELS or correct < MIN_EACH or wrong < MIN_EACH:
                return None
            fitted = fit_with_prior([f for f, _, _ in examples], [label for _, label, _ in examples], confidence.DEFAULT_MODEL)
            fitted["source"] = f"learned from {len(examples)} reviewed answers on this data source"
            conn.execute(insert(self.calibrations).values(
                connection_id=connection_id,
                model=json.dumps(fitted),
                labels=len(examples),
                correct=correct,
                fitted_at=datetime.now(timezone.utc).isoformat(),
            ))
        return fitted

    def model_for(self, connection_id: Optional[str]) -> Dict[str, Any]:
        """The confidence model to use for this data source."""
        if connection_id:
            with self.database.engine.connect() as conn:
                row = conn.execute(
                    select(self.calibrations.c.model).where(self.calibrations.c.connection_id == connection_id)
                ).first()
            if row:
                try:
                    return json.loads(row[0])
                except ValueError:
                    pass
        return confidence.load_model()

    def status(self, connection_id: str, penalty: float) -> Dict[str, Any]:
        examples = self.examples(connection_id)
        correct = sum(label for _, label, _ in examples)
        wrong = len(examples) - correct
        model = self.model_for(connection_id)
        active = model.get("source", "").startswith("learned")
        # Answers SlayQL gave as fact that a person later checked (usually flagged ones).
        answered = [(label, item) for _, label, item in examples if item["outcome"] in {"confident", "caveat"}]
        threshold = confidence.threshold(penalty)
        default = confidence.DEFAULT_MODEL
        return {
            "connection_id": connection_id,
            "labels": len(examples),
            "correct": correct,
            "wrong": wrong,
            "min_labels": MIN_LABELS,
            "min_each": MIN_EACH,
            "needed": max(0, MIN_LABELS - len(examples), MIN_EACH - correct, MIN_EACH - wrong) if not active else 0,
            "active": active,
            "source": model.get("source"),
            "weights": model.get("weights", {}),
            "bias": model.get("bias"),
            "default_weights": default["weights"],
            "default_bias": default["bias"],
            "reviewed_answers": {"n": len(answered), "wrong": sum(1 for label, _ in answered if label == 0)},
            "threshold": round(threshold, 4),
            # How confident SlayQL is when every check passes and all candidates agree.
            "clean_answer_confidence": round(confidence.probability(_clean_answer(), model), 4),
            "clean_answer_confidence_default": round(confidence.probability(_clean_answer(), default), 4),
        }


def _clean_answer() -> Dict[str, float]:
    return {"agreement": 1.0, "single_candidate": 0.0, "unresolved_blocking": 0.0, "ambiguity": 0.0,
            "warnings": 0.0, "repairs": 0.0, "empty_result": 0.0, "semantic_invalid": 0.0}


workspace_learning = WorkspaceLearning(control_database)
