"""Compare candidate queries by the results they return."""
from __future__ import annotations

import hashlib
from itertools import product
from typing import Any, Dict, List, Optional

import sqlglot
from sqlglot import exp

from backend.app.queries.executor import ExecutionResult
from backend.app.verification.models import CandidateResult, ClarifyOption


def normalize_value(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return str(int(value))
    if isinstance(value, (int, float)):
        return f"{float(value):.6g}"
    text = str(value).strip()
    try:
        return f"{float(text):.6g}"
    except ValueError:
        return text


def result_signature(result: ExecutionResult) -> str:
    """Order-insensitive fingerprint of a result's values (column names ignored)."""
    rows = sorted(tuple(normalize_value(value) for value in row) for row in result.rows)
    return hashlib.sha1(repr(rows).encode("utf-8")).hexdigest()[:16]


def results_agree(first: Optional[ExecutionResult], second: Optional[ExecutionResult]) -> bool:
    """True when both results hold the same rows, allowing one to carry extra columns.

    "SELECT name" and "SELECT id, name, unit_price" give the same answer; only
    the presentation differs, so they should not count as a disagreement.
    """
    if first is None or second is None or len(first.rows) != len(second.rows):
        return False
    narrow, wide = sorted((first, second), key=lambda result: len(result.columns))
    if not narrow.rows or not narrow.columns or len(wide.columns) > 12:
        return False

    def column(result: ExecutionResult, index: int) -> List[str]:
        return sorted(normalize_value(row[index]) for row in result.rows)

    wide_columns = [column(wide, j) for j in range(len(wide.columns))]
    choices = [
        [j for j, values in enumerate(wide_columns) if values == column(narrow, i)]
        for i in range(len(narrow.columns))
    ]
    if any(not options for options in choices):
        return False
    target = sorted(tuple(normalize_value(value) for value in row) for row in narrow.rows)
    for chosen in product(*choices):
        if len(set(chosen)) == len(chosen):
            projected = sorted(tuple(normalize_value(row[j]) for j in chosen) for row in wide.rows)
            if projected == target:
                return True
    return False


def cluster(candidates: List[CandidateResult]) -> List[List[CandidateResult]]:
    """Group successful candidates that return the same answer, largest group first.

    Ties keep the earlier group first, so the primary candidate wins a tie.
    """
    groups: List[List[CandidateResult]] = []
    for candidate in candidates:
        if not (candidate.ok and candidate.signature):
            continue
        for group in groups:
            representative = group[0]
            if representative.signature == candidate.signature or results_agree(representative.result, candidate.result):
                group.append(candidate)
                break
        else:
            groups.append([candidate])
    return sorted(groups, key=lambda group: -len(group))


def summarize(candidates: List[CandidateResult]) -> Dict[str, Any]:
    groups = cluster(candidates)
    ok = [candidate for candidate in candidates if candidate.ok]
    top = groups[0] if groups else []
    return {
        "candidates": len(candidates),
        "succeeded": len(ok),
        "agreement": round(len(top) / len(ok), 3) if ok else 0.0,
        "clusters": [
            {"size": len(group), "candidate_ids": [c.candidate_id for c in group], "preview": group[0].preview}
            for group in groups
        ],
    }


def disagreement_options(candidates: List[CandidateResult], dialect: str) -> List[ClarifyOption]:
    """When no interpretation has a majority, offer each distinct result."""
    groups = cluster(candidates)
    ok = [candidate for candidate in candidates if candidate.ok]
    if len(groups) < 2 or len(groups[0]) * 2 > len(ok):
        return []
    options = []
    for group in groups[:3]:
        representative = group[0]
        options.append(ClarifyOption(
            label=_describe(representative.sql, [g[0].sql for g in groups if g is not group], dialect),
            sql=representative.sql,
            preview=representative.preview,
            candidate_id=representative.candidate_id,
        ))
    return options


def _predicates(sql: str, dialect: str) -> set[str]:
    try:
        tree = sqlglot.parse_one(sql, read=dialect)
    except Exception:
        return set()
    found = set()
    for where in tree.find_all(exp.Where):
        condition = where.this
        parts = list(condition.flatten()) if isinstance(condition, exp.And) else [condition]
        found.update(part.sql(dialect=dialect) for part in parts)
    return found


def _describe(sql: str, others: List[str], dialect: str) -> str:
    own = _predicates(sql, dialect)
    other = set().union(*(_predicates(item, dialect) for item in others)) if others else set()
    extra = sorted(own - other)
    if extra:
        return "Only where " + " and ".join(extra)[:160]
    missing = sorted(other - own)
    if missing:
        return "Without the filter " + " and ".join(missing)[:150]
    return "Alternative interpretation"
