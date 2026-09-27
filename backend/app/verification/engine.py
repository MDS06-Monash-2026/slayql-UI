"""Verification entry points used by the live pipeline and the evaluation harness."""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from backend.app.catalog.discovery import CatalogSchema
from backend.app.queries.executor import ExecutionResult
from backend.app.verification import checks, confidence, consensus, sql_scope
from backend.app.verification.models import (
    CandidateResult,
    ClarifyOption,
    Finding,
    SqlRunner,
    Verification,
    result_preview,
)


async def run_checks(
    *,
    question: str,
    sql: str,
    dialect: str,
    catalog: CatalogSchema,
    run_sql: SqlRunner,
    result: ExecutionResult,
    definitions: Optional[List[Dict[str, Any]]] = None,
    today: Optional[date] = None,
) -> Tuple[List[Finding], List[ClarifyOption], List[Dict[str, Any]]]:
    """Run every deterministic check on one executed query."""
    tree = sql_scope.parse(sql, dialect)
    findings: List[Finding] = checks.check_sanity(result)
    if tree is None:
        return findings, [], []
    findings += checks.check_grounding(tree, question, catalog, definitions)
    findings += await checks.check_grain(tree, catalog, run_sql)
    definition_findings, options, used = await checks.check_definitions(
        tree, question, catalog, run_sql, definitions or []
    )
    findings += definition_findings
    findings += await checks.check_periods(tree, sql, catalog, run_sql, result, today=today)
    # A period check that explains an empty result supersedes the generic one.
    if any(f.check == "period" and "No data" in f.title for f in findings):
        findings = [f for f in findings if not (f.check == "sanity" and "no rows" in f.title)]
    return findings, options, used


def repair_feedback(findings: List[Finding]) -> str:
    hints = [f.repair_hint for f in findings if f.severity == "blocking" and f.repair_hint]
    return " ".join(hints)


async def verify(
    *,
    question: str,
    dialect: str,
    catalog: CatalogSchema,
    run_sql: SqlRunner,
    candidates: List[CandidateResult],
    primary_id: str,
    penalty: float,
    definitions: Optional[List[Dict[str, Any]]] = None,
    repairs: int = 0,
    semantic_invalid: bool = False,
    today: Optional[date] = None,
    model: Optional[Dict[str, Any]] = None,
) -> Verification:
    """Check every candidate, let only unblocked ones vote, and decide the outcome."""
    primary = next((c for c in candidates if c.candidate_id == primary_id), None)
    checked: Dict[str, Tuple[List[Finding], List[ClarifyOption], List[Dict[str, Any]]]] = {}
    for candidate in candidates:
        if candidate.ok and candidate.result is not None:
            checked[candidate.candidate_id] = await run_checks(
                question=question,
                sql=candidate.sql,
                dialect=dialect,
                catalog=catalog,
                run_sql=run_sql,
                result=candidate.result,
                definitions=definitions,
                today=today,
            )
    # A candidate with a blocking problem (e.g. fan-out) must not outvote a correct one.
    eligible = [
        c for c in candidates
        if c.candidate_id in checked and not any(f.severity == "blocking" for f in checked[c.candidate_id][0])
    ]
    groups = consensus.cluster(eligible)
    if groups:
        top = groups[0]
        selected = primary if primary is not None and primary in top else top[0]
    else:
        selected = primary
    consensus_summary = consensus.summarize(eligible or candidates)
    consensus_summary["excluded_by_checks"] = sum(1 for c in candidates if c.candidate_id in checked) - len(eligible)
    consensus_summary["candidates"] = len(candidates)

    findings: List[Finding] = []
    options: List[ClarifyOption] = []
    used: List[Dict[str, Any]] = []
    if selected is not None and selected.candidate_id in checked:
        findings, options, used = checked[selected.candidate_id]
        findings, options = list(findings), list(options)
        if options:
            options.insert(0, ClarifyOption(
                label="As calculated (all records)",
                sql=selected.sql,
                preview=selected.preview,
                candidate_id=selected.candidate_id,
            ))
    else:
        findings.append(Finding(
            check="execution",
            severity="blocking",
            title="No candidate query ran successfully",
            detail="Every generated query failed validation or execution.",
        ))

    disagreement = consensus.disagreement_options(eligible, dialect)
    if disagreement and not options:
        options = disagreement
        findings.append(Finding(
            check="consensus",
            severity="ambiguity",
            title="The question can be read in different ways",
            detail="Independent attempts produced different answers and none had a majority.",
        ))

    succeeded = consensus_summary["succeeded"]
    feature_values = confidence.features(
        agreement=consensus_summary["agreement"],
        candidate_count=succeeded,
        findings=findings,
        repairs=repairs,
        empty_result=bool(selected and selected.result is not None and not selected.result.rows),
        semantic_invalid=semantic_invalid,
    )
    p = confidence.probability(feature_values, model)
    t = confidence.threshold(penalty)

    if any(f.severity == "blocking" for f in findings):
        outcome, summary = "handoff", "A check found a problem that could not be repaired, so this goes to an analyst."
    elif len(options) >= 2:
        outcome, summary = "clarify", "This question has more than one reasonable meaning. Choose the one you intend."
    elif p >= t:
        if any(f.severity == "warning" for f in findings):
            outcome, summary = "caveat", "Checks passed, with a limitation noted below."
        else:
            outcome, summary = "confident", "Checks passed."
    else:
        outcome, summary = "handoff", "Confidence is below the threshold for this workspace, so an analyst should confirm it."

    if outcome == "confident" and used:
        summary = "Checks passed, using the approved definition."

    return Verification(
        outcome=outcome,
        probability=round(p, 4),
        threshold=round(t, 4),
        penalty=float(penalty),
        summary=summary,
        findings=findings,
        consensus=consensus_summary,
        clarify_options=options if outcome == "clarify" else [],
        definitions_used=used,
        features=feature_values,
        selected_candidate_id=selected.candidate_id if selected else None,
    )


def candidate_from_result(candidate_id: str, sql: str, result: Optional[ExecutionResult], error: Optional[str] = None) -> CandidateResult:
    if result is None or result.error or error:
        return CandidateResult(candidate_id=candidate_id, sql=sql, ok=False, error=error or (result.error if result else "not executed"))
    return CandidateResult(
        candidate_id=candidate_id,
        sql=sql,
        ok=True,
        signature=consensus.result_signature(result),
        preview=result_preview(result),
        row_count=len(result.rows),
        result=result,
    )
