"""Reports emailed on a schedule: stored specs, due-time claiming and the email itself.

Each delivery refreshes the saved report on current data (no AI calls), so every
figure in the email was re-run and re-checked that morning.
"""
from __future__ import annotations

import html
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, delete, insert, select, update

from backend.app.control_database import ControlDatabase, control_database

# Malaysia has no daylight saving time.
MYT = timezone(timedelta(hours=8))
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def next_run(weekday: int, hour: int, after: Optional[datetime] = None) -> datetime:
    """The next weekday at hour:00 Malaysia time strictly after `after`, in UTC."""
    local = (after or _now()).astimezone(MYT)
    candidate = local.replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=(weekday - local.weekday()) % 7)
    if candidate <= local:
        candidate += timedelta(days=7)
    return candidate.astimezone(timezone.utc)


class ScheduleStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.table = database.report_schedules

    def create(self, *, owner_id: str, connection_id: str, report: Dict[str, Any], recipients: List[str],
               weekday: int, hour: int) -> Dict[str, Any]:
        now = _now()
        record = {
            "id": f"sch_{uuid.uuid4().hex[:12]}",
            "owner_id": owner_id,
            "connection_id": connection_id,
            "title": str(report.get("title") or "Report")[:120],
            "report": json.dumps(report, default=str),
            "recipients": json.dumps(recipients),
            "weekday": weekday,
            "hour": hour,
            "active": 1,
            "next_run_at": _iso(next_run(weekday, hour, now)),
            "last_sent_at": None,
            "last_status": None,
            "created_at": _iso(now),
            "updated_at": _iso(now),
        }
        with self.database.engine.begin() as conn:
            conn.execute(insert(self.table).values(**record))
        return self._row(record)

    def list_for(self, owner_id: str) -> List[Dict[str, Any]]:
        statement = select(self.table).where(self.table.c.owner_id == owner_id).order_by(self.table.c.created_at.desc())
        with self.database.engine.connect() as conn:
            return [self._row(row) for row in conn.execute(statement).mappings()]

    def get(self, schedule_id: str) -> Optional[Dict[str, Any]]:
        with self.database.engine.connect() as conn:
            row = conn.execute(select(self.table).where(self.table.c.id == schedule_id)).mappings().first()
        return self._row(row) if row else None

    def delete(self, schedule_id: str, owner_id: str) -> bool:
        with self.database.engine.begin() as conn:
            result = conn.execute(delete(self.table).where(self.table.c.id == schedule_id, self.table.c.owner_id == owner_id))
        return bool(result.rowcount)

    def claim_due(self, now: Optional[datetime] = None) -> List[Dict[str, Any]]:
        """Schedules due now, each moved to its next run first so no other worker sends it too."""
        now = now or _now()
        with self.database.engine.connect() as conn:
            due = [dict(row) for row in conn.execute(select(self.table).where(and_(
                self.table.c.active == 1, self.table.c.next_run_at <= _iso(now)))).mappings()]
        claimed = []
        for row in due:
            following = _iso(next_run(row["weekday"], row["hour"], now))
            with self.database.engine.begin() as conn:
                result = conn.execute(update(self.table).where(
                    self.table.c.id == row["id"], self.table.c.next_run_at == row["next_run_at"],
                ).values(next_run_at=following, updated_at=_iso(now)))
            if result.rowcount:
                claimed.append(self._row({**row, "next_run_at": following}))
        return claimed

    def mark_sent(self, schedule_id: str, status: str) -> None:
        with self.database.engine.begin() as conn:
            conn.execute(update(self.table).where(self.table.c.id == schedule_id).values(
                last_sent_at=_iso(_now()), last_status=status[:300], updated_at=_iso(_now())))

    @staticmethod
    def _row(row: Any) -> Dict[str, Any]:
        record = dict(row)
        record["report"] = json.loads(record["report"]) if isinstance(record.get("report"), str) else record.get("report")
        record["recipients"] = json.loads(record["recipients"]) if isinstance(record.get("recipients"), str) else record.get("recipients")
        record["active"] = bool(record.get("active"))
        record["when"] = f"Every {WEEKDAYS[record['weekday']]} at {record['hour']:02d}:00 (Malaysia time)"
        return record


schedule_store = ScheduleStore(control_database)


# --- The email ----------------------------------------------------------------

def _format(value: Any, kind: str) -> str:
    if value is None:
        return "—"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if kind == "currency":
        return f"RM {number:,.0f}"
    if kind == "percent":
        return f"{number:.1f}%"
    return f"{number:,.0f}" if number == int(number) else f"{number:,.2f}"


def _change(item: Dict[str, Any]) -> str:
    value, previous = item.get("value"), item.get("previous")
    try:
        if previous in (None, 0) or value is None:
            return ""
        change = (float(value) - float(previous)) / abs(float(previous)) * 100
    except (TypeError, ValueError):
        return ""
    return f"{'▲' if change >= 0 else '▼'} {abs(change):.0f}% vs last week"


def render_email(report: Dict[str, Any], app_url: str) -> Dict[str, str]:
    """Subject, plain text and HTML for a refreshed report."""
    title = report.get("title") or "Report"
    today = datetime.now(MYT).strftime("%d %b %Y")
    figures = report.get("kpis", []) + report.get("panels", [])
    passed = [f for f in figures if f.get("outcome") in {"confident", "caveat"}]
    held = [f for f in figures if f.get("outcome") not in {"confident", "caveat"}]
    narrative = report.get("narrative") or {}
    findings = [narrative.get("headline")] + [f.get("text") for f in narrative.get("findings", [])]
    findings = [text for text in findings if text]

    text = [f"{title}: {today}", ""]
    rows = []
    for kpi in report.get("kpis", []):
        checked = kpi.get("outcome") in {"confident", "caveat"}
        shown = _format(kpi.get("value"), kpi.get("format", "number")) if checked else "held for your analyst"
        change = _change(kpi) if checked else ""
        text.append(f"- {kpi.get('label')}: {shown} {change}".rstrip())
        rows.append(
            f"<tr><td style=\"padding:8px 12px;color:#475569\">{html.escape(str(kpi.get('label')))}</td>"
            f"<td style=\"padding:8px 12px;font-size:18px;font-weight:600;font-family:monospace;text-align:right\">{html.escape(shown)}</td>"
            f"<td style=\"padding:8px 12px;color:#64748b;font-size:12px\">{html.escape(change)}</td></tr>"
        )
    if findings:
        text += ["", "What changed:"] + [f"- {line}" for line in findings]
    if held:
        text += ["", "Held for your analyst (did not pass its checks):"] + [f"- {f.get('label') or f.get('title')}" for f in held]
    text += ["", f"{len(passed)} of {len(figures)} figures were run on your full data and passed SlayQL's checks.",
             f"Open the full report: {app_url}", "", "SlayQL"]

    body = [
        "<div style=\"font-family:Segoe UI,Arial,sans-serif;max-width:640px;color:#0f172a\">",
        f"<h2 style=\"margin:0\">{html.escape(title)}</h2>",
        f"<p style=\"margin:4px 0 16px;color:#64748b\">{html.escape(today)} · {html.escape(report.get('subtitle') or '')}</p>",
        f"<table style=\"border-collapse:collapse;width:100%;background:#f8fafc;border-radius:8px\">{''.join(rows)}</table>",
    ]
    if findings:
        body.append("<h3 style=\"margin:20px 0 6px\">What changed</h3><ul style=\"padding-left:18px\">"
                    + "".join(f"<li style=\"margin:4px 0\">{html.escape(line)}</li>" for line in findings) + "</ul>")
    if held:
        body.append("<p style=\"background:#fff7ed;padding:10px 12px;border-radius:8px;color:#9a3412\">Held for your analyst: "
                    + html.escape(", ".join(str(f.get("label") or f.get("title")) for f in held)) + ". They did not pass their checks, so no number is shown.</p>")
    body.append(f"<p style=\"color:#475569;font-size:13px\">{len(passed)} of {len(figures)} figures were run on your full data and passed "
                f"SlayQL's checks. <a href=\"{html.escape(app_url)}\">Open the full report</a>.</p></div>")
    return {"subject": f"{title}: {today}", "text": "\n".join(text), "html": "".join(body)}
