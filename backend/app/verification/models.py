from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from backend.app.queries.executor import ExecutionResult

Severity = Literal["blocking", "ambiguity", "warning", "info"]
Outcome = Literal["confident", "caveat", "clarify", "handoff"]

# Runs one read-only SQL statement and returns its result. Callers validate
# and bound the statement; checks use it for small probe queries.
SqlRunner = Callable[[str], Awaitable[ExecutionResult]]


class Finding(BaseModel):
    check: str
    severity: Severity
    title: str
    detail: str
    repair_hint: str = ""
    probe_sql: Optional[str] = None
    data: Dict[str, Any] = Field(default_factory=dict)


class ClarifyOption(BaseModel):
    label: str
    sql: str
    preview: str
    candidate_id: Optional[str] = None


class CandidateResult(BaseModel):
    candidate_id: str
    sql: str
    ok: bool
    error: Optional[str] = None
    signature: Optional[str] = None
    preview: str = ""
    row_count: int = 0
    result: Optional[ExecutionResult] = Field(default=None, exclude=True)


class Verification(BaseModel):
    outcome: Outcome
    probability: float
    threshold: float
    penalty: float
    summary: str
    findings: List[Finding] = Field(default_factory=list)
    consensus: Dict[str, Any] = Field(default_factory=dict)
    clarify_options: List[ClarifyOption] = Field(default_factory=list)
    definitions_used: List[Dict[str, Any]] = Field(default_factory=list)
    features: Dict[str, float] = Field(default_factory=dict)
    selected_candidate_id: Optional[str] = None


def result_preview(result: Optional[ExecutionResult], max_rows: int = 3) -> str:
    """Short human-readable preview of a result, e.g. for clarify options."""
    if result is None or result.error:
        return "error"
    if not result.rows:
        return "no rows"
    if len(result.rows) == 1 and len(result.rows[0]) == 1:
        return format_value(result.rows[0][0])
    shown = "; ".join(", ".join(format_value(value) for value in row) for row in result.rows[:max_rows])
    more = f" (+{len(result.rows) - max_rows} more rows)" if len(result.rows) > max_rows else ""
    return shown + more


def format_value(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:,.2f}"
    if isinstance(value, int) and not isinstance(value, bool):
        return f"{value:,}"
    return "NULL" if value is None else str(value)
