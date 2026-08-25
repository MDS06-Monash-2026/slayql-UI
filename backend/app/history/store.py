from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import delete, insert, select, update

from backend.app.control_database import ControlDatabase, control_database


class HistoryStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.history = database.query_history

    def add(
        self,
        *,
        run_id: str,
        conversation_id: str,
        prompt: str,
        model_id: Optional[str],
        connection_id: Optional[str],
        created_at: str,
        owner_id: str,
    ) -> Dict[str, Any]:
        values = {
            "conversation_id": conversation_id,
            "prompt": prompt,
            "model_id": model_id,
            "connection_id": connection_id,
            "created_at": created_at,
            "owner_id": owner_id,
        }
        with self.database.engine.begin() as conn:
            exists = conn.execute(
                select(self.history.c.id).where(self.history.c.id == run_id)
            ).first()
            if exists:
                conn.execute(update(self.history).where(self.history.c.id == run_id).values(**values))
            else:
                conn.execute(insert(self.history).values(id=run_id, **values))
        return {
            "id": run_id,
            "conversation_id": conversation_id,
            "prompt": prompt,
            "model_id": model_id,
            "connection_id": connection_id,
            "created_at": created_at,
            "owner_id": owner_id,
        }

    def list(self, owner_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        safe_limit = max(1, min(limit, 100))
        with self.database.engine.connect() as conn:
            rows = conn.execute(
                select(
                    self.history.c.id,
                    self.history.c.conversation_id,
                    self.history.c.prompt,
                    self.history.c.model_id,
                    self.history.c.connection_id,
                    self.history.c.created_at,
                )
                .where(self.history.c.owner_id == owner_id)
                .order_by(self.history.c.created_at.desc())
                .limit(safe_limit)
            ).mappings().all()
        return [dict(row) for row in rows]

    def delete(self, run_id: str, owner_id: str) -> bool:
        with self.database.engine.begin() as conn:
            cursor = conn.execute(
                delete(self.history).where(
                    self.history.c.id == run_id,
                    self.history.c.owner_id == owner_id,
                )
            )
        return cursor.rowcount > 0


history_store = HistoryStore(control_database)
