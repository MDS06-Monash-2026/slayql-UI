"""Suggested definitions for a newly connected data source.

Most wrong answers on business questions come from terms with no agreed meaning:
"sales" with or without cancelled invoices, with or without SST. Instead of asking
every time, SlayQL finds these terms in the data once and lets the owner approve a
meaning, showing the number each option gives. AutoCount databases get a starter
pack with the usual meanings for invoices, credit notes and receipts.
"""
from __future__ import annotations

import re
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from backend.app.catalog.discovery import CatalogSchema
from backend.app.verification.checks import (
    FLAG_COLUMN,
    FLAG_FAMILIES,
    FLAG_VALUES,
    NEGATIVE_STATUS,
    STATUS_COLUMN,
    TRUE_VALUES,
)
from backend.app.verification.models import ExecutionResult, format_value

SqlRunner = Callable[[str], Awaitable[ExecutionResult]]

SALES_SYNONYMS = ["revenue", "turnover", "jualan", "hasil", "pendapatan"]
# Tables that usually hold sales, best first. IV and CS are AutoCount's invoices and cash sales.
SALES_TABLES = ["iv", "invoice", "invoices", "sales", "sale", "sales_orders", "orders", "order", "transactions"]
# AutoCount document tables other than invoices, with the term a business uses for them.
AUTOCOUNT_TERMS = {
    "cn": ("credit notes", ["credit note", "nota kredit"], "credit notes"),
    "arpayment": ("collections", ["receipts", "payments received", "kutipan"], "receipts"),
    "cs": ("cash sales", ["cash sale", "jualan tunai"], "cash sales"),
}
AUTOCOUNT_MARKERS = {"iv", "debtor"}
EX_TAX = re.compile(r"ex(cl(uding)?)?_?tax|before_?tax|net_?of_?tax|pre_?tax", re.I)
INC_TAX = re.compile(r"inc(l(uding)?)?_?tax|after_?tax|with_?tax|gross", re.I)
MEASURE = re.compile(r"total|amount|amt|revenue|value|price", re.I)
NUMERIC = re.compile(r"int|dec|num|real|float|double|money|currency", re.I)
IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _q(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _plain(identifier: str) -> str:
    """Identifiers as a person would write them in a filter, quoted only when needed."""
    return identifier if IDENTIFIER.match(identifier) else _q(identifier)


def _literal(value: Any) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def is_autocount(catalog: CatalogSchema) -> bool:
    return AUTOCOUNT_MARKERS <= {name.lower() for name in catalog.tables}


def _numeric_columns(table: Any) -> List[str]:
    return [c.name for c in table.columns if not c.type or NUMERIC.search(c.type)]


def _measures(table: Any) -> List[Tuple[str, str]]:
    """(column, how to describe it): a tax-exclusive and tax-inclusive pair when there is one."""
    numeric = [c for c in _numeric_columns(table) if MEASURE.search(c) or EX_TAX.search(c) or INC_TAX.search(c)]
    ex = next((c for c in numeric if EX_TAX.search(c)), None)
    inc = next((c for c in numeric if INC_TAX.search(c)), None)
    if ex and inc:
        return [(ex, "excluding SST"), (inc, "including SST")]
    main = next((c for c in numeric if re.search(r"total", c, re.I)), None) or next(iter(numeric), None)
    return [(main, "")] if main else []


async def _exclusion(table: Any, noun: str, run_sql: SqlRunner) -> Optional[Tuple[str, List[Any], str]]:
    """The column whose rows most totals leave out (a cancelled flag, or cancelled/refunded statuses)."""
    for column in table.columns:
        is_flag = bool(FLAG_COLUMN.search(column.name))
        if not (is_flag or STATUS_COLUMN.search(column.name)):
            continue
        result = await run_sql(
            f"SELECT {_q(column.name)}, COUNT(*) FROM {_q(table.name)} GROUP BY {_q(column.name)} ORDER BY COUNT(*) DESC LIMIT 20"
        )
        if result.error or not result.rows or len(result.rows) > 12:
            continue
        values = [row[0] for row in result.rows if row[0] is not None]
        if is_flag:
            if not values or not {str(v).strip().lower() for v in values} <= FLAG_VALUES:
                continue
            negative = [v for v in values if str(v).strip().lower() in TRUE_VALUES]
            if not negative:
                # Nothing is cancelled yet ('F' only): the rule still matters for future documents.
                present = {str(v).strip().lower() for v in values}
                family = next((f for f in FLAG_FAMILIES if present <= f), set())
                true_value = next((v for v in family if v in TRUE_VALUES), None)
                upper = all(str(v).isupper() for v in values if str(v).isalpha())
                negative = [true_value.upper() if upper else true_value] if true_value else []
            flag = re.sub(r"^is_?", "", column.name, flags=re.I).lower()
            label = f"{flag} {noun}"
        else:
            negative = [v for v in values if NEGATIVE_STATUS.search(str(v))]
            label = ", ".join(str(v).lower() for v in negative) + f" {noun}"
        if negative:
            return column.name, negative, label
    return None


def _filter(column: str, negative: List[Any]) -> str:
    if len(negative) == 1:
        return f"{_plain(column)} <> {_literal(negative[0])}"
    return f"{_plain(column)} NOT IN ({', '.join(_literal(v) for v in negative)})"


async def _value(run_sql: SqlRunner, table: str, measure: str, where: str) -> Optional[str]:
    sql = f"SELECT SUM({_q(measure)}) FROM {_q(table)}" + (f" WHERE {where}" if where else "")
    result = await run_sql(sql)
    if result.error or not result.rows:
        return None
    return format_value(result.rows[0][0])


async def _suggest_for_table(
    table: Any, term: str, synonyms: List[str], noun: str, run_sql: SqlRunner, source: str
) -> Optional[Dict[str, Any]]:
    measures = _measures(table)
    exclusion = await _exclusion(table, noun, run_sql)
    if not measures or (len(measures) < 2 and not exclusion):
        return None  # Nothing to choose between.
    options: List[Dict[str, Any]] = []
    filters: List[Tuple[Optional[str], str, str]] = []
    if exclusion:
        column, negative, label = exclusion
        filters.append((column, _filter(column, negative), f"leaves out {label}"))
        filters.append((None, "", f"includes {label}"))
    else:
        filters.append((None, "", ""))
    for column, filter_sql, filter_text in filters:
        for measure, measure_text in measures:
            value = await _value(run_sql, table.name, measure, filter_sql)
            if value is None:
                continue
            parts = [f"Sum of {measure}" + (f" ({measure_text})" if measure_text else "")]
            if filter_text:
                parts.append(filter_text)
            description = "; ".join(parts) + "."
            options.append({
                "label": description[0].upper() + description[1:],
                "value": value,
                "definition": {
                    "term": term,
                    "synonyms": synonyms,
                    "table_name": table.name,
                    "column_name": column,
                    "filter_sql": filter_sql,
                    "description": description,
                },
            })
    # Options that give the same number are one choice; keep the first (the recommended one).
    distinct: List[Dict[str, Any]] = []
    for option in options:
        if not any(o["value"] == option["value"] for o in distinct):
            distinct.append(option)
    single_rule = len(distinct) == 1 and bool(exclusion)
    if len(distinct) < 2 and not single_rule:
        return None
    options = distinct
    detail = (f"Questions about {term} can give {len(options)} different totals from {noun}. Choose the one your company reports."
              if len(options) > 1 else
              f"No {noun} are {exclusion[2].split()[0]} yet, so every reading gives the same total today. Approving the rule keeps later answers consistent.")
    return {
        "term": term,
        "table": table.name,
        "source": source,
        "question": f"What counts as {term}?",
        "detail": detail,
        "recommended": 0,
        "options": options,
    }


async def suggest_definitions(
    catalog: CatalogSchema, run_sql: SqlRunner, approved_terms: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """Terms in this data source that need an agreed meaning, with the number each meaning gives."""
    approved = {term.lower() for term in (approved_terms or [])}
    by_name = {name.lower(): table for name, table in catalog.tables.items()}
    autocount = is_autocount(catalog)
    source = "AutoCount starter pack" if autocount else "Found in your data"
    suggestions: List[Dict[str, Any]] = []

    sales_table = next((by_name[name] for name in SALES_TABLES if name in by_name), None)
    if sales_table is not None and "sales" not in approved:
        noun = "invoices" if sales_table.name.lower() in {"iv", "invoice", "invoices"} else sales_table.name.lower().replace("_", " ")
        suggestion = await _suggest_for_table(sales_table, "sales", SALES_SYNONYMS, noun, run_sql, source)
        if suggestion:
            suggestions.append(suggestion)
    if autocount:
        for name, (term, synonyms, noun) in AUTOCOUNT_TERMS.items():
            if name in by_name and term not in approved:
                suggestion = await _suggest_for_table(by_name[name], term, synonyms, noun, run_sql, source)
                if suggestion:
                    suggestions.append(suggestion)
    return suggestions
