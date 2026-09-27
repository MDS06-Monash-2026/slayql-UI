"""Trusted reports: checked figures, computed findings and a grounded narrative."""
import json

import httpx
import pytest

from backend.app.catalog.discovery import CatalogService
from backend.app.config import settings
from backend.app.main import app
from backend.app.queries.executor import QueryExecutor
from backend.app.workbench import insights, trusted_report


async def _context():
    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)

    async def execute(sql):
        return await QueryExecutor.execute_sqlite(settings.SQLITE_DEMO_PATH, sql)

    return await trusted_report.make_context(
        connection_id="sqlite_demo", catalog=catalog, dialect="sqlite", execute=execute, llm=False
    )


async def _report(question="How is revenue trending?"):
    ctx = await _context()
    events = [event async for event in trusted_report.generate(question, "", ctx)]
    return events, events[-1]["report"]


@pytest.mark.asyncio
async def test_catalog_plan_reports_checked_figures_on_the_full_data():
    events, report = await _report()
    assert [e["type"] for e in events][:3] == ["stage", "plan", "stage"]
    assert report["meta"]["planner"] == "catalog"
    total = next(k for k in report["kpis"] if k["id"] == "total")
    # The whole table, filtered to completed orders: not a 200-row preview, not an average.
    assert total["value"] == pytest.approx(2159970.05)
    assert total["outcome"] == "confident"
    assert all(item["outcome"] in {"confident", "caveat"} for item in report["kpis"] + report["panels"])
    assert report["facts"] and report["narrative"]["source"] == "computed"


@pytest.mark.asyncio
async def test_an_ambiguous_figure_asks_instead_of_reporting_a_number():
    ctx = await _context()
    ctx.definitions = []  # no approved definition of revenue yet
    item = {"id": "revenue", "label": "Total revenue", "question": "What is our total revenue?", "format": "currency",
            "sql": "SELECT SUM(total_amount) AS value FROM orders"}
    checked = await trusted_report.run_item(item, "kpi", ctx, repair=False)
    assert checked["outcome"] == "clarify"
    assert any("cancelled" in option["label"] for option in checked["options"])
    facts = trusted_report.collect_facts([checked], [])
    # No number is stated as fact for a figure that needs a definition.
    assert [f["kind"] for f in facts] == ["needs_definition"]

    # Once revenue has an approved definition, a query that ignores it is not reported.
    ctx.definitions = [{"id": "def_1", "term": "revenue", "synonyms": [], "table": "orders", "column": "status",
                        "filter_sql": "status = 'completed'", "version": 1}]
    checked = await trusted_report.run_item(item, "kpi", ctx, repair=False)
    assert checked["outcome"] == "handoff"
    assert any(f["check"] == "definition" for f in checked["findings"])


@pytest.mark.asyncio
async def test_a_fan_out_panel_is_not_shown_as_fact():
    ctx = await _context()
    panel = {"id": "inflated", "title": "Revenue by carrier", "question": "Revenue from completed orders by carrier",
             "chart": "bar_h", "x": "carrier", "y": "revenue", "span": 1,
             "sql": "SELECT s.carrier, SUM(o.total_amount) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.id "
                    "JOIN shipments s ON s.order_id = o.id WHERE o.status = 'completed' GROUP BY s.carrier"}
    checked = await trusted_report.run_item(panel, "panel", ctx, repair=False)
    assert checked["outcome"] == "handoff"
    assert any(f["check"] == "grain" for f in checked["findings"])


def test_narrative_sentences_with_numbers_not_in_the_facts_are_removed():
    facts = [
        {"id": "a.latest", "item_id": "a", "kind": "latest", "importance": 0.8, "values": {},
         "text": "Revenue by month: fell 36.9% from 2026-05 to 2026-06 (143.4K to 90.4K)."},
        {"id": "b.leader", "item_id": "b", "kind": "leader", "importance": 0.6, "values": {},
         "text": "Revenue by segment: Enterprise leads with 724.6K, 33.5% of the total shown."},
    ]
    candidate = {
        "headline": "Revenue fell 36.9% last month.",
        "findings": [
            {"text": "Enterprise leads with 724.6K (33.5%).", "fact_ids": ["b.leader"]},
            {"text": "Revenue will recover by 12% next quarter.", "fact_ids": ["a.latest"]},
            {"text": "Revenue fell 36.9%, to 90.4K.", "fact_ids": ["b.leader"]},
            {"text": "Revenue fell 36.9%, driven by Enterprise.", "fact_ids": ["a.latest"]},
        ],
        "next_steps": ["Review the Enterprise accounts."],
    }
    grounded = trusted_report.ground_narrative(candidate, facts)
    assert grounded["headline"] == "Revenue fell 36.9% last month."
    assert [f["text"] for f in grounded["findings"]] == ["Enterprise leads with 724.6K (33.5%)."]
    assert grounded["removed_sentences"] == 3


def test_findings_flag_incomplete_periods_instead_of_a_collapse():
    panel = {"id": "trend", "title": "Revenue by month", "chart": "line", "x": "period", "y": "revenue"}
    rows = [["2026-01", 100.0], ["2026-02", 110.0], ["2026-03", 105.0], ["2026-04", 20.0]]
    facts, hints = insights.panel_facts(panel, ["period", "revenue"], rows)
    assert hints["partial"] == "2026-04"
    assert facts[0]["kind"] == "partial" and "may be incomplete" in facts[0]["text"]
    ranking = {"id": "seg", "title": "Revenue by segment", "chart": "bar_h", "x": "segment", "y": "revenue"}
    facts, hints = insights.panel_facts(ranking, ["segment", "revenue"], [["A", 60.0], ["B", 30.0], ["C", 10.0]])
    assert hints["highlight"] == "A"
    assert any("60.0% of the total" in f["text"] for f in facts)


@pytest.mark.asyncio
async def test_report_api_streams_events_and_refreshes_without_ai():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        session = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()
        headers = {"Authorization": f"Bearer {session['token']}"}
        response = await client.post("/api/v1/connections/sqlite_demo/reports", json={"question": "Revenue overview"}, headers=headers)
        assert response.status_code == 200
        events = [json.loads(line) for line in response.text.splitlines() if line.strip()]
        report = events[-1]["report"]
        assert events[-1]["type"] == "report" and report["kpis"]

        refreshed = await client.post("/api/v1/connections/sqlite_demo/reports/refresh", json={"report": report}, headers=headers)
        assert refreshed.status_code == 200, refreshed.text
        body = refreshed.json()
        assert body["meta"]["refreshed"] is True and body["meta"]["ai_calls"] == 0
        assert [k["value"] for k in body["kpis"]] == [k["value"] for k in report["kpis"]]
