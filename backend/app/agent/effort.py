from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


ThinkingEffort = Literal["minimal", "low", "medium", "high", "max"]
DEFAULT_THINKING_EFFORT: ThinkingEffort = "minimal"


@dataclass(frozen=True)
class ThinkingProfile:
    name: ThinkingEffort
    provider_sql_effort: str
    provider_answer_effort: str
    sql_max_tokens: int
    answer_max_tokens: int
    max_repair_attempts: int
    use_model_intent: bool
    use_model_semantic_validation: bool
    use_model_chart: bool
    use_model_answer: bool


THINKING_PROFILES: dict[ThinkingEffort, ThinkingProfile] = {
    "minimal": ThinkingProfile(
        name="minimal",
        provider_sql_effort="minimal",
        provider_answer_effort="none",
        sql_max_tokens=700,
        answer_max_tokens=0,
        max_repair_attempts=1,
        use_model_intent=False,
        use_model_semantic_validation=False,
        use_model_chart=False,
        use_model_answer=False,
    ),
    "low": ThinkingProfile(
        name="low",
        provider_sql_effort="low",
        provider_answer_effort="none",
        sql_max_tokens=1100,
        answer_max_tokens=240,
        max_repair_attempts=1,
        use_model_intent=False,
        use_model_semantic_validation=False,
        use_model_chart=False,
        use_model_answer=True,
    ),
    "medium": ThinkingProfile(
        name="medium",
        provider_sql_effort="medium",
        provider_answer_effort="minimal",
        sql_max_tokens=1500,
        answer_max_tokens=360,
        max_repair_attempts=2,
        use_model_intent=False,
        use_model_semantic_validation=True,
        use_model_chart=False,
        use_model_answer=True,
    ),
    "high": ThinkingProfile(
        name="high",
        provider_sql_effort="high",
        provider_answer_effort="low",
        sql_max_tokens=1800,
        answer_max_tokens=500,
        max_repair_attempts=3,
        use_model_intent=True,
        use_model_semantic_validation=True,
        use_model_chart=True,
        use_model_answer=True,
    ),
    "max": ThinkingProfile(
        name="max",
        provider_sql_effort="xhigh",
        provider_answer_effort="medium",
        sql_max_tokens=2600,
        answer_max_tokens=700,
        max_repair_attempts=3,
        use_model_intent=True,
        use_model_semantic_validation=True,
        use_model_chart=True,
        use_model_answer=True,
    ),
}


def get_thinking_profile(effort: ThinkingEffort) -> ThinkingProfile:
    return THINKING_PROFILES[effort]
