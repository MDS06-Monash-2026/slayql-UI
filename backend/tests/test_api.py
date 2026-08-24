import pytest
import httpx
from backend.app.main import app

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
        
        # 3. 1-Click Reviewer demo login
        rev_resp = await client.post("/api/v1/auth/login", json={"is_reviewer": True})
        assert rev_resp.status_code == 200
        rev_data = rev_resp.json()
        assert rev_data["user"]["name"] == "Enterprise Reviewer"

@pytest.mark.asyncio
async def test_api_models():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/models")
        assert resp.status_code == 200
        models = resp.json()
        assert len(models) >= 5
        assert any(m["id"] == "anthropic/claude-3.5-sonnet" for m in models)

@pytest.mark.asyncio
async def test_api_connections_and_catalog():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/connections")
        assert resp.status_code == 200
        conns = resp.json()
        assert len(conns) >= 2
        
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

@pytest.mark.asyncio
async def test_api_create_and_drop_custom_table():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Create custom table in sqlite_demo
        tbl_resp = await client.post("/api/v1/connections/sqlite_demo/tables", json={
            "table_name": "marketing_campaigns_test",
            "description": "Marketing ad spend and channel conversions",
            "columns": [
                {"name": "id", "type": "INTEGER", "primary_key": True, "nullable": False},
                {"name": "campaign_name", "type": "VARCHAR(255)", "primary_key": False, "nullable": False},
                {"name": "budget_usd", "type": "REAL", "primary_key": False, "nullable": True},
                {"name": "status", "type": "TEXT", "primary_key": False, "nullable": True}
            ],
            "initial_rows": [
                {"id": 1, "campaign_name": "Summer Blitz", "budget_usd": 15000.0, "status": "active"},
                {"id": 2, "campaign_name": "Product Launch", "budget_usd": 25000.0, "status": "completed"}
            ]
        })
        assert tbl_resp.status_code == 200
        data = tbl_resp.json()
        assert data["status"] == "table_created"
        assert "marketing_campaigns_test" in data["catalog"]["tables"]
        
        # Verify execution against new table
        exec_resp = await client.post("/api/v1/agent-runs/custom_run/execute", json={
            "sql": "SELECT id, campaign_name, budget_usd FROM marketing_campaigns_test"
        })
        assert exec_resp.status_code == 200
        exec_data = exec_resp.json()
        assert len(exec_data["result"]["rows"]) == 2
        
        # Drop custom table
        drop_resp = await client.delete("/api/v1/connections/sqlite_demo/tables/marketing_campaigns_test")
        assert drop_resp.status_code == 200
        drop_data = drop_resp.json()
        assert "marketing_campaigns_test" not in drop_data["catalog"]["tables"]

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
        first_login = (await client.post("/api/v1/auth/login", json={"email": "owner@example.com"})).json()
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

        second_login = (await client.post("/api/v1/auth/login", json={"email": "other@example.com"})).json()
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
