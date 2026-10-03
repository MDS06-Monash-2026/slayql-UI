"""The report agent (LangGraph), period windows and scheduled editions."""
import json
import sqlite3
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest

from backend.app.catalog.discovery import CatalogService
from backend.app.config import settings
from backend.app.queries.executor import QueryExecutor
from backend.app.workbench import report_agent, report_periods, trusted_report
from backend.app.workbench.schedules import render_email


# --- Periods ---------------------------------------------------------------------------

def test_weeks_run_monday_to_sunday_and_follow_the_data():
    week = report_periods.window("week", data_max=date(2026, 6, 28), today=date(2026, 10, 2))
    assert (week["start"], week["end"], week["prev_start"]) == ("2026-06-22", "2026-06-29", "2026-06-15")
    assert date.fromisoformat(week["start"]).weekday() == 0 and "data ends" in week["note"]
    # A Monday send covers the week that ended the day before.
    assert report_periods.window("week", today=date(2026, 10, 5))["start"] == "2026-09-28"
    # A month is reported only once it is over: data ending on the 28th means the month before.
    assert report_periods.window("month", data_max=date(2026, 6, 28), today=date(2026, 10, 2))["label"] == "May 2026"
    assert report_periods.window("month", today=date(2026, 10, 1))["label"] == "September 2026"
    assert report_periods.window("month", today=date(2026, 10, 1), offset=-1)["label"] == "August 2026"
    custom = report_periods.window(start=date(2026, 5, 1), end=date(2026, 5, 20))
    assert (custom["end"], custom["prev_start"], custom["bucket"]) == ("2026-05-21", "2026-04-11", "day")


def test_placeholders_render_dates_buckets_and_escaped_slicers():
    win = report_periods.window("week", today=date(2026, 10, 5))
    sql = ("SELECT {{bucket:o.order_date}} AS period FROM orders o JOIN customers c ON c.id = o.customer_id "
           "WHERE o.order_date >= {{start}} AND o.order_date < '{{end}}' AND {{filter:segment:c.segment}} "
           "AND {{filter:city:c.city}} AND {{mystery}}")
    out = report_periods.render(sql, win, "sqlite", {"segment": ["SMB", "O'Brien"]})
    assert "date(o.order_date, '-6 days', 'weekday 1')" in out
    assert ">= '2026-09-28' AND o.order_date < '2026-10-05'" in out
    assert "c.segment IN ('SMB', 'O''Brien')" in out and "AND 1=1" in out
    assert "{{mystery}}" in out  # unknown placeholders are never guessed


def test_weekly_and_monthly_sends_are_at_the_hour_in_malaysia_time():
    after = datetime(2026, 10, 2, tzinfo=timezone.utc)  # a Friday
    assert report_periods.next_send("weekly", weekday=0, hour=8, after=after) == datetime(2026, 10, 5, 0, tzinfo=timezone.utc)
    assert report_periods.next_send("monthly", day_of_month=1, hour=8, after=after) == datetime(2026, 11, 1, 0, tzinfo=timezone.utc)
    assert report_periods.describe_cadence("monthly", 0, 1, 8) == "Monthly on the 1st at 08:00 (Malaysia time)"


# --- The agent ----------------------------------------------------------------------------

async def _context(llm=True):
    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)

    async def execute(sql):
        return await QueryExecutor.execute_sqlite(settings.SQLITE_DEMO_PATH, sql)

    return await trusted_report.make_context(connection_id="sqlite_demo", catalog=catalog, dialect="sqlite", execute=execute, llm=llm)


SALES = "o.status IN ('completed', 'shipped')"
JOIN = "FROM orders o JOIN customers c ON c.id = o.customer_id"
TREND = "o.order_date >= {{trend_start}} AND o.order_date < {{end}} AND {{filter:segment:c.segment}}"
PERIOD = "o.order_date >= {{start}} AND o.order_date < {{end}} AND {{filter:segment:c.segment}}"


def _kpi(kpi_id, label, measure, where=SALES, fmt="number"):
    return {"id": kpi_id, "label": label, "question": label, "format": fmt,
            "sql": f"SELECT {{{{bucket:o.order_date}}}} AS period, {measure} AS value {JOIN} WHERE {where} AND {TREND} "
                   f"GROUP BY {{{{bucket:o.order_date}}}} ORDER BY period"}


def _panel(panel_id, chart, sql, x, y, **extra):
    return {"id": panel_id, "title": panel_id.replace("-", " ").title(), "question": panel_id, "chart": chart, "x": x, "y": y, "sql": sql, **extra}


def _plan(bad=False):
    panels = [
        _panel("revenue-trend", "area", f"SELECT {{{{bucket:o.order_date}}}} AS period, SUM(o.total_amount) AS revenue {JOIN} WHERE {SALES} AND {TREND} GROUP BY {{{{bucket:o.order_date}}}} ORDER BY period", "period", "revenue", span=2),
        _panel("status-share", "donut", f"SELECT o.status, COUNT(*) AS orders {JOIN} WHERE {PERIOD} GROUP BY o.status", "status", "orders"),
        _panel("top-customers", "bar_h", f"SELECT c.company, SUM(o.total_amount) AS revenue {JOIN} WHERE {SALES} AND {PERIOD} GROUP BY c.company ORDER BY revenue DESC LIMIT 10", "company", "revenue"),
        _panel("by-segment", "bar", f"SELECT c.segment, SUM(o.total_amount) AS revenue {JOIN} WHERE {SALES} AND {PERIOD} GROUP BY c.segment", "segment", "revenue", filter_id="segment"),
        _panel("status-mix", "stacked_bar", f"SELECT {{{{bucket:o.order_date}}}} AS period, o.status, COUNT(*) AS orders {JOIN} WHERE {TREND} GROUP BY {{{{bucket:o.order_date}}}}, o.status ORDER BY period", "period", "orders", series="status"),
        _panel("weekday-heat", "heatmap", f"SELECT strftime('%w', o.order_date) AS weekday, c.segment, COUNT(*) AS orders {JOIN} WHERE {TREND} GROUP BY 1, 2", "weekday", "orders", series="segment"),
        _panel("segment-flow", "sankey", f"SELECT c.segment AS source, o.status AS target, COUNT(*) AS orders {JOIN} WHERE {TREND} GROUP BY c.segment, o.status", "source", "orders", series="target"),
        _panel("largest-orders", "table", f"SELECT o.id, c.company, o.order_date, o.total_amount {JOIN} WHERE {PERIOD} ORDER BY o.total_amount DESC LIMIT 20", "", ""),
    ]
    if bad:
        panels[1] = {**panels[1], "chart": "bar"}             # repeats a chart type
        panels[2] = {**panels[2], "x": "customer_name"}       # not a column of the result
    return {
        "title": "Weekly sales", "subtitle": "Sales, orders and deliveries", "grain": "week",
        "anchor_sql": "SELECT MIN(order_date), MAX(order_date) FROM orders",
        "filters": [{"id": "segment", "label": "Segment", "values_sql": "SELECT DISTINCT segment FROM customers WHERE segment IS NOT NULL ORDER BY 1"}],
        "kpis": [_kpi("revenue", "Revenue", "SUM(o.total_amount)", fmt="currency"), _kpi("orders", "Orders", "COUNT(*)", where="1=1"),
                 _kpi("average-order", "Average order", "AVG(o.total_amount)", fmt="currency"),
                 _kpi("refunds", "Refunded orders", "COUNT(*)", where="o.status = 'refunded'")],
        "panels": panels,
    }


def _call(call_id, name, **arguments):
    return {"id": call_id, "name": name, "arguments": json.dumps(arguments)}


def _script(monkeypatch, turns):
    """Replace the model with scripted turns; each turn is a list of tool calls (or a text reply)."""
    seen = []

    async def fake(ctx, messages, tools):
        seen.append(messages)
        turn = turns.pop(0)
        if isinstance(turn, str):
            return {"type": "completed", "content": turn, "tool_calls": [], "usage": {}}
        return {"type": "completed", "content": "", "tool_calls": turn, "usage": {"cost": 0.001}}

    monkeypatch.setattr(report_agent, "_call_model", fake)
    return seen


def _expected(sql_where, start, end, segment=None):
    con = sqlite3.connect(settings.SQLITE_DEMO_PATH)
    extra = f" AND c.segment = '{segment}'" if segment else ""
    return con.execute(f"SELECT COALESCE(SUM(o.total_amount), 0) {JOIN} WHERE {sql_where} AND o.order_date >= ? AND o.order_date < ?{extra}",
                       (start, end)).fetchone()[0]


@pytest.mark.asyncio
async def test_agent_explores_fixes_its_plan_and_reports_one_period(monkeypatch):
    seen = _script(monkeypatch, [
        [_call("a", "list_tables"), _call("b", "describe_table", table="orders"), _call("c", "profile_column", table="orders", column="status")],
        [_call("d", "run_sql", sql=_plan()["kpis"][0]["sql"], purpose="weekly revenue")],
        [_call("e", "submit_report", report=_plan(bad=True))],
        [_call("f", "submit_report", report=_plan())],
    ])
    ctx = await _context()
    events = [e async for e in report_agent.build("Weekly sales report", "", ctx, grain="week")]
    kinds = [e["type"] for e in events]
    assert kinds[0] == "stage" and "plan" in kinds and kinds[-1] == "report"
    labels = [e["label"] for e in events if e["type"] == "tool"]
    assert labels[0].startswith("Listed") and any(l.startswith("Profiled orders.status: 5 values") for l in labels)
    assert any("problems sent back" in l for l in labels) and any("accepted" in l for l in labels)
    # The server's problems went back to the model in plain words.
    problems = json.loads(seen[3][-1]["content"])["problems"]
    assert any("Chart types used more than once: bar" in p for p in problems)
    assert any("customer_name" in p for p in problems)

    report = events[-1]["report"]
    assert report["agent"]["framework"] == "LangGraph" and report["agent"]["submissions"] == 2
    assert len({p["chart"] for p in report["panels"]}) == 8
    period = report["period"]
    assert period["grain"] == "week" and date.fromisoformat(period["start"]).weekday() == 0
    assert report["filters"][0]["values"] == ["Consumer", "Enterprise", "Mid-Market", "SMB"]
    revenue = next(k for k in report["kpis"] if k["id"] == "revenue")
    assert revenue["value"] == pytest.approx(_expected(SALES, period["start"], period["end"]))
    assert revenue["comparison_label"] == period["prev_label"] and len(revenue["spark"]) >= 2
    # Stored SQL keeps its placeholders; the run used real dates.
    assert "{{start}}" in report["panels"][1]["sql"] and period["start"] in report["panels"][1]["sql_run"]

    # The same checked SQL answers the week before, for one segment, with no model.
    ctx2 = await _context(llm=False)
    earlier = await trusted_report.refresh(report, ctx2, offset=-1, filter_state={"segment": ["SMB", "not-a-segment"]})
    assert earlier["period"]["start"] == (date.fromisoformat(period["start"]) - timedelta(days=7)).isoformat()
    assert earlier["filter_state"] == {"segment": ["SMB"]}
    revenue = next(k for k in earlier["kpis"] if k["id"] == "revenue")
    assert revenue["value"] == pytest.approx(_expected(SALES, earlier["period"]["start"], earlier["period"]["end"], "SMB"))
    monthly = await trusted_report.refresh(report, ctx2, grain="month")
    assert monthly["period"]["grain"] == "month" and monthly["period"]["start"].endswith("-01")


@pytest.mark.asyncio
async def test_agent_asks_when_the_request_is_ambiguous(monkeypatch):
    _script(monkeypatch, [[_call("a", "ask_user", question="Which business area?", options=["Sales", "Deliveries"])]])
    events = [e async for e in report_agent.build("Report on performance", "", await _context())]
    assert events[-1] == {"type": "clarify", "question": "Which business area?", "options": ["Sales", "Deliveries"]}


@pytest.mark.asyncio
async def test_follow_up_changes_one_figure_and_keeps_the_rest(monkeypatch):
    _script(monkeypatch, [[_call("a", "submit_report", report=_plan())]])
    report = [e async for e in report_agent.build("Weekly sales", "", await _context(), grain="week")][-1]["report"]
    scatter = _panel("customer-value", "scatter", f"SELECT c.company, COUNT(*) AS orders, SUM(o.total_amount) AS revenue {JOIN} WHERE {SALES} AND {PERIOD} GROUP BY c.company",
                     "orders", "revenue", label="company")
    # The user is looking at the month before, monthly; an edit keeps that view.
    report = await trusted_report.refresh(report, await _context(llm=False), grain="month", offset=-1)
    _script(monkeypatch, [[_call("b", "edit_report", changes={"panels": [scatter], "remove": ["largest-orders"]}, reply="Added a scatter of customers.")]])
    events = [e async for e in report_agent.follow_up(report, "Show how order count relates to revenue per customer", await _context())]
    assert [e for e in events if e["type"] == "reply"][0]["text"] == "Added a scatter of customers."
    items = [e["item"]["id"] for e in events if e["type"] == "item"]
    assert items == ["customer-value"]  # only the new figure ran again
    edited = events[-1]["report"]
    assert edited["question"] == "Weekly sales"  # the request it was built for, not the follow-up
    assert [p["id"] for p in edited["panels"]][-1] == "customer-value" and "largest-orders" not in [p["id"] for p in edited["panels"]]
    assert edited["agent"]["history"][-2]["content"].startswith("Show how order count")
    assert edited["period"]["grain"] == "month" and edited["period"]["offset"] == -1


@pytest.mark.asyncio
async def test_without_a_model_the_catalog_plan_is_used():
    events = [e async for e in report_agent.build("How is revenue trending?", "", await _context(llm=False))]
    report = events[-1]["report"]
    assert report["meta"]["planner"] == "catalog" and report["kpis"]


# --- Editions -------------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_email_is_a_newspaper_edition_for_the_period(monkeypatch):
    _script(monkeypatch, [[_call("a", "submit_report", report=_plan())]])
    report = [e async for e in report_agent.build("Weekly sales", "", await _context(), grain="week")][-1]["report"]
    message = render_email(report, "https://slayql.example", cadence="weekly")
    assert message["subject"].startswith("Weekly sales · Weekly brief · ") and report["period"]["label"] in message["subject"]
    assert "The SlayQL Brief" in message["html"] and "Inside this edition" in message["html"]
    assert f"Covers {report['period']['label']}" in message["text"]


@pytest.mark.asyncio
async def test_schedule_preview_and_a_monthly_schedule(monkeypatch):
    from backend.app import main

    _script(monkeypatch, [[_call("a", "submit_report", report=_plan())]])
    report = [e async for e in report_agent.build("Weekly sales", "", await _context(), grain="week")][-1]["report"]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
        session = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()
        headers = {"Authorization": f"Bearer {session['token']}"}
        preview = await client.post("/api/v1/connections/sqlite_demo/reports/schedule-preview", headers=headers,
                                    json={"report": report, "cadence": "monthly", "day_of_month": 1, "hour": 8})
        assert preview.status_code == 200, preview.text
        body = preview.json()
        assert body["when"] == "Monthly on the 1st at 08:00 (Malaysia time)" and body["period"]["grain"] == "month"
        assert "Monthly edition" in body["html"]
        created = await client.post("/api/v1/report-schedules", headers=headers, json={
            "connection_id": "sqlite_demo", "report": report, "recipients": ["owner@example.com"],
            "cadence": "monthly", "day_of_month": 1, "hour": 8})
        assert created.status_code == 200, created.text
        assert created.json()["cadence"] == "monthly" and created.json()["next_run_at"].endswith("T00:00:00Z")
        assert (await client.delete(f"/api/v1/report-schedules/{created.json()['id']}", headers=headers)).status_code == 200
        questions = await client.get("/api/v1/connections/sqlite_demo/report-questions", headers=headers)
        assert questions.status_code == 200 and isinstance(questions.json(), list)


@pytest.mark.asyncio
async def test_report_history_lists_a_digest_and_deletes_in_bulk(monkeypatch):
    from backend.app import main

    _script(monkeypatch, [[_call("a", "submit_report", report=_plan())]])
    report = [e async for e in report_agent.build("Weekly sales", "", await _context(), grain="week")][-1]["report"]
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {(await client.post('/api/v1/auth/login', json={'is_reviewer': True})).json()['token']}"}
        stranger = (await client.post("/api/v1/auth/login", json={
            "email": "history.other@example.com", "name": "Other", "organization_name": "Other Co", "password": "another-pass-1"})).json()
        other = {"Authorization": f"Bearer {stranger['token']}"}
        ids = [(await client.post("/api/v1/connections/sqlite_demo/saved-reports", json={"report": report}, headers=headers)).json()["id"]
               for _ in range(3)]
        listed = (await client.get("/api/v1/connections/sqlite_demo/saved-reports", headers=headers)).json()
        entry = next(r for r in listed if r["id"] == ids[0])
        summary = entry["summary"]
        assert summary["grain"] == "week" and summary["period"] == report["period"]["label"] and summary["source"] == "agent"
        assert len(summary["charts"]) == 8 and summary["figures"] == 12
        assert summary["kpis"] and {k["label"] for k in summary["kpis"]} <= {"Revenue", "Orders", "Average order", "Refunded orders"}
        # Someone else cannot delete them; the owner deletes two at once.
        assert (await client.post("/api/v1/saved-reports/delete", json={"ids": ids}, headers=other)).json()["deleted"] == 0
        assert (await client.post("/api/v1/saved-reports/delete", json={"ids": ids[:2]}, headers=headers)).json()["deleted"] == 2
        left = {r["id"] for r in (await client.get("/api/v1/connections/sqlite_demo/saved-reports", headers=headers)).json()}
        assert ids[2] in left and not {ids[0], ids[1]} & left


def test_calendar_parts_are_answerable_from_dates_but_missing_subjects_are_not():
    from backend.app.verification import checks

    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)
    assert checks.check_answer_subject("Which weekdays have the most support cases?", catalog) == []
    assert checks.check_answer_subject("Which month had the highest revenue?", catalog) == []
    assert checks.check_answer_subject("Which products drove sales in the period?", catalog) == []
    flagged = checks.check_answer_subject("Which salesperson closed the most deals?", catalog)
    assert flagged and flagged[0].severity == "blocking"


def test_chart_rules_reject_charts_that_do_not_fit_their_data():
    from backend.app.workbench import chart_rules

    def check(chart, columns, rows, **extra):
        return chart_rules.problem({"chart": chart, "x": columns[0], "y": columns[1], **extra}, columns, rows)

    six = [[f"c{i}", 10 - i] for i in range(6)]
    assert "at most 5" in check("donut", ["c", "v"], six)
    assert check("donut", ["c", "v"], [["a", 70], ["b", 20], ["c", 10]]) is None
    assert "shrink" in check("funnel", ["s", "n"], [["a", 5], ["b", 9], ["c", 1]])
    assert check("funnel", ["s", "n"], [["a", 9], ["b", 5], ["c", 1]]) is None
    assert "at least 4 periods" in check("area", ["p", "v"], [["2026-01-01", 1], ["2026-02-01", 2]])
    assert "at least 15 points" in check("scatter", ["a", "b"], [[1, 2]] * 5, label="name")
    assert "itself" in check("sankey", ["s", "v", "t"], [["a", 1, "a"], ["a", 2, "b"], ["b", 3, "c"]], series="t")
    assert "target" in check("bullet", ["r", "v"], [["north", 5]])
    assert "6 columns" in chart_rules.problem({"chart": "table"}, list("abcdefg"), [[1] * 7])


@pytest.mark.asyncio
async def test_a_detail_table_hides_an_unfilled_column_instead_of_failing():
    ctx = await _context(llm=False)
    table = {"id": "open-cases", "title": "Open cases", "question": "Which support cases are still open?", "chart": "table",
             "sql": "SELECT id, subject, priority, resolution_time_hours FROM support_cases WHERE resolution_time_hours IS NULL LIMIT 20"}
    checked = await trusted_report.run_item(table, "panel", ctx, repair=False)
    assert checked["hidden_columns"] == ["resolution_time_hours"]
    assert "resolution_time_hours" not in checked["columns"]
    assert not any(f["title"].startswith("Column resolution_time_hours is empty") for f in checked["findings"])
