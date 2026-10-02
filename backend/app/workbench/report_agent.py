"""SlayQL report agent: a LangGraph graph around the deep model (gpt-6.1-sol).

The agent explores the database with tools before it plans, the way an analyst would:

  explore ─▶ tools ─▶ explore ─▶ ...    The model calls list_tables, describe_table, profile_column,
     │                                   run_sql and get_definitions, then submit_report. A submission
     │                                   is run on the data before it is accepted; problems go back to
     │                                   the model to fix (at most three submissions).
     ├─▶ END (clarify)                   ask_user: the request is ambiguous, so ask instead of guessing.
     ├─▶ fallback ─▶ check               No model, or no acceptable plan: a plan built from the catalog.
     ▼
  check ─▶ summarise ─▶ END              Every figure runs on the full data through the trust layer;
                                         findings are computed, and the summary may only restate them.

Follow-ups ("add refunds by month", "make it weekly", "add my question about top customers") run
the same graph in edit mode with the current report as context. Only changed figures are checked again.

The model never sees credentials or table rows beyond the small samples its own probe queries
return (personal columns are masked), and every query it writes is validated as read-only.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any, AsyncGenerator, Awaitable, Callable, Dict, List, Optional, TypedDict

from backend.app import privacy
from backend.app.knowledge.store import knowledge_store
from backend.app.providers.llm_client import llm_client
from backend.app.workbench import report_periods, trusted_report
from backend.app.workbench.trusted_report import (
    CHART_CONTRACTS,
    PERIOD_RULES,
    ReportContext,
    _q,
    collect_facts,
    data_coverage,
    normalize_plan,
)

try:  # LangGraph runs the graph; a small runner with the same edges is used if it is not installed.
    from langchain_core.runnables import RunnableConfig
    from langgraph.graph import END, StateGraph

    HAVE_LANGGRAPH = True
except ImportError:  # pragma: no cover - exercised only without the dependency
    END, StateGraph, HAVE_LANGGRAPH = "__end__", None, False
    RunnableConfig = Dict[str, Any]  # type: ignore[misc]

logger = logging.getLogger(__name__)

MAX_ROUNDS = 14
MAX_SUBMISSIONS = 3
MIN_PANELS, MIN_KPIS = 8, 4
ROW_LIMITS = {"donut": 6, "bar": 12, "bar_h": 12, "funnel": 10, "treemap": 30, "heatmap": 200, "scatter": 200, "table": 50}
Emit = Callable[[Dict[str, Any]], Awaitable[None]]


class AgentState(TypedDict, total=False):
    mode: str                     # "build" or "edit"
    question: str
    title: str
    grain: Optional[str]
    report: Optional[Dict[str, Any]]
    messages: List[Dict[str, Any]]
    pending: List[Dict[str, Any]]
    rounds: int
    submissions: int
    nudged: bool
    status: str                   # exploring | accepted | clarify | answered | failed
    plan: Optional[Dict[str, Any]]
    changed: List[str]
    reply: str
    clarify: Optional[Dict[str, Any]]
    trace: List[Dict[str, Any]]
    planner: str


# --- Tools ---------------------------------------------------------------------------

def _fn(name: str, description: str, properties: Dict[str, Any], required: List[str]) -> Dict[str, Any]:
    return {"type": "function", "function": {"name": name, "description": description, "parameters": {
        "type": "object", "properties": properties, "required": required}}}


READ_TOOLS = [
    _fn("list_tables", "List every table with its row count and the tables it links to.", {}, []),
    _fn("describe_table", "Columns, types, sample category values and links of one table.",
        {"table": {"type": "string"}}, ["table"]),
    _fn("profile_column", "Distribution of one column: top values with counts for categories, min/max/average for numbers and dates.",
        {"table": {"type": "string"}, "column": {"type": "string"}}, ["table", "column"]),
    _fn("run_sql", "Run a read-only SELECT to test a query (placeholders are filled for the current period). Returns at most 15 rows.",
        {"sql": {"type": "string"}, "purpose": {"type": "string", "description": "What this query checks, in a few words."}}, ["sql", "purpose"]),
    _fn("get_definitions", "The business definitions this workspace has approved (what revenue, active customer, ... mean).", {}, []),
]

REPORT_SCHEMA = {
    "type": "object",
    "description": "The full report: title, subtitle, grain, anchor_sql, filters, kpis, panels (see the system prompt).",
}

BUILD_TOOLS = READ_TOOLS + [
    _fn("ask_user", "Ask one clarifying question when the request is ambiguous in a way that changes the whole report. At most once.",
        {"question": {"type": "string"}, "options": {"type": "array", "items": {"type": "string"}, "description": "2 to 4 short answers."}},
        ["question", "options"]),
    _fn("submit_report", "Submit the finished report. The server runs every query and replies with problems to fix, or accepts it.",
        {"report": REPORT_SCHEMA}, ["report"]),
]

EDIT_TOOLS = READ_TOOLS + [
    _fn("edit_report", "Change the report. Items with an existing id replace it; new ids are added. Then reply to the user.",
        {"changes": {"type": "object", "description": "title, subtitle, grain, filters, kpis, panels, remove (ids)."},
         "reply": {"type": "string", "description": "One or two sentences telling the user what changed."}},
        ["changes", "reply"]),
    _fn("answer", "Reply without changing the report, for a question about it.",
        {"reply": {"type": "string"}}, ["reply"]),
]

REPORT_SHAPE = """submit_report takes {"report": {
  "title": str, "subtitle": str, "grain": "week" | "month",
  "anchor_sql": "SELECT MIN(<main date column>), MAX(<main date column>) FROM <table>",
  "filters": [{"id": str, "label": str, "values_sql": "SELECT DISTINCT <column> FROM <table> WHERE <column> IS NOT NULL ORDER BY 1"}],
  "kpis": [{"id": str, "label": str, "question": str, "format": "number|currency|percent", "sql": str}],
  "panels": [{"id": str, "title": str, "question": str, "purpose": "trend|ranking|composition|comparison|relationship|flow|detail",
              "chart": str, "x": str, "y": str, "series": str|null, "label": str|null, "filter_id": str|null,
              "format": "number|currency|percent", "span": 1|2|3, "sql": str}]}}"""

BUILD_RULES = f"""You are SlayQL's report analyst. You build a management dashboard on a live SQL database, using tools.

How to work:
1. Explore first: list_tables, describe_table for the tables the request needs, profile_column on the category,
   status and date columns you will filter or group by, get_definitions. Call several tools at once when you can.
2. Test the queries you are unsure of with run_sql. Finish in about 8 steps.
3. Only if the request could mean two different reports, call ask_user once with 2 to 4 short options.
   Never ask about periods, charts or layout: decide those yourself.
4. Call submit_report. The server runs every query; if it lists problems, fix them and submit again.

What a good report has:
- 4 to 6 KPIs a manager reads first (revenue, orders, average value, customers, refunds, open cases...).
- 8 to 10 panels, EVERY panel a different chart type, each chosen because it is the right form for its question.
  Order them like a professional dashboard: the headline trend first (area or line, span 2), then the shares and
  rankings, then flows and relationships (funnel, heatmap, scatter, waterfall), then a detail table (span 3).
- 1 to 3 slicers (filters) on dimensions a manager filters by (segment, region, category, channel, carrier,
  priority). Use each slicer in every query that can reach that column, through {{{{filter:<id>:<alias.column>}}}}.
  When a panel's x is a slicer's column, set its filter_id so clicking a bar filters the whole report.
- grain "week" when the request is operational or says week/weekly, otherwise "month".
- Titles a manager understands ("Revenue by month", not "SUM(total_amount)"); questions say which statuses count.
- Questions never say "this week", "last month" or a date: the reader picks the period. Write "Revenue in the
  period" or "Orders by status in the period".
- Name result columns after the data they hold: s.status AS status, not AS stage. Every figure passes a check that
  rejects labels the database does not contain. Calendar parts you compute from a date (weekday, hour, month) are fine.
- Detail tables: only columns that have values; skip columns that are empty.

Rules:
- Aggregate a parent table's measure at its own grain: never SUM an orders column after joining order lines or
  shipments; use EXISTS or pre-aggregate the child table instead.
- Apply approved definitions exactly. Without one, when a table has a status column, decide which statuses count
  (for example completed and shipped orders for revenue) and say so in the question.
- Never compute growth rates in SQL; the report computes changes. Use only tables and columns that exist.
  One SELECT per query, no semicolons, the SQL dialect given.

{CHART_CONTRACTS}

{PERIOD_RULES}

{REPORT_SHAPE}"""

EDIT_RULES = f"""You are SlayQL's report analyst. The user is looking at a dashboard you built and asks for a change or
asks a question about it. Use the read tools if you need to, then either:
- edit_report: changes = {{"title"?, "subtitle"?, "grain"? ("week"|"month"), "filters"? (the full new slicer list),
  "kpis"?: [items to add or replace], "panels"?: [items to add or replace], "remove"?: [ids]}}, plus a short reply.
  Keep an item's id to replace it. New panels should use a chart type the report does not use yet, when one fits.
  When the user gives a past question with its SQL, adapt that SQL to the period placeholders where it is about
  time, pick the right chart, and add it as a panel.
- answer: a short reply when nothing needs to change. Use only numbers shown in the current report.

{CHART_CONTRACTS}

{PERIOD_RULES}

Item shapes are the same as the report's: kpis {{id, label, question, format, sql}}; panels {{id, title, question,
purpose, chart, x, y, series, label, filter_id, format, span, sql}}."""


def _cell(value: Any) -> Any:
    if isinstance(value, str) and len(value) > 60:
        return value[:57] + "..."
    return value


def _find_table(ctx: ReportContext, name: str):
    name = str(name or "").strip().strip('"`[]')
    if name in ctx.catalog.tables:
        return ctx.catalog.tables[name]
    lowered = {key.lower(): key for key in ctx.catalog.tables}
    key = lowered.get(name.lower()) or lowered.get(name.split(".")[-1].lower())
    return ctx.catalog.tables.get(key) if key else None


async def _tool(call: Dict[str, Any], state: AgentState, ctx: ReportContext) -> Dict[str, Any]:
    """Run one read tool. Returns the JSON result for the model and a line for the trace."""
    name = call.get("name")
    try:
        args = json.loads(call.get("arguments") or "{}")
    except ValueError:
        return {"result": {"error": "The arguments were not valid JSON."}, "label": f"{name}: invalid arguments", "ok": False}

    if name == "list_tables":
        tables = [{
            "table": t.name, "rows": t.row_count_estimate, "columns": len(t.columns),
            "links_to": sorted({k.to_table for k in t.foreign_keys}),
        } for t in list(ctx.catalog.tables.values())[:80]]
        return {"result": {"tables": tables}, "label": f"Listed {len(tables)} tables", "ok": True}

    if name == "describe_table":
        table = _find_table(ctx, args.get("table"))
        if not table:
            return {"result": {"error": f"No table named {args.get('table')}."}, "label": f"Looked for {args.get('table')}", "ok": False}
        columns = []
        for column in table.columns:
            entry = {"name": column.name, "type": column.type, **({"primary_key": True} if column.primary_key else {})}
            if not privacy.is_personal(column.name):
                samples = [str(v) for v in (column.sample_values or [])[:6] if isinstance(v, str) and len(v) <= 40]
                if samples:
                    entry["examples"] = samples
            else:
                entry["personal"] = True
            columns.append(entry)
        linked_from = sorted({other.name for other in ctx.catalog.tables.values() for k in other.foreign_keys if k.to_table == table.name})
        return {"result": {
            "table": table.name, "rows": table.row_count_estimate, "columns": columns,
            "links": [f"{table.name}.{k.from_column} -> {k.to_table}.{k.to_column}" for k in table.foreign_keys],
            "linked_from": linked_from,
        }, "label": f"Read {table.name} ({len(columns)} columns, {table.row_count_estimate:,} rows)", "ok": True}

    if name == "profile_column":
        table = _find_table(ctx, args.get("table"))
        column = next((c for c in (table.columns if table else []) if c.name.lower() == str(args.get("column") or "").lower()), None)
        if not table or not column:
            return {"result": {"error": "No such table or column."}, "label": f"Looked for {args.get('table')}.{args.get('column')}", "ok": False}
        q = lambda n: _q(n, ctx.dialect)  # noqa: E731
        col, tab = q(column.name), q(table.name)
        numeric = re.search(r"int|real|num|dec|float|double|money", column.type or "", re.I)
        if privacy.is_personal(column.name):
            result = await ctx.run(f"SELECT COUNT(DISTINCT {col}), COUNT(*) FROM {tab}")
            out = {"personal": True, "distinct": result.rows[0][0] if result.rows else None}
            summary = f"{out['distinct']} distinct values (personal data, values not read)"
        elif numeric or trusted_report.DATE_COLUMN.search(column.name):
            result = await ctx.run(f"SELECT MIN({col}), MAX({col}), AVG({col}) , COUNT({col}), COUNT(*) FROM {tab}" if numeric
                                   else f"SELECT MIN({col}), MAX({col}), COUNT({col}), COUNT(*) FROM {tab}")
            row = result.rows[0] if result.rows else []
            out = {"min": _cell(row[0]) if row else None, "max": _cell(row[1]) if row else None}
            if numeric and row:
                out.update({"average": round(float(row[2]), 2) if row[2] is not None else None, "non_null": row[3], "rows": row[4]})
            elif row:
                out.update({"non_null": row[2], "rows": row[3]})
            summary = f"{out['min']} to {out['max']}"
        else:
            result = await ctx.run(f"SELECT {col}, COUNT(*) AS n FROM {tab} GROUP BY {col} ORDER BY n DESC")
            values = [[_cell(r[0]), r[1]] for r in result.rows[:12]]
            out = {"top_values": values, "distinct_values": len(result.rows)}
            summary = f"{len(result.rows)} values: " + ", ".join(str(v[0]) for v in values[:4]) + ("…" if len(result.rows) > 4 else "")
        if result.error:
            return {"result": {"error": result.error}, "label": f"Profiled {table.name}.{column.name}: failed", "ok": False}
        return {"result": out, "label": f"Profiled {table.name}.{column.name}: {summary}", "ok": True}

    if name == "run_sql":
        sql = str(args.get("sql") or "").strip().rstrip(";")
        purpose = str(args.get("purpose") or "a query")[:80]
        result = await ctx.run(ctx.render(sql))
        if result.error:
            return {"result": {"error": result.error[:600]}, "label": f"Tested {purpose}: error", "ok": False}
        rows = privacy.mask_rows(result.columns, result.rows[:15]) if privacy.enabled() else result.rows[:15]
        return {"result": {"columns": result.columns, "rows": [[_cell(v) for v in r] for r in rows], "row_count": len(result.rows)},
                "label": f"Tested {purpose}: {len(result.rows)} row{'s' if len(result.rows) != 1 else ''}", "ok": True}

    if name == "get_definitions":
        return {"result": {"definitions": knowledge_store.definitions_context(ctx.definitions) or "None approved yet."},
                "label": f"Read {len(ctx.definitions)} approved definition{'s' if len(ctx.definitions) != 1 else ''}", "ok": True}

    return {"result": {"error": f"Unknown tool {name}."}, "label": f"Unknown tool {name}", "ok": False}


# --- Checking a submission -----------------------------------------------------------

def _limit_problem(panel: Dict[str, Any], rows: int) -> Optional[str]:
    limit = ROW_LIMITS.get(panel["chart"])
    if limit and rows > limit:
        return f"returns {rows} rows; a {panel['chart']} shows at most {limit}"
    return None


async def _probe_items(plan: Dict[str, Any], ctx: ReportContext) -> List[str]:
    """Run each figure once for the current period and report contract problems (no trust checks yet)."""
    problems: List[str] = []
    semaphore = asyncio.Semaphore(4)

    async def probe(item: Dict[str, Any], kind: str) -> None:
        async with semaphore:
            result = await ctx.run(ctx.render(item["sql"]))
        name = f"{kind} '{item['id']}'"
        if result.error:
            problems.append(f"{name}: {result.error[:240]}")
            return
        columns = result.columns
        if kind == "kpi":
            if "value" not in [c.lower() for c in columns] and len(columns) < 2:
                problems.append(f"{name}: return a column named value (one row), or period and value")
            return
        needed = [item.get("x"), item.get("y")] if item["chart"] != "table" else []
        needed += [item.get("series")] if item.get("series") else []
        needed += [item.get("label")] if item.get("label") else []
        missing = [c for c in needed if c and c not in columns]
        if missing:
            problems.append(f"{name}: columns {missing} are not in the result {columns}")
        if len(result.rows) >= 3:
            empty = [c for i, c in enumerate(columns) if all(r[i] is None for r in result.rows)]
            if empty:
                problems.append(f"{name}: columns {empty} are empty; remove them")
        limit = _limit_problem(item, len(result.rows))
        if limit:
            problems.append(f"{name}: {limit}")

    await asyncio.gather(*[probe(k, "kpi") for k in plan["kpis"]], *[probe(p, "panel") for p in plan["panels"]])
    return problems


async def validate_plan(plan: Dict[str, Any], ctx: ReportContext, *, full: bool = True) -> List[str]:
    """Problems that send a submission back to the model, in plain words."""
    problems: List[str] = []
    if full:
        if len(plan["kpis"]) < MIN_KPIS:
            problems.append(f"Only {len(plan['kpis'])} KPIs: give 4 to 6.")
        if len(plan["panels"]) < MIN_PANELS:
            problems.append(f"Only {len(plan['panels'])} panels: give 8 to 10.")
        charts = [p["chart"] for p in plan["panels"]]
        repeated = sorted({c for c in charts if charts.count(c) > 1})
        if repeated:
            problems.append(f"Chart types used more than once: {', '.join(repeated)}. Every panel needs a different chart type.")
        texts = [i["sql"] for i in plan["kpis"] + plan["panels"]]
        if not any(report_periods.uses_period(t) for t in texts):
            problems.append("No query uses the period placeholders, so the report cannot be sent weekly or monthly.")
        if not plan.get("anchor_sql"):
            problems.append("anchor_sql is missing: SELECT MIN(date), MAX(date) of the main date column.")
    if plan.get("anchor_sql"):
        first, last = await trusted_report.data_range(ctx, plan)
        if last is None:
            problems.append("anchor_sql must return the first and last date of the main date column.")
    used = {fid for i in plan["kpis"] + plan["panels"] for fid in report_periods.filter_ids(i["sql"])}
    for spec in plan.get("filters") or []:
        result = await ctx.run(spec["values_sql"])
        if result.error:
            problems.append(f"filter '{spec['id']}': {result.error[:200]}")
        elif len(result.rows) < 2:
            problems.append(f"filter '{spec['id']}' has fewer than 2 values; choose another dimension.")
        if spec["id"] not in used:
            problems.append(f"filter '{spec['id']}' is not used by any query; add {{{{filter:{spec['id']}:<column>}}}} where it applies.")
    problems += await _probe_items(plan, ctx)
    return problems[:14]


# --- Model calls ----------------------------------------------------------------------

async def _call_model(ctx: ReportContext, messages: List[Dict[str, Any]], tools: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    completed = None
    async for event in llm_client._stream_completion(
        requested_model_id=llm_client.deep_model, messages=messages, session_id=None, max_tokens=9000,
        reasoning_effort="low", fallback_text="", tools=tools, parallel_tool_calls=True, use_requested_model=True,
    ):
        if event.get("type") == "completed":
            completed = event
    if completed:
        usage = completed.get("usage") or {}
        ctx.usage["calls"] += 1
        ctx.usage["cost"] += float(usage.get("cost") or 0)
        ctx.usage["tokens"] += int(usage.get("total_tokens") or 0)
    return completed


def _runtime(config: Dict[str, Any]):
    configurable = (config or {}).get("configurable", {})
    return configurable["ctx"], configurable["emit"]


async def _trace(state: AgentState, emit: Emit, step: Dict[str, Any]) -> List[Dict[str, Any]]:
    trace = list(state.get("trace") or []) + [step]
    await emit({"type": "tool", **step})
    return trace


# --- Nodes ----------------------------------------------------------------------------

async def explore(state: AgentState, config: RunnableConfig) -> AgentState:
    ctx, emit = _runtime(config)
    if state.get("rounds", 0) >= MAX_ROUNDS:
        return {"status": "failed", "pending": []}
    tools = BUILD_TOOLS if state["mode"] == "build" else EDIT_TOOLS
    try:
        completed = await _call_model(ctx, state["messages"], tools)
    except Exception as error:  # the provider failed: fall back instead of failing the request
        logger.warning("Report agent model call failed: %s", str(error)[:200])
        return {"status": "failed", "pending": []}
    if not completed:
        return {"status": "failed", "pending": []}
    calls = completed.get("tool_calls") or []
    content = (completed.get("content") or "").strip()
    message = {"role": "assistant", "content": content or None}
    if calls:
        message["tool_calls"] = [{"id": c.get("id"), "type": "function",
                                  "function": {"name": c.get("name"), "arguments": c.get("arguments") or "{}"}} for c in calls]
    messages = state["messages"] + [message]
    update: AgentState = {"messages": messages, "rounds": state.get("rounds", 0) + 1, "pending": calls}
    if content and calls:
        update["trace"] = await _trace(state, emit, {"name": "think", "label": content[:200], "ok": True})
    if not calls:
        if state["mode"] == "edit" and content:
            return {**update, "status": "answered", "reply": content[:600]}
        if state.get("nudged"):
            return {**update, "status": "failed"}
        finish = "submit_report" if state["mode"] == "build" else "edit_report or answer"
        update["messages"] = messages + [{"role": "user", "content": f"Call {finish} now."}]
        update["nudged"] = True
    return update


async def run_tools(state: AgentState, config: RunnableConfig) -> AgentState:
    ctx, emit = _runtime(config)
    messages = list(state["messages"])
    update: AgentState = {"pending": []}
    trace = list(state.get("trace") or [])
    calls = state.get("pending") or []
    reads = [c for c in calls if c.get("name") in {t["function"]["name"] for t in READ_TOOLS}]
    results = await asyncio.gather(*[_tool(c, state, ctx) for c in reads])
    by_id = {c.get("id"): r for c, r in zip(reads, results)}

    for call in calls:
        name = call.get("name")
        if call.get("id") in by_id:
            outcome = by_id[call.get("id")]
            trace.append({"name": name, "label": outcome["label"], "ok": outcome["ok"]})
            await emit({"type": "tool", "name": name, "label": outcome["label"], "ok": outcome["ok"]})
            content = outcome["result"]
        else:
            try:
                args = json.loads(call.get("arguments") or "{}")
            except ValueError:
                args = {}
            content, step = await _finishing_tool(name, args, state, ctx, update)
            trace.append(step)
            await emit({"type": "tool", **step})
        messages.append({"role": "tool", "tool_call_id": call.get("id"), "name": name,
                         "content": json.dumps(content, ensure_ascii=True, default=str)[:9000]})
    update.update({"messages": messages, "trace": trace})
    return update


async def _finishing_tool(name: str, args: Dict[str, Any], state: AgentState, ctx: ReportContext,
                          update: AgentState) -> tuple:
    """ask_user, submit_report, edit_report and answer: tools that can end the exploration."""
    if name == "ask_user" and state["mode"] == "build":
        options = [str(o)[:80] for o in (args.get("options") or [])][:4]
        update.update({"status": "clarify", "clarify": {"question": str(args.get("question") or "")[:300], "options": options}})
        return {"ok": True, "note": "Asked the user."}, {"name": name, "label": "Asked you a question", "ok": True}

    if name == "answer" and state["mode"] == "edit":
        update.update({"status": "answered", "reply": str(args.get("reply") or "")[:800]})
        return {"ok": True}, {"name": name, "label": "Answered without changing the report", "ok": True}

    if name == "submit_report" and state["mode"] == "build":
        submissions = state.get("submissions", 0) + 1
        update["submissions"] = submissions
        plan = normalize_plan(args.get("report") if isinstance(args.get("report"), dict) else args)
        problems = await validate_plan(plan, ctx)
        label = f"Submitted {len(plan['kpis'])} KPIs and {len(plan['panels'])} charts"
        if not problems or (submissions >= MAX_SUBMISSIONS and len(plan["panels"]) >= 4):
            if problems:
                plan = await _drop_failing(plan, ctx)
            update.update({"status": "accepted", "plan": plan, "planner": "agent"})
            return {"accepted": True}, {"name": name, "label": f"{label}: accepted after running every query", "ok": True}
        if submissions >= MAX_SUBMISSIONS:
            update["status"] = "failed"
        return ({"accepted": False, "problems": problems, "instruction": "Fix these and call submit_report again with the whole report."},
                {"name": name, "label": f"{label}: {len(problems)} problem{'s' if len(problems) != 1 else ''} sent back to fix", "ok": False})

    if name == "edit_report" and state["mode"] == "edit":
        submissions = state.get("submissions", 0) + 1
        update["submissions"] = submissions
        merged, changed = _merge(state["report"], args.get("changes") or {})
        partial = {**merged, "kpis": [k for k in merged["kpis"] if k["id"] in changed],
                   "panels": [p for p in merged["panels"] if p["id"] in changed]}
        problems = await validate_plan(partial, ctx, full=False) if changed or merged.get("filters") != state["report"].get("filters") else []
        if problems and submissions < MAX_SUBMISSIONS:
            return ({"accepted": False, "problems": problems, "instruction": "Fix these and call edit_report again."},
                    {"name": name, "label": f"Edited {len(changed)} figure{'s' if len(changed) != 1 else ''}: {len(problems)} problems sent back", "ok": False})
        update.update({"status": "accepted", "plan": merged, "changed": changed, "reply": str(args.get("reply") or "Done.")[:600], "planner": "agent"})
        return {"accepted": True}, {"name": name, "label": f"Changed {len(changed)} figure{'s' if len(changed) != 1 else ''}", "ok": True}

    return {"error": f"{name} is not available now."}, {"name": name, "label": f"{name} is not available", "ok": False}


async def _drop_failing(plan: Dict[str, Any], ctx: ReportContext) -> Dict[str, Any]:
    """Keep the figures that run; used when the last allowed submission still had problems."""
    async def runs(item: Dict[str, Any]) -> bool:
        return not (await ctx.run(ctx.render(item["sql"]))).error
    kpis = [k for k, ok in zip(plan["kpis"], await asyncio.gather(*[runs(k) for k in plan["kpis"]])) if ok]
    panels = [p for p, ok in zip(plan["panels"], await asyncio.gather(*[runs(p) for p in plan["panels"]])) if ok]
    return {**plan, "kpis": kpis, "panels": panels}


def _merge(report: Dict[str, Any], changes: Dict[str, Any]) -> tuple:
    """Apply an edit to a report's plan; returns the new plan and the ids that must be re-run."""
    base = trusted_report.plan_from_report(report)
    incoming = normalize_plan({"kpis": changes.get("kpis") or [], "panels": changes.get("panels") or [],
                               "filters": changes.get("filters") if changes.get("filters") is not None else base["filters"]})
    remove = {str(i) for i in changes.get("remove") or []}
    changed: List[str] = []

    def merge_list(current: List[Dict[str, Any]], new_items: List[Dict[str, Any]], originals: List[Dict[str, Any]]):
        ids = {item["id"] for item in current}
        out = [item for item in current if item["id"] not in remove]
        for raw, item in zip(originals, new_items):
            wanted = str(raw.get("id") or item["id"])
            item["id"] = wanted if wanted in ids else (item["id"] if item["id"] not in ids else f"{item['id']}-new")
            if item["id"] in ids:
                out = [item if existing["id"] == item["id"] else existing for existing in out]
            else:
                out.append(item)
            changed.append(item["id"])
        return out

    plan = dict(base)
    plan["kpis"] = merge_list(base["kpis"], incoming["kpis"], [k for k in changes.get("kpis") or [] if isinstance(k, dict) and k.get("sql")])[:trusted_report.MAX_KPIS]
    plan["panels"] = merge_list(base["panels"], incoming["panels"], [p for p in changes.get("panels") or [] if isinstance(p, dict) and p.get("sql")])[:trusted_report.MAX_PANELS + 2]
    plan["filters"] = incoming["filters"]
    for key in ("title", "subtitle"):
        if changes.get(key):
            plan[key] = str(changes[key])[:120 if key == "title" else 200]
    if changes.get("grain") in report_periods.GRAINS:
        plan["grain"] = changes["grain"]
    return plan, changed


async def fallback(state: AgentState, config: RunnableConfig) -> AgentState:
    ctx, emit = _runtime(config)
    if state["mode"] == "edit":
        return {"status": "answered", "reply": state.get("reply") or "I could not make that change. Try describing the chart you want."}
    tables = trusted_report.report_tables(ctx.catalog, state.get("question", ""))
    plan = trusted_report.fallback_plan(ctx, tables, state.get("question", ""))
    plan["grain"] = state.get("grain") or plan.get("grain") or "month"
    trace = await _trace(state, emit, {"name": "fallback", "label": "Planned from the database structure (no AI plan was accepted)", "ok": True})
    return {"status": "accepted", "plan": plan, "planner": "catalog", "trace": trace}


async def check(state: AgentState, config: RunnableConfig) -> AgentState:
    """Run every figure that needs it on the full data, through the trust layer."""
    ctx, emit = _runtime(config)
    plan = state["plan"]
    report = state.get("report") or {}
    period = report.get("period") or {}
    same_period = state["mode"] == "edit" and plan.get("grain") == report.get("grain") and plan.get("filters") == trusted_report.plan_from_report(report)["filters"]
    # An edit keeps the period and slicers the user is looking at, unless it changed the grain or slicers.
    await trusted_report.prepare(
        ctx, plan, grain=state.get("grain") or (period.get("grain") if same_period else plan.get("grain")),
        offset=period.get("offset", 0) if same_period else 0,
        filter_state=report.get("filter_state") if same_period else None,
    )
    await emit({"type": "stage", "stage": "check", "label": "Running every figure on the full data and checking it"})
    await emit({"type": "plan", "planner": state.get("planner"), "title": plan["title"], "subtitle": plan["subtitle"],
                "period": ctx.window, "filters": plan.get("filters") or [],
                "kpis": [{"id": k["id"], "label": k["label"]} for k in plan["kpis"]],
                "panels": [{"id": p["id"], "title": p["title"], "chart": p["chart"], "span": p["span"]} for p in plan["panels"]]})
    previous = {i["id"]: i for i in (report.get("kpis") or []) + (report.get("panels") or [])} if same_period else {}
    rerun = set(state.get("changed") or []) if same_period else None
    todo = {"kpis": [k for k in plan["kpis"] if rerun is None or k["id"] in rerun or k["id"] not in previous],
            "panels": [p for p in plan["panels"] if rerun is None or p["id"] in rerun or p["id"] not in previous]}
    done: List[Dict[str, Any]] = []
    async for item in trusted_report._run_all(ctx, todo, repair=True):
        done.append(item)
        await emit({"type": "item", "item": item})
    fresh = {i["id"]: i for i in done}
    kpis = [fresh.get(k["id"]) or previous[k["id"]] for k in plan["kpis"] if k["id"] in fresh or k["id"] in previous]
    panels = [fresh.get(p["id"]) or previous[p["id"]] for p in plan["panels"] if p["id"] in fresh or p["id"] in previous]
    return {"plan": {**plan, "checked_kpis": kpis, "checked_panels": panels}}


async def summarise(state: AgentState, config: RunnableConfig) -> AgentState:
    ctx, emit = _runtime(config)
    plan = state["plan"]
    kpis, panels = plan.pop("checked_kpis"), plan.pop("checked_panels")
    await emit({"type": "stage", "stage": "findings", "label": "Computing findings and writing the summary"})
    facts = collect_facts(kpis, panels)
    # A report keeps the request it was built for; follow-up messages go into the agent's history.
    question = ((state.get("report") or {}).get("question") if state["mode"] == "edit" else state.get("question")) or state.get("question") or ""
    narrative = await trusted_report.write_narrative(question, facts, panels, ctx)
    agent = {
        "model": llm_client.deep_model if state.get("planner") == "agent" else None,
        "framework": "LangGraph" if HAVE_LANGGRAPH else "built-in graph runner",
        "rounds": state.get("rounds", 0),
        "submissions": state.get("submissions", 0),
        "steps": (state.get("trace") or [])[-40:],
        "history": ((state.get("report") or {}).get("agent") or {}).get("history", [])[-20:] + (
            [{"role": "user", "content": state.get("question", "")}, {"role": "assistant", "content": state.get("reply", "")}]
            if state["mode"] == "edit" else []),
    }
    report = trusted_report.assemble(plan, kpis, panels, narrative, facts, ctx, question=question,
                                     planner=state.get("planner") or "agent", started=config["configurable"]["started"], agent=agent)
    await trusted_report._queue_handoffs(report, ctx)
    if state["mode"] == "edit":
        await emit({"type": "reply", "text": state.get("reply") or "Done."})
    await emit({"type": "report", "report": report})
    return {"status": "done"}


# --- Graph ----------------------------------------------------------------------------

def _after_explore(state: AgentState) -> str:
    status = state.get("status")
    if status == "failed":
        return "fallback"
    if status in {"answered", "clarify"}:
        return END
    return "tools" if state.get("pending") else "explore"


def _after_tools(state: AgentState) -> str:
    status = state.get("status")
    if status == "accepted":
        return "check"
    if status in {"clarify", "answered"}:
        return END
    if status == "failed":
        return "fallback"
    return "explore"


def _after_fallback(state: AgentState) -> str:
    return "check" if state.get("status") == "accepted" else END


NODES = {"explore": explore, "tools": run_tools, "fallback": fallback, "check": check, "summarise": summarise}
EDGES = {"explore": _after_explore, "tools": _after_tools, "fallback": _after_fallback}


def build_graph():
    graph = StateGraph(AgentState)
    for name, node in NODES.items():
        graph.add_node(name, node)
    graph.set_entry_point("explore")
    for name, route in EDGES.items():
        graph.add_conditional_edges(name, route)
    graph.add_edge("check", "summarise")
    graph.add_edge("summarise", END)
    return graph.compile()


GRAPH = build_graph() if HAVE_LANGGRAPH else None


async def _run_plain(state: AgentState, config: Dict[str, Any], entry: str) -> None:
    """The same graph without LangGraph: follow the edges until END."""
    node = entry
    while node != END:
        update = await NODES[node](state, config)
        state.update(update or {})
        node = EDGES[node](state) if node in EDGES else ("summarise" if node == "check" else END)


async def _stream(state: AgentState, ctx: ReportContext, entry: str = "explore") -> AsyncGenerator[Dict[str, Any], None]:
    queue: asyncio.Queue = asyncio.Queue()
    done = object()

    async def emit(event: Dict[str, Any]) -> None:
        await queue.put(event)

    config = {"configurable": {"ctx": ctx, "emit": emit, "started": time.perf_counter()}, "recursion_limit": 80}
    final: Dict[str, Any] = {}

    async def run() -> None:
        try:
            if GRAPH is not None and entry == "explore":
                result = await GRAPH.ainvoke(state, config)
            else:
                result = dict(state)
                await _run_plain(result, config, entry)
            final.update(result or {})
        except Exception as error:
            logger.exception("Report agent failed")
            await queue.put({"type": "error", "detail": f"The report could not be built: {str(error)[:200]}"})
        finally:
            await queue.put(done)

    task = asyncio.create_task(run())
    try:
        while True:
            event = await queue.get()
            if event is done:
                break
            yield event
        if final.get("status") == "clarify" and final.get("clarify"):
            yield {"type": "clarify", **final["clarify"]}
        elif final.get("status") == "answered":
            yield {"type": "reply", "text": final.get("reply") or "Done.", "changed": False}
    finally:
        if not task.done():
            task.cancel()


async def _setup(ctx: ReportContext, grain: Optional[str]) -> List[str]:
    """Data coverage for the prompt, and a provisional period so probe queries can be rendered."""
    tables = trusted_report.report_tables(ctx.catalog, "")
    coverage = await data_coverage(ctx, tables)
    last_dates = [report_periods.parse_day(line.rsplit(" to ", 1)[-1]) for line in coverage]
    first_dates = [report_periods.parse_day(line.split(": ", 1)[-1].split(" to ")[0]) for line in coverage]
    last = max([d for d in last_dates if d], default=None)
    first = min([d for d in first_dates if d], default=None)
    ctx.window = report_periods.window(grain or "month", data_min=first, data_max=last)
    return coverage


async def build(question: str, title: str, ctx: ReportContext, *, grain: Optional[str] = None,
                history: Optional[List[Dict[str, str]]] = None) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream a report built by the agent: tool steps, the plan, each checked figure, then the report."""
    yield {"type": "stage", "stage": "explore", "label": "Exploring your data"}
    coverage = await _setup(ctx, grain)
    request = question.strip() or "Give a management overview of this business."
    prior = "".join(f"\n{turn['role'].title()}: {turn['content']}" for turn in (history or [])[-6:] if turn.get("content"))
    user = (f"Request: {request}{prior}\n\n"
            f"SQL dialect: {ctx.dialect}\nTables: {len(ctx.catalog.tables)}\n"
            f"Data coverage: {'; '.join(coverage) or 'no date columns found'}\n"
            f"Period the report opens on: {ctx.window['label']} ({ctx.window['grain']})"
            + (f"\nPreferred title: {title}" if title else "")
            + (f"\nThe user wants a {grain}ly report." if grain in {"week", "month"} else ""))
    state: AgentState = {
        "mode": "build", "question": request, "title": title, "grain": grain, "report": None,
        "messages": [{"role": "system", "content": BUILD_RULES}, {"role": "user", "content": user}],
        "rounds": 0, "submissions": 0, "status": "exploring", "trace": [],
    }
    async for event in _stream(state, ctx, "explore" if ctx.llm else "fallback"):
        yield event


def _report_digest(report: Dict[str, Any]) -> str:
    """The current report for the edit prompt: definitions, SQL and the values the user can see."""
    lines = [f"Title: {report.get('title')}", f"Grain: {report.get('grain') or (report.get('period') or {}).get('grain')}",
             f"Period shown: {(report.get('period') or {}).get('label')}"]
    lines += [f"Slicer {f['id']} ({f['label']}): {f['values_sql']}" for f in report.get("filters") or []]
    for k in report.get("kpis") or []:
        lines.append(f"KPI {k['id']} '{k.get('label')}' = {k.get('value')} (previous {k.get('previous')}), outcome {k.get('outcome')}: {k.get('sql')}")
    for p in report.get("panels") or []:
        sample = json.dumps((p.get("rows") or [])[:5], default=str)[:300]
        lines.append(f"PANEL {p['id']} '{p.get('title')}' {p.get('chart')} x={p.get('x')} y={p.get('y')} series={p.get('series')} "
                     f"outcome {p.get('outcome')}: {p.get('sql')}\n  first rows: {sample}")
    return "\n".join(lines)


async def follow_up(report: Dict[str, Any], message: str, ctx: ReportContext,
                    questions: Optional[List[Dict[str, str]]] = None) -> AsyncGenerator[Dict[str, Any], None]:
    """Change a report from a chat message (and optional past questions to add)."""
    yield {"type": "stage", "stage": "explore", "label": "Working on your change"}
    await _setup(ctx, report.get("grain") or (report.get("period") or {}).get("grain"))
    extra = ""
    if questions:
        extra = "\n\nPast questions to add to the report as panels (adapt them to the period placeholders where they are about time):\n" + "\n".join(
            f"- {q.get('question')}\n  SQL: {q.get('sql')}" for q in questions[:8] if q.get("sql"))
    history = ((report.get("agent") or {}).get("history") or [])[-8:]
    state: AgentState = {
        "mode": "edit", "question": message, "title": report.get("title", ""), "grain": None, "report": report,
        "messages": [{"role": "system", "content": EDIT_RULES},
                     {"role": "user", "content": f"Current report:\n{_report_digest(report)}\n\nSQL dialect: {ctx.dialect}"},
                     *[{"role": t["role"], "content": t["content"]} for t in history if t.get("content") and t.get("role") in {"user", "assistant"}],
                     {"role": "user", "content": (message or "Add these questions to the report.") + extra}],
        "rounds": 0, "submissions": 0, "status": "exploring", "trace": [],
    }
    if not ctx.llm:
        yield {"type": "reply", "text": "Changing the report needs the AI provider, which is not configured.", "changed": False}
        return
    async for event in _stream(state, ctx):
        yield event
