from __future__ import annotations

import base64
import hashlib
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from backend.app.config import settings


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_user_id(email: str) -> str:
    digest = hashlib.sha256(email.strip().lower().encode()).hexdigest()[:16]
    return f"usr_{digest}"


class AccountStore:
    def __init__(self, db_path: str) -> None:
        self.db_path = str(Path(db_path))
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS user_profiles (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    organization_name TEXT NOT NULL,
                    bio TEXT NOT NULL DEFAULT '',
                    timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
                    avatar_bytes BLOB,
                    avatar_content_type TEXT,
                    credits INTEGER NOT NULL DEFAULT 1000,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS credit_transactions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    amount INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES user_profiles(id)
                )
                """
            )
            conn.commit()

    @staticmethod
    def _profile(row: sqlite3.Row) -> Dict[str, Any]:
        initials = "".join(part[0].upper() for part in row["name"].split()[:2]) or "U"
        avatar_data_url = None
        if row["avatar_bytes"] and row["avatar_content_type"]:
            encoded = base64.b64encode(row["avatar_bytes"]).decode()
            avatar_data_url = f"data:{row['avatar_content_type']};base64,{encoded}"
        return {
            "id": row["id"],
            "email": row["email"],
            "name": row["name"],
            "role": row["role"],
            "organization_name": row["organization_name"],
            "bio": row["bio"],
            "timezone": row["timezone"],
            "credits": row["credits"],
            "avatar_initials": initials,
            "avatar_data_url": avatar_data_url,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def upsert_login(self, *, email: str, name: str, role: str, organization_name: str) -> Dict[str, Any]:
        user_id = stable_user_id(email)
        now = _now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO user_profiles
                (id, email, name, role, organization_name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET
                    role = excluded.role,
                    organization_name = CASE
                        WHEN user_profiles.organization_name = '' THEN excluded.organization_name
                        ELSE user_profiles.organization_name
                    END,
                    updated_at = excluded.updated_at
                """,
                (user_id, email.lower(), name, role, organization_name, now, now),
            )
            row = conn.execute("SELECT * FROM user_profiles WHERE email = ?", (email.lower(),)).fetchone()
            conn.commit()
        return self._profile(row)

    def get(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM user_profiles WHERE id = ?", (user_id,)).fetchone()
        return self._profile(row) if row else None

    def update(self, user_id: str, fields: Dict[str, str]) -> Optional[Dict[str, Any]]:
        allowed = {"name", "role", "organization_name", "bio", "timezone"}
        updates = {key: value.strip() for key, value in fields.items() if key in allowed and isinstance(value, str)}
        if updates:
            assignments = ", ".join(f"{key} = ?" for key in updates)
            with self._connect() as conn:
                conn.execute(
                    f"UPDATE user_profiles SET {assignments}, updated_at = ? WHERE id = ?",
                    (*updates.values(), _now(), user_id),
                )
                conn.commit()
        return self.get(user_id)

    def set_avatar(self, user_id: str, content: bytes, content_type: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            conn.execute(
                "UPDATE user_profiles SET avatar_bytes = ?, avatar_content_type = ?, updated_at = ? WHERE id = ?",
                (content, content_type, _now(), user_id),
            )
            conn.commit()
        return self.get(user_id)

    def add_credits(self, user_id: str, amount: int, reason: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            updated = conn.execute(
                "UPDATE user_profiles SET credits = credits + ?, updated_at = ? WHERE id = ?",
                (amount, _now(), user_id),
            )
            if updated.rowcount == 0:
                return None
            conn.execute(
                "INSERT INTO credit_transactions (id, user_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)",
                (f"cr_{uuid.uuid4().hex[:16]}", user_id, amount, reason, _now()),
            )
            conn.commit()
        return self.get(user_id)

    def consume_credit(self, user_id: str, amount: int = 1, reason: str = "AI query") -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            updated = conn.execute(
                "UPDATE user_profiles SET credits = credits - ?, updated_at = ? WHERE id = ? AND credits >= ?",
                (amount, _now(), user_id, amount),
            )
            if updated.rowcount == 0:
                return None
            conn.execute(
                "INSERT INTO credit_transactions (id, user_id, amount, reason, created_at) VALUES (?, ?, ?, ?, ?)",
                (f"cr_{uuid.uuid4().hex[:16]}", user_id, -amount, reason, _now()),
            )
            conn.commit()
        return self.get(user_id)

    def credit_summary(self, user_id: str) -> Optional[Dict[str, Any]]:
        profile = self.get(user_id)
        if not profile:
            return None
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, amount, reason, created_at FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
                (user_id,),
            ).fetchall()
        return {"balance": profile["credits"], "transactions": [dict(row) for row in rows]}


account_store = AccountStore(settings.CONTROL_DB_PATH)
