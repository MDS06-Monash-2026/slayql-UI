"""One-time password reset links sent by email."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_, func, insert, select, update

from backend.app.control_database import ControlDatabase, control_database

LINK_MINUTES = 30
MAX_PER_HOUR = 3


def _iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class PasswordResetStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.table = database.password_resets

    def recent_requests(self, user_id: str) -> int:
        since = _iso(datetime.now(timezone.utc) - timedelta(hours=1))
        with self.database.engine.connect() as conn:
            return conn.execute(select(func.count()).select_from(self.table).where(and_(
                self.table.c.user_id == user_id, self.table.c.created_at >= since))).scalar() or 0

    def create(self, user_id: str) -> str:
        """A new link token (returned once, stored only as a hash)."""
        token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        with self.database.engine.begin() as conn:
            conn.execute(insert(self.table).values(
                token_hash=_hash(token), user_id=user_id, created_at=_iso(now),
                expires_at=_iso(now + timedelta(minutes=LINK_MINUTES)), used_at=None,
            ))
        return token

    def consume(self, token: str) -> Optional[str]:
        """The user the token belongs to, if it is unused and unexpired; it cannot be used again."""
        now = _iso(datetime.now(timezone.utc))
        t = self.table
        with self.database.engine.begin() as conn:
            row = conn.execute(select(t).where(t.c.token_hash == _hash(token or ""))).mappings().first()
            if not row or row["used_at"] or row["expires_at"] < now:
                return None
            claimed = conn.execute(update(t).where(t.c.token_hash == row["token_hash"], t.c.used_at.is_(None)).values(used_at=now))
            return row["user_id"] if claimed.rowcount else None


password_reset_store = PasswordResetStore(control_database)
