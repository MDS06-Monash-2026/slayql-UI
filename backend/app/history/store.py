from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.app.config import settings


class HistoryStore:
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
                CREATE TABLE IF NOT EXISTS query_history (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    model_id TEXT,
                    connection_id TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_query_history_created_at ON query_history(created_at DESC)"
            )
            columns = {row[1] for row in conn.execute("PRAGMA table_info(query_history)").fetchall()}
            if "owner_id" not in columns:
                conn.execute("ALTER TABLE query_history ADD COLUMN owner_id TEXT")
            conn.commit()

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
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO query_history
                (id, conversation_id, prompt, model_id, connection_id, created_at, owner_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (run_id, conversation_id, prompt, model_id, connection_id, created_at, owner_id),
            )
            conn.commit()
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
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, conversation_id, prompt, model_id, connection_id, created_at "
                "FROM query_history WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?",
                (owner_id, safe_limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def delete(self, run_id: str, owner_id: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM query_history WHERE id = ? AND owner_id = ?", (run_id, owner_id))
            conn.commit()
        return cursor.rowcount > 0


history_store = HistoryStore(settings.CONTROL_DB_PATH)
