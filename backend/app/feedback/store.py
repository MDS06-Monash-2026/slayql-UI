from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import insert, select, update

from backend.app.control_database import ControlDatabase, control_database


REPORT_CATEGORIES = {
    "incorrect_or_unhelpful",
    "invalid_sql",
    "missing_context",
    "unsafe_output",
    "other",
}
REPORT_STATUSES = {"new", "reviewed", "resolved", "dismissed"}


class ChatReportStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.reports = database.chat_reports
        self.messages = database.chat_messages

    def create(
        self,
        *,
        owner_id: str,
        message_id: str,
        category: str,
        note: str,
        created_at: str,
    ) -> Optional[Dict[str, Any]]:
        if category not in REPORT_CATEGORIES:
            raise ValueError("Unsupported report category.")

        with self.database.engine.begin() as conn:
            message = conn.execute(
                select(self.messages).where(
                    self.messages.c.id == message_id,
                    self.messages.c.owner_id == owner_id,
                    self.messages.c.role == "assistant",
                )
            ).mappings().first()
            if not message:
                return None

            existing = conn.execute(
                select(self.reports).where(
                    self.reports.c.owner_id == owner_id,
                    self.reports.c.message_id == message_id,
                )
            ).mappings().first()
            if existing:
                return self._payload(dict(existing))

            prior_user = conn.execute(
                select(self.messages.c.content)
                .where(
                    self.messages.c.conversation_id == message["conversation_id"],
                    self.messages.c.owner_id == owner_id,
                    self.messages.c.role == "user",
                    self.messages.c.created_at <= message["created_at"],
                )
                .order_by(self.messages.c.created_at.desc(), self.messages.c.id.desc())
                .limit(1)
            ).first()
            try:
                message_payload = json.loads(message.get("payload_json") or "{}")
            except (TypeError, json.JSONDecodeError):
                message_payload = {}

            intent_validation = message_payload.get("intent_validation")
            if not isinstance(intent_validation, dict):
                intent_validation = {}
            semantic_validation = message_payload.get("semantic_validation")
            if not isinstance(semantic_validation, dict):
                semantic_validation = {}
            checks = message_payload.get("checks")
            if not isinstance(checks, list):
                checks = []
            safe_context = {
                "status": message_payload.get("status"),
                "resolution_code": message_payload.get("resolution_code"),
                "requested_model_id": message_payload.get("requested_model_id"),
                "execution_model_id": message_payload.get("execution_model_id"),
                "attempt_count": message_payload.get("attempt_count"),
                "error": message_payload.get("error"),
                "intent_validation": {
                    key: intent_validation.get(key)
                    for key in (
                        "intent", "requires_sql", "is_follow_up", "confidence",
                        "reason", "model", "mode",
                    )
                    if intent_validation.get(key) is not None
                },
                "semantic_validation": {
                    key: semantic_validation.get(key)
                    for key in (
                        "is_semantically_valid", "reason", "missing_requirements", "model", "mode",
                    )
                    if semantic_validation.get(key) is not None
                },
                "checks": [
                    {
                        key: check.get(key)
                        for key in ("code", "status", "detail")
                        if check.get(key) is not None
                    }
                    for check in checks[:20]
                    if isinstance(check, dict)
                ],
            }
            record = {
                "id": f"report_{uuid.uuid4().hex[:16]}",
                "owner_id": owner_id,
                "conversation_id": message["conversation_id"],
                "message_id": message_id,
                "run_id": message_id.removeprefix("msg_") if message_id.startswith("msg_run_") else None,
                "category": category,
                "note": note.strip()[:2000],
                "question": str(prior_user.content if prior_user else "")[:4000],
                "assistant_response": str(message["content"])[:8000],
                "sql": str(message.get("sql") or "")[:20000] or None,
                "context_json": json.dumps(safe_context, ensure_ascii=True, default=str),
                "status": "new",
                "resolution_note": "",
                "created_at": created_at,
                "resolved_at": None,
            }
            conn.execute(insert(self.reports).values(**record))
        return self._payload(record)

    def list(self, *, status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        if status and status not in REPORT_STATUSES:
            raise ValueError("Unsupported report status.")
        statement = select(self.reports)
        if status:
            statement = statement.where(self.reports.c.status == status)
        statement = statement.order_by(self.reports.c.created_at.desc()).limit(max(1, min(limit, 200)))
        with self.database.engine.connect() as conn:
            rows = conn.execute(statement).mappings().all()
        return [self._payload(dict(row)) for row in rows]

    def update_status(
        self,
        *,
        report_id: str,
        status: str,
        resolution_note: str,
        resolved_at: str,
    ) -> Optional[Dict[str, Any]]:
        if status not in REPORT_STATUSES:
            raise ValueError("Unsupported report status.")
        values = {
            "status": status,
            "resolution_note": resolution_note.strip()[:2000],
            "resolved_at": resolved_at if status in {"resolved", "dismissed"} else None,
        }
        with self.database.engine.begin() as conn:
            existing = conn.execute(
                select(self.reports).where(self.reports.c.id == report_id)
            ).mappings().first()
            if not existing:
                return None
            conn.execute(
                update(self.reports).where(self.reports.c.id == report_id).values(**values)
            )
        return self._payload({**dict(existing), **values})

    @staticmethod
    def _payload(record: Dict[str, Any]) -> Dict[str, Any]:
        try:
            context = json.loads(record.get("context_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            context = {}
        return {
            key: record.get(key)
            for key in (
                "id", "owner_id", "conversation_id", "message_id", "run_id", "category",
                "note", "question", "assistant_response", "sql", "status",
                "resolution_note", "created_at", "resolved_at",
            )
        } | {"context": context}


chat_report_store = ChatReportStore(control_database)
