"""Repairs that need no model call."""
from __future__ import annotations

from typing import Optional

import sqlglot
from sqlglot import exp

NOW_FUNCTIONS = {"NOW", "GETDATE", "SYSDATE", "SYSDATETIME", "CURDATE", "LOCALTIMESTAMP", "GETUTCDATE"}


def anchor_relative_dates(sql: str, dialect: str, anchor: str) -> Optional[str]:
    """Measure relative periods from where the data ends instead of from today.

    "Last month" written as DATE('now', 'start of month', '-1 month') on data that ended in June
    returns nothing; with 'now' replaced by the latest date in the data it means the month before
    the data ends, which is how SlayQL reads relative periods. Returns None if nothing changed.
    """
    try:
        tree = sqlglot.parse_one(sql, read=dialect)
    except Exception:
        return None
    anchor = str(anchor).strip()
    day = anchor[:10]
    sqlite = dialect == "sqlite"

    def as_date(value: str) -> exp.Expression:
        # SQLite keeps dates as text; CAST(... AS DATE) there would turn '2026-06-28' into 2026.
        return exp.Literal.string(value) if sqlite else exp.cast(exp.Literal.string(value), "DATE")

    def as_timestamp(value: str) -> exp.Expression:
        return exp.Literal.string(value) if sqlite else exp.cast(exp.Literal.string(value), "TIMESTAMP")

    changed = False
    for node in list(tree.find_all(exp.Literal)):
        if node.is_string and str(node.this).strip().lower() == "now":
            node.replace(exp.Literal.string(anchor))
            changed = True
    for node in list(tree.find_all(exp.CurrentDate)):
        node.replace(as_date(day))
        changed = True
    for kind in (exp.CurrentTimestamp, exp.CurrentDatetime):
        for node in list(tree.find_all(kind)):
            node.replace(as_timestamp(anchor))
            changed = True
    for node in list(tree.find_all(exp.Anonymous)):
        if str(node.name).upper() in NOW_FUNCTIONS:
            node.replace(as_timestamp(anchor))
            changed = True
    return tree.sql(dialect=dialect) if changed else None
