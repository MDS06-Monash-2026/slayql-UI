"""Persistent, encrypted storage for user data-source credentials.

Only connection metadata is kept in memory or returned by the API. The credential
payload is encrypted before it is written to the control database.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete, insert, select, update

from backend.app.config import settings
from backend.app.control_database import ControlDatabase, control_database

logger = logging.getLogger(__name__)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SecretCipher:
    def __init__(self, configured_key: Optional[str]) -> None:
        self.ephemeral = not bool(configured_key)
        if self.ephemeral and (settings.APP_ENV == "production" or settings.DATABASE_URL):
            raise RuntimeError(
                "FIELD_ENCRYPTION_KEY must be configured when using production or Supabase persistence."
            )
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
    def __init__(self, database: ControlDatabase, data_dir: str, encryption_key: Optional[str]) -> None:
        self.database = database
        self.connections = database.data_connections
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.cipher = SecretCipher(encryption_key)

    @staticmethod
    def _metadata(row: Any) -> Dict[str, Any]:
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
        with self.database.engine.begin() as conn:
            existing = conn.execute(
                select(self.connections).where(self.connections.c.id == connection_id)
            ).mappings().first()
            values = {
                "name": name,
                "provider": provider,
                "mode": mode,
                "description": description,
                "access_mode": "read_only",
                "status": status,
                "data_path": data_path,
                "encrypted_credentials": encrypted,
                "created_at": existing["created_at"] if existing else created_at,
                "last_tested_at": existing["last_tested_at"] if existing else None,
                "owner_id": owner_id,
            }
            if existing:
                conn.execute(
                    update(self.connections)
                    .where(self.connections.c.id == connection_id)
                    .values(**values)
                )
            else:
                conn.execute(insert(self.connections).values(id=connection_id, **values))
        return self.get_metadata(connection_id) or {}

    def list_metadata(self, owner_id: Optional[str] = None) -> list[Dict[str, Any]]:
        query = select(self.connections).order_by(self.connections.c.created_at.desc())
        if owner_id is not None:
            query = query.where(self.connections.c.owner_id == owner_id)
        with self.database.engine.connect() as conn:
            rows = conn.execute(query).mappings().all()
        return [self._metadata(row) for row in rows]

    def get_metadata(self, connection_id: str, owner_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        query = select(self.connections).where(self.connections.c.id == connection_id)
        if owner_id is not None:
            query = query.where(self.connections.c.owner_id == owner_id)
        with self.database.engine.connect() as conn:
            row = conn.execute(query).mappings().first()
        return self._metadata(row) if row else None

    def get_credentials(self, connection_id: str) -> Dict[str, Any]:
        with self.database.engine.connect() as conn:
            row = conn.execute(
                select(self.connections.c.encrypted_credentials).where(
                    self.connections.c.id == connection_id
                )
            ).mappings().first()
        if not row or not row["encrypted_credentials"]:
            return {}
        return self.cipher.decrypt(row["encrypted_credentials"])

    def update_status(self, connection_id: str, status: str) -> None:
        with self.database.engine.begin() as conn:
            conn.execute(
                update(self.connections)
                .where(self.connections.c.id == connection_id)
                .values(status=status, last_tested_at=_utc_now())
            )

    def delete(self, connection_id: str) -> Optional[Dict[str, Any]]:
        metadata = self.get_metadata(connection_id)
        if metadata:
            with self.database.engine.begin() as conn:
                conn.execute(delete(self.connections).where(self.connections.c.id == connection_id))
        return metadata


connection_store = ConnectionStore(
    control_database,
    settings.CONNECTION_DATA_DIR,
    settings.FIELD_ENCRYPTION_KEY,
)
