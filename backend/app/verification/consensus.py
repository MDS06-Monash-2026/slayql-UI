"""Compare candidate queries by the results they return."""
from __future__ import annotations

import hashlib
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


def cluster(candidates: List[CandidateResult]) -> List[List[CandidateResult]]:
    """Group successful candidates with identical results, largest group first.

    Ties keep the earlier group first, so the primary candidate wins a tie.
    """
    groups: Dict[str, List[CandidateResult]] = {}
    for candidate in candidates:
        if candidate.ok and candidate.signature:
            groups.setdefault(candidate.signature, []).append(candidate)
    return sorted(groups.values(), key=lambda group: -len(group))


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
