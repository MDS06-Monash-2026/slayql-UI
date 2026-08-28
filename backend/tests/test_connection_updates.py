import sqlite3

import httpx
import pytest

from backend.app.catalog.discovery import CatalogSchema
from backend.app.config import settings
from backend.app.connections.registry import get_credentials
from backend.app.connections.store import connection_store
from backend.app.main import DYNAMIC_CONNECTIONS, app


def _sqlite_file(path, table_name: str, value: str):
    with sqlite3.connect(path) as connection:
        connection.execute(f'CREATE TABLE "{table_name}" (value TEXT NOT NULL)')
        connection.execute(f'INSERT INTO "{table_name}" (value) VALUES (?)', (value,))
        connection.commit()
    return path.read_bytes()


@pytest.mark.asyncio
async def test_replace_managed_sqlite_file_preserves_connection_and_last_good_copy(tmp_path, monkeypatch):
    monkeypatch.setattr(connection_store, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "CONNECTION_DATA_DIR", str(tmp_path))
    original = _sqlite_file(tmp_path / "original.db", "old_records", "before")
    replacement = _sqlite_file(tmp_path / "replacement.db", "new_records", "after")

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        upload = await client.post(
            "/api/v1/connections/upload",
            data={"name": "Replaceable database"},
            files={"file": ("original.db", original, "application/x-sqlite3")},
        )
        assert upload.status_code == 200
        connection_id = upload.json()["id"]

        replaced = await client.put(
            f"/api/v1/connections/{connection_id}/file",
            files={"file": ("replacement.db", replacement, "application/x-sqlite3")},
        )
        assert replaced.status_code == 200
        payload = replaced.json()
        assert payload["connection"]["id"] == connection_id
        assert "new_records" in payload["catalog"]["tables"]
        assert "old_records" not in payload["catalog"]["tables"]

        refreshed = await client.post(f"/api/v1/connections/{connection_id}/catalog/refresh")
        assert refreshed.status_code == 200
        assert "new_records" in refreshed.json()["tables"]

        query = await client.post(
            f"/api/v1/connections/{connection_id}/workbench/query",
            json={"sql": "SELECT value FROM new_records"},
        )
        assert query.status_code == 200
        assert query.json()["result"]["rows"] == [["after"]]

        invalid = await client.put(
            f"/api/v1/connections/{connection_id}/file",
            files={"file": ("broken.db", b"not a sqlite database", "application/x-sqlite3")},
        )
        assert invalid.status_code == 400
        still_healthy = await client.post(
            f"/api/v1/connections/{connection_id}/workbench/query",
            json={"sql": "SELECT value FROM new_records"},
        )
        assert still_healthy.status_code == 200
        assert still_healthy.json()["result"]["rows"] == [["after"]]

        assert (await client.delete(f"/api/v1/connections/{connection_id}")).status_code == 200
        DYNAMIC_CONNECTIONS.pop(connection_id, None)


@pytest.mark.asyncio
async def test_update_external_connection_merges_and_verifies_credentials(monkeypatch):
    verified = {}
    invalidated = []

    def fake_test(provider, credentials):
        verified.update({"provider": provider, "credentials": dict(credentials)})
        return {"status": "healthy", "message": "Connection verified."}

    def fake_catalog(provider, credentials):
        return CatalogSchema(engine=provider, database_name=credentials["database"], tables={})

    monkeypatch.setattr("backend.app.main.test_external_connection", fake_test)
    monkeypatch.setattr("backend.app.main.get_external_catalog", fake_catalog)
    monkeypatch.setattr(
        "backend.app.main.invalidate_external_catalog",
        lambda provider, credentials: invalidated.append((provider, dict(credentials))),
    )

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        owner_session = (await client.post(
            "/api/v1/auth/login",
            json={"email": "connection-update-owner@example.com"},
        )).json()
        other_session = (await client.post(
            "/api/v1/auth/login",
            json={"email": "connection-update-other@example.com"},
        )).json()
        owner_headers = {"Authorization": f"Bearer {owner_session['token']}"}
        other_headers = {"Authorization": f"Bearer {other_session['token']}"}

        created = await client.post(
            "/api/v1/connections",
            headers=owner_headers,
            json={
                "name": "Primary warehouse",
                "provider": "postgresql",
                "credentials": {
                    "host": "db.example.com",
                    "database": "analytics",
                    "username": "reader",
                    "password": "old-secret",
                },
            },
        )
        assert created.status_code == 200
        connection_id = created.json()["id"]

        denied = await client.patch(
            f"/api/v1/connections/{connection_id}",
            headers=other_headers,
            json={"name": "Not allowed"},
        )
        assert denied.status_code == 404
        assert (await client.post(
            f"/api/v1/connections/{connection_id}/catalog/refresh",
            headers=other_headers,
        )).status_code == 404

        updated = await client.patch(
            f"/api/v1/connections/{connection_id}",
            headers=owner_headers,
            json={
                "name": "Reporting warehouse",
                "credentials": {"password": "new-secret"},
            },
        )
        assert updated.status_code == 200
        payload = updated.json()
        assert payload["connection"]["id"] == connection_id
        assert payload["connection"]["name"] == "Reporting warehouse"
        assert "credentials" not in payload["connection"]
        assert verified["provider"] == "postgresql"
        assert verified["credentials"]["host"] == "db.example.com"
        assert verified["credentials"]["password"] == "new-secret"
        assert get_credentials(connection_id)["password"] == "new-secret"
        assert invalidated[0][1]["password"] == "old-secret"
        assert invalidated[1][1]["password"] == "new-secret"

        refreshed = await client.post(
            f"/api/v1/connections/{connection_id}/catalog/refresh",
            headers=owner_headers,
        )
        assert refreshed.status_code == 200
        assert refreshed.json()["database_name"] == "analytics"
        assert invalidated[-1][1]["password"] == "new-secret"

        assert (await client.delete(
            f"/api/v1/connections/{connection_id}",
            headers=owner_headers,
        )).status_code == 200
        assert (await client.post("/api/v1/auth/logout", headers=owner_headers)).status_code == 200
        assert (await client.post("/api/v1/auth/logout", headers=other_headers)).status_code == 200
        DYNAMIC_CONNECTIONS.pop(connection_id, None)
