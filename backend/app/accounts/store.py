from __future__ import annotations

import base64
import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import insert, select, update

from backend.app.control_database import ControlDatabase, control_database


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_user_id(email: str) -> str:
    digest = hashlib.sha256(email.strip().lower().encode()).hexdigest()[:16]
    return f"usr_{digest}"


class AccountStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.profiles = database.user_profiles
        self.transactions = database.credit_transactions

    @staticmethod
    def _profile(row: Any) -> Dict[str, Any]:
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
        normalized_email = email.lower()
        with self.database.engine.begin() as conn:
            existing = conn.execute(
                select(self.profiles).where(self.profiles.c.email == normalized_email)
            ).mappings().first()
            if existing:
                conn.execute(
                    update(self.profiles)
                    .where(self.profiles.c.email == normalized_email)
                    .values(
                        role=role,
                        organization_name=(
                            organization_name
                            if existing["organization_name"] == ""
                            else existing["organization_name"]
                        ),
                        updated_at=now,
                    )
                )
            else:
                conn.execute(
                    insert(self.profiles).values(
                        id=user_id,
                        email=normalized_email,
                        name=name,
                        role=role,
                        organization_name=organization_name,
                        created_at=now,
                        updated_at=now,
                    )
                )
            row = conn.execute(
                select(self.profiles).where(self.profiles.c.email == normalized_email)
            ).mappings().one()
        return self._profile(row)

    def get(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self.database.engine.connect() as conn:
            row = conn.execute(
                select(self.profiles).where(self.profiles.c.id == user_id)
            ).mappings().first()
        return self._profile(row) if row else None

    def update(self, user_id: str, fields: Dict[str, str]) -> Optional[Dict[str, Any]]:
        allowed = {"name", "role", "organization_name", "bio", "timezone"}
        updates = {key: value.strip() for key, value in fields.items() if key in allowed and isinstance(value, str)}
        if updates:
            with self.database.engine.begin() as conn:
                conn.execute(
                    update(self.profiles)
                    .where(self.profiles.c.id == user_id)
                    .values(**updates, updated_at=_now())
                )
        return self.get(user_id)

    def set_avatar(self, user_id: str, content: bytes, content_type: str) -> Optional[Dict[str, Any]]:
        with self.database.engine.begin() as conn:
            conn.execute(
                update(self.profiles)
                .where(self.profiles.c.id == user_id)
                .values(avatar_bytes=content, avatar_content_type=content_type, updated_at=_now())
            )
        return self.get(user_id)

    def add_credits(self, user_id: str, amount: int, reason: str) -> Optional[Dict[str, Any]]:
        with self.database.engine.begin() as conn:
            updated = conn.execute(
                update(self.profiles)
                .where(self.profiles.c.id == user_id)
                .values(credits=self.profiles.c.credits + amount, updated_at=_now())
            )
            if updated.rowcount == 0:
                return None
            conn.execute(
                insert(self.transactions).values(
                    id=f"cr_{uuid.uuid4().hex[:16]}",
                    user_id=user_id,
                    amount=amount,
                    reason=reason,
                    created_at=_now(),
                )
            )
        return self.get(user_id)

    def consume_credit(self, user_id: str, amount: int = 1, reason: str = "AI query") -> Optional[Dict[str, Any]]:
        with self.database.engine.begin() as conn:
            updated = conn.execute(
                update(self.profiles)
                .where(self.profiles.c.id == user_id, self.profiles.c.credits >= amount)
                .values(credits=self.profiles.c.credits - amount, updated_at=_now())
            )
            if updated.rowcount == 0:
                return None
            conn.execute(
                insert(self.transactions).values(
                    id=f"cr_{uuid.uuid4().hex[:16]}",
                    user_id=user_id,
                    amount=-amount,
                    reason=reason,
                    created_at=_now(),
                )
            )
            # Read the updated row on the same connection. This avoids a
            # second transaction just to refresh the caller's credit balance.
            row = conn.execute(
                select(self.profiles).where(self.profiles.c.id == user_id)
            ).mappings().first()
        return self._profile(row) if row else None

    def credit_summary(self, user_id: str) -> Optional[Dict[str, Any]]:
        profile = self.get(user_id)
        if not profile:
            return None
        with self.database.engine.connect() as conn:
            rows = conn.execute(
                select(
                    self.transactions.c.id,
                    self.transactions.c.amount,
                    self.transactions.c.reason,
                    self.transactions.c.created_at,
                )
                .where(self.transactions.c.user_id == user_id)
                .order_by(self.transactions.c.created_at.desc())
                .limit(20)
            ).mappings().all()
        return {"balance": profile["credits"], "transactions": [dict(row) for row in rows]}


account_store = AccountStore(control_database)
