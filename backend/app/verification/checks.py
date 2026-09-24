"""Deterministic checks for the mistakes that distort business figures.

Each check inspects the generated SQL and, where needed, runs small read-only
probe queries through the supplied runner. Checks never modify data.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlglot import exp

from backend.app.catalog.discovery import CatalogSchema
from backend.app.queries.executor import ExecutionResult
from backend.app.verification import sql_scope
from backend.app.verification.models import ClarifyOption, Finding, SqlRunner, result_preview

# Statuses that usually should not count towards business totals.
NEGATIVE_STATUS = re.compile(r"cancel|refund|fail|void|reject|return|declin|deleted|test", re.I)
STATUS_COLUMN = re.compile(r"(^|_)(status|state|stage)($|_)", re.I)
# Measures whose business meaning depends on which statuses count.
MEASURE_TERMS = re.compile(
    r"\b(revenue|sales|income|turnover|earnings?|gmv|takings|jualan|hasil|pendapatan|untung)\b", re.I
)
NOW_TOKENS = re.compile(r"'now'|current_date|current_timestamp|\bnow\s*\(|getdate\s*\(|sysdate", re.I)
DATE_COLUMN = re.compile(r"(date|time|_at$|_on$|day|month|year|period)", re.I)
DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _q(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


async def check_grain(tree: exp.Expression, catalog: CatalogSchema, run_sql: SqlRunner) -> List[Finding]:
    """Detect SUM/AVG/COUNT over a table whose rows a join has duplicated."""
    findings: List[Finding] = []
    for select in sql_scope.aggregate_selects(tree):
        if not sql_scope.has_joins(select):
            continue
        select_sources = sql_scope.sources(select, catalog)
        at_risk: Dict[str, tuple[sql_scope.Source, str, str]] = {}
        for aggregate in select.find_all(exp.Sum, exp.Avg, exp.Count):
            if sql_scope.owning_select(aggregate) is not select:
                continue
            if isinstance(aggregate, exp.Count) and (aggregate.args.get("distinct") or isinstance(aggregate.this, exp.Distinct)):
                continue
            for column in aggregate.find_all(exp.Column):
                source = sql_scope.column_source(column, select_sources)
                key = sql_scope.primary_key(source.table) if source else None
                if source and key and column.name.lower() != key.lower():
                    at_risk.setdefault(source.alias.lower(), (source, key, aggregate.sql()))
        for source, key, aggregate_sql in at_risk.values():
            probe = sql_scope.strip_shape(sql_scope.with_root_ctes(select, tree))
            probe.set("expressions", [
                exp.alias_(exp.Count(this=exp.Star()), "n_rows"),
                exp.alias_(exp.Count(this=exp.Distinct(expressions=[exp.column(key, table=source.alias)])), "n_keys"),
            ])
            probe_sql = probe.sql()
            result = await run_sql(probe_sql)
            if result.error or not result.rows:
                continue
            n_rows, n_keys = result.rows[0][0] or 0, result.rows[0][1] or 0
            if n_keys and n_rows > n_keys:
                ratio = n_rows / n_keys
                table = source.table.name
                findings.append(Finding(
                    check="grain",
                    severity="blocking",
                    title=f"Joins repeat each row of {table} about {ratio:.1f} times",
                    detail=(
                        f"After the joins, {n_rows:,} rows remain for {n_keys:,} distinct {table}. "
                        f"{aggregate_sql} therefore counts some {table} rows more than once."
                    ),
                    repair_hint=(
                        f"{aggregate_sql} is inflated because joining makes each {table} row appear about "
                        f"{ratio:.1f} times. Compute it at the {table} level: aggregate the joined tables in a "
                        f"subquery grouped by {table}.{key} before joining, use EXISTS for joins that only filter, "
                        f"or drop joins the question does not need."
                    ),
                    probe_sql=probe_sql,
                    data={"table": table, "rows": n_rows, "keys": n_keys, "ratio": round(ratio, 3)},
                ))
    return findings


async def check_definitions(
    tree: exp.Expression,
    question: str,
    catalog: CatalogSchema,
    run_sql: SqlRunner,
    definitions: List[Dict[str, Any]],
) -> tuple[List[Finding], List[ClarifyOption], List[Dict[str, Any]]]:
    """Check business-term filters against approved definitions or status columns.

    Returns findings, clarify options (alternative interpretations with their
    results) and the approved definitions that applied.
    """
    findings: List[Finding] = []
    options: List[ClarifyOption] = []
    used: List[Dict[str, Any]] = []
    lowered_question = question.lower()

    selects = sql_scope.aggregate_selects(tree) or list(tree.find_all(exp.Select))[:1]
    for select in selects:
        select_sources = sql_scope.sources(select, catalog)
        filtered = set(sql_scope.where_columns(select, select_sources))
        tables = {source.table.name.lower(): source for source in select_sources.values()}

        for definition in definitions:
            terms = [definition.get("term", "")] + list(definition.get("synonyms") or [])
            if not any(term and re.search(rf"\b{re.escape(term.lower())}\b", lowered_question) for term in terms):
                continue
            table = str(definition.get("table") or "").lower()
            column = str(definition.get("column") or "").lower()
            if table not in tables:
                continue
            used.append(definition)
            if column and (table, column) not in filtered:
                findings.append(Finding(
                    check="definition",
                    severity="blocking",
                    title=f"Does not apply the approved definition of \"{definition['term']}\"",
                    detail=f"The approved definition filters {table}.{column}: {definition.get('filter_sql')}.",
                    repair_hint=(
                        f"Apply the approved definition of {definition['term']}: add the filter "
                        f"{definition.get('filter_sql')} on {table}."
                    ),
                    data={"definition_id": definition.get("id")},
                ))

        if used or not MEASURE_TERMS.search(question):
            continue
        # A deliberate filter on any status column settles the table's status question.
        settled_tables = {table for table, column in filtered if STATUS_COLUMN.search(column)}
        for source in select_sources.values():
            if source.table.name.lower() in settled_tables:
                continue
            for column in source.table.columns:
                if not STATUS_COLUMN.search(column.name) or (source.table.name.lower(), column.name.lower()) in filtered:
                    continue
                if not re.search(r"char|text|string|varchar", column.type or "text", re.I) and column.type:
                    continue
                distribution = await run_sql(
                    f"SELECT {_q(column.name)}, COUNT(*) FROM {_q(source.table.name)} "
                    f"GROUP BY {_q(column.name)} ORDER BY COUNT(*) DESC LIMIT 20"
                )
                if distribution.error or not distribution.rows or len(distribution.rows) > 12:
                    continue
                negative = [row[0] for row in distribution.rows if row[0] is not None and NEGATIVE_STATUS.search(str(row[0]))]
                if not negative or any(str(value).lower() in lowered_question for value in negative):
                    continue
                counts = ", ".join(f"{row[0]} {row[1]:,}" for row in distribution.rows)
                variant = select.copy()
                values = ", ".join("'" + str(value).replace("'", "''") + "'" for value in negative)
                variant = variant.where(f"{_q(source.alias)}.{_q(column.name)} NOT IN ({values})")
                variant_tree = _replace_select(tree, select, variant)
                variant_sql = variant_tree.sql()
                variant_result = await run_sql(variant_sql)
                if variant_result.error:
                    continue
                findings.append(Finding(
                    check="definition",
                    severity="ambiguity",
                    title=f"Includes {', '.join(str(v) for v in negative)} {source.table.name}",
                    detail=(
                        f"{source.table.name}.{column.name} is not filtered, so every status counts ({counts}). "
                        "Whether these count depends on the company's definition."
                    ),
                    data={"table": source.table.name, "column": column.name, "excluded": negative},
                ))
                options.append(ClarifyOption(
                    label=f"Exclude {', '.join(str(v) for v in negative)} {source.table.name}",
                    sql=variant_sql,
                    preview=result_preview(variant_result),
                ))
                break
    return findings, options, used


def _replace_select(tree: exp.Expression, old: exp.Select, new: exp.Select) -> exp.Expression:
    if old is tree:
        root_with = tree.args.get("with_") or tree.args.get("with")
        if root_with is not None and (new.args.get("with_") or new.args.get("with")) is None:
            new.set("with_" if "with_" in new.arg_types else "with", root_with.copy())
        return new
    copy = tree.copy()
    for node in copy.find_all(exp.Select):
        if node == old:
            node.replace(new)
            break
    return copy


async def check_periods(
    tree: exp.Expression,
    sql: str,
    catalog: CatalogSchema,
    run_sql: SqlRunner,
    result: ExecutionResult,
    today: Optional[date] = None,
) -> List[Finding]:
    """Check date filters against the dates actually present in the data."""
    findings: List[Finding] = []
    today = today or date.today()
    uses_now = bool(NOW_TOKENS.search(sql))
    for select in tree.find_all(exp.Select):
        select_sources = sql_scope.sources(select, catalog)
        where = select.args.get("where")
        if where is None:
            continue
        for column in where.find_all(exp.Column):
            source = sql_scope.column_source(column, select_sources)
            if not source or not DATE_COLUMN.search(column.name):
                continue
            coverage = await run_sql(
                f"SELECT MIN({_q(column.name)}), MAX({_q(column.name)}) FROM {_q(source.table.name)}"
            )
            if coverage.error or not coverage.rows or coverage.rows[0][1] is None:
                continue
            first, last = str(coverage.rows[0][0]), str(coverage.rows[0][1])
            last_date = _to_date(last)
            key = f"{source.table.name}.{column.name}"
            if uses_now and last_date and last_date < today - timedelta(days=30):
                findings.append(Finding(
                    check="period",
                    severity="blocking",
                    title="Relative dates use today's date, but the data ends earlier",
                    detail=f"{key} runs from {first} to {last}, but the query measures periods from today ({today}).",
                    repair_hint=(
                        f"The data in {key} ends on {last}. Interpret relative periods such as 'last month' "
                        f"relative to that latest date, not to the current date."
                    ),
                    data={"column": key, "min": first, "max": last},
                ))
                uses_now = False
            if _has_time_component(last):
                for literal in _upper_bounds(where, column):
                    if DATE_ONLY.match(literal):
                        findings.append(Finding(
                            check="period",
                            severity="blocking",
                            title="Date upper bound drops most of its last day",
                            detail=(
                                f"{key} stores times (for example {last}), so a bound of '{literal}' "
                                f"excludes records after midnight on {literal}."
                            ),
                            repair_hint=(
                                f"{key} contains times. Replace the inclusive upper bound '{literal}' with "
                                f"'< ' the following day so the whole of {literal} is included."
                            ),
                            data={"column": key, "bound": literal},
                        ))
            if not result.rows and not result.error:
                findings.append(Finding(
                    check="period",
                    severity="warning",
                    title="No data in the requested period",
                    detail=f"The query returned no rows. {key} covers {first} to {last}.",
                    data={"column": key, "min": first, "max": last},
                ))
    return _dedupe(findings)


def check_sanity(result: ExecutionResult) -> List[Finding]:
    findings: List[Finding] = []
    if result.error:
        return findings
    if not result.rows:
        findings.append(Finding(check="sanity", severity="warning", title="The query returned no rows", detail="There is no data matching the question as interpreted."))
        return findings
    if result.is_truncated:
        findings.append(Finding(
            check="sanity",
            severity="warning",
            title=f"Showing only the first {len(result.rows):,} rows",
            detail="The result was cut off at the row limit, so totals computed from these rows would be incomplete.",
        ))
    for index, name in enumerate(result.columns):
        values = [row[index] for row in result.rows if index < len(row)]
        if values and all(value is None for value in values):
            findings.append(Finding(check="sanity", severity="warning", title=f"Column {name} is empty", detail=f"Every value of {name} is NULL."))
    return findings


def _to_date(value: str) -> Optional[date]:
    for length, pattern in ((19, "%Y-%m-%d %H:%M:%S"), (19, "%Y-%m-%dT%H:%M:%S"), (10, "%Y-%m-%d")):
        try:
            return datetime.strptime(value[:length], pattern).date()
        except ValueError:
            continue
    return None


def _has_time_component(value: str) -> bool:
    return bool(re.match(r"^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}", value)) and not value[11:19] == "00:00:00"


def _upper_bounds(where: exp.Expression, column: exp.Column) -> List[str]:
    bounds: List[str] = []
    for node in where.find_all(exp.Between):
        if node.this == column and isinstance(node.args.get("high"), exp.Literal):
            bounds.append(node.args["high"].this)
    for node in where.find_all(exp.LTE):
        if node.this == column and isinstance(node.expression, exp.Literal):
            bounds.append(node.expression.this)
    return bounds


def _dedupe(findings: List[Finding]) -> List[Finding]:
    seen = set()
    unique = []
    for finding in findings:
        key = (finding.check, finding.title, finding.detail)
        if key not in seen:
            seen.add(key)
            unique.append(finding)
    return unique
