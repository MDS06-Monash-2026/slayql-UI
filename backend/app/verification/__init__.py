"""Trust layer: checks each answer and decides whether to answer, clarify or hand off."""
from backend.app.verification.engine import candidate_from_result, repair_feedback, run_checks, verify
from backend.app.verification.models import CandidateResult, ClarifyOption, Finding, Verification

__all__ = [
    "CandidateResult",
    "ClarifyOption",
    "Finding",
    "Verification",
    "candidate_from_result",
    "repair_feedback",
    "run_checks",
    "verify",
]
