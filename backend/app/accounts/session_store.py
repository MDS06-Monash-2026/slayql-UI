from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy import delete, insert, select, update

from backend.app.control_database import ControlDatabase, control_database


class SessionStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.sessions = database.backend_sessions

    def save(self, token: str, user_id: str, authenticated_at: str) -> None:
        with self.database.engine.begin() as conn:
            exists = conn.execute(
                select(self.sessions.c.token).where(self.sessions.c.token == token)
            ).first()
            values = {"user_id": user_id, "authenticated_at": authenticated_at}
            if exists:
                conn.execute(update(self.sessions).where(self.sessions.c.token == token).values(**values))
            else:
                conn.execute(insert(self.sessions).values(token=token, **values))

    def get(self, token: str) -> Optional[Dict[str, Any]]:
        with self.database.engine.connect() as conn:
            row = conn.execute(
                select(self.sessions).where(self.sessions.c.token == token)
            ).mappings().first()
        return dict(row) if row else None

    def delete(self, token: str) -> bool:
        with self.database.engine.begin() as conn:
            result = conn.execute(delete(self.sessions).where(self.sessions.c.token == token))
        return result.rowcount > 0


session_store = SessionStore(control_database)
