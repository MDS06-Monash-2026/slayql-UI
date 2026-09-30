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


CLEAN = {"agreement": 1.0, "single_candidate": 0.0, "unresolved_blocking": 0.0, "ambiguity": 0.0,
         "warnings": 0.0, "repairs": 0.0, "empty_result": 0.0, "semantic_invalid": 0.0}


def test_learning_stays_at_the_prior_without_evidence_and_moves_with_it():
    from backend.app.verification import confidence
    from backend.app.verification.learning import fit_with_prior

    prior = confidence.DEFAULT_MODEL
    unchanged = fit_with_prior([], [], prior)
    assert unchanged["weights"] == prior["weights"]
    # On this data source, clean-looking answers are often wrong.
    rows, labels = [CLEAN] * 40, [1] * 20 + [0] * 20
    learned = fit_with_prior(rows, labels, prior)
    assert confidence.probability(CLEAN, learned) < confidence.probability(CLEAN, prior) - 0.15


@pytest.mark.asyncio
async def test_review_decisions_recalibrate_that_data_source_only():
    from backend.app.verification.learning import MIN_LABELS, workspace_learning

    connection_id = "learning_test_source"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        headers = await _reviewer(client)
        before = (await client.get(f"/api/v1/connections/{connection_id}/calibration", headers=headers)).json()
        assert before["active"] is False and before["needed"] == MIN_LABELS

        # An analyst reviews answers that looked clean: half were right, half wrong.
        last = None
        for index in range(MIN_LABELS + 4):
            item = knowledge_store.create_review_item(
                source="flag", question=f"q{index}", sql="SELECT 1", connection_id=connection_id,
                outcome="confident", verification={"features": CLEAN, "outcome": "confident"},
            )
            last = await client.post(
                f"/api/v1/review-items/{item['id']}/resolve",
                json={"resolution": "confirmed" if index % 2 else "corrected"},
                headers=headers,
            )
            assert last.status_code == 200, last.text
        status = last.json()["calibration"]
        assert status["active"] is True
        assert status["labels"] == MIN_LABELS + 4
        assert status["reviewed_answers"] == {"n": MIN_LABELS + 4, "wrong": (MIN_LABELS + 4) // 2}
        assert status["clean_answer_confidence"] < status["clean_answer_confidence_default"]
        assert workspace_learning.model_for(connection_id)["source"].startswith("learned")
        assert not workspace_learning.model_for("sqlite_demo").get("source", "").startswith("learned")


@pytest.mark.asyncio
async def test_suggestions_show_each_meaning_with_its_number_and_need_an_analyst():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        denied = await client.get("/api/v1/connections/sqlite_demo/definitions/suggestions")
        assert denied.status_code in {401, 403}
        headers = await _reviewer(client)
        response = await client.get("/api/v1/connections/sqlite_demo/definitions/suggestions", headers=headers)
        assert response.status_code == 200, response.text
        for suggestion in response.json():
            assert len({option["value"] for option in suggestion["options"]}) == len(suggestion["options"])
            recommended = suggestion["options"][suggestion["recommended"]]["definition"]
            assert recommended["term"] == suggestion["term"] and recommended["table_name"] == suggestion["table"]
        missing = await client.get("/api/v1/connections/no_such_connection/definitions/suggestions", headers=headers)
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_a_clarify_choice_can_become_the_company_definition():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        session = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()
        headers = {"Authorization": f"Bearer {session['token']}"}
        owner = session["user"]["id"]
        run = SlayQLPipeline.create_run("What is our turnover?", connection_id="sqlite_demo", owner_id=owner)
        definition = {"term": "turnover", "synonyms": ["sales"], "table_name": "orders", "column_name": "status",
                      "filter_sql": "status <> 'cancelled'", "description": "Leaves out cancelled orders."}
        RUN_METADATA_STORE[run["run_id"]]["result"] = {"verification": {"clarify_options": [
            {"label": "As calculated (all records)", "sql": "SELECT SUM(total_amount) FROM orders", "preview": ""},
            {"label": "Exclude cancelled orders", "sql": "SELECT 1", "preview": "", "definition": definition},
        ]}}
        # Only options that stand for a definition can be saved, and only by an analyst.
        assert (await client.post(f"/api/v1/agent-runs/{run['run_id']}/clarify/0/definition", headers=headers)).status_code == 404
        assert (await client.post(f"/api/v1/agent-runs/{run['run_id']}/clarify/1/definition")).status_code in {401, 403}
        saved = await client.post(f"/api/v1/agent-runs/{run['run_id']}/clarify/1/definition", headers=headers)
        assert saved.status_code == 200, saved.text
        assert saved.json()["status"] == "approved" and saved.json()["filter_sql"] == "status <> 'cancelled'"
        approved = (await client.get("/api/v1/connections/sqlite_demo/definitions?status=approved")).json()
        assert any(d["term"] == "turnover" for d in approved)


@pytest.mark.asyncio
async def test_definitions_of_someone_elses_connection_are_not_visible():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/connections/conn_not_yours/definitions")
        assert response.status_code == 404


@pytest.mark.asyncio
async def test_the_asker_sees_the_analysts_answer_and_others_do_not():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        session = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()
        headers = {"Authorization": f"Bearer {session['token']}"}
        item = knowledge_store.create_review_item(
            source="handoff", question="How many customers do we have?", sql="SELECT COUNT(*) FROM customers",
            owner_id=session["user"]["id"], connection_id="sqlite_demo", outcome="handoff",
        )
        resolved = await client.post(f"/api/v1/review-items/{item['id']}/resolve",
                                     json={"resolution": "confirmed", "note": "Checked against the CRM."}, headers=headers)
        assert resolved.status_code == 200, resolved.text

        answers = (await client.get("/api/v1/my-answers", headers=headers)).json()
        mine = next(a for a in answers if a["id"] == item["id"])
        assert mine["resolution"] == "confirmed" and mine["has_answer"] and mine["note"] == "Checked against the CRM."
        result = await client.get(f"/api/v1/my-answers/{item['id']}/result", headers=headers)
        assert result.status_code == 200 and result.json()["row_count"] == 1

        assert (await client.get("/api/v1/my-answers")).status_code == 401
        other = (await client.post("/api/v1/auth/login", json={
            "email": "someone.else@example.com", "name": "Someone", "organization_name": "Other Co", "password": "another-pass-1",
        })).json()
        denied = await client.get(f"/api/v1/my-answers/{item['id']}/result", headers={"Authorization": f"Bearer {other['token']}"})
        assert denied.status_code == 404


def test_answer_emails_say_what_the_analyst_decided_and_are_off_by_default(monkeypatch):
    from backend.app.config import settings
    from backend.app.notifications import answers
    from backend.app.verification.models import ExecutionResult

    result = ExecutionResult(columns=["count"], column_types=["INTEGER"], rows=[[60]], row_count=1, execution_time_ms=1)
    item = {"id": "rev_x", "question": "How many customers do we have?", "resolution": "corrected",
            "resolution_note": "Excludes test accounts.", "reviewed_by": "aisha@example.com", "owner_id": "user_1"}
    message = answers.compose(item, result, "Kian")
    assert message["subject"].startswith("Answered: How many customers")
    assert "corrected the answer" in message["text"] and "Answer: 60" in message["text"]
    assert "Excludes test accounts." in message["html"] and "Hi Kian," in message["text"]
    dismissed = answers.compose({**item, "resolution": "dismissed", "resolution_note": ""}, None)
    assert "cannot be answered from this data" in dismissed["text"] and "Answer:" not in dismissed["text"]

    sent = []
    monkeypatch.setattr(answers, "send_email", lambda *args: sent.append(args))
    monkeypatch.setattr(answers, "email_configured", lambda: True)
    monkeypatch.setattr(answers.account_store, "get", lambda user_id: {"email": "kian@example.com", "name": "Kian Lok"})
    assert answers.notify_asker(item, result) is False  # off unless EMAIL_NOTIFICATIONS is set
    monkeypatch.setattr(settings, "EMAIL_NOTIFICATIONS", True)
    monkeypatch.setattr(answers.account_store, "get", lambda user_id: {"email": "reviewer@slayql.demo"})
    assert answers.notify_asker(item, result) is False  # demo accounts have no inbox
    assert sent == []
