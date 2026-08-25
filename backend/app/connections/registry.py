"""Connection lookup shared by HTTP endpoints and the agent pipeline."""

from pathlib import Path
from typing import Any, Dict, Optional

from backend.app.config import settings
from backend.app.connections.store import connection_store

def default_connection_id() -> Optional[str]:
    return "sqlite_demo" if settings.demo_connections_enabled else None


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
    if not connection or connection.get("engine") != "sqlite":
        return None
    if connection_id == "sqlite_demo":
        return settings.SQLITE_DEMO_PATH

    raw_path = str(connection.get("path") or "").strip()
    candidates = []
    if raw_path and Path(raw_path).is_absolute():
        candidates.append(Path(raw_path))
    if raw_path:
        # Persisted records may contain an absolute path from another host.
        # Resolve the uploaded filename inside this deployment's data volume.
        candidates.append(Path(settings.CONNECTION_DATA_DIR) / Path(raw_path).name)
    candidates.append(Path(settings.CONNECTION_DATA_DIR) / f"{connection_id}.sqlite3")
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return None


def require_sqlite_path(connection_id: str) -> str:
    path = get_sqlite_path(connection_id)
    if not path:
        raise FileNotFoundError(
            "The selected SQLite file is unavailable on this deployment. Re-upload the database file."
        )
    return path
