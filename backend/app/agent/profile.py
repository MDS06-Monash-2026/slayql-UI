"""A short profile of the data the model is about to query.

The catalog gives the model a few sample values per column. For a flag that is almost
always 'F', those samples may never show 'T', so the model guesses 'Y' and its
"non-cancelled" filter excludes nothing. Listing every value of status and flag
columns (with counts), and the date range of date columns, lets the model use the
data's own codes and periods instead of guessing.
"""
from __future__ import annotations

import re
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from backend.app import privacy
from backend.app.catalog.discovery import CatalogSchema
from backend.app.queries.executor import ExecutionResult

SqlRunner = Callable[[str], Awaitable[ExecutionResult]]

CODED = re.compile(r"(^|_)(status|state|stage|type|kind|method|channel|category|segment|tier|priority|currency)($|_)"
                   r"|^(is_?)?(cancel+ed|void(ed)?|deleted|rejected|active|paid|closed)$|status$|method$|type$", re.I)
DATE_NAME = re.compile(r"(date|_at|_on|time)$", re.I)
DATE_TYPE = re.compile(r"date|time", re.I)
MAX_COLUMNS = 12
MAX_VALUES = 12
TTL_SECONDS = 600

_cache: Dict[Tuple[str, str, str], Tuple[float, Optional[str]]] = {}


def _q(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _columns(catalog: CatalogSchema, tables: List[str]) -> List[Tuple[str, Any, str]]:
    picked: List[Tuple[str, Any, str]] = []
    for name in tables:
        table = catalog.tables.get(name)
        if not table:
            continue
        for column in table.columns:
            if column.primary_key or privacy.is_personal(column.name):
                continue
            if DATE_TYPE.search(column.type or "") or DATE_NAME.search(column.name):
                picked.append((name, column, "range"))
            elif CODED.search(column.name) and not re.search(r"int|dec|num|real|float|double|money", column.type or "", re.I):
                picked.append((name, column, "values"))
    # Coded columns first: they decide filters; date ranges second.
    picked.sort(key=lambda entry: entry[2] != "values")
    return picked[:MAX_COLUMNS]


async def _describe(table: str, column: Any, kind: str, run_sql: SqlRunner) -> Optional[str]:
    name = f"{table}.{column.name}"
    if kind == "range":
        result = await run_sql(f"SELECT MIN({_q(column.name)}), MAX({_q(column.name)}) FROM {_q(table)}")
        if result.error or not result.rows or result.rows[0][0] is None:
            return None
        return f"{name}: from {result.rows[0][0]} to {result.rows[0][1]}"
    result = await run_sql(
        f"SELECT {_q(column.name)}, COUNT(*) FROM {_q(table)} GROUP BY {_q(column.name)} ORDER BY COUNT(*) DESC LIMIT {MAX_VALUES + 1}"
    )
    if result.error or not result.rows or len(result.rows) > MAX_VALUES:
        return None  # Free text rather than a code: its values do not help.
    shown = ", ".join(("NULL" if value is None else f"'{value}'") + f" ({count:,})" for value, count in result.rows)
    return f"{name}: {shown}"


async def data_profile(connection_id: str, catalog: CatalogSchema, tables: List[str], run_sql: SqlRunner) -> str:
    """Lines such as "IV.Cancelled: 'F' (695), 'T' (12)" and "IV.DocDate: from 2025-01-01 to 2026-09-15"."""
    lines: List[str] = []
    now = time.monotonic()
    for table, column, kind in _columns(catalog, tables):
        key = (connection_id, table, column.name)
        cached = _cache.get(key)
        if cached and now - cached[0] < TTL_SECONDS:
            line = cached[1]
        else:
            try:
                line = await _describe(table, column, kind, run_sql)
            except Exception:
                line = None
            _cache[key] = (now, line)
        if line:
            lines.append(line)
    if not lines:
        return ""
    return "DATA PROFILE (every value of coded columns with its row count; date ranges):\n" + "\n".join(lines)
