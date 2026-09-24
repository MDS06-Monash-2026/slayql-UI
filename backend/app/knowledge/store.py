"""Approved definitions, verified queries and the analyst review queue."""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, insert, select, update

from backend.app.control_database import ControlDatabase, control_database

DEFINITION_STATUSES = {"draft", "approved", "retired"}
REVIEW_STATUSES = {"open", "resolved", "dismissed"}
REVIEW_RESOLUTIONS = {"confirmed", "corrected", "dismissed"}
REVIEW_SOURCES = {"handoff", "clarify", "flag"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def question_key(question: str) -> str:
    """Normalise a question so trivially different phrasings share a key."""
    return re.sub(r"[^a-z0-9]+", " ", question.casefold()).strip()


class KnowledgeStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.definitions = database.business_definitions
        self.queries = database.verified_queries
        self.reviews = database.review_items

    # --- Definitions -------------------------------------------------------

    def list_definitions(self, connection_id: Optional[str] = None, status: Optional[str] = None) -> List[Dict[str, Any]]:
        statement = select(self.definitions).order_by(self.definitions.c.term, self.definitions.c.version.desc())
        conditions = []
        if connection_id:
            conditions.append(self.definitions.c.connection_id == connection_id)
        if status:
            conditions.append(self.definitions.c.status == status)
        if conditions:
            statement = statement.where(and_(*conditions))
        with self.database.engine.connect() as conn:
            return [self._definition(row) for row in conn.execute(statement).mappings()]

    def approved_definitions(self, connection_id: str) -> List[Dict[str, Any]]:
        return self.list_definitions(connection_id=connection_id, status="approved")

    def create_definition(
        self,
        *,
        connection_id: str,
        term: str,
        table_name: str,
        column_name: Optional[str],
        filter_sql: str,
        description: str = "",
        synonyms: Optional[List[str]] = None,
        created_by: Optional[str] = None,
        approve: bool = False,
    ) -> Dict[str, Any]:
        term = term.strip()
        if not term or not table_name.strip():
            raise ValueError("A definition needs a term and a table.")
        now = _now()
        with self.database.engine.begin() as conn:
            previous = conn.execute(
                select(self.definitions).where(
                    self.definitions.c.connection_id == connection_id,
                    self.definitions.c.term == term,
                ).order_by(self.definitions.c.version.desc())
            ).mappings().first()
            version = int(previous["version"]) + 1 if previous else 1
            if approve:
                # One approved version per term: retire the older approved ones.
                conn.execute(
                    update(self.definitions)
                    .where(
                        self.definitions.c.connection_id == connection_id,
                        self.definitions.c.term == term,
                        self.definitions.c.status == "approved",
                    )
                    .values(status="retired", updated_at=now)
                )
            record = {
                "id": f"def_{uuid.uuid4().hex[:12]}",
                "connection_id": connection_id,
                "term": term,
                "synonyms": json.dumps([s.strip() for s in (synonyms or []) if s and s.strip()]),
                "description": description.strip(),
                "table_name": table_name.strip(),
                "column_name": (column_name or "").strip() or None,
                "filter_sql": filter_sql.strip(),
                "status": "approved" if approve else "draft",
                "version": version,
                "created_by": created_by,
                "approved_by": created_by if approve else None,
                "approved_at": now if approve else None,
                "created_at": now,
                "updated_at": now,
            }
            conn.execute(insert(self.definitions).values(**record))
        return self._definition(record)

    def set_definition_status(self, definition_id: str, status: str, actor: Optional[str]) -> Optional[Dict[str, Any]]:
        if status not in DEFINITION_STATUSES:
            raise ValueError("Unsupported definition status.")
        now = _now()
        with self.database.engine.begin() as conn:
            current = conn.execute(select(self.definitions).where(self.definitions.c.id == definition_id)).mappings().first()
            if not current:
                return None
            if status == "approved":
                conn.execute(
                    update(self.definitions)
                    .where(
                        self.definitions.c.connection_id == current["connection_id"],
                        self.definitions.c.term == current["term"],
                        self.definitions.c.status == "approved",
                        self.definitions.c.id != definition_id,
                    )
                    .values(status="retired", updated_at=now)
                )
            values: Dict[str, Any] = {"status": status, "updated_at": now}
            if status == "approved":
                values.update(approved_by=actor, approved_at=now)
            conn.execute(update(self.definitions).where(self.definitions.c.id == definition_id).values(**values))
            updated = conn.execute(select(self.definitions).where(self.definitions.c.id == definition_id)).mappings().first()
        return self._definition(updated)

    @staticmethod
    def definitions_context(definitions: List[Dict[str, Any]]) -> str:
        lines = []
        for item in definitions:
            synonyms = f" (also: {', '.join(item['synonyms'])})" if item.get("synonyms") else ""
            rule = f"filter {item['filter_sql']}" if item.get("filter_sql") else "no extra filter"
            lines.append(f"- {item['term']}{synonyms}: use table {item['table_name']} with {rule}. {item.get('description', '')}".strip())
        return "\n".join(lines)

    @staticmethod
    def _definition(row: Any) -> Dict[str, Any]:
        record = dict(row)
        try:
            record["synonyms"] = json.loads(record.get("synonyms") or "[]")
        except ValueError:
            record["synonyms"] = []
        record["table"] = record.get("table_name")
        record["column"] = record.get("column_name")
        return record

    # --- Verified queries --------------------------------------------------

    def add_verified_query(self, *, connection_id: str, question: str, sql: str, approved_by: Optional[str], definition_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        record = {
            "id": f"vq_{uuid.uuid4().hex[:12]}",
            "connection_id": connection_id,
            "question": question.strip(),
            "question_key": question_key(question),
            "sql": sql.strip(),
            "definition_ids": json.dumps(definition_ids or []),
            "approved_by": approved_by,
            "created_at": _now(),
        }
        with self.database.engine.begin() as conn:
            conn.execute(insert(self.queries).values(**record))
        return {**record, "definition_ids": definition_ids or []}

    def find_verified_query(self, connection_id: str, question: str) -> Optional[Dict[str, Any]]:
        with self.database.engine.connect() as conn:
            row = conn.execute(
                select(self.queries)
                .where(self.queries.c.connection_id == connection_id, self.queries.c.question_key == question_key(question))
                .order_by(self.queries.c.created_at.desc())
            ).mappings().first()
        if not row:
            return None
        record = dict(row)
        record["definition_ids"] = json.loads(record.get("definition_ids") or "[]")
        return record

    # --- Review queue ------------------------------------------------------

    def create_review_item(
        self,
        *,
        source: str,
        question: str,
        sql: str = "",
        owner_id: Optional[str] = None,
        connection_id: Optional[str] = None,
        run_id: Optional[str] = None,
        outcome: Optional[str] = None,
        verification: Optional[Dict[str, Any]] = None,
        note: str = "",
    ) -> Dict[str, Any]:
        if source not in REVIEW_SOURCES:
            raise ValueError("Unsupported review source.")
        now = _now()
        record = {
            "id": f"rev_{uuid.uuid4().hex[:12]}",
            "owner_id": owner_id,
            "connection_id": connection_id,
            "run_id": run_id,
            "question": question[:4000],
            "sql": sql or "",
            "source": source,
            "outcome": outcome,
            "verification": json.dumps(verification or {}, default=str),
            "note": note[:2000],
            "status": "open",
            "resolution": None,
            "resolution_note": None,
            "corrected_sql": None,
            "reviewed_by": None,
            "created_at": now,
            "updated_at": now,
        }
        with self.database.engine.begin() as conn:
            conn.execute(insert(self.reviews).values(**record))
        return self._review(record)

    def list_review_items(self, status: Optional[str] = "open", limit: int = 100) -> List[Dict[str, Any]]:
        statement = select(self.reviews).order_by(self.reviews.c.created_at.desc()).limit(limit)
        if status:
            if status not in REVIEW_STATUSES:
                raise ValueError("Unsupported review status.")
            statement = statement.where(self.reviews.c.status == status)
        with self.database.engine.connect() as conn:
            return [self._review(row) for row in conn.execute(statement).mappings()]

    def count_open(self) -> int:
        return len(self.list_review_items(status="open", limit=500))

    def get_review_item(self, item_id: str) -> Optional[Dict[str, Any]]:
        with self.database.engine.connect() as conn:
            row = conn.execute(select(self.reviews).where(self.reviews.c.id == item_id)).mappings().first()
        return self._review(row) if row else None

    def resolve_review_item(
        self,
        item_id: str,
        *,
        resolution: str,
        reviewer: Optional[str],
        note: str = "",
        corrected_sql: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        if resolution not in REVIEW_RESOLUTIONS:
            raise ValueError("Unsupported review resolution.")
        status = "dismissed" if resolution == "dismissed" else "resolved"
        with self.database.engine.begin() as conn:
            result = conn.execute(
                update(self.reviews)
                .where(self.reviews.c.id == item_id)
                .values(
                    status=status,
                    resolution=resolution,
                    resolution_note=note[:2000],
                    corrected_sql=corrected_sql,
                    reviewed_by=reviewer,
                    updated_at=_now(),
                )
            )
            if not result.rowcount:
                return None
        return self.get_review_item(item_id)

    @staticmethod
    def _review(row: Any) -> Dict[str, Any]:
        record = dict(row)
        try:
            record["verification"] = json.loads(record.get("verification") or "{}")
        except ValueError:
            record["verification"] = {}
        return record


knowledge_store = KnowledgeStore(control_database)
