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
FLAG_FAMILIES = [{"t", "f"}, {"y", "n"}, {"1", "0"}, {"true", "false"}, {"yes", "no"}]


def _flag_family(values: List[str]) -> set:
    """The coding a yes/no column uses ({'t','f'} for AutoCount), judged from its values."""
    present = {v.strip().lower() for v in values}
    return next((family for family in FLAG_FAMILIES if present and present <= family), present)


def _similar(literal: str, values: List[str]) -> Optional[str]:
    """A real value the literal is probably a misspelling of (canceled / cancelled)."""
    import difflib

    lowered = literal.lower()
    for value in values:
        if len(lowered) >= 4 and value.lower()[:4] == lowered[:4] and value.lower() != lowered:
            return value
    close = difflib.get_close_matches(lowered, [v.lower() for v in values], n=1, cutoff=0.8)
    return next((v for v in values if close and v.lower() == close[0]), None)
CASE_INSENSITIVE_ENGINES = {"mysql", "sqlserver", "mssql"}
FLAG_VALUES = TRUE_VALUES | {"f", "n", "0", "false", "no"}
# Words for the same measure: approving one meaning of "sales" also settles "revenue" and "jualan".
SALES_WORDS = ["sales", "revenue", "turnover", "jualan", "hasil", "pendapatan"]
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
        keyed: Dict[str, tuple[sql_scope.Source, str]] = {}
        # Tables each aggregate reads, and those it only multiplies by another table's column:
        # in SUM(l.Qty * i.UnitCost) the item's cost is a rate applied to each invoice line.
        aggregate_aliases: List[tuple[set, set]] = []
        for aggregate in select.find_all(exp.Sum, exp.Avg, exp.Count):
            if sql_scope.owning_select(aggregate) is not select:
                continue
            if isinstance(aggregate, exp.Count) and (aggregate.args.get("distinct") or isinstance(aggregate.this, exp.Distinct)):
                continue
            aliases, unscaled = set(), set()
            for column in aggregate.find_all(exp.Column):
                source = sql_scope.column_source(column, select_sources)
                key = sql_scope.primary_key(source.table) if source else None
                if source and key:
                    alias = source.alias.lower()
                    aliases.add(alias)
                    keyed.setdefault(alias, (source, key))
                    product = column.find_ancestor(exp.Mul)
                    if product is not None and any(node is aggregate for node in product.walk()):
                        product = None  # SUM(x) * 2: the product is outside the aggregate
                    partners = {
                        other.alias.lower() for other in (
                            sql_scope.column_source(c, select_sources) for c in (product.find_all(exp.Column) if product else [])
                        ) if other is not None and other.alias.lower() != alias
                    }
                    if not partners:
                        unscaled.add(alias)
                if source and key and column.name.lower() != key.lower():
                    at_risk.setdefault(source.alias.lower(), (source, key, aggregate.sql()))
            aggregate_aliases.append((aliases, aliases - unscaled))

        async def repetition(source: sql_scope.Source, key: str):
            probe = sql_scope.strip_shape(sql_scope.with_root_ctes(select, tree))
            probe.set("expressions", [
                exp.alias_(exp.Count(this=exp.Star()), "n_rows"),
                exp.alias_(exp.Count(this=exp.Distinct(expressions=[exp.column(key, table=source.alias)])), "n_keys"),
            ])
            probe_sql = probe.sql()
            result = await run_sql(probe_sql)
            if result.error or not result.rows:
                return probe_sql, None
            return probe_sql, (result.rows[0][0] or 0, result.rows[0][1] or 0)

        clean: Dict[str, bool] = {}

        async def is_clean(alias: str) -> bool:
            """True when the joins leave each row of this table exactly once."""
            if alias not in clean:
                _, counts = await repetition(*keyed[alias])
                clean[alias] = bool(counts and counts[1] and counts[0] == counts[1])
            return clean[alias]

        for alias, (source, key, aggregate_sql) in at_risk.items():
            probe_sql, counts = await repetition(source, key)
            if not counts:
                continue
            n_rows, n_keys = counts
            clean[alias] = bool(n_keys and n_rows == n_keys)
            if n_keys and n_rows > n_keys:
                # Every aggregate using this table also uses a table that is not repeated,
                # so it is computed at that finer level (quantity x unit cost per line).
                involved = [(aliases, scaled) for aliases, scaled in aggregate_aliases if alias in aliases]
                computed_finer = bool(involved) and all(alias in scaled for _, scaled in involved)
                for aliases, _ in involved:
                    if not computed_finer:
                        break
                    finer = False
                    for other in aliases - {alias}:
                        if await is_clean(other):
                            finer = True
                            break
                    if not finer:
                        computed_finer = False
                        break
                if computed_finer:
                    continue
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
                # The rule for "sales" applied to "how many invoices were issued": say so, since the
                # question never chose it (cancelled invoices were still issued).
                table = str(definition.get("table") or "").lower()
                column = str(definition.get("column") or "").lower()
                named = re.sub(r"^is_?", "", column)[:6]
                # "How many completed orders": a filter value the question names was chosen by the user.
                where = select.args.get("where")
                chosen = [str(node.this).lower() for node in where.find_all(exp.Literal) if node.is_string] if where is not None else []
                chosen += [value.lower() for value in re.findall(r"'([^']*)'", str(definition.get("filter_sql") or ""))]
                names_filter = named in lowered_question or any(len(v) >= 4 and v[:6] in lowered_question for v in chosen)
                if (column and table in tables and (table, column) in filtered and not names_filter
                        and _counts_documents_of(question, table, catalog)
                        and not any(f.data.get("spread_column") == (table, column) for f in findings if f.data)):
                    findings.append(Finding(
                        check="definition",
                        severity="warning",
                        title=f"Applies the approved rule for \"{definition['term']}\" to a question that does not mention it",
                        detail=(f"The query filters {definition.get('table')} with {definition.get('filter_sql')}, the approved "
                                f"meaning of \"{definition['term']}\". This question asks about something else, so check "
                                "whether those records should be left out here."),
                        data={"definition_id": definition.get("id"), "spread": True, "spread_column": (table, column)},
                    ))
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
        where = select.args.get("where")
        literals = [str(node.this).lower() for node in where.find_all(exp.Literal) if node.is_string] if where is not None else []
        assumed = sorted(f"{table}.{column}" for table, column in filtered
                         if table in settled_tables and (STATUS_COLUMN.search(column) or FLAG_COLUMN.search(column)))
        # "Revenue from completed orders" or "non-cancelled invoices": the user chose the filter.
        named_filter = any(len(value) >= 4 and value[:6] in lowered_question for value in literals) or any(
            re.sub(r"^is_?", "", name.split(".")[1].lower())[:6] in lowered_question for name in assumed)
        if settled_tables and not named_filter and not any(f.check == "definition" for f in findings):
            term = MEASURE_TERMS.search(question).group(0)
            findings.append(Finding(
                check="definition",
                severity="warning",
                title=f"Assumes which records count as \"{term}\"",
                detail=(f"There is no approved definition of \"{term}\", so this answer uses its own filter on "
                        f"{', '.join(assumed)}. Approve a definition so every answer uses the same one."),
                data={"assumed": assumed, "term": term},
            ))
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
                    named = re.sub(r"^is_?", "", column.name.lower())[:6] in lowered_question
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
                term = MEASURE_TERMS.search(question).group(0).lower()
                synonyms = [w for w in SALES_WORDS if w != term] if term in SALES_WORDS else []
                if len(negative) == 1:
                    rule = f"{column.name} <> '" + str(negative[0]).replace("'", "''") + "'"
                else:
                    rule = f"{column.name} NOT IN ({values})"
                options.append(ClarifyOption(
                    label=f"Exclude {excluded}",
                    sql=variant_sql,
                    preview=result_preview(variant_result),
                    definition={
                        "term": term, "synonyms": synonyms, "table_name": source.table.name,
                        "column_name": column.name, "filter_sql": rule,
                        "description": f"Leaves out {excluded}.",
                    },
                ))
                break
    return findings, options, used


def _counts_documents_of(question: str, table: str, catalog: CatalogSchema) -> bool:
    """"How many invoices were issued": a count of the table's own documents. Leaving cancelled
    ones out is a choice there; for "customers who bought" or "unpaid invoices" it is expected.
    The first counted noun that names a table decides ("how many customers have unpaid invoices"
    counts customers)."""
    from backend.app.agent.retrieval import QUERY_ALIASES, tokenize

    match = COUNT_QUESTION.search(question or "")
    if not match:
        return False
    names = {name.lower(): name.lower() for name in catalog.tables}
    for word in tokenize(match.group(1)):
        stem = _stem(word)
        for candidate in [stem, word] + QUERY_ALIASES.get(stem, []) + QUERY_ALIASES.get(word, []):
            named = names.get(candidate) or names.get(_stem(candidate))
            if named:
                return named == table
    return False


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


# "Last month", "this year", "bulan lepas": periods whose meaning depends on the reference date.
RELATIVE_PERIOD = re.compile(
    r"\b(last|this|previous|past|current)\s+(\d+\s+)?(day|week|month|quarter|year)s?\b|\b(year|month)[- ]to[- ]date\b|\bytd\b|\bmtd\b"
    r"|\b(bulan|tahun|minggu|suku)\s+(lepas|ini|lalu)\b|\b(yesterday|today|semalam)\b",
    re.I,
)


SHORT_PERIOD = re.compile(r"day|week|month|yesterday|today|semalam|mtd|minggu|bulan", re.I)


async def check_periods(
    tree: exp.Expression,
    sql: str,
    catalog: CatalogSchema,
    run_sql: SqlRunner,
    result: ExecutionResult,
    today: Optional[date] = None,
    question: str = "",
) -> List[Finding]:
    """Check date filters against the dates actually present in the data."""
    findings: List[Finding] = []
    today = today or date.today()
    reported_now = False
    relative = RELATIVE_PERIOD.search(question or "")
    stated = False
    for select in tree.find_all(exp.Select):
        select_sources = sql_scope.sources(select, catalog)
        where = select.args.get("where")
        if where is None:
            continue
        # Only a filter measured from today matters; today's date in SELECT (an age) is fine.
        uses_now = not reported_now and bool(NOW_TOKENS.search(where.sql()))
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
                uses_now, reported_now = False, True
            elif (relative and not stated and not NOW_TOKENS.search(where.sql()) and last_date
                  and last_date < today - timedelta(days=30) and result.rows
                  # A day, week or month counted from today would hold no data, so a non-empty answer
                  # was counted from where the data ends. A year or quarter may overlap: need MAX(date).
                  and (SHORT_PERIOD.search(relative.group(0))
                       or re.search(rf"max\s*\(\s*(\w+\.)?\"?{re.escape(column.name)}\"?\s*\)", sql, re.I))):
                # Measured from where the data ends: right, but a reader may assume the calendar. Say so.
                findings.append(Finding(
                    check="period",
                    severity="info",
                    title=f"\"{relative.group(0)}\" is measured from the latest data, not from today",
                    detail=(f"{key} ends on {last}, before today ({today}), so the period is counted back from "
                            f"where the data ends. Ask again with dates if you meant the calendar period."),
                    data={"column": key, "max": last, "assumption": True},
                ))
                stated = True
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
    "pendapatan", "full", "lost", "loss", "losses", "leakage", "gain", "gains", "paid", "bought", "made", "owed", "owing", "outstanding", "owes", "owe", "unpaid", "overdue", "due", "settled", "fund", "funds", "money", "spending", "faster", "slower", "higher", "lower", "greater", "bigger", "smaller", "larger", "longer", "shorter", "older", "younger", "earlier", "later", "better", "worse", "increase", "decrease", "decline", "rise", "drop", "delta", "repeat", "returning", "new", "active", "inactive", "churned", "churn", "retained", "retention", "loyal", "recurring", "lapsed", "dormant", "frequent", "conversion", "nilai", "banyak", "setiap", "seunit", "lepas", "paling", "kita", "yang",
    "january", "february", "march", "april", "june", "july", "august", "september", "october", "november",
    "december", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "januari",
    "februari", "mac", "julai", "ogos", "oktober", "disember",
}


# Calendar parts a query can compute from any date column (strftime('%w', d) AS weekday).
CALENDAR_LABELS = {"weekday", "week", "day", "hour", "month", "quarter", "year", "period", "date", "dow", "time", "minute"}
DATE_FUNCTION = re.compile(r"strftime|extract|date_trunc|datepart|datename|to_char|date_format|dayofweek|weekday|time_to_str|date\s*\(|hour\s*\(|month\s*\(|year\s*\(", re.I)


def _calendar_part(token: str, expression_sql: str) -> bool:
    """A label naming a calendar part, computed with a date function, is grounded in the date it comes from."""
    return _stem(token) in CALENDAR_LABELS and bool(DATE_FUNCTION.search(expression_sql))


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


# Columns about a person: their values (Siti, Hafiz) name people, not concepts the data covers.
PERSON_COLUMN = re.compile(r"(^|_)(full_?name|first_?name|last_?name|email|e_?mail|phone|mobile)($|_)", re.I)


def schema_vocabulary(catalog: CatalogSchema, definitions: Optional[List[Dict[str, Any]]] = None) -> set:
    """Every word that names something in this database: tables, columns, descriptions, sample values."""
    from backend.app.agent.retrieval import tokenize

    words: set = set()
    for table in catalog.tables.values():
        words.update(tokenize(table.name))
        words.update(tokenize(table.description or ""))
        for column in table.columns:
            words.update(tokenize(column.name))
            if PERSON_COLUMN.search(column.name):
                continue
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
    all_codes = [str(literal.this).lower() for literal in tree.find_all(exp.Literal) if literal.is_string]
    for alias in tree.find_all(exp.Alias):
        label = alias.alias
        if not label:
            continue
        # Coded values stand for the concept they abbreviate: element = 'cl' for chlorine.
        # Coded filter values anywhere in the query (gender = 'M') stand for what they abbreviate.
        codes = all_codes
        for token in tokenize(label):
            stem = _stem(token)
            if len(token) < 4 or token.isdigit() or stem not in question_words or stem in missing:
                continue
            if any(code and code[0] == token[0] and (len(code) <= 2 or _abbreviates(code, token)) for code in codes):
                continue
            if not _grounded(token, vocabulary) and not _describes_action(token) and not _calendar_part(token, alias.this.sql()):
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


def _filtered_column(node: exp.Expression) -> tuple[Optional[exp.Column], bool]:
    """The column a filter compares, looking through COALESCE/UPPER/LOWER/TRIM.

    Returns (column, case_insensitive)."""
    folded = False
    while isinstance(node, (exp.Coalesce, exp.Upper, exp.Lower, exp.Trim)):
        folded = folded or isinstance(node, (exp.Upper, exp.Lower))
        node = node.this
    return (node if isinstance(node, exp.Column) else None), folded


async def check_filter_values(tree: exp.Expression, catalog: CatalogSchema, run_sql: SqlRunner) -> List[Finding]:
    """Detect text filters whose values do not occur in the data.

    status = 'Refunded' when the data says 'refunded' silently turns a total into zero,
    and Cancelled <> 'Y' when the flag is 'T'/'F' silently excludes nothing, so
    cancelled invoices are counted. A value that differs only in letter case, or a
    missing value on a status or flag column, is blocking, and the repair is told the
    real values. Other missing values carry a warning listing the values in the data.
    """
    findings: List[Finding] = []
    seen: set = set()
    for select in tree.find_all(exp.Select):
        where = select.args.get("where")
        if where is None:
            continue
        select_sources = sql_scope.sources(select, catalog)
        # (column, literal, excludes, case_insensitive)
        filters: List[tuple] = []
        for node in where.find_all(exp.EQ, exp.NEQ, exp.In):
            if sql_scope.owning_select(node) is not select:
                continue  # a subquery's filters are checked with its own tables
            if isinstance(node, (exp.EQ, exp.NEQ)):
                left, right = node.this, node.expression
                if isinstance(left, exp.Literal):
                    left, right = right, left
                column, folded = _filtered_column(left)
                if column is not None and isinstance(right, exp.Literal) and right.is_string:
                    filters.append((column, right.this, isinstance(node, exp.NEQ), folded))
            elif not node.args.get("query"):
                column, folded = _filtered_column(node.this)
                excludes = isinstance(node.parent, exp.Not)
                if column is not None:
                    filters += [(column, item.this, excludes, folded) for item in node.expressions
                                if isinstance(item, exp.Literal) and item.is_string]
        # Group by column so an exclusion list is judged as a whole.
        grouped: Dict[tuple, Dict[str, Any]] = {}
        for column, literal, excludes, folded in filters:
            source = sql_scope.column_source(column, select_sources)
            if not source:
                continue
            key = (source.table.name.lower(), column.name.lower(), excludes)
            entry = grouped.setdefault(key, {"source": source, "column": column, "literals": [], "folded": folded})
            entry["literals"].append(literal)
        for key, entry in grouped.items():
            if key in seen:
                continue
            seen.add(key)
            excludes = key[2]
            source, column = entry["source"], entry["column"]
            distinct = await run_sql(
                f"SELECT DISTINCT {_q(column.name)} FROM {_q(source.table.name)} WHERE {_q(column.name)} IS NOT NULL LIMIT 41"
            )
            if distinct.error or not distinct.rows:
                continue
            values = [str(row[0]) for row in distinct.rows]
            complete = len(values) <= 40
            ignore_case = entry["folded"] or catalog.engine in CASE_INSENSITIVE_ENGINES
            present = {v.lower() for v in values} if ignore_case else set(values)
            absent = [lit for lit in entry["literals"] if (lit.lower() if ignore_case else lit) not in present]
            if not absent:
                continue
            name = f"{source.table.name}.{column.name}"
            is_flag = bool(FLAG_COLUMN.search(column.name))
            shown = ", ".join(f"'{value}'" for value in values[:12]) + (" ..." if len(values) > 12 else "")
            same_case = [] if ignore_case else [v for lit in absent for v in values if v.lower() == lit.lower()]
            if is_flag and complete:
                # A flag value from the column's own coding is fine even if no row has it yet
                # ('T' when nothing is cancelled); one from another coding ('Y' for a T/F flag) is a mistake.
                family = _flag_family(values)
                absent = [lit for lit in absent if lit.strip().lower() not in family]
                categorical = bool(absent)
            elif STATUS_COLUMN.search(column.name) and complete:
                # A status that simply has no rows is not a mistake; a misspelled one is.
                categorical = any(_similar(lit, values) for lit in absent)
                if excludes and not categorical:
                    continue
            else:
                categorical = False
            if not absent:
                continue
            listed = ", ".join(f"'{value}'" for value in absent)
            if excludes:
                # Judge an exclusion list as a whole: it fails when none of its values occur.
                if not complete or len(absent) < len(entry["literals"]):
                    continue
                findings.append(Finding(
                    check="filter",
                    severity="blocking" if categorical or same_case else "warning",
                    title=f"The exclusion on {column.name} removes nothing",
                    detail=(f"The query excludes {listed} from {name}, but those values never occur, "
                            f"so the rows it meant to leave out are still counted. Values in the data: {shown}."),
                    repair_hint=(f"{name} contains {shown}. Exclude the values that actually mark the rows "
                                 f"to leave out, instead of {listed}."),
                    data={"column": name, "values": values[:40], "absent": absent, "excludes": True},
                ))
                continue
            if same_case:
                findings.append(Finding(
                    check="filter",
                    severity="blocking",
                    title=f"'{absent[0]}' does not match the data's '{same_case[0]}'",
                    detail=f"{name} stores '{same_case[0]}'; the filter '{absent[0]}' matches no rows because the letter case differs.",
                    repair_hint=f"In {name}, use '{same_case[0]}' instead of '{absent[0]}'; text comparisons are case-sensitive.",
                    data={"column": name, "value": absent[0], "suggested": same_case[0]},
                ))
            elif complete:
                literal = absent[0].replace("'", "''")
                exact = await run_sql(f"SELECT COUNT(*) FROM {_q(source.table.name)} WHERE {_q(column.name)} = '{literal}'")
                if exact.error or not exact.rows or exact.rows[0][0]:
                    continue
                findings.append(Finding(
                    check="filter",
                    severity="blocking" if categorical else "warning",
                    title=f"No record has {column.name} = '{absent[0]}'",
                    detail=f"The filter on {name} matches nothing, so this figure may be zero or empty for that reason. Values in the data: {shown}.",
                    repair_hint=f"{name} contains {shown}. Use one of those values in the filter." if categorical else "",
                    data={"column": name, "value": absent[0], "values": values[:40]},
                ))
    return findings


COUNT_QUESTION = re.compile(
    r"\b(?:how many|number of|count of|berapa\s+(?:ramai|banyak)|bilangan)\s+((?:[\w&-]+\s+){0,3}[\w&-]+)", re.I
)
SUBJECT_QUESTION = re.compile(
    r"\b(?:which|what(?:\s+(?:is|are|was|were)\s+(?:our|my|your)(?:\s+(?:current|latest|total|overall|average))?)?)"
    r"\s+([a-z][\w-]*)(?:\s+([a-z][\w-]*))?|\b([a-z][\w-]*)\s+mana\b",
    re.I,
)
NOT_SUBJECTS = {"is", "are", "was", "were", "of", "one", "ones", "do", "does", "did", "has", "have", "the", "a", "an",
                "kind", "type", "types", "percentage", "percent", "proportion", "ratio", "amount", "number", "total", "yang",
                "time", "year", "month", "day", "date", "had", "made", "make", "sold", "bought", "got", "gave",
                "can", "will", "should", "would", "most", "least", "best", "worst",
                # Adverbs end the subject: "what customers still owe", "which items never sold".
                "still", "also", "just", "only", "ever", "never", "already", "currently", "really", "usually", "often",
                # Verbs end the subject too: "which products drove sales", "which regions grew".
                "drove", "drive", "drives", "grew", "grow", "grows", "fell", "fall", "falls", "rose", "rise", "rises",
                "led", "lead", "leads", "paid", "pay", "pays", "spent", "spend", "spends", "took", "take", "takes",
                "won", "win", "wins", "lost", "lose", "loses", "brought", "bring", "brings", "kept", "keep", "keeps",
                "sent", "send", "sends", "sell", "sells", "buy", "buys", "owe", "owes", "need", "needs", "generate", "generates"}


def _entity_table(words: List[str], catalog: CatalogSchema) -> Optional[Any]:
    """The catalog table a question noun names (customers, pelanggan), if any."""
    from backend.app.agent.retrieval import MALAY_TERMS, tokenize

    by_stem: Dict[str, Any] = {}
    for table in catalog.tables.values():
        parts = tokenize(table.name)
        if parts:
            by_stem.setdefault(_stem(parts[-1]), table)
            by_stem.setdefault(_stem("".join(parts)), table)
    for word in words:
        for candidate in [word] + MALAY_TERMS.get(word, []):
            table = by_stem.get(_stem(candidate.lower()))
            if table:
                return table
    return None


async def check_entity_count(tree: exp.Expression, question: str, catalog: CatalogSchema, run_sql: SqlRunner) -> List[Finding]:
    """Detect a count of rows where the question asks how many distinct things.

    "How many customers have ordered?" answered with COUNT(customer_id) FROM orders
    counts orders; and COUNT(p.id) after a join can count each patient several times.
    A probe compares rows with distinct keys, so a one-to-one count is never flagged.
    """
    from backend.app.agent.retrieval import tokenize

    match = COUNT_QUESTION.search(question or "")
    entity = _entity_table(tokenize(match.group(1)), catalog) if match else None
    if entity is None:
        return []
    findings: List[Finding] = []
    for select in sql_scope.aggregate_selects(tree):
        select_sources = sql_scope.sources(select, catalog)
        returned = [node for expression in select.expressions for node in expression.find_all(exp.Count)]
        for count in returned:  # counts in HAVING or ORDER BY filter groups; they are not the answer
            if sql_scope.owning_select(count) is not select:
                continue
            if count.args.get("distinct") or isinstance(count.this, exp.Distinct):
                continue
            if count.this is None or isinstance(count.this, exp.Star):
                if len(select_sources) != 1:
                    continue
                source = next(iter(select_sources.values()))
            else:
                column = count.find(exp.Column)
                source = sql_scope.column_source(column, select_sources) if column is not None else None
            if source is None:
                continue
            if source.table.name.lower() == entity.name.lower():
                key = sql_scope.primary_key(entity)
                if not key or not sql_scope.has_joins(select):
                    continue
                key_sql = exp.column(key, table=source.alias)
            else:
                link = next((fk for fk in source.table.foreign_keys if fk.to_table.lower() == entity.name.lower()), None)
                if link is None:
                    continue
                key_sql = exp.column(link.from_column, table=source.alias)
            probe = sql_scope.strip_shape(sql_scope.with_root_ctes(select, tree))
            probe.set("expressions", [
                exp.alias_(exp.Count(this=exp.Star()), "n_rows"),
                exp.alias_(exp.Count(this=exp.Distinct(expressions=[key_sql.copy()])), "n_distinct"),
            ])
            result = await run_sql(probe.sql())
            if result.error or not result.rows:
                continue
            n_rows, n_distinct = result.rows[0][0] or 0, result.rows[0][1] or 0
            if n_distinct and n_rows > n_distinct:
                noun = entity.name.replace("_", " ")
                findings.append(Finding(
                    check="grain",
                    severity="blocking",
                    title=f"Counts {n_rows:,} rows, not {n_distinct:,} distinct {noun}",
                    detail=(
                        f"The question asks how many {noun}, but {count.sql()} counts {source.table.name} rows, "
                        f"so some {noun} are counted more than once."
                    ),
                    repair_hint=f"Count distinct {noun}: use COUNT(DISTINCT {key_sql.sql()}) instead of {count.sql()}.",
                    probe_sql=probe.sql(),
                    data={"rows": n_rows, "distinct": n_distinct, "entity": entity.name},
                ))
                return findings
    return findings


def check_answer_subject(question: str, catalog: CatalogSchema, definitions: Optional[List[Dict[str, Any]]] = None) -> List[Finding]:
    """Hand off "which X" questions when nothing in the database represents X.

    "Which salesperson closed the most deals?" (or "Jurujual mana ...") cannot be answered
    from data with no salespeople, whatever the SQL returns.
    """
    from backend.app.agent.retrieval import MALAY_TERMS

    vocabulary = schema_vocabulary(catalog, definitions)
    has_dates = any(DATE_COLUMN.search(c.name) or re.search(r"date|time", c.type or "", re.I)
                    for t in catalog.tables.values() for c in t.columns)
    for match in SUBJECT_QUESTION.finditer(question or ""):
        # "which delivery driver": the subject noun may be the first or second word.
        words = [match.group(1), match.group(2)] if match.group(1) else [match.group(3)]
        candidates = []
        for word in (w.lower() for w in words if w):
            if word in NOT_SUBJECTS or _describes_action(word):
                break
            candidates.append(word)
        missing = None
        for word in candidates:
            if len(word) < 4 or word in GENERIC_TERMS:
                continue
            translations = MALAY_TERMS.get(word, [])
            # "Which weekdays / months / hours": calendar parts come from any date column.
            if _stem(word) in CALENDAR_LABELS and has_dates:
                continue
            if not (_grounded(word, vocabulary) or any(_grounded(t, vocabulary) for t in translations)):
                missing = (word, translations)
                break
        if not missing:
            continue
        word, translations = missing
        shown = translations[0] if translations else word
        return [Finding(
            check="coverage",
            severity="blocking",
            title=f"The data has nothing about \"{shown}\"",
            detail=f"The question asks which {shown}, but no table, column or value in this database represents one.",
            data={"terms": [shown]},
        )]
    return []


def check_correlated_subqueries(tree: exp.Expression, catalog: CatalogSchema) -> List[Finding]:
    """Detect EXISTS (subquery) conditions that never refer to the outer query's rows.

    "Invoices that include rice" written as EXISTS (SELECT 1 FROM ItemGroup WHERE
    Description = 'Rice') is true for every invoice, so it filters nothing.
    """
    findings: List[Finding] = []
    for node in tree.find_all(exp.Exists):
        inner = node.find(exp.Select)
        outer = node.find_ancestor(exp.Select)
        if inner is None or outer is None:
            continue
        outer_sources = sql_scope.sources(outer, catalog)
        inner_sources = sql_scope.sources(inner, catalog)
        inner_columns = {column.name.lower() for source in inner_sources.values() for column in source.table.columns}
        outer_columns = {column.name.lower() for source in outer_sources.values() for column in source.table.columns}
        correlated = False
        for column in inner.find_all(exp.Column):
            qualifier = (column.table or "").lower()
            if qualifier and qualifier in outer_sources and qualifier not in inner_sources:
                correlated = True
            elif not qualifier and column.name.lower() in outer_columns and column.name.lower() not in inner_columns:
                correlated = True
            if correlated:
                break
        if not correlated and outer_sources:
            tables = ", ".join(sorted(source.table.name for source in outer_sources.values()))
            findings.append(Finding(
                check="grain",
                severity="blocking",
                title="An EXISTS condition does not depend on the row being tested",
                detail=(f"The EXISTS subquery never refers to {tables}, so it is true (or false) for every row "
                        f"and does not filter anything."),
                repair_hint=(f"Link the EXISTS subquery to the outer row, for example with a condition that joins "
                             f"its tables to {tables} on their shared key."),
            ))
    return findings


ADMISSION = re.compile(
    r"\b(cannot|can't|can ?not|unable to|not (?:possible|available|supported|present|represented)|no (?:such |matching |relevant )?"
    r"(?:table|column|data|field|information)|does not (?:exist|contain|have)|doesn't (?:exist|contain|have)|"
    r"closest (?:answer|approximation)|approximat|as a proxy|instead of)\b",
    re.I,
)


def check_admissions(sql: str) -> List[Finding]:
    """The model sometimes explains, in a SQL comment, that it could not do what was asked
    (-- the schema has no invoice line table, so this returns all invoices) and answers anyway."""
    comments = re.findall(r"--[^\n]*|/\*.*?\*/", sql or "", re.S)
    admitted = next((c for c in comments if ADMISSION.search(c)), None)
    if not admitted:
        return []
    note = " ".join(admitted.strip("-/* \n").split())[:240]
    return [Finding(
        check="coverage",
        severity="blocking",
        title="The query says it could not answer the question as asked",
        detail=f"The generated SQL notes: \"{note}\". An answer built on that substitution is not stated as fact.",
    )]


def check_reads_data(tree: exp.Expression) -> List[Finding]:
    """A query that reads no table (SELECT 'No such data' AS note) is a refusal, not an answer."""
    if any(True for _ in tree.find_all(exp.Table)):
        return []
    return [Finding(
        check="coverage",
        severity="blocking",
        title="The query does not read any data",
        detail="It returns fixed text or numbers instead of reading the database, usually because the data cannot answer the question.",
    )]


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
