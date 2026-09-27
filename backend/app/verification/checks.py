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
# Yes/no flags that mark rows most totals leave out, e.g. AutoCount's Cancelled = 'T'.
FLAG_COLUMN = re.compile(r"^(is_?)?(cancel+ed|void(ed)?|deleted|rejected)$", re.I)
TRUE_VALUES = {"t", "y", "1", "true", "yes"}
FLAG_VALUES = TRUE_VALUES | {"f", "n", "0", "false", "no"}
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
        settled_tables = {table for table, column in filtered if STATUS_COLUMN.search(column) or FLAG_COLUMN.search(column)}
        for source in select_sources.values():
            if source.table.name.lower() in settled_tables:
                continue
            for column in source.table.columns:
                is_flag = bool(FLAG_COLUMN.search(column.name))
                if not (STATUS_COLUMN.search(column.name) or is_flag) or (source.table.name.lower(), column.name.lower()) in filtered:
                    continue
                if column.type and not re.search(r"char|text|string" + (r"|int|bit|bool" if is_flag else ""), column.type, re.I):
                    continue
                distribution = await run_sql(
                    f"SELECT {_q(column.name)}, COUNT(*) FROM {_q(source.table.name)} "
                    f"GROUP BY {_q(column.name)} ORDER BY COUNT(*) DESC LIMIT 20"
                )
                if distribution.error or not distribution.rows or len(distribution.rows) > 12:
                    continue
                if is_flag:
                    # A flag such as AutoCount's Cancelled = 'T': its "true" rows are the ones in question.
                    values = {str(row[0]).strip().lower() for row in distribution.rows if row[0] is not None}
                    if not values or not values <= FLAG_VALUES:
                        continue
                    negative = [row[0] for row in distribution.rows if row[0] is not None and str(row[0]).strip().lower() in TRUE_VALUES]
                    named = column.name.lower()[:6] in lowered_question
                else:
                    negative = [row[0] for row in distribution.rows if row[0] is not None and NEGATIVE_STATUS.search(str(row[0]))]
                    # A question that already names these statuses ("cancellations", "refunds") has decided.
                    named = any(str(value).lower()[:6] in lowered_question for value in negative)
                if not negative or named:
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
                excluded = (f"{source.table.name} marked {column.name}" if is_flag
                            else f"{', '.join(str(v) for v in negative)} {source.table.name}")
                findings.append(Finding(
                    check="definition",
                    severity="ambiguity",
                    title=f"Includes {excluded}",
                    detail=(
                        f"{source.table.name}.{column.name} is not filtered, so every row counts ({counts}). "
                        "Whether these count depends on the company's definition."
                    ),
                    data={"table": source.table.name, "column": column.name, "excluded": negative},
                ))
                options.append(ClarifyOption(
                    label=f"Exclude {excluded}",
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


# Words that describe how a figure is computed rather than what it is about.
GENERIC_TERMS = {
    "total", "totals", "sum", "count", "counts", "number", "numbers", "amount", "amounts", "average", "avg", "mean",
    "median", "min", "max", "minimum", "maximum", "highest", "lowest", "largest", "smallest", "biggest", "most",
    "least", "value", "values", "rate", "rates", "ratio", "percent", "percentage", "pct", "share", "each", "first",
    "last", "latest", "earliest", "name", "names", "list", "growth", "change", "difference", "diff", "rank",
    "ranking", "year", "years", "month", "months", "week", "weeks", "day", "days", "quarter", "quarters", "period",
    "time", "times", "hour", "hours", "minutes", "result", "overall", "grand", "net", "gross", "revenue", "sales",
    "sale", "income", "turnover", "earnings", "profit", "profits", "margin", "units", "unit", "sold", "spend",
    "spent", "cost", "costs", "price", "prices", "many", "much", "distinct", "unique", "record", "records", "item",
    "items", "entry", "entries", "frequency", "occurrences", "size", "level", "top", "bottom", "yearly", "monthly",
    "weekly", "daily", "annual", "annually", "cumulative", "running", "status", "type", "category", "group",
    "label", "flag", "jumlah", "purata", "bilangan", "ramai", "peratus", "tertinggi", "terendah", "hasil", "jualan",
    "pendapatan", "full", "lost", "loss", "losses", "leakage", "gain", "gains", "paid", "bought", "made", "owed", "owing", "outstanding", "nilai", "banyak", "setiap", "seunit", "lepas", "paling", "kita", "yang",
    "january", "february", "march", "april", "june", "july", "august", "september", "october", "november",
    "december", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "januari",
    "februari", "mac", "julai", "ogos", "oktober", "disember",
}


def _describes_action(token: str) -> bool:
    """Verb forms describe a filter or event, not a missing thing.

    English: placed, collected, shipping. Bahasa Malaysia: dihantar, dikutip,
    membeli, berjaya, terjual.
    """
    if len(token) <= 5:
        return False
    return token.endswith(("ed", "ing")) or (len(token) > 6 and token.startswith(("di", "mem", "men", "meng", "ber", "ter")))


def _stem(token: str) -> str:
    if token.endswith("ies") and len(token) > 4:
        return token[:-3] + "y"
    if token.endswith("s") and not token.endswith("ss") and len(token) > 3:
        return token[:-1]
    return token


def _abbreviates(short: str, word: str) -> bool:
    """True when `short` abbreviates `word`: avg/average, qty/quantity, cust/customer.

    A contiguous prefix only counts when little is cut off, so "sale" does not
    stand for "salesperson".
    """
    if len(short) < 3 or len(short) >= len(word) or short[0] != word[0]:
        return False
    if word.startswith(short):
        return len(word) - len(short) <= 5
    remaining = iter(word)
    return all(char in remaining for char in short)


def schema_vocabulary(catalog: CatalogSchema, definitions: Optional[List[Dict[str, Any]]] = None) -> set:
    """Every word that names something in this database: tables, columns, descriptions, sample values."""
    from backend.app.agent.retrieval import tokenize

    words: set = set()
    for table in catalog.tables.values():
        words.update(tokenize(table.name))
        words.update(tokenize(table.description or ""))
        for column in table.columns:
            words.update(tokenize(column.name))
            for value in column.sample_values or []:
                if isinstance(value, str) and len(value) <= 80:
                    words.update(tokenize(value))
    for definition in definitions or []:
        for term in [definition.get("term", "")] + list(definition.get("synonyms") or []):
            words.update(tokenize(term))
    return {_stem(word) for word in words if len(word) >= 2}


def _grounded(term: str, vocabulary: set) -> bool:
    from backend.app.agent.retrieval import MALAY_TERMS, QUERY_ALIASES

    stem = _stem(term)
    if term in GENERIC_TERMS or stem in GENERIC_TERMS or stem in vocabulary or term in vocabulary:
        return True
    related = QUERY_ALIASES.get(term, []) + QUERY_ALIASES.get(stem, []) + MALAY_TERMS.get(term, [])
    if any(_stem(word) in vocabulary for word in related):
        return True
    # Schema words are often abbreviated (AvgScrMath) or split (sales_person for salesperson).
    if any(_abbreviates(word, stem) for word in vocabulary):
        return True
    return any(
        stem[:i] in vocabulary and stem[i:] in vocabulary for i in range(3, len(stem) - 2)
    )


def check_grounding(
    tree: exp.Expression,
    question: str,
    catalog: CatalogSchema,
    definitions: Optional[List[Dict[str, Any]]] = None,
) -> List[Finding]:
    """Detect a query that relabels unrelated data as something the database does not contain.

    When a question asks for a concept the data lacks ("which salesperson closed the
    most deals?"), a model tends to pick a nearby column and name the output after the
    concept (customer_id AS salesperson_id). The label is then the only place the
    concept appears. Flag labels whose words come from the question but match no
    table, column, value or approved definition.
    """
    from backend.app.agent.retrieval import MALAY_TERMS, tokenize

    tokens = tokenize(question)
    # A Malay question often gets English labels (kepuasan -> satisfaction_score).
    translated = [word for token in tokens for word in MALAY_TERMS.get(token, [])]
    question_words = {_stem(token) for token in tokens + translated if len(token) >= 4}
    if not question_words:
        return []
    vocabulary = schema_vocabulary(catalog, definitions)
    missing: Dict[str, str] = {}
    for alias in tree.find_all(exp.Alias):
        label = alias.alias
        if not label:
            continue
        # Coded values stand for the concept they abbreviate: element = 'cl' for chlorine.
        codes = [str(literal.this).lower() for literal in alias.this.find_all(exp.Literal) if literal.is_string]
        for token in tokenize(label):
            stem = _stem(token)
            if len(token) < 4 or stem not in question_words or stem in missing:
                continue
            if any(code and code[0] == token[0] and (len(code) <= 2 or _abbreviates(code, token)) for code in codes):
                continue
            if not _grounded(token, vocabulary) and not _describes_action(token):
                missing[stem] = f"{alias.this.sql()} AS {label}"
    if not missing:
        return []
    terms = ", ".join(f'"{term}"' for term in missing)
    relabelled = "; ".join(missing.values())
    return [Finding(
        check="coverage",
        severity="blocking",
        title=f"The data has nothing about {terms}",
        detail=(
            f"No table, column or value in this database mentions {terms}. The query labels other data "
            f"with that name ({relabelled}), so the figure would answer a different question."
        ),
        repair_hint=(
            f"The database has no data about {terms}. Do not relabel an unrelated column as {terms}. "
            "Use only columns that genuinely represent what the question asks for."
        ),
        data={"terms": list(missing), "relabelled": list(missing.values())},
    )]


async def check_filter_values(tree: exp.Expression, catalog: CatalogSchema, run_sql: SqlRunner) -> List[Finding]:
    """Detect text filters that match nothing in the data, such as status = 'Refunded' when the data says 'refunded'.

    A wrong filter value silently turns a total into zero or an empty list. When the value
    exists with different letter case, the query is certainly wrong (blocking, with a repair
    hint). When it does not exist at all and the column has few distinct values, the answer
    carries a warning listing the values the data does use.
    """
    findings: List[Finding] = []
    seen: set = set()
    for select in tree.find_all(exp.Select):
        where = select.args.get("where")
        if where is None:
            continue
        select_sources = sql_scope.sources(select, catalog)
        pairs: List[tuple[exp.Column, str]] = []
        for node in where.find_all(exp.EQ, exp.In):
            if isinstance(node, exp.EQ):
                left, right = node.this, node.expression
                if isinstance(right, exp.Column) and isinstance(left, exp.Literal):
                    left, right = right, left
                if isinstance(left, exp.Column) and isinstance(right, exp.Literal) and right.is_string:
                    pairs.append((left, right.this))
            elif isinstance(node.this, exp.Column) and not node.args.get("query"):
                pairs += [(node.this, item.this) for item in node.expressions if isinstance(item, exp.Literal) and item.is_string]
        for column, literal in pairs:
            source = sql_scope.column_source(column, select_sources)
            key = (source.table.name.lower(), column.name.lower(), literal) if source else None
            if not source or key in seen:
                continue
            seen.add(key)
            distinct = await run_sql(
                f"SELECT DISTINCT {_q(column.name)} FROM {_q(source.table.name)} WHERE {_q(column.name)} IS NOT NULL LIMIT 41"
            )
            if distinct.error or not distinct.rows:
                continue
            values = [str(row[0]) for row in distinct.rows]
            if literal in values:
                continue
            name = f"{source.table.name}.{column.name}"
            # MySQL's default collations ignore case, so only an absent value matters there.
            same_case = [] if catalog.engine == "mysql" else [value for value in values if value.lower() == literal.lower()]
            if not same_case and len(values) <= 40:
                # Only a complete list shows the value is absent; long lists may be truncated.
                exact = await run_sql(
                    f"SELECT COUNT(*) FROM {_q(source.table.name)} WHERE {_q(column.name)} = '{literal.replace(chr(39), chr(39) * 2)}'"
                )
                if exact.error or not exact.rows or exact.rows[0][0]:
                    continue
            if same_case:
                findings.append(Finding(
                    check="filter",
                    severity="blocking",
                    title=f"'{literal}' does not match the data's '{same_case[0]}'",
                    detail=f"{name} stores '{same_case[0]}'; the filter '{literal}' matches no rows because the letter case differs.",
                    repair_hint=f"In {name}, use '{same_case[0]}' instead of '{literal}'; text comparisons are case-sensitive.",
                    data={"column": name, "value": literal, "suggested": same_case[0]},
                ))
            elif len(values) <= 40:
                shown = ", ".join(f"'{value}'" for value in values[:12]) + (" ..." if len(values) > 12 else "")
                findings.append(Finding(
                    check="filter",
                    severity="warning",
                    title=f"No record has {column.name} = '{literal}'",
                    detail=f"The filter on {name} matches nothing, so this figure may be zero or empty for that reason. Values in the data: {shown}.",
                    data={"column": name, "value": literal, "values": values[:40]},
                ))
    return findings


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
