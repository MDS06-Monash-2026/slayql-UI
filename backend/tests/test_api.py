import asyncio
import json
import threading

import pytest
import httpx
from backend.app.providers.llm_client import ALTERNATE_MODEL, CURATED_MODELS, DEEP_MODEL, DEFAULT_MODEL
from backend.app.main import ACTIVE_SESSIONS, app

@pytest.mark.asyncio
async def test_api_health():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["sqlite_demo_ready"] is True

@pytest.mark.asyncio
async def test_api_auth_and_session():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Organization email sign-in
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": "alex.chen@stripe.com",
            "password": "correct horse 1",
            "role": "Data Architect"
        })
        assert login_resp.status_code == 200
        session = login_resp.json()
        assert "token" in session
        assert session["user"]["email"] == "alex.chen@stripe.com"
        assert "Stripe" in session["organization"]["name"]
        
        token = session["token"]
        
        # 2. Session verification
        sess_resp = await client.get("/api/v1/session", headers={"Authorization": f"Bearer {token}"})
        assert sess_resp.status_code == 200
        sess_data = sess_resp.json()
        assert sess_data["user"]["name"] == session["user"]["name"]

        ACTIVE_SESSIONS.pop(token)
        persisted_resp = await client.get("/api/v1/session", headers={"Authorization": f"Bearer {token}"})
        assert persisted_resp.json()["user"]["email"] == "alex.chen@stripe.com"
        
        # 3. 1-Click Reviewer demo login
        rev_resp = await client.post("/api/v1/auth/login", json={"is_reviewer": True})
        assert rev_resp.status_code == 200
        rev_data = rev_resp.json()
        assert rev_data["user"]["name"] == "Enterprise Reviewer"

        assert (await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {token}"})).status_code == 200
        assert (await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {rev_data['token']}"})).status_code == 200

@pytest.mark.asyncio
async def test_api_models():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/models")
        assert resp.status_code == 200
        models = resp.json()
        assert [m["id"] for m in models] == [m.id for m in CURATED_MODELS] and models[0]["id"] == DEFAULT_MODEL

@pytest.mark.asyncio
async def test_api_connections_and_catalog():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/connections")
        assert resp.status_code == 200
        conns = resp.json()
        ids = [c["id"] for c in conns]
        assert "sqlite_demo" in ids
        # The PostgreSQL demo is listed only when it is configured.
        from backend.app.config import settings
        assert ("postgres_demo" in ids) == bool(settings.DEMO_POSTGRES_URL)
        
        cat_resp = await client.get("/api/v1/connections/sqlite_demo/catalog")
        assert cat_resp.status_code == 200
        catalog = cat_resp.json()
        assert "tables" in catalog
        assert "customers" in catalog["tables"]


@pytest.mark.asyncio
async def test_workbench_query_chart_catalog_and_local_health_agent(monkeypatch):
    from backend.app.config import settings

    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        idiom_resp = await client.get("/api/v1/workbench/chart-idioms")
        assert idiom_resp.status_code == 200
        idioms = idiom_resp.json()
        assert idioms["count"] >= 50
        assert any(item["id"] == "bump" for item in idioms["idioms"])

        suggestions_resp = await client.get("/api/v1/connections/sqlite_demo/explore-suggestions")
        assert suggestions_resp.status_code == 200
        suggestions = suggestions_resp.json()
        assert suggestions["mode"] == "local_fallback"
        assert 3 <= len(suggestions["suggestions"]) <= 4
        assert all(item["label"] and item["prompt"] for item in suggestions["suggestions"])

        query_resp = await client.post("/api/v1/connections/sqlite_demo/workbench/query", json={
            "sql": "SELECT c.segment, COUNT(o.id) AS order_count FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.segment"
        })
        assert query_resp.status_code == 200
        result = query_resp.json()["result"]
        assert result["row_count"] > 0
        assert result["columns"] == ["segment", "order_count"]

        visual_resp = await client.post("/api/v1/connections/sqlite_demo/workbench/ai/visualization", json={
            "question": "Compare orders by customer segment",
            "result": {"columns": result["columns"], "column_types": result["column_types"], "rows": result["rows"]},
        })
        assert visual_resp.status_code == 200
        assert visual_resp.json()["model"] == "gemini-3.5-flash-lite"
        assert visual_resp.json()["mode"] == "local_fallback"

        dashboard_resp = await client.post("/api/v1/connections/sqlite_demo/workbench/ai/dashboard", json={
            "preference": {"title": "Order mix", "layout": "executive", "palette": "indigo"},
            "result": {"columns": result["columns"], "column_types": result["column_types"], "rows": result["rows"]},
        })
        assert dashboard_resp.status_code == 200
        dashboard = dashboard_resp.json()
        assert dashboard["model"] == "gemini-3.5-flash-lite"
        assert dashboard["mode"] == "local_fallback"
        assert len(dashboard["widgets"]) >= 2
        assert dashboard["data_profile"]["row_count"] == result["row_count"]

        health_resp = await client.post("/api/v1/connections/sqlite_demo/workbench/ai/health")
        assert health_resp.status_code == 200
        health = health_resp.json()
        assert health["model"] == "gemini-3.5-flash-lite"
        assert health["diagnostics"]["table_count"] >= 10
        assert health["diagnostics"]["total_rows"] >= 1000

@pytest.mark.asyncio
async def test_api_create_and_test_database_connection():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Create connection
        create_resp = await client.post("/api/v1/connections", json={
            "name": "Marketing Snowflake Warehouse",
            "engine": "snowflake",
            "description": "Production advertising and campaign metrics"
        })
        assert create_resp.status_code == 200
        conn_data = create_resp.json()
        assert "id" in conn_data
        conn_id = conn_data["id"]
        
        # Test connection
        test_resp = await client.post(f"/api/v1/connections/{conn_id}/test")
        assert test_resp.status_code == 200
        test_data = test_resp.json()
        assert test_data["status"] == "healthy"

        delete_resp = await client.delete(f"/api/v1/connections/{conn_id}")
        assert delete_resp.status_code == 200

@pytest.mark.asyncio
async def test_api_shared_demo_database_is_read_only():
    """Anyone can use the shared demo database, so nobody may add or drop its tables."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        before = (await client.get("/api/v1/connections/sqlite_demo/catalog")).json()["tables"].keys()
        tbl_resp = await client.post("/api/v1/connections/sqlite_demo/tables", json={
            "table_name": "marketing_campaigns_test",
            "columns": [{"name": "id", "type": "INTEGER", "primary_key": True, "nullable": False}],
        })
        assert tbl_resp.status_code == 403
        drop_resp = await client.delete("/api/v1/connections/sqlite_demo/tables/customers")
        assert drop_resp.status_code == 403
        after = (await client.get("/api/v1/connections/sqlite_demo/catalog")).json()["tables"].keys()
        assert set(before) == set(after) and "customers" in after

@pytest.mark.asyncio
async def test_api_create_agent_run_and_execute():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Create run
        resp = await client.post("/api/v1/agent-runs", json={
            "question": "Show top 5 customers by total spending",
            "model_id": "anthropic/claude-3.5-sonnet"
        })
        assert resp.status_code == 200
        run_data = resp.json()
        assert "run_id" in run_data
        run_id = run_data["run_id"]
        
        # Test manual execution
        exec_resp = await client.post(f"/api/v1/agent-runs/{run_id}/execute", json={
            "sql": "SELECT id, full_name, city FROM customers LIMIT 5"
        })
        assert exec_resp.status_code == 200
        exec_data = exec_resp.json()
        assert exec_data["validation"]["is_valid"] is True
        assert len(exec_data["result"]["rows"]) == 5


@pytest.mark.asyncio
async def test_run_acceptance_and_terminal_stream_do_not_wait_for_conversation_write(monkeypatch):
    from backend.app.main import conversation_store

    original_persist = conversation_store.persist_user_message
    write_started = threading.Event()
    release_write = threading.Event()

    def delayed_persist(**kwargs):
        write_started.set()
        release_write.wait(timeout=10)
        return original_persist(**kwargs)

    monkeypatch.setattr(conversation_store, "persist_user_message", delayed_persist)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await asyncio.wait_for(client.post("/api/v1/agent-runs", json={
            "question": "Hello",
            "connection_id": "sqlite_demo",
        }), timeout=2)
        run = response.json()
        assert response.status_code == 200
        assert await asyncio.to_thread(write_started.wait, 2)

        stream = await asyncio.wait_for(client.get(run["events_url"]), timeout=2)
        assert stream.status_code == 200
        assert "event: run.completed" in stream.text

        release_write.set()
        thread = await client.get(f"/api/v1/conversations/{run['conversation_id']}")
        assert [message["role"] for message in thread.json()["messages"]] == ["user", "assistant"]


@pytest.mark.asyncio
async def test_agent_run_can_be_created_and_streamed_in_one_request():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/agent-runs/stream", json={
            "question": "List customers for review",
            "connection_id": "sqlite_demo",
            "thinking_effort": "minimal",
        })

        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.text.index("event: run.created") < response.text.index("event: run.accepted")
        assert response.text.count("event: run.created") == 1
        assert response.text.count("event: run.completed") == 1

        first_delta_block = next(
            block
            for block in response.text.split("\n\n")
            if "event: provider.first_delta" in block
        )
        first_delta = json.loads(next(
            line.removeprefix("data: ")
            for line in first_delta_block.splitlines()
            if line.startswith("data: ")
        ))
        assert first_delta["payload"]["phase"] == "sql"
        assert first_delta["payload"]["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_agent_stream_is_replayable_and_persists_assistant_thread():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        create_resp = await client.post("/api/v1/agent-runs", json={
            "question": "List customers for review",
            "model_id": "openai/gpt-5.6-solar",
            "connection_id": "sqlite_demo",
            "thinking_effort": "high",
        })
        assert create_resp.status_code == 200
        run = create_resp.json()
        # A model that is not offered falls back to the default.
        # High effort without a chosen model runs on the deep model.
        assert run["execution_model_id"] == DEEP_MODEL
        assert run["thinking_effort"] == "high"

        stream_resp = await client.get(run["events_url"])
        assert stream_resp.status_code == 200
        assert "BM25 schema indexing" in stream_resp.text
        assert f'"execution_model_id": "{DEEP_MODEL}"' in stream_resp.text
        assert "event: visualization.agent_started" in stream_resp.text
        assert "event: sql.semantic_validation_completed" in stream_resp.text
        assert "gemini-3.5-flash-lite" in stream_resp.text
        assert stream_resp.text.count("event: provider.completed") >= 2
        assert '"phase": "answer"' in stream_resp.text
        assert stream_resp.text.count("event: run.completed") == 1
        completed_block = next(
            block
            for block in stream_resp.text.split("\n\n")
            if "event: run.completed" in block
        )
        completed_event = json.loads(next(
            line.removeprefix("data: ")
            for line in completed_block.splitlines()
            if line.startswith("data: ")
        ))
        assert "stream_events" not in completed_event["payload"]

        replay_resp = await client.get(run["events_url"])
        assert replay_resp.status_code == 200
        assert replay_resp.text.count("event: run.completed") == 1

        thread_resp = await client.get(f"/api/v1/conversations/{run['conversation_id']}")
        assert thread_resp.status_code == 200
        thread = thread_resp.json()
        assert [message["role"] for message in thread["messages"]] == ["user", "assistant"]
        assert thread["messages"][-1]["payload"]["status"] == "success"
        assert thread["messages"][-1]["payload"]["execution_model_id"] == DEEP_MODEL
        assert thread["messages"][-1]["payload"]["thinking_effort"] == "high"
        assert thread["messages"][-1]["payload"]["stream_events"]
        assert thread["messages"][-1]["payload"]["semantic_validation"]["is_semantically_valid"] is True
        assert thread["messages"][-1]["payload"]["chart"]["model"] == "gemini-3.5-flash-lite"

        continuation_resp = await client.post("/api/v1/agent-runs", json={
            "question": "Now keep only the first ten",
            "model_id": "anthropic/claude-opus-5",
            "connection_id": "sqlite_demo",
            "conversation_id": run["conversation_id"],
        })
        assert continuation_resp.status_code == 200
        continuation = continuation_resp.json()
        assert continuation["conversation_id"] == run["conversation_id"]
        assert (await client.get(continuation["events_url"])).status_code == 200
        updated_thread = (await client.get(f"/api/v1/conversations/{run['conversation_id']}")).json()
        assert [message["role"] for message in updated_thread["messages"]] == [
            "user", "assistant", "user", "assistant"
        ]
        assert updated_thread["messages"][-1]["payload"]["intent_validation"]["is_follow_up"] is True


@pytest.mark.asyncio
async def test_minimal_thinking_effort_uses_fast_local_agents():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        create_resp = await client.post("/api/v1/agent-runs", json={
            "question": "List customers for review",
            "connection_id": "sqlite_demo",
            "thinking_effort": "minimal",
        })
        assert create_resp.status_code == 200
        run = create_resp.json()
        assert run["thinking_effort"] == "minimal"

        stream = await client.get(run["events_url"])
        assert stream.status_code == 200
        assert '"thinking_effort": "minimal"' in stream.text
        assert '"provider_reasoning_effort": "minimal"' in stream.text
        assert "slayql/local-intent" in stream.text
        assert "slayql/local-semantic-validator" in stream.text
        assert "slayql/local-chart-planner" in stream.text
        assert "slayql/local-result-summary" in stream.text

        thread = (await client.get(f"/api/v1/conversations/{run['conversation_id']}")).json()
        payload = thread["messages"][-1]["payload"]
        assert payload["thinking_effort"] == "minimal"
        assert payload["attempt_count"] == 1
        assert payload["intent_validation"]["mode"] == "local_heuristic"
        assert payload["semantic_validation"]["mode"] == "local_heuristic"


@pytest.mark.asyncio
async def test_invalid_thinking_effort_is_rejected():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/agent-runs", json={
            "question": "List customers",
            "connection_id": "sqlite_demo",
            "thinking_effort": "unlimited",
        })
        assert response.status_code == 422


@pytest.mark.asyncio
async def test_chat_intent_routes_metadata_no_query_and_reports():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        schema_run = (await client.post("/api/v1/agent-runs", json={
            "question": "What tables are in the database?",
            "connection_id": "sqlite_demo",
        })).json()
        schema_stream = await client.get(schema_run["events_url"])
        assert "event: intent.validator_completed" in schema_stream.text
        assert '"intent": "schema_overview"' in schema_stream.text
        assert '"tool": "catalog_agent"' in schema_stream.text
        assert "event: orchestrator.tool_call.completed" in schema_stream.text
        schema_thread = (await client.get(f"/api/v1/conversations/{schema_run['conversation_id']}")).json()
        schema_message = schema_thread["messages"][-1]
        assert schema_message["payload"]["resolution_code"] == "schema_overview"
        assert "customers" in [row[0] for row in schema_message["payload"]["rows"]]
        assert schema_message["sql"] is None

        count_run = (await client.post("/api/v1/agent-runs", json={
            "question": "How many total rows are in the database?",
            "connection_id": "sqlite_demo",
            "conversation_id": schema_run["conversation_id"],
        })).json()
        count_stream = await client.get(count_run["events_url"])
        assert "slayql/metadata-planner" in count_stream.text
        assert '"tool": "sql_agent"' in count_stream.text
        count_thread = (await client.get(f"/api/v1/conversations/{schema_run['conversation_id']}")).json()
        count_message = count_thread["messages"][-1]
        assert count_message["payload"]["intent_validation"]["intent"] == "row_count_overview"
        assert count_message["payload"]["rows"][0][0] == "All tables"
        assert count_message["sql"]

        no_query_run = (await client.post("/api/v1/agent-runs", json={
            "question": "Hey there",
            "connection_id": "sqlite_demo",
            "thinking_effort": "max",
        })).json()
        assert no_query_run["initial_answer"]
        assert no_query_run["initial_is_sql_query"] is False
        no_query_stream = await client.get(no_query_run["events_url"])
        assert "slayql/local-response" in no_query_stream.text
        assert "provider.request_started" not in no_query_stream.text
        no_query_thread = (await client.get(f"/api/v1/conversations/{no_query_run['conversation_id']}")).json()
        no_query_message = no_query_thread["messages"][-1]
        assert no_query_message["payload"]["status"] == "no_query"
        assert no_query_message["payload"]["reportable"] is True

        guidance_run = (await client.post("/api/v1/agent-runs", json={
            "question": "What kind of query is important for a dashboard?",
            "connection_id": "sqlite_demo",
        })).json()
        guidance_stream = await client.get(guidance_run["events_url"])
        assert guidance_stream.status_code == 200
        assert '"intent": "business_guidance"' in guidance_stream.text
        assert '"is_sql_query": false' in guidance_stream.text
        assert "provider.request_started" not in guidance_stream.text
        guidance_thread = (await client.get(f"/api/v1/conversations/{guidance_run['conversation_id']}")).json()
        guidance_message = guidance_thread["messages"][-1]
        assert guidance_message["payload"]["resolution_code"] == "business_guidance"
        assert guidance_message["sql"] is None

        report_resp = await client.post("/api/v1/chat-reports", json={
            "message_id": no_query_message["id"],
            "category": "incorrect_or_unhelpful",
        })
        assert report_resp.status_code == 200
        report = report_resp.json()
        assert report["status"] == "new"
        assert report["context"]["resolution_code"] == "unsupported"
        duplicate = (await client.post("/api/v1/chat-reports", json={
            "message_id": no_query_message["id"],
        })).json()
        assert duplicate["id"] == report["id"]

        admin_session = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()
        admin_headers = {"Authorization": f"Bearer {admin_session['token']}"}
        reports = (await client.get("/api/v1/admin/chat-reports?status=new", headers=admin_headers)).json()
        assert any(item["id"] == report["id"] for item in reports)
        updated = (await client.patch(
            f"/api/v1/admin/chat-reports/{report['id']}",
            headers=admin_headers,
            json={"status": "resolved", "resolution_note": "Reviewed in test."},
        )).json()
        assert updated["status"] == "resolved"
        assert updated["resolved_at"]
        assert (await client.post("/api/v1/auth/logout", headers=admin_headers)).status_code == 200


@pytest.mark.asyncio
async def test_query_history_is_persisted():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        create_resp = await client.post("/api/v1/agent-runs", json={
            "question": "Persist this recent chat",
            "model_id": "anthropic/claude-sonnet-4.5",
            "connection_id": "sqlite_demo",
        })
        assert create_resp.status_code == 200
        run_data = create_resp.json()

        history_resp = await client.get("/api/v1/history")
        assert history_resp.status_code == 200
        matching = [item for item in history_resp.json() if item["id"] == run_data["run_id"]]
        assert matching
        assert matching[0]["prompt"] == "Persist this recent chat"
        assert matching[0]["conversation_id"] == run_data["conversation_id"]

        delete_resp = await client.delete(f"/api/v1/history/{run_data['run_id']}")
        assert delete_resp.status_code == 200
        assert delete_resp.json()["status"] == "deleted"

        updated_history = (await client.get("/api/v1/history")).json()
        assert not any(item["id"] == run_data["run_id"] for item in updated_history)
        assert (await client.delete(f"/api/v1/history/{run_data['run_id']}")).status_code == 404


@pytest.mark.asyncio
async def test_profiles_credits_and_connection_ownership():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        first_login = (await client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "owner-password"})).json()
        first_headers = {"Authorization": f"Bearer {first_login['token']}"}

        profile_resp = await client.patch(
            "/api/v1/profile",
            headers=first_headers,
            json={"name": "Database Owner", "bio": "Owns analytics sources"},
        )
        assert profile_resp.status_code == 200
        assert profile_resp.json()["name"] == "Database Owner"

        avatar_resp = await client.post(
            "/api/v1/profile/avatar",
            headers=first_headers,
            files={"file": ("avatar.png", b"\x89PNG\r\n\x1a\nprofile", "image/png")},
        )
        assert avatar_resp.status_code == 200
        assert avatar_resp.json()["avatar_data_url"].startswith("data:image/png;base64,")

        credits_before = (await client.get("/api/v1/credits", headers=first_headers)).json()["balance"]
        credits_added = (await client.post("/api/v1/credits/add", headers=first_headers, json={"amount": 25})).json()
        assert credits_added["balance"] == credits_before + 25

        connection_resp = await client.post(
            "/api/v1/connections",
            headers=first_headers,
            json={
                "name": "Owner warehouse",
                "provider": "postgresql",
                "credentials": {"host": "db.example.com", "database": "analytics", "username": "reader", "password": "secret"},
            },
        )
        assert connection_resp.status_code == 200
        connection_id = connection_resp.json()["id"]
        assert any(item["id"] == connection_id for item in (await client.get("/api/v1/connections", headers=first_headers)).json())

        second_login = (await client.post("/api/v1/auth/login", json={"email": "other@example.com", "password": "other-password"})).json()
        second_headers = {"Authorization": f"Bearer {second_login['token']}"}
        assert not any(item["id"] == connection_id for item in (await client.get("/api/v1/connections", headers=second_headers)).json())
        assert (await client.delete(f"/api/v1/connections/{connection_id}", headers=second_headers)).status_code == 404
        assert any(item["id"] == connection_id for item in (await client.get("/api/v1/connections", headers=first_headers)).json())

        run_resp = await client.post(
            "/api/v1/agent-runs",
            headers=first_headers,
            json={"question": "Count customers", "connection_id": "sqlite_demo"},
        )
        assert run_resp.status_code == 200
        assert run_resp.json()["credits_remaining"] == credits_added["balance"] - 1

        cleanup_resp = await client.delete(f"/api/v1/connections/{connection_id}", headers=first_headers)
        assert cleanup_resp.status_code == 200
        assert (await client.post("/api/v1/auth/logout", headers=first_headers)).status_code == 200
        assert (await client.post("/api/v1/auth/logout", headers=second_headers)).status_code == 200


def _completed_payload(stream_text):
    block = next(b for b in stream_text.split("\n\n") if "event: run.completed\n" in b)
    return json.loads(block.split("data: ", 1)[1])["payload"]


@pytest.mark.asyncio
async def test_agent_run_attaches_a_verification_outcome():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/agent-runs/stream", json={
            "question": "List customers for review",
            "connection_id": "sqlite_demo",
            "thinking_effort": "medium",
        })
        assert response.status_code == 200
        assert "event: verification.decision" in response.text
        verification = _completed_payload(response.text)["verification"]
        assert verification["outcome"] in {"confident", "caveat", "clarify", "handoff"}
        # medium effort compares three candidate queries
        assert verification["consensus"]["candidates"] == 3
        assert 0.0 <= verification["probability"] <= 1.0



@pytest.mark.asyncio
async def test_passwords_roles_and_organisation_scoping():
    from backend.app.knowledge.store import knowledge_store

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        async def login(email, password, **extra):
            return await client.post("/api/v1/auth/login", json={"email": email, "password": password, **extra})

        # A password is required, set on first sign-in and checked afterwards.
        assert (await login("founder@roles-test.my", "short")).status_code == 400
        first = await login("founder@roles-test.my", "founder-pass-1")
        assert first.status_code == 200 and first.json()["user"]["access_role"] == "owner"
        assert (await login("founder@roles-test.my", "wrong-password")).status_code == 401
        # Claiming "Admin" as a title grants nothing: later members join as viewers.
        staff = await login("staff@roles-test.my", "staff-pass-12", role="Admin")
        assert staff.json()["user"]["access_role"] == "viewer"
        owner_h = {"Authorization": f"Bearer {first.json()['token']}"}
        staff_h = {"Authorization": f"Bearer {staff.json()['token']}"}

        # Viewers cannot do analyst work or change roles, including their own.
        assert (await client.get("/api/v1/review-items", headers=staff_h)).status_code == 403
        staff_id = staff.json()["user"]["id"]
        assert (await client.patch(f"/api/v1/organization/members/{staff_id}", json={"access_role": "owner"}, headers=staff_h)).status_code == 403
        profile = await client.patch("/api/v1/profile", json={"role": "Owner"}, headers=staff_h)
        assert profile.status_code == 200
        assert (await client.get("/api/v1/review-items", headers=staff_h)).status_code == 403

        # The owner promotes them to analyst, which takes effect in their live session.
        promoted = await client.patch(f"/api/v1/organization/members/{staff_id}", json={"access_role": "analyst"}, headers=owner_h)
        assert promoted.status_code == 200
        assert (await client.get("/api/v1/review-items", headers=staff_h)).status_code == 200
        # The last owner cannot be demoted.
        founder_id = first.json()["user"]["id"]
        assert (await client.patch(f"/api/v1/organization/members/{founder_id}", json={"access_role": "viewer"}, headers=owner_h)).status_code == 400
        members = (await client.get("/api/v1/organization/members", headers=owner_h)).json()["members"]
        assert {m["email"]: m["access_role"] for m in members} == {"founder@roles-test.my": "owner", "staff@roles-test.my": "analyst"}

        # Review items stay inside their organisation.
        mine = knowledge_store.create_review_item(source="flag", question="ours", owner_id=founder_id)
        outsider = await login("boss@elsewhere-test.my", "elsewhere-pass")
        other = knowledge_store.create_review_item(source="flag", question="theirs", owner_id=outsider.json()["user"]["id"])
        visible = {item["id"] for item in (await client.get("/api/v1/review-items", headers=owner_h)).json()}
        assert mine["id"] in visible and other["id"] not in visible
        resolved = await client.post(f"/api/v1/review-items/{other['id']}/resolve", json={"resolution": "dismissed"}, headers=owner_h)
        assert resolved.status_code == 404


@pytest.mark.asyncio
async def test_password_reset_links_work_once_and_sign_out_old_sessions(monkeypatch):
    from backend.app import main
    from backend.app.accounts.password_reset import password_reset_store

    sent = []
    monkeypatch.setattr(main, "email_configured", lambda: True)
    monkeypatch.setattr(main, "_dispatch_reset_email", lambda to, link: sent.append((to, link)))
    email = "reset.me@example.com"
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        old = (await client.post("/api/v1/auth/login", json={"email": email, "name": "R", "organization_name": "Reset Co", "password": "first-password"})).json()
        old_headers = {"Authorization": f"Bearer {old['token']}"}
        # Unknown addresses get the same reply and no email.
        unknown = await client.post("/api/v1/auth/password-reset/request", json={"email": "nobody.here@example.com"})
        assert unknown.status_code == 200 and not sent
        reply = await client.post("/api/v1/auth/password-reset/request", json={"email": email})
        assert reply.json() == unknown.json()
        assert sent and sent[0][0] == email and "/reset-password?token=" in sent[0][1]
        token = sent[0][1].split("token=")[1]

        assert (await client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "password": "short"})).status_code == 400
        done = await client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "password": "second-password"})
        assert done.status_code == 200, done.text
        # One use only; the old session is signed out; old password refused, new one works.
        assert (await client.post("/api/v1/auth/password-reset/confirm", json={"token": token, "password": "third-password"})).status_code == 400
        assert (await client.get("/api/v1/my-answers", headers=old_headers)).status_code == 401
        wrong = await client.post("/api/v1/auth/login", json={"email": email, "organization_name": "Reset Co", "password": "first-password"})
        assert wrong.status_code == 401
        right = await client.post("/api/v1/auth/login", json={"email": email, "organization_name": "Reset Co", "password": "second-password"})
        assert right.status_code == 200
        # At most three links an hour per account.
        for _ in range(4):
            await client.post("/api/v1/auth/password-reset/request", json={"email": email})
        assert password_reset_store.recent_requests(main.stable_user_id(email)) == 3
