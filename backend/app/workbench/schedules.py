"""Reports emailed on a schedule: stored specs, due-time claiming and the email itself.

A schedule is weekly (a weekday) or monthly (a day of the month), at an hour in Malaysia
time. Each delivery refreshes the saved report for the period that just ended (the
Monday-to-Sunday week before a weekly send, the calendar month before a monthly one,
anchored to the data's last date) with no AI calls, so every figure in the email was
re-run and re-checked that morning. The email is laid out like a newspaper: a lead
story, the key figures, then one short story per chart.
"""
from __future__ import annotations

import html
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, delete, insert, select, update

from backend.app.control_database import ControlDatabase, control_database
from backend.app.workbench import insights, report_periods

# Malaysia has no daylight saving time.
MYT = timezone(timedelta(hours=8))
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
CADENCES = ("weekly", "monthly")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def next_run(weekday: int, hour: int, after: Optional[datetime] = None, *, cadence: str = "weekly",
             day_of_month: int = 1) -> datetime:
    """The next send time strictly after `after`, at hour:00 Malaysia time, in UTC."""
    return report_periods.next_send(cadence, weekday=weekday, day_of_month=day_of_month, hour=hour, after=after)


class ScheduleStore:
    def __init__(self, database: ControlDatabase) -> None:
        self.database = database
        self.table = database.report_schedules

    def create(self, *, owner_id: str, connection_id: str, report: Dict[str, Any], recipients: List[str],
               weekday: int, hour: int, cadence: str = "weekly", day_of_month: int = 1) -> Dict[str, Any]:
        now = _now()
        cadence = cadence if cadence in CADENCES else "weekly"
        record = {
            "id": f"sch_{uuid.uuid4().hex[:12]}",
            "owner_id": owner_id,
            "connection_id": connection_id,
            "title": str(report.get("title") or "Report")[:120],
            "report": json.dumps(report, default=str),
            "recipients": json.dumps(recipients),
            "weekday": weekday,
            "hour": hour,
            "cadence": cadence,
            "day_of_month": max(1, min(28, int(day_of_month or 1))),
            "active": 1,
            "next_run_at": _iso(next_run(weekday, hour, now, cadence=cadence, day_of_month=day_of_month)),
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
            following = _iso(next_run(row["weekday"], row["hour"], now, cadence=row.get("cadence") or "weekly",
                                      day_of_month=row.get("day_of_month") or 1))
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
        record["cadence"] = record.get("cadence") or "weekly"
        record["day_of_month"] = record.get("day_of_month") or 1
        record["when"] = report_periods.describe_cadence(record["cadence"], record["weekday"], record["day_of_month"], record["hour"])
        return record


schedule_store = ScheduleStore(control_database)


# --- The email: a newspaper edition ------------------------------------------------------

INK, MUTED, RULE, ACCENT, PAPER = "#0f172a", "#64748b", "#e2e8f0", "#4f46e5", "#fbfaf7"
SERIF = "Georgia,'Times New Roman',serif"
SANS = "'Segoe UI',Helvetica,Arial,sans-serif"
ANSWERED = {"confident", "caveat"}


def _format(value: Any, kind: str) -> str:
    number = insights.to_number(value)
    if number is None:
        return "—" if value is None else str(value)
    return insights.format_value(number, kind or "number")


def _change(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    value, previous = insights.to_number(item.get("value")), insights.to_number(item.get("previous"))
    if value is None or not previous:
        return None
    change = (value - previous) / abs(previous) * 100
    bad = bool(insights.UP_IS_BAD.search(str(item.get("label") or "")))
    good = (change >= 0) != bad
    return {"text": f"{'▲' if change >= 0 else '▼'} {abs(change):.1f}%", "color": "#047857" if good else "#b91c1c",
            "against": str(item.get("comparison_label") or "the previous period")}


def _e(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def _bars(panel: Dict[str, Any], limit: int = 5) -> str:
    """Horizontal bars for a category chart, as table cells (works in every mail client)."""
    columns, rows = panel.get("columns") or [], panel.get("rows") or []
    if panel.get("x") not in columns or panel.get("y") not in columns:
        return ""
    xi, yi = columns.index(panel["x"]), columns.index(panel["y"])
    points = [(str(r[xi]), insights.to_number(r[yi])) for r in rows if insights.to_number(r[yi]) is not None]
    totals: Dict[str, float] = {}
    for label, value in points:
        totals[label] = totals.get(label, 0) + value
    ranked = sorted(totals.items(), key=lambda p: p[1], reverse=True)[:limit]
    peak = max((abs(v) for _, v in ranked), default=0) or 1
    lines = []
    for label, value in ranked:
        width = max(2, int(abs(value) / peak * 100))
        lines.append(
            f"<tr><td style=\"padding:3px 8px 3px 0;font:12px {SANS};color:{INK};width:38%\">{_e(label[:34])}</td>"
            f"<td style=\"padding:3px 0\"><div style=\"background:{ACCENT};height:9px;width:{width}%;border-radius:2px\"></div></td>"
            f"<td style=\"padding:3px 0 3px 8px;font:600 12px {SANS};color:{INK};text-align:right;white-space:nowrap\">{_e(_format(value, panel.get('format')))}</td></tr>")
    return f"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">{''.join(lines)}</table>" if lines else ""


def _columns(panel: Dict[str, Any]) -> str:
    """A small column chart for a trend, as table cells."""
    columns, rows = panel.get("columns") or [], panel.get("rows") or []
    if panel.get("x") not in columns or panel.get("y") not in columns:
        return ""
    xi, yi = columns.index(panel["x"]), columns.index(panel["y"])
    totals: Dict[str, float] = {}
    for r in rows:
        value = insights.to_number(r[yi])
        if value is not None:
            totals[str(r[xi])] = totals.get(str(r[xi]), 0) + value
    points = sorted(totals.items())[-12:]
    peak = max((abs(v) for _, v in points), default=0) or 1
    cells = "".join(
        f"<td valign=\"bottom\" style=\"padding:0 2px\"><div style=\"background:{ACCENT if i == len(points) - 1 else '#c7d2fe'};"
        f"height:{max(3, int(abs(v) / peak * 56))}px;border-radius:2px 2px 0 0\"></div></td>"
        for i, (_, v) in enumerate(points))
    first, last = (points[0][0], points[-1][0]) if points else ("", "")
    return (f"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"height:60px\"><tr>{cells}</tr></table>"
            f"<table role=\"presentation\" width=\"100%\"><tr><td style=\"font:11px {SANS};color:{MUTED}\">{_e(first[:10])}</td>"
            f"<td style=\"font:11px {SANS};color:{MUTED};text-align:right\">{_e(last[:10])}</td></tr></table>") if points else ""


def _story(panel: Dict[str, Any]) -> str:
    facts = [f for f in panel.get("facts") or [] if f.get("kind") not in {"rows", "value"}]
    lead = facts[0]["text"] if facts else panel.get("question") or ""
    lead = lead.replace(f"{panel.get('title')}: ", "")
    chart = ""
    if panel.get("chart") in {"line", "area", "waterfall"}:
        chart = _columns(panel)
    elif panel.get("chart") not in {"table", "scatter", "heatmap"}:
        chart = _bars(panel)
    return (f"<td valign=\"top\" style=\"padding:14px 12px;border-top:1px solid {RULE};width:50%\">"
            f"<p style=\"margin:0 0 4px;font:700 15px/1.3 {SERIF};color:{INK}\">{_e(panel.get('title'))}</p>"
            f"<p style=\"margin:0 0 10px;font:13px/1.5 {SANS};color:#334155\">{_e(lead[:1].upper() + lead[1:])}</p>{chart}</td>")


def render_email(report: Dict[str, Any], app_url: str, *, cadence: Optional[str] = None) -> Dict[str, str]:
    """Subject, plain text and HTML for a refreshed report, laid out as a newspaper edition."""
    title = report.get("title") or "Report"
    period = report.get("period") or {}
    edition = {"week": "Weekly edition", "month": "Monthly edition"}.get(period.get("grain"), "Edition")
    if cadence:
        edition = {"weekly": "Weekly edition", "monthly": "Monthly edition"}.get(cadence, edition)
    today = datetime.now(MYT).strftime("%d %b %Y").lstrip("0")
    covers = period.get("label") or today
    against = period.get("prev_label")
    figures = report.get("kpis", []) + report.get("panels", [])
    passed = [f for f in figures if f.get("outcome") in ANSWERED]
    held = [f for f in figures if f.get("outcome") not in ANSWERED]
    narrative = report.get("narrative") or {}
    headline = narrative.get("headline") or "Your figures for this period"
    findings = [f.get("text") for f in narrative.get("findings", []) if f.get("text")]
    app_url = (app_url or "").strip()

    # Plain text
    text = [f"{title} · {edition}", f"Covers {covers}" + (f", compared with {against}" if against else ""), "", headline, ""]
    for kpi in report.get("kpis", []):
        if kpi.get("outcome") in ANSWERED:
            change = _change(kpi)
            text.append(f"- {kpi.get('label')}: {_format(kpi.get('value'), kpi.get('format'))}"
                        + (f" ({change['text']} vs {change['against']})" if change else ""))
        else:
            text.append(f"- {kpi.get('label')}: held for your analyst")
    if findings:
        text += ["", "What changed:"] + [f"- {line}" for line in findings]
    if held:
        text += ["", "Held for your analyst (did not pass its checks):"] + [f"- {f.get('label') or f.get('title')}" for f in held]
    text += ["", f"{len(passed)} of {len(figures)} figures were run on your full data and passed SlayQL's checks.",
             f"Open the full report: {app_url}" if app_url else "Open SlayQL for the full report.", "", "SlayQL"]

    # HTML
    tiles = []
    for kpi in report.get("kpis", [])[:6]:
        ok = kpi.get("outcome") in ANSWERED
        change = _change(kpi) if ok else None
        tiles.append(
            f"<td valign=\"top\" style=\"padding:12px;border-right:1px solid {RULE}\">"
            f"<p style=\"margin:0;font:11px {SANS};color:{MUTED};text-transform:uppercase;letter-spacing:.06em\">{_e(kpi.get('label'))}</p>"
            f"<p style=\"margin:4px 0 0;font:700 22px {SERIF};color:{INK}\">{_e(_format(kpi.get('value'), kpi.get('format')) if ok else '—')}</p>"
            + (f"<p style=\"margin:2px 0 0;font:600 12px {SANS};color:{change['color']}\">{_e(change['text'])}"
               f"<span style=\"font-weight:400;color:{MUTED}\"> vs {_e(change['against'])}</span></p>" if change else
               (f"<p style=\"margin:2px 0 0;font:12px {SANS};color:#9a3412\">Held for your analyst</p>" if not ok else ""))
            + "</td>")
    tile_rows = "".join(f"<tr>{''.join(tiles[i:i + 3])}</tr>" for i in range(0, len(tiles), 3))
    stories = [p for p in report.get("panels", []) if p.get("outcome") in ANSWERED and p.get("chart") != "table"][:8]
    story_rows = "".join(f"<tr>{_story(stories[i])}{_story(stories[i + 1]) if i + 1 < len(stories) else '<td></td>'}</tr>"
                         for i in range(0, len(stories), 2))
    body = [
        f"<div style=\"background:#eef0f4;padding:24px 8px\">",
        f"<table role=\"presentation\" align=\"center\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:680px;background:{PAPER};border:1px solid {RULE}\">",
        # Masthead
        f"<tr><td style=\"padding:22px 24px 10px;text-align:center;border-bottom:3px double {INK}\">"
        f"<p style=\"margin:0;font:600 11px {SANS};letter-spacing:.3em;color:{ACCENT};text-transform:uppercase\">The SlayQL Brief</p>"
        f"<h1 style=\"margin:6px 0 4px;font:700 30px/1.15 {SERIF};color:{INK}\">{_e(title)}</h1>"
        f"<p style=\"margin:0;font:12px {SANS};color:{MUTED}\">{_e(edition)} · {_e(today)} · Covers {_e(covers)}"
        + (f" · compared with {_e(against)}" if against else "") + "</p></td></tr>",
        # Lead story
        f"<tr><td style=\"padding:20px 24px 6px\">"
        f"<h2 style=\"margin:0 0 10px;font:700 22px/1.3 {SERIF};color:{INK}\">{_e(headline)}</h2>"
        + "".join(f"<p style=\"margin:0 0 8px;font:14px/1.6 {SANS};color:#334155\">{_e(line)}</p>" for line in findings[:4])
        + (f"<p style=\"margin:8px 0 0;font:italic 12px {SANS};color:{MUTED}\">{_e(period.get('note'))}</p>" if period.get("note") else "")
        + "</td></tr>",
        # Key figures
        (f"<tr><td style=\"padding:8px 24px\"><p style=\"margin:0 0 6px;font:700 12px {SANS};color:{INK};text-transform:uppercase;letter-spacing:.08em;"
         f"border-top:1px solid {INK};padding-top:8px\">The numbers</p>"
         f"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#fff;border:1px solid {RULE}\">{tile_rows}</table></td></tr>") if tiles else "",
        # Stories
        (f"<tr><td style=\"padding:14px 12px 4px\"><p style=\"margin:0 12px 4px;font:700 12px {SANS};color:{INK};text-transform:uppercase;letter-spacing:.08em\">Inside this edition</p>"
         f"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">{story_rows}</table></td></tr>") if stories else "",
    ]
    if held:
        body.append(f"<tr><td style=\"padding:8px 24px\"><p style=\"margin:0;background:#fff7ed;border-left:3px solid #f97316;padding:10px 12px;font:13px/1.5 {SANS};color:#9a3412\">"
                    f"Held for your analyst: {_e(', '.join(str(f.get('label') or f.get('title')) for f in held))}. They did not pass their checks, so no number is shown.</p></td></tr>")
    body.append(
        f"<tr><td style=\"padding:16px 24px 22px;border-top:1px solid {RULE}\">"
        f"<p style=\"margin:0 0 10px;font:13px/1.5 {SANS};color:#475569\">{len(passed)} of {len(figures)} figures were run on your full data and passed SlayQL's checks this morning.</p>"
        + (f"<a href=\"{_e(app_url)}\" style=\"display:inline-block;background:{ACCENT};color:#fff;text-decoration:none;font:600 13px {SANS};padding:10px 16px;border-radius:8px\">Open the live report</a>" if app_url else "")
        + f"<p style=\"margin:14px 0 0;font:11px {SANS};color:{MUTED}\">You receive this because a SlayQL report was scheduled to your address. Change or stop it in SlayQL, AI Database Lab, Report studio.</p>"
        "</td></tr></table></div>")
    subject = f"{title} · {edition.split()[0]} brief · {covers}"
    return {"subject": subject, "text": "\n".join(text), "html": "".join(body)}
