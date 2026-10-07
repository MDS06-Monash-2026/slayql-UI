"""Ready-made report packs: checked figures with no AI calls."""
from pathlib import Path

import pytest

from backend.app.catalog.discovery import CatalogService
from backend.app.queries.executor import QueryExecutor
from backend.app.workbench import trusted_report
from backend.app.workbench.report_packs import available_templates, build_template

REPO = Path(__file__).resolve().parents[2]
AUTOCOUNT = REPO / "public" / "autocount-sample.db"
DEMO = REPO / "backend" / "data" / "slayql_demo.sqlite3"


def _context(db: Path):
    catalog = CatalogService.get_sqlite_catalog(str(db))

    async def execute(sql):
        return await QueryExecutor.execute_sqlite(str(db), sql, 10.0, 1000)

    return trusted_report.ReportContext(connection_id="pack-test", catalog=catalog, dialect="sqlite", execute=execute, llm=False)


@pytest.mark.asyncio
async def test_the_weekly_distributor_pack_passes_every_check_on_the_autocount_sample():
    ctx = _context(AUTOCOUNT)
    assert [t["id"] for t in available_templates(ctx.catalog, "sqlite")] == ["distributor-weekly"]
    report = await trusted_report.refresh(build_template("distributor-weekly", ctx.catalog, "sqlite"), ctx)
    assert report["trust"] == {"confident": 10, "caveat": 0, "clarify": 0, "handoff": 0}
    assert report["meta"]["ai_calls"] == 0
    sales = next(k for k in report["kpis"] if k["id"] == "sales-week")
    assert sales["value"] > 0 and sales["previous"] > 0
    # Nothing unsold in 90 days is a checked "none", not a failure.
    slow = next(p for p in report["panels"] if p["id"] == "slow-items")
    assert slow["row_count"] == 0 and slow["outcome"] == "confident"


def test_the_pack_speaks_each_dialect_and_needs_autocount_tables():
    catalog = CatalogService.get_sqlite_catalog(str(AUTOCOUNT))
    tsql = build_template("distributor-weekly", catalog, "tsql")
    sql = " ".join(item["sql"] for item in tsql["kpis"] + tsql["panels"])
    assert "DATEADD(day, -7, a.d)" in sql and "SELECT TOP 10" in sql and "LIMIT" not in sql
    postgres = build_template("distributor-weekly", catalog, "postgres")
    assert "to_char(" in " ".join(p["sql"] for p in postgres["panels"])
    demo = CatalogService.get_sqlite_catalog(str(DEMO))
    assert available_templates(demo, "sqlite") == [] and build_template("distributor-weekly", demo, "sqlite") is None


def test_schedules_run_weekly_in_malaysia_time_and_are_claimed_once():
    from datetime import datetime, timezone
    from backend.app.workbench.schedules import next_run, schedule_store

    # Wednesday 30 Sep 2026, 10:00 in Malaysia (02:00 UTC): the next Monday 08:00 is 5 Oct, 00:00 UTC.
    now = datetime(2026, 9, 30, 2, 0, tzinfo=timezone.utc)
    assert next_run(0, 8, now) == datetime(2026, 10, 5, 0, 0, tzinfo=timezone.utc)
    # Wednesday 08:00 Malaysia time has already passed at 10:00 that day: next week.
    assert next_run(2, 8, now) == datetime(2026, 10, 7, 0, 0, tzinfo=timezone.utc)

    schedule = schedule_store.create(owner_id="user_sched", connection_id="sqlite_demo", report={"title": "T", "kpis": []},
                                     recipients=["a@example.com"], weekday=0, hour=8)
    # The schedule's first run depends on today's date; claim it one minute after it falls due.
    from datetime import timedelta
    first_run = datetime.fromisoformat(schedule["next_run_at"].replace("Z", "+00:00"))
    due_time = first_run + timedelta(minutes=1)
    claimed = [s for s in schedule_store.claim_due(due_time) if s["id"] == schedule["id"]]
    expected_next = (first_run + timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    assert len(claimed) == 1 and claimed[0]["next_run_at"] == expected_next
    assert not [s for s in schedule_store.claim_due(due_time) if s["id"] == schedule["id"]]
    assert schedule_store.delete(schedule["id"], "user_sched")


@pytest.mark.asyncio
async def test_scheduling_needs_an_analyst_and_sending_refreshes_the_report(monkeypatch):
    import httpx
    from backend.app import main

    sent = []
    monkeypatch.setattr(main, "email_configured", lambda: True)
    monkeypatch.setattr(main, "send_email", lambda to, subject, text, html: sent.append((to, subject, text)))
    report = {"title": "Customer count", "kpis": [
        {"id": "customers", "label": "Customers", "question": "How many customers are there?", "sql": "SELECT COUNT(*) AS value FROM customers"}]}
    body = {"connection_id": "sqlite_demo", "report": report, "recipients": ["owner@example.com"], "weekday": 0, "hour": 8}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
        assert (await client.post("/api/v1/report-schedules", json=body)).status_code in {401, 403}
        session = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()
        headers = {"Authorization": f"Bearer {session['token']}"}
        bad = await client.post("/api/v1/report-schedules", json={**body, "recipients": ["not-an-email"]}, headers=headers)
        assert bad.status_code == 400
        created = await client.post("/api/v1/report-schedules", json=body, headers=headers)
        assert created.status_code == 200, created.text
        schedule = created.json()
        assert schedule["when"] == "Every Monday at 08:00 (Malaysia time)"
        result = await client.post(f"/api/v1/report-schedules/{schedule['id']}/send", headers=headers)
        assert result.status_code == 200, result.text
        assert result.json()["status"].startswith("Sent to 1 recipient(s); 1 of 1 figures passed")
        assert sent[0][0] == "owner@example.com" and sent[0][1].startswith("Customer count · ")
        assert "Customers:" in sent[0][2] and "passed SlayQL's checks" in sent[0][2]
        listed = (await client.get("/api/v1/report-schedules", headers=headers)).json()
        assert any(s["id"] == schedule["id"] and s["last_status"].startswith("Sent") for s in listed)
        assert (await client.delete(f"/api/v1/report-schedules/{schedule['id']}", headers=headers)).status_code == 200
        # The demo database is not AutoCount, so it has no distributor pack.
        assert (await client.get("/api/v1/connections/sqlite_demo/report-templates", headers=headers)).json() == []


@pytest.mark.asyncio
async def test_saved_reports_live_on_the_server_and_only_their_owner_sees_them():
    import httpx
    from backend.app import main

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=main.app), base_url="http://test") as client:
        assert (await client.get("/api/v1/connections/sqlite_demo/saved-reports")).status_code == 401
        owner = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()
        headers = {"Authorization": f"Bearer {owner['token']}"}
        report = {"title": "Monthly revenue", "question": "How is revenue trending?", "kpis": [{"id": "k", "value": 1}], "panels": []}
        created = (await client.post("/api/v1/connections/sqlite_demo/saved-reports", json={"report": report}, headers=headers)).json()
        assert created["id"].startswith("rpt_") and created["title"] == "Monthly revenue"
        # Saving again with the id updates the same report.
        updated = (await client.post("/api/v1/connections/sqlite_demo/saved-reports",
                                     json={"id": created["id"], "report": {**report, "title": "Revenue v2"}}, headers=headers)).json()
        assert updated["id"] == created["id"]
        listed = (await client.get("/api/v1/connections/sqlite_demo/saved-reports", headers=headers)).json()
        assert [r["title"] for r in listed if r["id"] == created["id"]] == ["Revenue v2"]
        full = (await client.get(f"/api/v1/saved-reports/{created['id']}", headers=headers)).json()
        assert full["report"]["kpis"][0]["value"] == 1

        other = (await client.post("/api/v1/auth/login", json={
            "email": "saved.other@example.com", "name": "Other", "organization_name": "Other Co", "password": "another-pass-1",
        })).json()
        other_headers = {"Authorization": f"Bearer {other['token']}"}
        assert (await client.get(f"/api/v1/saved-reports/{created['id']}", headers=other_headers)).status_code == 404
        assert not [r for r in (await client.get("/api/v1/connections/sqlite_demo/saved-reports", headers=other_headers)).json()
                    if r["id"] == created["id"]]
        assert (await client.delete(f"/api/v1/saved-reports/{created['id']}", headers=other_headers)).status_code == 404
        assert (await client.delete(f"/api/v1/saved-reports/{created['id']}", headers=headers)).status_code == 200
