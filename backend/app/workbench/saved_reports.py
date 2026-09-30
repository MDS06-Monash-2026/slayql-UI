"""Reports saved from Report Studio, kept on the server per user and data source."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, insert, select, update

from backend.app.control_database import ControlDatabase, control_database

MAX_PER_SOURCE = 50


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class SavedReportStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.table = database.saved_reports

    def list_for(self, owner_id: str, connection_id: str) -> List[Dict[str, Any]]:
        """Newest first, without the report bodies."""
        t = self.table
        statement = (
            select(t.c.id, t.c.title, t.c.question, t.c.updated_at)
            .where(t.c.owner_id == owner_id, t.c.connection_id == connection_id)
            .order_by(t.c.updated_at.desc())
            .limit(MAX_PER_SOURCE)
        )
        with self.database.engine.connect() as conn:
            return [dict(row) for row in conn.execute(statement).mappings()]

    def get(self, report_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
        t = self.table
        with self.database.engine.connect() as conn:
            row = conn.execute(select(t).where(t.c.id == report_id, t.c.owner_id == owner_id)).mappings().first()
        if not row:
            return None
        record = dict(row)
        record["report"] = json.loads(record["report"])
        return record

    def save(self, *, owner_id: str, connection_id: str, report: Dict[str, Any], report_id: Optional[str] = None) -> Dict[str, Any]:
        """Create, or update the caller's own report with this id."""
        t = self.table
        now = _now()
        values = {
            "title": str(report.get("title") or "Report")[:200],
            "question": str(report.get("question") or "")[:2000],
            "report": json.dumps(report, default=str),
            "updated_at": now,
        }
        with self.database.engine.begin() as conn:
            if report_id:
                result = conn.execute(update(t).where(
                    t.c.id == report_id, t.c.owner_id == owner_id, t.c.connection_id == connection_id,
                ).values(**values))
                if result.rowcount:
                    return {"id": report_id, **{k: v for k, v in values.items() if k != "report"}}
            new_id = f"rpt_{uuid.uuid4().hex[:12]}"
            conn.execute(insert(t).values(id=new_id, owner_id=owner_id, connection_id=connection_id, created_at=now, **values))
            # Keep the newest MAX_PER_SOURCE per data source.
            stale = conn.execute(
                select(t.c.id).where(t.c.owner_id == owner_id, t.c.connection_id == connection_id)
                .order_by(t.c.updated_at.desc()).offset(MAX_PER_SOURCE)
            ).scalars().all()
            if stale:
                conn.execute(delete(t).where(t.c.id.in_(stale)))
        return {"id": new_id, **{k: v for k, v in values.items() if k != "report"}}

    def delete(self, report_id: str, owner_id: str) -> bool:
        with self.database.engine.begin() as conn:
            result = conn.execute(delete(self.table).where(self.table.c.id == report_id, self.table.c.owner_id == owner_id))
        return bool(result.rowcount)


saved_report_store = SavedReportStore(control_database)
