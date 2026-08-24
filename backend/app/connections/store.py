"""Persistent, encrypted storage for user data-source credentials.

Only connection metadata is kept in memory or returned by the API. The credential
payload is encrypted before it is written to the control database.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from cryptography.fernet import Fernet, InvalidToken

from backend.app.config import settings

logger = logging.getLogger(__name__)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SecretCipher:
    def __init__(self, configured_key: Optional[str]) -> None:
        self.ephemeral = not bool(configured_key)
        if self.ephemeral and settings.APP_ENV == "production":
            raise RuntimeError("FIELD_ENCRYPTION_KEY must be configured before starting in production.")
        if configured_key:
            try:
                self._fernet = Fernet(configured_key.encode())
            except Exception as exc:
                raise RuntimeError(
                    "FIELD_ENCRYPTION_KEY must be a valid Fernet key. "
                    "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
                ) from exc
        else:
            # Keeps the demo usable without setup while making the production
            # misconfiguration visible. A configured key is required for restart-safe secrets.
            self._fernet = Fernet(Fernet.generate_key())
            logger.warning("FIELD_ENCRYPTION_KEY is not configured; encrypted credentials are ephemeral.")

    def encrypt(self, value: Dict[str, Any]) -> str:
        raw = json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode()
        return self._fernet.encrypt(raw).decode()

    def decrypt(self, token: str) -> Dict[str, Any]:
        try:
            return json.loads(self._fernet.decrypt(token.encode()).decode())
        except (InvalidToken, ValueError, TypeError, json.JSONDecodeError) as exc:
            raise RuntimeError("Stored connection credentials cannot be decrypted") from exc


class ConnectionStore:
    def __init__(self, db_path: str, data_dir: str, encryption_key: Optional[str]) -> None:
        self.db_path = str(Path(db_path))
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self.cipher = SecretCipher(encryption_key)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS data_connections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    access_mode TEXT NOT NULL DEFAULT 'read_only',
                    status TEXT NOT NULL DEFAULT 'pending',
                    data_path TEXT,
                    encrypted_credentials TEXT,
                    created_at TEXT NOT NULL,
                    last_tested_at TEXT
                )
                """
            )
            columns = {row[1] for row in conn.execute("PRAGMA table_info(data_connections)").fetchall()}
            if "owner_id" not in columns:
                conn.execute("ALTER TABLE data_connections ADD COLUMN owner_id TEXT")
            conn.commit()

    @staticmethod
    def _metadata(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"],
            "engine": row["provider"],
            "provider": row["provider"],
            "mode": row["mode"],
            "description": row["description"],
            "access_mode": row["access_mode"],
            "status": row["status"],
            "path": row["data_path"],
            "created_at": row["created_at"],
            "last_tested_at": row["last_tested_at"],
            "credentials_configured": bool(row["encrypted_credentials"]),
            "owner_id": row["owner_id"],
        }

    def save(
        self,
        *,
        connection_id: str,
        name: str,
        provider: str,
        mode: str,
        description: str = "",
        status: str = "pending",
        credentials: Optional[Dict[str, Any]] = None,
        data_path: Optional[str] = None,
        owner_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        encrypted = self.cipher.encrypt(credentials or {}) if credentials else None
        created_at = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO data_connections
                (id, name, provider, mode, description, access_mode, status, data_path,
                 encrypted_credentials, created_at, last_tested_at, owner_id)
                VALUES (?, ?, ?, ?, ?, 'read_only', ?, ?, ?,
                        COALESCE((SELECT created_at FROM data_connections WHERE id = ?), ?),
                        (SELECT last_tested_at FROM data_connections WHERE id = ?), ?)
                """,
                (connection_id, name, provider, mode, description, status, data_path,
                 encrypted, connection_id, created_at, connection_id, owner_id),
            )
            conn.commit()
        return self.get_metadata(connection_id) or {}

    def list_metadata(self, owner_id: Optional[str] = None) -> list[Dict[str, Any]]:
        with self._connect() as conn:
            if owner_id is None:
                rows = conn.execute("SELECT * FROM data_connections ORDER BY created_at DESC").fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM data_connections WHERE owner_id = ? ORDER BY created_at DESC", (owner_id,)
                ).fetchall()
        return [self._metadata(row) for row in rows]

    def get_metadata(self, connection_id: str, owner_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            if owner_id is None:
                row = conn.execute("SELECT * FROM data_connections WHERE id = ?", (connection_id,)).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM data_connections WHERE id = ? AND owner_id = ?", (connection_id, owner_id)
                ).fetchone()
        return self._metadata(row) if row else None

    def get_credentials(self, connection_id: str) -> Dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT encrypted_credentials FROM data_connections WHERE id = ?", (connection_id,)
            ).fetchone()
        if not row or not row["encrypted_credentials"]:
            return {}
        return self.cipher.decrypt(row["encrypted_credentials"])

    def update_status(self, connection_id: str, status: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE data_connections SET status = ?, last_tested_at = ? WHERE id = ?",
                (status, _utc_now(), connection_id),
            )
            conn.commit()

    def delete(self, connection_id: str) -> Optional[Dict[str, Any]]:
        metadata = self.get_metadata(connection_id)
        if metadata:
            with self._connect() as conn:
                conn.execute("DELETE FROM data_connections WHERE id = ?", (connection_id,))
                conn.commit()
        return metadata


connection_store = ConnectionStore(
    settings.CONTROL_DB_PATH,
    settings.CONNECTION_DATA_DIR,
    settings.FIELD_ENCRYPTION_KEY,
)
