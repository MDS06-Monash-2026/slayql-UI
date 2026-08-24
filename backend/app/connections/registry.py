"""Connection lookup shared by HTTP endpoints and the agent pipeline."""

from typing import Any, Dict, Optional

from backend.app.config import settings
from backend.app.connections.store import connection_store


def get_connection(connection_id: str) -> Optional[Dict[str, Any]]:
    if connection_id == "sqlite_demo":
        return {"id": "sqlite_demo", "engine": "sqlite", "path": settings.SQLITE_DEMO_PATH, "name": "SlayQL Demo Database"}
    if connection_id == "postgres_demo":
        return {"id": "postgres_demo", "engine": "postgresql", "name": "Customer PostgreSQL Demo"}
    return connection_store.get_metadata(connection_id)


def get_credentials(connection_id: str) -> Dict[str, Any]:
    if connection_id == "postgres_demo" and settings.DEMO_POSTGRES_URL:
        return {"connection_string": settings.DEMO_POSTGRES_URL}
    return connection_store.get_credentials(connection_id)


def get_sqlite_path(connection_id: str) -> Optional[str]:
    connection = get_connection(connection_id)
    if connection and connection.get("engine") == "sqlite":
        return connection.get("path") or settings.SQLITE_DEMO_PATH
    return None
