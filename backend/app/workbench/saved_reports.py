"""Report history: every report built in Report Studio, kept on the server per user and data source.

Reports the agent builds or changes are stored automatically, so the history shows what was
asked and found, newest first, with a small digest for the list (period, key figures, charts,
checks). Opening one loads the full report; deleting removes it for good.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, insert, select, update

from backend.app.control_database import ControlDatabase, control_database

MAX_PER_SOURCE = 100
ANSWERED = {"confident", "caveat"}


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def summarize(report: Dict[str, Any]) -> Dict[str, Any]:
    """What the history list shows without loading the report."""
    kpis = report.get("kpis") or []
    panels = report.get("panels") or []
    period = report.get("period") or {}
    figures = kpis + panels
    meta = report.get("meta") or {}
    planner = str(meta.get("planner") or "")
    return {
        "grain": period.get("grain") or report.get("grain"),
        "period": period.get("label"),
        "kpis": [{"label": k.get("label"), "value": k.get("value"), "previous": k.get("previous"), "format": k.get("format")}
                 for k in kpis[:3] if k.get("outcome") in ANSWERED],
        "charts": [p.get("chart") for p in panels][:12],
        "figures": len(figures),
        "passed": sum(1 for f in figures if f.get("outcome") in ANSWERED),
        "headline": str((report.get("narrative") or {}).get("headline") or "")[:240],
        "source": "agent" if planner in {"agent", "model"} else "pack" if planner.startswith("template:") else "catalog" if planner else "saved",
        "filters": len(report.get("filters") or []),
    }


class SavedReportStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.table = database.saved_reports

    def list_for(self, owner_id: str, connection_id: str) -> List[Dict[str, Any]]:
        """Newest first, without the report bodies."""
        t = self.table
        statement = (
            select(t.c.id, t.c.title, t.c.question, t.c.created_at, t.c.updated_at, t.c.summary)
            .where(t.c.owner_id == owner_id, t.c.connection_id == connection_id)
            .order_by(t.c.updated_at.desc())
            .limit(MAX_PER_SOURCE)
        )
        with self.database.engine.connect() as conn:
            rows = [dict(row) for row in conn.execute(statement).mappings()]
        for row in rows:
            try:
                row["summary"] = json.loads(row.get("summary") or "{}")
            except ValueError:
                row["summary"] = {}
        return rows

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
            "summary": json.dumps(summarize(report), default=str),
            "updated_at": now,
        }
        with self.database.engine.begin() as conn:
            if report_id:
                result = conn.execute(update(t).where(
                    t.c.id == report_id, t.c.owner_id == owner_id, t.c.connection_id == connection_id,
                ).values(**values))
                if result.rowcount:
                    return {"id": report_id, **self._public(values)}
            new_id = f"rpt_{uuid.uuid4().hex[:12]}"
            conn.execute(insert(t).values(id=new_id, owner_id=owner_id, connection_id=connection_id, created_at=now, **values))
            # Keep the newest MAX_PER_SOURCE per data source.
            stale = conn.execute(
                select(t.c.id).where(t.c.owner_id == owner_id, t.c.connection_id == connection_id)
                .order_by(t.c.updated_at.desc()).offset(MAX_PER_SOURCE)
            ).scalars().all()
            if stale:
                conn.execute(delete(t).where(t.c.id.in_(stale)))
        return {"id": new_id, "created_at": now, **self._public(values)}

    @staticmethod
    def _public(values: Dict[str, Any]) -> Dict[str, Any]:
        return {**{k: v for k, v in values.items() if k not in {"report", "summary"}}, "summary": json.loads(values["summary"])}

    def delete_many(self, report_ids: List[str], owner_id: str) -> int:
        if not report_ids:
            return 0
        with self.database.engine.begin() as conn:
            result = conn.execute(delete(self.table).where(self.table.c.id.in_(report_ids), self.table.c.owner_id == owner_id))
        return int(result.rowcount or 0)

    def delete(self, report_id: str, owner_id: str) -> bool:
        with self.database.engine.begin() as conn:
            result = conn.execute(delete(self.table).where(self.table.c.id == report_id, self.table.c.owner_id == owner_id))
        return bool(result.rowcount)


saved_report_store = SavedReportStore(control_database)
