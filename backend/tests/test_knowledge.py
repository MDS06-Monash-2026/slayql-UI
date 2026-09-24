"""Review queue, approved definitions, verified queries and clarification choices."""
import json

import httpx
import pytest

from backend.app.agent.pipeline import RUN_METADATA_STORE, SlayQLPipeline
from backend.app.knowledge.store import knowledge_store, question_key
from backend.app.main import app


async def _reviewer(client):
    session = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()
    return {"Authorization": f"Bearer {session['token']}"}


def _completed(stream_text):
    block = next(b for b in stream_text.split("\n\n") if "event: run.completed\n" in b)
    return json.loads(block.split("data: ", 1)[1])["payload"]


@pytest.mark.asyncio
async def test_reviewer_can_approve_a_definition_and_it_retires_the_previous_version():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        headers = await _reviewer(client)
        body = {"term": "revenue", "table_name": "orders", "column_name": "status", "filter_sql": "status = 'completed'", "approve": True, "synonyms": ["jualan"]}
        first = await client.post("/api/v1/connections/sqlite_demo/definitions", json=body, headers=headers)
        assert first.status_code == 200, first.text
        second = await client.post("/api/v1/connections/sqlite_demo/definitions", json={**body, "filter_sql": "status IN ('completed', 'shipped')"}, headers=headers)
        assert second.json()["version"] == first.json()["version"] + 1

        approved = (await client.get("/api/v1/connections/sqlite_demo/definitions?status=approved")).json()
        revenue = [d for d in approved if d["term"] == "revenue"]
        assert len(revenue) == 1
        assert revenue[0]["filter_sql"] == "status IN ('completed', 'shipped')"
        assert revenue[0]["synonyms"] == ["jualan"]


@pytest.mark.asyncio
async def test_approving_requires_an_admin_and_rejects_invalid_filters():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        denied = await client.post("/api/v1/connections/sqlite_demo/definitions", json={"term": "margin", "table_name": "orders", "approve": True})
        assert denied.status_code in {401, 403}
        headers = await _reviewer(client)
        invalid = await client.post(
            "/api/v1/connections/sqlite_demo/definitions",
            json={"term": "margin", "table_name": "orders", "filter_sql": "no_such_column = 1"},
            headers=headers,
        )
        assert invalid.status_code == 400


@pytest.mark.asyncio
async def test_flagged_answer_reaches_the_review_queue_and_can_become_a_verified_query():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        headers = await _reviewer(client)
        stream = await client.post(
            "/api/v1/agent-runs/stream",
            json={"question": "List customers for review", "connection_id": "sqlite_demo", "thinking_effort": "minimal"},
            headers=headers,
        )
        run_id = _completed(stream.text) and next(
            json.loads(b.split("data: ", 1)[1])["run_id"] for b in stream.text.split("\n\n") if "event: run.completed\n" in b
        )
        await SlayQLPipeline.await_run_persistence(run_id)
        flagged = await client.post(
            "/api/v1/chat-reports",
            json={"message_id": f"msg_{run_id}", "category": "incorrect_answer", "note": "wrong customers"},
            headers=headers,
        )
        assert flagged.status_code == 200, flagged.text

        items = (await client.get("/api/v1/review-items", headers=headers)).json()
        item = next(i for i in items if i["run_id"] == run_id)
        assert item["source"] == "flag"
        assert item["question"] == "List customers for review"

        resolved = await client.post(
            f"/api/v1/review-items/{item['id']}/resolve",
            json={"resolution": "corrected", "corrected_sql": "SELECT full_name FROM customers", "save_verified_query": True},
            headers=headers,
        )
        assert resolved.status_code == 200, resolved.text
        assert resolved.json()["item"]["status"] == "resolved"
        assert resolved.json()["verified_query"]["question_key"] == question_key("List customers for review")


@pytest.mark.asyncio
async def test_verified_query_answers_its_question_directly():
    knowledge_store.add_verified_query(
        connection_id="sqlite_demo",
        question="How many completed orders are there?",
        sql="SELECT COUNT(*) AS completed_orders FROM orders WHERE status = 'completed'",
        approved_by="analyst@example.com",
    )
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        stream = await client.post(
            "/api/v1/agent-runs/stream",
            json={"question": "how many completed orders are there", "connection_id": "sqlite_demo", "thinking_effort": "medium"},
        )
        payload = _completed(stream.text)
        assert payload["rows"] == [[134]]
        assert payload["verification"]["outcome"] == "confident"
        assert payload["verification"]["verified_query"]["approved_by"] == "analyst@example.com"


@pytest.mark.asyncio
async def test_clarify_runs_only_server_offered_options():
    run = SlayQLPipeline.create_run("What is our total revenue?", connection_id="sqlite_demo")
    RUN_METADATA_STORE[run["run_id"]]["result"] = {"verification": {"clarify_options": [
        {"label": "Exclude cancelled", "sql": "SELECT SUM(total_amount) FROM orders WHERE status <> 'cancelled'", "preview": ""},
    ]}}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        chosen = await client.post(f"/api/v1/agent-runs/{run['run_id']}/clarify", json={"option_index": 0})
        assert chosen.status_code == 200, chosen.text
        assert chosen.json()["label"] == "Exclude cancelled"
        assert chosen.json()["row_count"] == 1
        missing = await client.post(f"/api/v1/agent-runs/{run['run_id']}/clarify", json={"option_index": 3})
        assert missing.status_code == 404
