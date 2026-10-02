"""Trusted reports: every KPI and chart is a checked query on the full data.

Stages:
  plan      the model turns a business question into KPIs and panels, each a
            question with its own SQL (a deterministic plan is used without a model)
  check     each query is validated, run on the whole database (not a preview)
            and passed through the trust layer, so every figure has an outcome
  findings  insights.py computes the facts: changes, leaders, concentration,
            incomplete periods
  narrative the model may only rephrase those facts; any sentence stating a
            number that no fact contains is removed

Refreshing a saved report re-runs the same checked SQL with no model calls.
Queries carry period and slicer placeholders (report_periods.py), so the same
checked SQL answers any week, month or filter without asking the model again.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Awaitable, Callable, Dict, List, Optional, Tuple

from backend.app import privacy
from backend.app.agent.rbp import RBPGraphEngine
from backend.app.catalog.discovery import CatalogSchema
from backend.app.config import settings
from backend.app.knowledge.store import knowledge_store
from backend.app.providers.llm_client import llm_client
from backend.app.queries.executor import ExecutionResult
from backend.app.queries.validator import SqlValidator
from backend.app.verification import candidate_from_result, verify
from backend.app.verification.checks import DATE_COLUMN, STATUS_COLUMN
from backend.app.verification.learning import workspace_learning
from backend.app.workbench import insights, report_periods

logger = logging.getLogger(__name__)

CHARTS = {"line", "area", "bar", "bar_h", "stacked_bar", "table", "donut", "treemap", "funnel", "heatmap", "scatter", "waterfall"}
# Charts whose rows are split by a second column (long format).
SERIES_CHARTS = {"stacked_bar", "heatmap", "line"}
FORMATS = {"number", "currency", "percent"}
MAX_KPIS, MAX_PANELS = 6, 10
MAX_FILTERS = 3

# What each chart needs from its query. Shared by the planner and the report agent.
CHART_CONTRACTS = """Chart contracts (x, y, series and label name columns your SQL returns; alias them clearly):
- line: x = period, y = measure. Optional series (at most 4 groups, long format) to compare a few groups over time.
- area: x = period, y = one measure. The headline trend.
- bar: x = category (at most 8), y = measure. Comparing a few groups.
- bar_h: x = label, y = measure, at most 10 rows ordered by y descending. Rankings (top customers, products).
- stacked_bar: x = period or category, series = a second dimension (at most 5 values), y = measure, long format.
- donut: x = category (at most 6), y = measure. Part of a whole only.
- treemap: x = category (at most 20), y = measure. Share of a total across many categories.
- funnel: x = stage, y = count, rows in process order (for example an order or case status lifecycle).
- heatmap: x = column dimension (weekday, hour, period), series = row dimension, y = measure, long format, each at most 12 values.
- scatter: label = entity name, x = measure A, y = measure B, one row per entity, at most 150 rows. How two measures relate.
- waterfall: x = period in order, y = measure. The chart shows how each period rose or fell from the one before.
- table: the records a manager would follow up, at most 20 rows."""

PERIOD_RULES = """Periods. The report covers one period (a week Monday to Sunday, or a calendar month). Never hard-code dates and
never use the current date: write these placeholders, without quotes, and the server fills them for whichever period
and slicers the reader picks, including weekly and monthly emails:
- {{start}} and {{end}}: the reported period, end exclusive. Filter with  col >= {{start}} AND col < {{end}}.
- {{prev_start}} and {{prev_end}}: the period before it.
- {{trend_start}}: where trend charts begin. Trends filter with  col >= {{trend_start}} AND col < {{end}}.
- {{bucket:<date expression>}}: the start date of the period a row falls in, for grouping trends, for example
  SELECT {{bucket:o.order_date}} AS period, SUM(o.total_amount) AS value ... GROUP BY {{bucket:o.order_date}} ORDER BY period
- {{filter:<slicer id>:<column expression>}}: a slicer condition, for example  AND {{filter:segment:c.segment}}.
  It becomes c.segment IN (...) when the reader picks values and 1=1 otherwise.
KPIs use the series form (period, value) over {{trend_start}} to {{end}}: the tile shows the reported period, its change
from the period before and a sparkline. A KPI that is not about time may return one row with a column named value.
Rankings, shares and detail tables cover {{start}} to {{end}}. Trends, heatmaps over periods and waterfalls cover
{{trend_start}} to {{end}}."""
ANSWERED = {"confident", "caveat"}
LABEL_COLUMN = re.compile(r"(^|_)(name|title|label|segment|category|type|region|city|country|carrier|channel|department|status)($|_)", re.I)
MONEY_COLUMN = re.compile(r"amount|total|revenue|sales|price|value|cost|spend|budget|salary|balance", re.I)
ID_COLUMN = re.compile(r"(^|_)(id|key|code|sku|ref)$", re.I)
CAUSAL = re.compile(r"driven by|because|due to|caused by|as a result of|thanks to|owing to|led by", re.I)

PLANNER_RULES = """You plan a management report on a SQL database. Every figure will be run on the full data and checked
for double counting, missing business filters and dates outside the data, so write SQL a careful analyst would.

Return only JSON:
{"title": str, "subtitle": str, "grain": "week|month",
 "kpis": [{"id": str, "label": str, "question": str, "format": "number|currency|percent", "sql": str}],
 "panels": [{"id": str, "title": str, "question": str, "purpose": "trend|ranking|composition|comparison|relationship|flow|detail",
             "chart": "line|area|bar|bar_h|stacked_bar|donut|treemap|funnel|heatmap|scatter|waterfall|table",
             "x": str, "y": str, "series": str|null, "label": str|null,
             "format": "number|currency|percent", "span": 1|2|3, "sql": str}]}

Rules:
- 4 to 6 KPIs and 8 to 10 panels, each panel a different chart type. Each answers a distinct question a manager
  would act on. No decoration.
- Never compute growth rates in SQL; the report computes changes. Keep every query short and readable.
- Aggregate a parent table's measure at its own grain: never SUM an orders column after joining order lines or
  shipments; use EXISTS or pre-aggregate the child table instead.
- Apply approved definitions exactly when a term they define is used. Without one, when a table has a status
  column, say in the question which statuses you counted.
- Use only tables and columns in the schema. Use the SQL dialect given. One SELECT per sql, no semicolons.
- Spans on a 3-column grid: the main trend and heatmaps span 2, most charts 1, detail tables 3.

""" + CHART_CONTRACTS + "\n\n" + PERIOD_RULES

NARRATIVE_RULES = """You write the summary of a management report. You receive numbered facts computed from the data.
Return only JSON: {"headline": str, "findings": [{"text": str, "fact_ids": [str]}], "next_steps": [str]}.
- headline: one sentence, the most decision-relevant point.
- findings: 3 or 4 sentences, each citing the fact ids it restates. Most important first.
- next_steps: 1 or 2 concrete follow-ups for a manager, without numbers.
- Use ONLY numbers that appear in the cited facts, written the same way. Never compute new numbers.
- If a fact says a period may be incomplete, do not describe that period as a decline.
- Never claim a cause ("driven by", "because of", "due to") unless a fact states it. A segment leading overall
  does not explain a change over time.
- Plain business English. No hype, no markdown."""


@dataclass
class ReportContext:
    connection_id: str
    catalog: CatalogSchema
    dialect: str
    execute: Callable[[str], Awaitable[ExecutionResult]]
    owner_id: Optional[str] = None
    penalty: float = field(default_factory=lambda: float(settings.VERIFY_DEFAULT_PENALTY))
    definitions: List[Dict[str, Any]] = field(default_factory=list)
    model: Dict[str, Any] = field(default_factory=dict)
    llm: bool = True
    usage: Dict[str, float] = field(default_factory=lambda: {"cost": 0.0, "calls": 0, "tokens": 0})
    # The period and slicer selection queries are rendered for (see report_periods.render).
    window: Optional[Dict[str, Any]] = None
    filter_values: Dict[str, List[Any]] = field(default_factory=dict)

    def render(self, sql: str) -> str:
        return report_periods.render(sql, self.window, self.dialect, self.filter_values)

    async def run(self, sql: str) -> ExecutionResult:
        """Validated, read-only execution with the app's row limit and timeout."""
        validation = SqlValidator.validate_and_sanitize(sql=sql, dialect=self.dialect, catalog=self.catalog, max_rows=settings.MAX_RESULT_ROWS)
        if not validation.is_valid:
            return ExecutionResult(columns=[], column_types=[], rows=[], row_count=0, execution_time_ms=0,
                                   error=validation.error_message or "The query failed validation.")
        return await self.execute(validation.sanitized_sql)


async def make_context(*, connection_id: str, catalog: CatalogSchema, dialect: str,
                       execute: Callable[[str], Awaitable[ExecutionResult]], owner_id: Optional[str] = None,
                       llm: Optional[bool] = None) -> ReportContext:
    definitions = await asyncio.to_thread(knowledge_store.approved_definitions, connection_id)
    model = await asyncio.to_thread(workspace_learning.model_for, connection_id)
    return ReportContext(
        connection_id=connection_id, catalog=catalog, dialect=dialect, execute=execute, owner_id=owner_id,
        definitions=definitions, model=model,
        llm=bool(llm_client.api_key) and not str(llm_client.api_key).startswith("mock_") if llm is None else llm,
    )


# --- Context for the planner -----------------------------------------------

def _q(name: str, dialect: str) -> str:
    return f"`{name}`" if dialect == "mysql" else '"' + name.replace('"', '""') + '"'


def report_tables(catalog: CatalogSchema, question: str) -> List[str]:
    names = list(catalog.tables)
    if len(names) <= 25:
        return names
    chain = RBPGraphEngine(catalog).match_schema_entities(question or "overview")["expanded_chain"]
    return (chain or names)[:15]


def schema_text(catalog: CatalogSchema, tables: List[str]) -> str:
    lines = []
    for name in tables:
        table = catalog.tables.get(name)
        if not table:
            continue
        columns = []
        for column in table.columns:
            text = f"{column.name} {column.type}{' PK' if column.primary_key else ''}"
            # Category values help the planner write correct filters; personal data is never included.
            if (STATUS_COLUMN.search(column.name) or LABEL_COLUMN.search(column.name)) and not privacy.is_personal(column.name):
                samples = [str(v) for v in (column.sample_values or [])[:6] if isinstance(v, str) and len(v) <= 40]
                if samples and not re.search(r"(^|_)name$", column.name, re.I):
                    text += f" e.g. {', '.join(samples)}"
            columns.append(text)
        lines.append(f"TABLE {name} ({table.row_count_estimate:,} rows): {'; '.join(columns)}")
        for key in table.foreign_keys:
            lines.append(f"  FK {name}.{key.from_column} -> {key.to_table}.{key.to_column}")
    return "\n".join(lines)


async def data_coverage(ctx: ReportContext, tables: List[str]) -> List[str]:
    """Date ranges actually present, so relative periods are anchored to the data."""
    probes = []
    for name in tables:
        table = ctx.catalog.tables.get(name)
        for column in (table.columns if table else []):
            if DATE_COLUMN.search(column.name) and not ID_COLUMN.search(column.name) and len(probes) < 8:
                probes.append((name, column.name))
    out = []
    for table, column in probes:
        result = await ctx.run(f"SELECT MIN({_q(column, ctx.dialect)}), MAX({_q(column, ctx.dialect)}) FROM {_q(table, ctx.dialect)}")
        if not result.error and result.rows and result.rows[0][1] is not None:
            out.append(f"{table}.{column}: {result.rows[0][0]} to {result.rows[0][1]}")
    return out


# --- Model calls -----------------------------------------------------------

async def _complete_json(ctx: ReportContext, system: str, payload: Dict[str, Any], max_tokens: int = 3500,
                         *, deep: bool = False) -> Optional[Dict[str, Any]]:
    if not ctx.llm:
        return None
    content: List[str] = []
    usage: Dict[str, Any] = {}
    try:
        async for event in llm_client._stream_completion(
            # Planning a report is difficult work; writing its summary is not.
            requested_model_id=llm_client.deep_model if deep else llm_client.execution_model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": json.dumps(payload, ensure_ascii=False, default=str)}],
            session_id=None, max_tokens=max_tokens, reasoning_effort="minimal", fallback_text="", use_requested_model=True,
        ):
            if event.get("type") == "content_delta":
                content.append(event.get("delta", ""))
            elif event.get("type") in {"usage", "completed"} and event.get("usage"):
                usage = event["usage"]
    except Exception as error:
        # The caller falls back to a deterministic plan or summary; record why.
        logger.warning("Report model call failed (%s): %s", type(error).__name__, str(error)[:200])
        return None
    ctx.usage["calls"] += 1
    ctx.usage["cost"] += float(usage.get("cost") or 0)
    ctx.usage["tokens"] += int(usage.get("total_tokens") or 0)
    text = "".join(content)
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        logger.warning("Report model returned no JSON (%d characters)", len(text))
        return None
    try:
        value = json.loads(text[start:end + 1])
    except ValueError:
        logger.warning("Report model returned invalid JSON (%d characters)", len(text))
        return None
    return value if isinstance(value, dict) else None


def _slug(value: Any, fallback: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").casefold()).strip("-")
    return text[:40] or fallback


def normalize_plan(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only well-formed items within the limits; ids are unique slugs."""
    seen: set = set()

    def unique(value: Any, fallback: str) -> str:
        base = _slug(value, fallback)
        slug, n = base, 2
        while slug in seen:
            slug, n = f"{base}-{n}", n + 1
        seen.add(slug)
        return slug

    kpis = []
    for index, item in enumerate(raw.get("kpis") or []):
        if isinstance(item, dict) and str(item.get("sql") or "").strip() and len(kpis) < MAX_KPIS:
            kpis.append({
                "id": unique(item.get("id") or item.get("label"), f"kpi-{index + 1}"),
                "label": str(item.get("label") or "Value")[:60],
                "question": str(item.get("question") or item.get("label") or "")[:300],
                "format": item.get("format") if item.get("format") in FORMATS else "number",
                "sql": str(item["sql"]).strip().rstrip(";"),
            })
    filters = []
    for index, item in enumerate(raw.get("filters") or []):
        if isinstance(item, dict) and str(item.get("values_sql") or "").strip() and len(filters) < MAX_FILTERS:
            filter_id = _slug(item.get("id") or item.get("label"), f"filter-{index + 1}")
            if filter_id in {f["id"] for f in filters}:
                continue
            filters.append({
                "id": filter_id,
                "label": str(item.get("label") or filter_id.replace("-", " ").title())[:40],
                "values_sql": str(item["values_sql"]).strip().rstrip(";"),
                "values": [str(v) for v in (item.get("values") or [])][:50],
            })
    filter_ids = {f["id"] for f in filters}

    panels = []
    for index, item in enumerate(raw.get("panels") or []):
        if isinstance(item, dict) and str(item.get("sql") or "").strip() and len(panels) < MAX_PANELS:
            chart = item.get("chart") if item.get("chart") in CHARTS else "bar"
            if chart in {"stacked_bar", "heatmap"} and not item.get("series"):
                chart = "bar"
            if chart == "scatter" and not item.get("label"):
                chart = "table"
            try:
                span = max(1, min(3, int(item.get("span") or (3 if chart == "table" else 1))))
            except (TypeError, ValueError):
                span = 1
            panels.append({
                "id": unique(item.get("id") or item.get("title"), f"panel-{index + 1}"),
                "title": str(item.get("title") or "Analysis")[:90],
                "question": str(item.get("question") or item.get("title") or "")[:300],
                "purpose": str(item.get("purpose") or "comparison")[:20],
                "chart": chart,
                "x": str(item.get("x") or ""), "y": str(item.get("y") or ""),
                "series": str(item["series"]) if item.get("series") and chart in SERIES_CHARTS else None,
                "label": str(item["label"]) if item.get("label") and chart == "scatter" else None,
                "filter_id": item.get("filter_id") if item.get("filter_id") in filter_ids else None,
                "format": item.get("format") if item.get("format") in FORMATS else "number",
                "span": span,
                "sql": str(item["sql"]).strip().rstrip(";"),
                **({"source": item["source"]} if item.get("source") in {"question", "agent", "pack"} else {}),
            })
    grain = raw.get("grain") if raw.get("grain") in report_periods.GRAINS else None
    return {
        "title": str(raw.get("title") or "Management report")[:120],
        "subtitle": str(raw.get("subtitle") or "")[:200],
        "kpis": kpis,
        "panels": panels,
        "filters": filters,
        "grain": grain,
        "anchor_sql": str(raw.get("anchor_sql") or "").strip().rstrip(";"),
    }


def fallback_plan(ctx: ReportContext, tables: List[str], question: str = "") -> Dict[str, Any]:
    """A sensible report from the catalog alone, used without a model or when planning fails."""
    catalog, d = ctx.catalog, ctx.dialect
    q = lambda name: _q(name, d)

    def month(column: str) -> str:
        return {
            "postgres": f"TO_CHAR(DATE_TRUNC('month', {q(column)}), 'YYYY-MM')",
            "snowflake": f"TO_CHAR(DATE_TRUNC('month', {q(column)}), 'YYYY-MM')",
            "mysql": f"DATE_FORMAT({q(column)}, '%Y-%m')",
            "tsql": f"FORMAT({q(column)}, 'yyyy-MM')",
        }.get(d, f"strftime('%Y-%m', {q(column)})")

    # Pick the fact table: one with dates and a money measure, preferring what the question
    # mentions and revenue-like measures over costs.
    words = set(re.findall(r"[a-z]+", (question or "").lower()))
    best, best_score = None, float("-inf")
    for name in tables:
        table = catalog.tables.get(name)
        if not table:
            continue
        dates = [c.name for c in table.columns if DATE_COLUMN.search(c.name) and not ID_COLUMN.search(c.name)]
        measures = [c.name for c in table.columns if MONEY_COLUMN.search(c.name) and not ID_COLUMN.search(c.name)
                    and re.search(r"int|real|num|dec|float|double|money", c.type or "", re.I)]
        if not (dates and measures):
            continue
        measure = max(measures, key=lambda m: (
            bool(re.search(r"total|amount|revenue|sales", m, re.I)),
            not re.search(r"cost|tax|discount", m, re.I),
            not m.lower().startswith("sub"),
        ))
        mentioned = len(words & set(re.findall(r"[a-z]+", f"{name} {' '.join(measures)}".lower().replace("_", " "))))
        revenue_like = 2 if re.search(r"total|amount|revenue|sales", measure, re.I) else 0
        score = 3 * mentioned + revenue_like + min(2.0, table.row_count_estimate / 1000)
        if score > best_score:
            best, best_score = (table, dates[0], measure), score
    if best is None:
        name = max(tables, key=lambda n: catalog.tables[n].row_count_estimate) if tables else None
        if not name:
            return {"title": "Management report", "subtitle": "", "kpis": [], "panels": []}
        return normalize_plan({
            "title": f"{name.replace('_', ' ').title()} overview",
            "kpis": [{"id": "records", "label": f"{name.replace('_', ' ').title()}", "question": f"How many {name} are there?", "sql": f"SELECT COUNT(*) AS value FROM {q(name)}"}],
            "panels": [{"id": "detail", "title": f"Latest {name.replace('_', ' ')}", "question": f"Sample of {name}", "chart": "table", "span": 3, "sql": f"SELECT * FROM {q(name)} LIMIT 20"}],
        })

    table, date_col, measure = best
    fact = table.name
    noun = fact.replace("_", " ")
    measure_label = measure.replace("_", " ")
    status = next((c.name for c in table.columns if STATUS_COLUMN.search(c.name) and re.search(r"char|text|string", c.type or "text", re.I)), None)
    completed = None
    if status:
        values = [str(v) for v in (next(c for c in table.columns if c.name == status).sample_values or [])]
        completed = next((v for v in values if re.fullmatch(r"(completed?|paid|closed|delivered|fulfilled|won)", v, re.I)), None)
    where = f" WHERE {q(status)} = '{completed}'" if completed else ""
    scope = f" ({completed} {noun} only)" if completed else ""

    kpis = [
        {"id": "total", "label": f"Total {measure_label}{scope}", "question": f"What is the total {measure_label} of {completed + ' ' if completed else ''}{noun}?", "format": "currency", "sql": f"SELECT SUM({q(measure)}) AS value FROM {q(fact)}{where}"},
        {"id": "latest-month", "label": f"{measure_label.capitalize()}, latest month", "question": f"What was the {measure_label} per month{scope}?", "format": "currency",
         "sql": f"SELECT {month(date_col)} AS period, SUM({q(measure)}) AS value FROM {q(fact)}{where} GROUP BY {month(date_col)} ORDER BY {month(date_col)}"},
        {"id": "count", "label": f"{noun.capitalize()}{scope}", "question": f"How many {completed + ' ' if completed else ''}{noun} are there?", "sql": f"SELECT COUNT(*) AS value FROM {q(fact)}{where}"},
        {"id": "average", "label": f"Average {measure_label}", "question": f"What is the average {measure_label} per {noun}{scope}?", "format": "currency", "sql": f"SELECT AVG({q(measure)}) AS value FROM {q(fact)}{where}"},
    ]
    panels = [{
        "id": "trend", "title": f"{measure_label.capitalize()} by month", "question": f"How has {measure_label} changed month by month{scope}?",
        "purpose": "trend", "chart": "area", "x": "period", "y": measure, "format": "currency", "span": 2,
        "sql": f"SELECT {month(date_col)} AS period, SUM({q(measure)}) AS {q(measure)} FROM {q(fact)}{where} GROUP BY {month(date_col)} ORDER BY {month(date_col)}",
    }]
    if status:
        panels.append({
            "id": "by-status", "title": f"{noun.capitalize()} by {status.replace('_', ' ')}", "question": f"How many {noun} are in each {status.replace('_', ' ')}?",
            "purpose": "composition", "chart": "bar_h", "x": status, "y": "records", "span": 1,
            "sql": f"SELECT {q(status)}, COUNT(*) AS records FROM {q(fact)} GROUP BY {q(status)} ORDER BY records DESC",
        })
    # Rank the parent table the fact points to, by its label column.
    for key in table.foreign_keys:
        parent = catalog.tables.get(key.to_table)
        label = next((c.name for c in (parent.columns if parent else [])
                      if LABEL_COLUMN.search(c.name) and not ID_COLUMN.search(c.name) and not privacy.is_personal(c.name)), None)
        if parent and label:
            panels.append({
                "id": f"by-{_slug(key.to_table, 'parent')}", "title": f"{measure_label.capitalize()} by {key.to_table.replace('_', ' ')} {label.replace('_', ' ')}",
                "question": f"Which {key.to_table.replace('_', ' ')} {label.replace('_', ' ')} has the highest {measure_label}{scope}?",
                "purpose": "ranking", "chart": "bar_h", "x": label, "y": measure, "format": "currency", "span": 1,
                "sql": (f"SELECT p.{q(label)} AS {q(label)}, SUM(f.{q(measure)}) AS {q(measure)} FROM {q(fact)} f "
                        f"JOIN {q(key.to_table)} p ON p.{q(key.to_column)} = f.{q(key.from_column)}"
                        f"{' WHERE f.' + q(status) + ' = ' + repr(completed) if completed else ''} "
                        f"GROUP BY p.{q(label)} ORDER BY 2 DESC LIMIT 10"),
            })
            break
    panels.append({
        "id": "largest", "title": f"Largest {noun}{scope}", "question": f"Which {noun} have the highest {measure_label}?",
        "purpose": "detail", "chart": "table", "span": 3,
        "sql": f"SELECT * FROM {q(fact)}{where} ORDER BY {q(measure)} DESC LIMIT 20",
    })
    return normalize_plan({
        "title": f"{noun.capitalize()} performance report",
        "subtitle": f"Built from {fact} without an AI planner. Every figure is checked.",
        "kpis": kpis, "panels": panels,
    })


async def plan_report(question: str, title: str, ctx: ReportContext) -> Tuple[Dict[str, Any], str]:
    tables = report_tables(ctx.catalog, question)
    coverage = await data_coverage(ctx, tables)
    payload = {
        "question": question or "Give a management overview of this data.",
        "preferred_title": title,
        "dialect": ctx.dialect,
        "schema": schema_text(ctx.catalog, tables),
        "data_coverage": coverage,
        "approved_definitions": knowledge_store.definitions_context(ctx.definitions),
    }
    raw = await _complete_json(ctx, PLANNER_RULES, payload, max_tokens=8000, deep=True)
    plan = normalize_plan(raw) if raw else None
    if plan and plan["kpis"] and plan["panels"]:
        if title:
            plan["title"] = title[:120]
        return plan, "model"
    return fallback_plan(ctx, tables, question), "catalog"


async def _repair_sql(item: Dict[str, Any], kind: str, sql: str, problem: str, ctx: ReportContext) -> Optional[str]:
    if not ctx.llm:
        return None
    contract = ("Return ONE row with a column named value (optionally previous), or a (period, value) series."
                if kind == "kpi" else f"Keep the output columns {item.get('x')!r} and {item.get('y')!r}"
                + (f" and {item.get('series')!r}" if item.get("series") else "") + ".")
    tables = report_tables(ctx.catalog, item.get("question", ""))
    raw = await _complete_json(ctx, (
        "You fix one SQL query for a management report. Return only JSON {\"sql\": str}. One SELECT, no semicolon, "
        "only tables and columns in the schema. Keep every {{...}} placeholder exactly as written: the server "
        "replaces them with dates and filters.\n\n" + PERIOD_RULES), {
        "question": item.get("question"), "dialect": ctx.dialect, "schema": schema_text(ctx.catalog, tables),
        "approved_definitions": knowledge_store.definitions_context(ctx.definitions),
        "previous_sql": sql, "problem": problem, "output_contract": contract,
    }, max_tokens=1200)
    fixed = str((raw or {}).get("sql") or "").strip().rstrip(";")
    return fixed or None


# --- Checking --------------------------------------------------------------

def _kpi_values(item: Dict[str, Any], result: ExecutionResult, win: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Fill value, previous and spark from a KPI result; returns an error message if the shape is wrong."""
    columns = [c.lower() for c in result.columns]
    rows = result.rows
    if win and report_periods.uses_period(item.get("sql", "")) and len(columns) >= 2 and "{{bucket" in item.get("sql", ""):
        # A period series: the tile shows the reported period, not whichever period has data last.
        value_index = columns.index("value") if "value" in columns else next(
            (i for i in range(1, len(columns)) if rows and insights.to_number(rows[0][i]) is not None), None)
        if value_index is None:
            return "The KPI series must have a numeric value column."
        by_period = {str(r[0])[:10]: insights.to_number(r[value_index]) for r in rows if r[0] is not None}
        item["spark"] = [[p, v] for p, v in sorted(by_period.items()) if v is not None][-24:]
        item["period"] = win["start"]
        item["value"] = by_period.get(win["start"])
        item["previous"] = by_period.get(win["prev_start"])
        item["comparison_label"] = win.get("prev_label") or "the previous period"
        if item["value"] is None:
            # No rows in the period: a total or count is zero; an average or rate has no value.
            ratio = item.get("format") == "percent" or re.search(r"avg|average|rate|ratio|share|margin|per\b", f"{item.get('label')} {item.get('question')}", re.I)
            item["value"] = None if ratio else 0.0
            item["empty_period"] = True
            if item["value"] is None:
                return "No records in this period, so there is no value to show."
        return None
    if not rows:
        return "The KPI query returned no rows."
    numeric = [i for i, _ in enumerate(columns) if insights.to_number(rows[0][i]) is not None]
    if len(rows) == 1:
        value_index = columns.index("value") if "value" in columns else (numeric[0] if numeric else None)
        if value_index is None:
            return "The KPI query must return a number."
        item["value"] = insights.to_number(rows[0][value_index])
        if "previous" in columns:
            item["previous"] = insights.to_number(rows[0][columns.index("previous")])
            item.setdefault("comparison_label", "the previous period")
        return None
    if len(columns) >= 2:
        value_index = columns.index("value") if "value" in columns else next((i for i in numeric if i != 0), None)
        if value_index is None:
            return "The KPI series must have a numeric value column."
        series = sorted(((str(r[0]), insights.to_number(r[value_index])) for r in rows if r[0] is not None), key=lambda p: p[0])
        series = [(p, v) for p, v in series if v is not None][-24:]
        if not series:
            return "The KPI series has no values."
        item["spark"] = [[p, v] for p, v in series]
        item["period"], item["value"] = series[-1]
        if len(series) >= 2:
            item["previous"] = series[-2][1]
            item["comparison_label"] = series[-2][0]
        return None
    return "The KPI query must return one number."


async def run_item(item: Dict[str, Any], kind: str, ctx: ReportContext, *, repair: bool = True) -> Dict[str, Any]:
    """Execute one KPI or panel on the full data and put it through the trust layer."""
    out = {key: value for key, value in item.items() if key not in {
        "columns", "rows", "row_count", "outcome", "probability", "findings", "options", "value", "previous",
        "spark", "period", "comparison_label", "error", "definitions_used", "repaired", "facts", "highlight", "partial",
        "features", "summary", "truncated", "duration_ms", "sql_run", "empty_period", "no_data"}}
    out["kind"] = kind
    sql = out["sql"]
    started = time.perf_counter()
    # The stored SQL keeps its placeholders; this run fills them for the current period and slicers.
    result = await ctx.run(ctx.render(sql))
    repaired = False
    if result.error and repair:
        fixed = await _repair_sql(out, kind, sql, f"The query failed: {result.error}", ctx)
        if fixed:
            second = await ctx.run(ctx.render(fixed))
            if not second.error:
                sql, result, repaired = fixed, second, True
    if result.error:
        return {**out, "sql": sql, "sql_run": ctx.render(sql), "outcome": "handoff", "error": result.error, "findings": [
            {"check": "execution", "severity": "blocking", "title": "The query could not run", "detail": result.error[:300]}]}

    async def check(current_sql: str, current: ExecutionResult):
        return await verify(
            question=out.get("question") or out.get("title") or "", dialect=ctx.dialect, catalog=ctx.catalog,
            run_sql=ctx.run, candidates=[candidate_from_result("report", current_sql, current)], primary_id="report",
            penalty=ctx.penalty, definitions=ctx.definitions, repairs=int(repaired), model=ctx.model,
        )

    verification = await check(ctx.render(sql), result)
    blocking = [f for f in verification.findings if f.severity == "blocking" and f.repair_hint]
    if blocking and repair:
        fixed = await _repair_sql(out, kind, sql, " ".join(f.repair_hint for f in blocking), ctx)
        if fixed:
            second = await ctx.run(ctx.render(fixed))
            if not second.error:
                second_check = await check(ctx.render(fixed), second)
                # Keep the rewrite only if it passes; a rejected attempt is not a repair.
                if not any(f.severity == "blocking" for f in second_check.findings):
                    sql, result, verification, repaired = fixed, second, second_check, True

    out.update({
        "sql": sql,
        "sql_run": ctx.render(sql),
        "columns": result.columns,
        "rows": result.rows[: settings.MAX_RESULT_ROWS],
        "row_count": len(result.rows),
        "truncated": bool(result.is_truncated),
        "outcome": verification.outcome,
        "probability": verification.probability,
        "summary": verification.summary,
        "findings": [{"check": f.check, "severity": f.severity, "title": f.title, "detail": f.detail} for f in verification.findings],
        "options": [{"label": o.label, "sql": o.sql, "preview": o.preview} for o in verification.clarify_options],
        "definitions_used": [{"term": d.get("term"), "version": d.get("version")} for d in verification.definitions_used],
        "features": verification.features,
        "repaired": repaired,
        "duration_ms": int((time.perf_counter() - started) * 1000),
    })
    if (kind == "panel" and out.get("purpose") == "exception" and not result.rows
            and not any(f["severity"] == "blocking" for f in out["findings"])):
        # An exception list with nothing in it ("items with no sales") is the good-news answer.
        out["findings"] = [f for f in out["findings"] if f["title"] != "The query returned no rows"]
        out.update({"outcome": "confident", "summary": "Nothing to report: no rows matched."})
    if kind == "kpi":
        problem = _kpi_values(out, result, ctx.window)
        if problem and out.get("empty_period"):
            out["no_data"] = True  # nothing happened in this period: not a failed check
        elif problem:
            out.update({"outcome": "handoff", "error": problem})
            out["findings"].append({"check": "shape", "severity": "blocking", "title": "Not a single figure", "detail": problem})
    elif out.get("chart") != "table":
        columns = result.columns
        if out.get("x") not in columns and columns:
            out["x"] = columns[0]
        if out.get("y") not in columns:
            numeric = [c for i, c in enumerate(columns) if c != out["x"] and result.rows and insights.to_number(result.rows[0][i]) is not None]
            out["y"] = numeric[0] if numeric else (columns[1] if len(columns) > 1 else columns[0])
        if out.get("series") and out["series"] not in columns:
            out["series"] = None
        if out.get("label") and out["label"] not in columns:
            out["label"] = next((c for c in columns if c not in {out["x"], out["y"]}), None)
    return out


# --- Findings and narrative ------------------------------------------------

def collect_facts(kpis: List[Dict[str, Any]], panels: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Facts only from figures that passed their checks; others become caveats without numbers."""
    facts: List[Dict[str, Any]] = []
    for kpi in kpis:
        if kpi.get("outcome") in ANSWERED:
            kpi["facts"] = insights.kpi_facts(kpi)
            facts += kpi["facts"]
    for panel in panels:
        if panel.get("outcome") in ANSWERED:
            panel_facts, hints = insights.panel_facts(panel, panel.get("columns") or [], panel.get("rows") or [])
            panel["facts"] = panel_facts
            panel.update({key: value for key, value in hints.items()})
            facts += panel_facts
    for item in kpis + panels:
        name = item.get("label") or item.get("title")
        if item.get("outcome") == "clarify":
            facts.append({"id": f"{item['id']}.needs_definition", "item_id": item["id"], "kind": "needs_definition", "importance": 0.9, "values": {},
                          "text": f"{name} depends on which records count, so it is not reported until a definition is chosen."})
        elif item.get("outcome") == "handoff":
            facts.append({"id": f"{item['id']}.needs_review", "item_id": item["id"], "kind": "needs_review", "importance": 0.85, "values": {},
                          "text": f"{name} did not pass its checks and needs an analyst before it is used."})
    return facts


def _normal(token: str) -> str:
    return token.lower().replace(",", "").replace(" ", "")


def ground_narrative(candidate: Optional[Dict[str, Any]], facts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Keep only sentences whose numbers all appear in the facts they cite."""
    by_id = {fact["id"]: fact for fact in facts}
    all_numbers = {_normal(n) for fact in facts for n in insights.numbers_in(fact["text"])}
    fallback = deterministic_narrative(facts)
    if not candidate:
        return fallback
    removed = 0

    def supported(text: str, allowed: set) -> bool:
        # Facts never state causes, so a sentence that claims one is not grounded.
        return not CAUSAL.search(text) and all(_normal(n) in allowed for n in insights.numbers_in(text))

    headline = str(candidate.get("headline") or "").strip()
    if not headline or not supported(headline, all_numbers):
        removed += bool(headline)
        headline = fallback["headline"]
    findings = []
    for finding in (candidate.get("findings") or [])[:5]:
        if not isinstance(finding, dict):
            continue
        cited = [fid for fid in finding.get("fact_ids") or [] if fid in by_id]
        allowed = {_normal(n) for fid in cited for n in insights.numbers_in(by_id[fid]["text"])}
        text = str(finding.get("text") or "").strip()
        if text and cited and supported(text, allowed):
            findings.append({"text": text[:400], "fact_ids": cited})
        elif text:
            removed += 1
    steps = [str(s).strip()[:200] for s in (candidate.get("next_steps") or [])[:2] if str(s).strip() and not insights.numbers_in(str(s))]
    if not findings:
        return {**fallback, "removed_sentences": removed}
    return {"headline": headline[:300], "findings": findings, "next_steps": steps or fallback["next_steps"],
            "source": "model", "removed_sentences": removed}


def deterministic_narrative(facts: List[Dict[str, Any]]) -> Dict[str, Any]:
    ranked, seen_numbers = [], []
    for fact in insights.rank([f for f in facts if f["kind"] not in {"needs_definition", "needs_review", "value"}], 12):
        numbers = {_normal(n) for n in insights.numbers_in(fact["text"])}
        # A KPI change and its trend chart often state the same numbers; say it once.
        if numbers and any(numbers <= earlier for earlier in seen_numbers):
            continue
        seen_numbers.append(numbers)
        ranked.append(fact)
        if len(ranked) == 5:
            break
    caveats = [f for f in facts if f["kind"] in {"needs_definition", "needs_review"}]
    steps = []
    if any(f["kind"] == "needs_definition" for f in caveats):
        steps.append("Agree the business definitions flagged below in Definitions, then refresh the report.")
    if any(f["kind"] == "needs_review" for f in caveats):
        steps.append("Ask an analyst to check the figures sent to the review queue.")
    if not steps:
        steps.append("Refresh this report next period to compare against these figures.")
    return {
        "headline": ranked[0]["text"] if ranked else "No finding passed its checks yet.",
        "findings": [{"text": f["text"], "fact_ids": [f["id"]]} for f in (ranked[1:4] + caveats[:1])],
        "next_steps": steps,
        "source": "computed",
        "removed_sentences": 0,
    }


async def write_narrative(question: str, facts: List[Dict[str, Any]], panels: List[Dict[str, Any]], ctx: ReportContext) -> Dict[str, Any]:
    # In privacy mode, findings that name people (a panel labelled by a personal column) stay on the server.
    personal = {p["id"] for p in panels if privacy.enabled() and privacy.is_personal(str(p.get("x") or ""))}
    shareable = [{"id": f["id"], "text": f["text"]} for f in insights.rank([f for f in facts if f["item_id"] not in personal], 14)]
    candidate = await _complete_json(ctx, NARRATIVE_RULES, {"question": question, "facts": shareable}, max_tokens=1200)
    return ground_narrative(candidate, facts)


# --- Assembly --------------------------------------------------------------

def trust_summary(items: List[Dict[str, Any]]) -> Dict[str, int]:
    summary = {"confident": 0, "caveat": 0, "clarify": 0, "handoff": 0}
    for item in items:
        summary[item.get("outcome") or "handoff"] = summary.get(item.get("outcome") or "handoff", 0) + 1
    return summary


def assemble(plan: Dict[str, Any], kpis: List[Dict[str, Any]], panels: List[Dict[str, Any]], narrative: Dict[str, Any],
             facts: List[Dict[str, Any]], ctx: ReportContext, *, question: str, planner: str, started: float,
             agent: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    return {
        "version": 3,
        "grain": plan.get("grain") or (ctx.window or {}).get("grain"),
        "anchor_sql": plan.get("anchor_sql") or "",
        "period": ctx.window,
        "filters": plan.get("filters") or [],
        "filter_state": {k: v for k, v in (ctx.filter_values or {}).items() if v},
        "agent": agent or {},
        "title": plan["title"],
        "subtitle": plan.get("subtitle", ""),
        "question": question,
        "kpis": kpis,
        "panels": panels,
        "narrative": narrative,
        "facts": facts,
        "trust": trust_summary(kpis + panels),
        "meta": {
            "planner": planner,
            "model": llm_client.execution_model if ctx.llm else None,
            "dialect": ctx.dialect,
            "definitions": [{"term": d.get("term"), "version": d.get("version")} for d in ctx.definitions],
            "confidence_model": ctx.model.get("source", "default prior"),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "ai_cost_usd": round(ctx.usage["cost"], 5),
            "ai_calls": int(ctx.usage["calls"]),
            # What left the server, for the PDPA disclosure panel.
            "data_sent": [
                "Table and column names, category examples and date ranges (planning)",
                "Computed findings: totals, changes and category labels (summary)",
            ] if ctx.llm else [],
        },
    }


async def _run_all(ctx: ReportContext, plan: Dict[str, Any], repair: bool) -> AsyncGenerator[Dict[str, Any], None]:
    semaphore = asyncio.Semaphore(4)

    async def guarded(item: Dict[str, Any], kind: str) -> Dict[str, Any]:
        async with semaphore:
            try:
                return await run_item(item, kind, ctx, repair=repair)
            except Exception as error:  # one bad panel must not sink the report
                return {**item, "kind": kind, "outcome": "handoff", "error": str(error)[:300], "findings": [
                    {"check": "execution", "severity": "blocking", "title": "The figure could not be produced", "detail": str(error)[:300]}]}

    tasks = [asyncio.create_task(guarded(item, "kpi")) for item in plan["kpis"]]
    tasks += [asyncio.create_task(guarded(item, "panel")) for item in plan["panels"]]
    for finished in asyncio.as_completed(tasks):
        yield await finished


def _ordered(items: List[Dict[str, Any]], plan_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_id = {item["id"]: item for item in items}
    return [by_id[p["id"]] for p in plan_items if p["id"] in by_id]


async def generate(question: str, title: str, ctx: ReportContext) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream a report as it is built: stage events, each checked figure, then the report."""
    started = time.perf_counter()
    yield {"type": "stage", "stage": "plan", "label": "Planning the figures this question needs"}
    plan, planner = await plan_report(question, title, ctx)
    await prepare(ctx, plan)
    yield {"type": "plan", "planner": planner, "title": plan["title"], "subtitle": plan["subtitle"],
           "kpis": [{"id": k["id"], "label": k["label"]} for k in plan["kpis"]],
           "panels": [{"id": p["id"], "title": p["title"], "chart": p["chart"], "span": p["span"]} for p in plan["panels"]]}
    yield {"type": "stage", "stage": "check", "label": "Running every query on the full data and checking it"}
    done: List[Dict[str, Any]] = []
    async for item in _run_all(ctx, plan, repair=True):
        done.append(item)
        yield {"type": "item", "item": item}
    kpis = _ordered([i for i in done if i["kind"] == "kpi"], plan["kpis"])
    panels = _ordered([i for i in done if i["kind"] == "panel"], plan["panels"])
    yield {"type": "stage", "stage": "findings", "label": "Computing findings and writing the summary"}
    facts = collect_facts(kpis, panels)
    narrative = await write_narrative(question, facts, panels, ctx)
    report = assemble(plan, kpis, panels, narrative, facts, ctx, question=question, planner=planner, started=started)
    await _queue_handoffs(report, ctx)
    yield {"type": "report", "report": report}


async def data_range(ctx: ReportContext, plan: Dict[str, Any]) -> Tuple[Optional[Any], Optional[Any]]:
    """First and last date of the report's main date column, from its anchor query."""
    anchor = plan.get("anchor_sql") or ""
    if not anchor:
        return None, None
    result = await ctx.run(anchor)
    if result.error or not result.rows:
        return None, None
    row = result.rows[0]
    first = report_periods.parse_day(row[0]) if row else None
    last = report_periods.parse_day(row[1]) if len(row) > 1 else first
    return first, last


async def prepare(ctx: ReportContext, plan: Dict[str, Any], *, grain: Optional[str] = None, offset: int = 0,
                  start: Any = None, end: Any = None, filter_state: Optional[Dict[str, List[Any]]] = None,
                  today: Any = None) -> None:
    """Set the period and slicers the report's queries are rendered for, and load slicer values."""
    texts = [i.get("sql", "") for i in plan.get("kpis", []) + plan.get("panels", [])]
    if any(report_periods.uses_period(t) for t in texts):
        first, last = await data_range(ctx, plan)
        ctx.window = report_periods.window(
            grain or plan.get("grain") or "month", data_min=first, data_max=last, offset=int(offset or 0),
            start=report_periods.parse_day(start), end=report_periods.parse_day(end),
            today=report_periods.parse_day(today) if today else None,
        )
    else:
        ctx.window = None
    for spec in plan.get("filters") or []:
        result = await ctx.run(spec["values_sql"])
        if not result.error:
            spec["values"] = report_periods.first_values(result.rows)[:50]
    allowed = {spec["id"]: set(spec.get("values") or []) for spec in plan.get("filters") or []}
    ctx.filter_values = {
        key: [str(v) for v in values if str(v) in allowed[key]][:50]
        for key, values in (filter_state or {}).items() if key in allowed and isinstance(values, list)
    }


def plan_from_report(report: Dict[str, Any]) -> Dict[str, Any]:
    return normalize_plan({key: report.get(key) for key in ("title", "subtitle", "kpis", "panels", "filters", "grain", "anchor_sql")})


async def refresh(report: Dict[str, Any], ctx: ReportContext, *, grain: Optional[str] = None, offset: int = 0,
                  start: Any = None, end: Any = None, filter_state: Optional[Dict[str, List[Any]]] = None,
                  today: Any = None) -> Dict[str, Any]:
    """Re-run a saved report's checked SQL for a period and slicer selection. No model calls, so no AI cost."""
    started = time.perf_counter()
    plan = plan_from_report(report)
    if grain is None and start is None:
        grain = (report.get("period") or {}).get("grain") if (report.get("period") or {}).get("grain") in report_periods.GRAINS else None
    await prepare(ctx, plan, grain=grain, offset=offset, start=start, end=end,
                  filter_state=report.get("filter_state") if filter_state is None else filter_state, today=today)
    done = [item async for item in _run_all(ctx, plan, repair=False)]
    kpis = _ordered([i for i in done if i["kind"] == "kpi"], plan["kpis"])
    panels = _ordered([i for i in done if i["kind"] == "panel"], plan["panels"])
    facts = collect_facts(kpis, panels)
    narrative = deterministic_narrative(facts)
    out = assemble(plan, kpis, panels, narrative, facts, ctx, question=str(report.get("question") or ""),
                   planner=(report.get("meta") or {}).get("planner", "saved"), started=started, agent=report.get("agent"))
    out["meta"]["refreshed"] = True
    return out


async def revise_item(report: Dict[str, Any], instruction: str, item: Optional[Dict[str, Any]], kind: str, ctx: ReportContext) -> Dict[str, Any]:
    """Change one figure (or add one) from a plain-language instruction, then check it."""
    tables = report_tables(ctx.catalog, f"{report.get('question', '')} {instruction}")
    current = {k: item.get(k) for k in ("id", "label", "title", "question", "chart", "x", "y", "series", "format", "span", "sql")} if item else None
    raw = await _complete_json(ctx, PLANNER_RULES + (
        "\n\nNow return JSON for exactly ONE item, {\"kpis\": [item]} or {\"panels\": [item]}, that applies the "
        "instruction. Keep the id when changing an existing item."), {
        "instruction": instruction, "report_question": report.get("question"), "existing_item": current, "kind": kind,
        "dialect": ctx.dialect, "schema": schema_text(ctx.catalog, tables),
        "data_coverage": await data_coverage(ctx, tables),
        "approved_definitions": knowledge_store.definitions_context(ctx.definitions),
    }, max_tokens=1500, deep=True)
    plan = normalize_plan(raw or {})
    candidates = plan["kpis"] if kind == "kpi" else plan["panels"]
    if not candidates:
        raise ValueError("The instruction did not produce a figure. Try describing the question it should answer.")
    new = candidates[0]
    if item and item.get("id"):
        new["id"] = item["id"]
    checked = await run_item(new, kind, ctx, repair=True)
    facts = collect_facts([checked] if kind == "kpi" else [], [checked] if kind == "panel" else [])
    return {"item": checked, "facts": facts}


async def _queue_handoffs(report: Dict[str, Any], ctx: ReportContext) -> None:
    """Figures that failed their checks go to the analyst review queue, like chat answers."""
    for item in report["kpis"] + report["panels"]:
        if item.get("outcome") != "handoff" or not item.get("sql"):
            continue
        try:
            await asyncio.to_thread(
                knowledge_store.create_review_item, source="handoff",
                question=f"[Report: {report['title']}] {item.get('question') or item.get('label') or item.get('title')}",
                sql=item["sql"], owner_id=ctx.owner_id, connection_id=ctx.connection_id, outcome="handoff",
                verification={"outcome": "handoff", "findings": item.get("findings", []), "probability": item.get("probability"),
                              "features": item.get("features") or {}},
            )
        except Exception:
            continue

