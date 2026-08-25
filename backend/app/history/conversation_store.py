from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, insert, select, update

from backend.app.control_database import ControlDatabase, control_database


class ConversationStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.conversations = database.chat_conversations
        self.messages = database.chat_messages

    def ensure(
        self,
        *,
        conversation_id: str,
        owner_id: str,
        connection_id: Optional[str],
        selected_model_id: Optional[str],
        title: str,
        occurred_at: str,
    ) -> Optional[Dict[str, Any]]:
        values = {
            "connection_id": connection_id,
            "selected_model_id": selected_model_id,
            "updated_at": occurred_at,
        }
        with self.database.engine.begin() as conn:
            existing = conn.execute(
                select(self.conversations).where(self.conversations.c.id == conversation_id)
            ).mappings().first()
            if existing:
                if existing["owner_id"] != owner_id:
                    return None
                conn.execute(
                    update(self.conversations)
                    .where(self.conversations.c.id == conversation_id)
                    .values(**values)
                )
                return {**dict(existing), **values}
            record = {
                "id": conversation_id,
                "owner_id": owner_id,
                "connection_id": connection_id,
                "title": title.strip()[:140] or "New chat",
                "selected_model_id": selected_model_id,
                "created_at": occurred_at,
                "updated_at": occurred_at,
            }
            conn.execute(insert(self.conversations).values(**record))
        return record

    def add_message(
        self,
        *,
        conversation_id: str,
        owner_id: str,
        role: str,
        content: str,
        created_at: str,
        sql: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        message_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        if role not in {"user", "assistant"}:
            raise ValueError("Conversation role must be user or assistant.")
        record = {
            "id": message_id or f"msg_{uuid.uuid4().hex[:16]}",
            "conversation_id": conversation_id,
            "owner_id": owner_id,
            "role": role,
            "content": content,
            "sql": sql,
            "payload_json": json.dumps(payload or {}, ensure_ascii=True, default=str),
            "created_at": created_at,
        }
        with self.database.engine.begin() as conn:
            conversation = conn.execute(
                select(self.conversations.c.owner_id).where(
                    self.conversations.c.id == conversation_id
                )
            ).first()
            if not conversation or conversation.owner_id != owner_id:
                return None
            conn.execute(insert(self.messages).values(**record))
            conn.execute(
                update(self.conversations)
                .where(self.conversations.c.id == conversation_id)
                .values(updated_at=created_at)
            )
        return self._message_payload(record)

    def get_metadata(self, conversation_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
        with self.database.engine.connect() as conn:
            row = conn.execute(
                select(self.conversations).where(
                    self.conversations.c.id == conversation_id,
                    self.conversations.c.owner_id == owner_id,
                )
            ).mappings().first()
        return dict(row) if row else None

    def list(self, owner_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        safe_limit = max(1, min(limit, 100))
        with self.database.engine.connect() as conn:
            rows = conn.execute(
                select(self.conversations)
                .where(self.conversations.c.owner_id == owner_id)
                .order_by(self.conversations.c.updated_at.desc())
                .limit(safe_limit)
            ).mappings().all()
        return [
            {
                **dict(row),
                "prompt": row["title"],
                "model_id": row["selected_model_id"],
            }
            for row in rows
        ]

    def get(self, conversation_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
        with self.database.engine.connect() as conn:
            conversation = conn.execute(
                select(self.conversations).where(
                    self.conversations.c.id == conversation_id,
                    self.conversations.c.owner_id == owner_id,
                )
            ).mappings().first()
            if not conversation:
                return None
            messages = conn.execute(
                select(self.messages)
                .where(
                    self.messages.c.conversation_id == conversation_id,
                    self.messages.c.owner_id == owner_id,
                )
                .order_by(self.messages.c.created_at, self.messages.c.id)
            ).mappings().all()
        return {
            **dict(conversation),
            "messages": [self._message_payload(dict(message)) for message in messages],
        }

    def context(self, conversation_id: str, owner_id: str, limit: int = 8) -> List[Dict[str, str]]:
        thread = self.get(conversation_id, owner_id)
        if not thread:
            return []
        context_messages = []
        for message in thread["messages"][-max(1, min(limit, 20)):]:
            content = message["content"]
            if message["role"] == "assistant" and message.get("sql"):
                content = f"{content}\n\nSQL used for that answer:\n{message['sql']}"
            context_messages.append({"role": message["role"], "content": content})
        return context_messages

    def delete(self, conversation_id: str, owner_id: str) -> bool:
        with self.database.engine.begin() as conn:
            exists = conn.execute(
                select(self.conversations.c.id).where(
                    self.conversations.c.id == conversation_id,
                    self.conversations.c.owner_id == owner_id,
                )
            ).first()
            if not exists:
                return False
            conn.execute(
                delete(self.messages).where(
                    self.messages.c.conversation_id == conversation_id,
                    self.messages.c.owner_id == owner_id,
                )
            )
            conn.execute(
                delete(self.conversations).where(
                    self.conversations.c.id == conversation_id,
                    self.conversations.c.owner_id == owner_id,
                )
            )
        return True

    @staticmethod
    def _message_payload(record: Dict[str, Any]) -> Dict[str, Any]:
        raw_payload = record.get("payload_json") or "{}"
        try:
            payload = json.loads(raw_payload)
        except (TypeError, json.JSONDecodeError):
            payload = {}
        return {
            "id": record["id"],
            "conversation_id": record["conversation_id"],
            "role": record["role"],
            "content": record["content"],
            "sql": record.get("sql"),
            "payload": payload,
            "created_at": record["created_at"],
        }


conversation_store = ConversationStore(control_database)
