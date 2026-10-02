"""Report periods: which dates a report covers, and the SQL placeholders that use them.

A report's queries are written once with placeholders, then run for any period:

  {{start}} / {{end}}            the period being reported, as quoted dates, end exclusive
  {{prev_start}} / {{prev_end}}  the period before it, the same length
  {{trend_start}}                where trend charts begin (12 weeks, 12 months, 8 quarters, 5 years back)
  {{bucket:<date expr>}}         the start date of the week/month/... a row falls in ('YYYY-MM-DD')
  {{filter:<id>:<expr>}}         a slicer: <expr> IN (...) when it is set, otherwise 1=1

Periods are complete calendar periods (weeks run Monday to Sunday) and are anchored to
the data: a weekly email sent on Monday covers the week that ended on Sunday, and data
that stops before today is reported up to its last complete period, with a note.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

GRAINS = ("week", "month", "quarter", "year", "all")
# How many periods a trend chart shows, the reported one included.
TREND_LENGTH = {"day": 30, "week": 12, "month": 12, "quarter": 8, "year": 5}
MYT = timezone(timedelta(hours=8))

PLACEHOLDER = re.compile(r"(')?\{\{\s*([a-z_]+)\s*(?::\s*([^{}]*?))?\s*\}\}(?(1)')")
SAFE_EXPRESSION = re.compile(r"^[\w.\"`\[\] ()]+$")


def today_myt() -> date:
    return datetime.now(MYT).date()


def parse_day(value: Any) -> Optional[date]:
    """A date from a database value: date, datetime or an ISO-like string."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    match = re.match(r"^\s*(\d{4})-(\d{2})-(\d{2})", str(value))
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


# --- Calendar arithmetic --------------------------------------------------------

def period_start(day: date, grain: str) -> date:
    if grain == "day":
        return day
    if grain == "week":
        return day - timedelta(days=day.weekday())
    if grain == "month":
        return day.replace(day=1)
    if grain == "quarter":
        return date(day.year, (day.month - 1) // 3 * 3 + 1, 1)
    if grain == "year":
        return date(day.year, 1, 1)
    raise ValueError(f"Unknown period: {grain}")


def shift(start: date, grain: str, periods: int) -> date:
    """The start of the period `periods` away from the one starting at `start`."""
    if grain == "day":
        return start + timedelta(days=periods)
    if grain == "week":
        return start + timedelta(weeks=periods)
    months = {"month": 1, "quarter": 3, "year": 12}[grain] * periods
    index = start.year * 12 + start.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def _range_label(start: date, last: date) -> str:
    if start.year != last.year:
        return f"{start.day} {start:%b %Y} – {last.day} {last:%b %Y}"
    if start.month != last.month:
        return f"{start.day} {start:%b} – {last.day} {last:%b %Y}"
    return f"{start.day}–{last.day} {last:%b %Y}"


def period_label(start: date, grain: str) -> str:
    """'22–28 Jun 2026', 'June 2026', 'Q2 2026', '2026'."""
    if grain == "week":
        return _range_label(start, start + timedelta(days=6))
    if grain == "month":
        return f"{start:%B %Y}"
    if grain == "quarter":
        return f"Q{(start.month - 1) // 3 + 1} {start.year}"
    if grain == "year":
        return str(start.year)
    return start.isoformat()


def _fmt(day: date) -> str:
    return f"{day.day} {day:%b %Y}"


def window(grain: str = "month", *, data_min: Optional[date] = None, data_max: Optional[date] = None,
           today: Optional[date] = None, offset: int = 0, start: Optional[date] = None,
           end: Optional[date] = None) -> Dict[str, Any]:
    """The period a report covers.

    By default this is the latest complete `grain` up to yesterday (Malaysia time) and
    the data's last date, moved back `offset` periods. A custom range uses `start` to
    `end` inclusive, compared with the same number of days before it.
    """
    today = today or today_myt()
    anchor = today - timedelta(days=1)
    note = ""
    if data_max and data_max < anchor:
        anchor = data_max
        note = f"Your data ends on {_fmt(data_max)}, so this shows the latest complete period in the data."

    if start and end:
        if end < start:
            start, end = end, start
        days = (end - start).days + 1
        bucket = "day" if days <= 31 else "week" if days <= 120 else "month"
        exclusive = end + timedelta(days=1)
        prev_start = start - timedelta(days=days)
        trend_start = period_start(start, bucket)  # a custom range's trend is the range itself
        return _pack("custom", bucket, start, exclusive, prev_start, start, trend_start,
                     _range_label(start, end), _range_label(prev_start, start - timedelta(days=1)), "", data_min, data_max)

    if grain == "all":
        first = data_min or date(2000, 1, 1)
        last = data_max or anchor
        exclusive = last + timedelta(days=1)
        return _pack("all", "month", first, exclusive, first, first, period_start(first, "month"),
                     "All time" + (f" ({_fmt(first)} – {_fmt(last)})" if data_min and data_max else ""), "", "", data_min, data_max)

    if grain not in TREND_LENGTH:
        grain = "month"
    current = period_start(anchor, grain)
    if shift(current, grain, 1) - timedelta(days=1) > anchor:
        current = shift(current, grain, -1)  # the period containing the anchor is not over yet
    current = shift(current, grain, offset)
    exclusive = shift(current, grain, 1)
    previous = shift(current, grain, -1)
    if offset:
        note = ""
    if data_min and exclusive <= data_min:
        note = "This period is before your data begins."
    return _pack(grain, grain, current, exclusive, previous, current, shift(current, grain, -(TREND_LENGTH[grain] - 1)),
                 period_label(current, grain), period_label(previous, grain), note, data_min, data_max, offset)


def _pack(grain: str, bucket: str, start: date, end: date, prev_start: date, prev_end: date, trend_start: date,
          label: str, prev_label: str, note: str, data_min: Optional[date], data_max: Optional[date],
          offset: int = 0) -> Dict[str, Any]:
    return {
        "grain": grain,
        "bucket": bucket,
        "offset": offset,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "last_day": (end - timedelta(days=1)).isoformat(),
        "prev_start": prev_start.isoformat(),
        "prev_end": prev_end.isoformat(),
        "trend_start": trend_start.isoformat(),
        "label": label,
        "prev_label": prev_label,
        "note": note,
        "data_min": data_min.isoformat() if data_min else None,
        "data_max": data_max.isoformat() if data_max else None,
    }


# --- SQL -----------------------------------------------------------------------

def bucket_sql(expr: str, grain: str, dialect: str) -> str:
    """SQL giving the start date ('YYYY-MM-DD') of the `grain` period `expr` falls in."""
    grain = grain if grain in TREND_LENGTH else "month"
    if dialect in {"postgres", "snowflake"}:
        if grain == "day":
            return f"TO_CHAR(CAST({expr} AS DATE), 'YYYY-MM-DD')"
        return f"TO_CHAR(DATE_TRUNC('{grain}', {expr}), 'YYYY-MM-DD')"
    if dialect == "mysql":
        return {
            "day": f"DATE_FORMAT({expr}, '%Y-%m-%d')",
            "week": f"DATE_FORMAT(DATE_SUB({expr}, INTERVAL WEEKDAY({expr}) DAY), '%Y-%m-%d')",
            "month": f"DATE_FORMAT({expr}, '%Y-%m-01')",
            "quarter": f"CONCAT(YEAR({expr}), '-', LPAD((QUARTER({expr}) - 1) * 3 + 1, 2, '0'), '-01')",
            "year": f"DATE_FORMAT({expr}, '%Y-01-01')",
        }[grain]
    if dialect == "tsql":
        return {
            "day": f"CONVERT(char(10), CAST({expr} AS date), 23)",
            "week": f"CONVERT(char(10), DATEADD(day, -((DATEPART(weekday, {expr}) + @@DATEFIRST - 2) % 7), CAST({expr} AS date)), 23)",
            "month": f"CONVERT(char(10), DATEFROMPARTS(YEAR({expr}), MONTH({expr}), 1), 23)",
            "quarter": f"CONVERT(char(10), DATEFROMPARTS(YEAR({expr}), (DATEPART(quarter, {expr}) - 1) * 3 + 1, 1), 23)",
            "year": f"CONVERT(char(10), DATEFROMPARTS(YEAR({expr}), 1, 1), 23)",
        }[grain]
    return {  # SQLite
        "day": f"date({expr})",
        "week": f"date({expr}, '-6 days', 'weekday 1')",
        "month": f"strftime('%Y-%m-01', {expr})",
        "quarter": f"printf('%s-%02d-01', strftime('%Y', {expr}), ((CAST(strftime('%m', {expr}) AS INTEGER) - 1) / 3) * 3 + 1)",
        "year": f"strftime('%Y-01-01', {expr})",
    }[grain]


def _literal(value: Any) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def render(sql: str, win: Optional[Dict[str, Any]], dialect: str, filters: Optional[Dict[str, List[Any]]] = None) -> str:
    """Fill a query's placeholders for one period and slicer selection.

    Unknown placeholders are left in place, so the query fails validation instead of
    running with a guess.
    """
    filters = filters or {}

    def replace(match: re.Match) -> str:
        name, argument = match.group(2), match.group(3)
        if name in {"start", "end", "prev_start", "prev_end", "trend_start"}:
            return _literal(win[name]) if win else match.group(0)
        if name == "bucket" and argument and SAFE_EXPRESSION.match(argument):
            return bucket_sql(argument.strip(), (win or {}).get("bucket", "month"), dialect)
        if name == "filter" and argument and ":" in argument:
            filter_id, expr = (part.strip() for part in argument.split(":", 1))
            if not SAFE_EXPRESSION.match(expr):
                return match.group(0)
            values = [v for v in (filters.get(filter_id) or []) if v is not None and str(v) != ""][:50]
            return f"{expr} IN ({', '.join(_literal(v) for v in values)})" if values else "1=1"
        return match.group(0)

    return PLACEHOLDER.sub(replace, sql or "")


def placeholders(sql: str) -> List[str]:
    return [m.group(2) for m in PLACEHOLDER.finditer(sql or "")]


def uses_period(sql: str) -> bool:
    return any(name in {"start", "end", "prev_start", "prev_end", "trend_start", "bucket"} for name in placeholders(sql))


def filter_ids(sql: str) -> List[str]:
    return [m.group(3).split(":", 1)[0].strip() for m in PLACEHOLDER.finditer(sql or "") if m.group(2) == "filter" and m.group(3)]


# --- Schedules -------------------------------------------------------------------

CADENCE_GRAIN = {"weekly": "week", "monthly": "month"}


def next_send(cadence: str, *, weekday: int = 0, day_of_month: int = 1, hour: int = 8,
              after: Optional[datetime] = None) -> datetime:
    """The next send time strictly after `after`, at hour:00 Malaysia time, in UTC."""
    local = (after or datetime.now(timezone.utc)).astimezone(MYT)
    if cadence == "monthly":
        day = max(1, min(28, int(day_of_month or 1)))
        candidate = local.replace(day=day, hour=hour, minute=0, second=0, microsecond=0)
        if candidate <= local:
            following = shift(candidate.date().replace(day=1), "month", 1)
            candidate = candidate.replace(year=following.year, month=following.month)
        return candidate.astimezone(timezone.utc)
    candidate = local.replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=(weekday - local.weekday()) % 7)
    if candidate <= local:
        candidate += timedelta(days=7)
    return candidate.astimezone(timezone.utc)


def describe_cadence(cadence: str, weekday: int, day_of_month: int, hour: int) -> str:
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    if cadence == "monthly":
        n = int(day_of_month or 1)
        suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
        return f"Monthly on the {n}{suffix} at {hour:02d}:00 (Malaysia time)"
    return f"Every {days[weekday]} at {hour:02d}:00 (Malaysia time)"


def first_values(rows: Iterable[List[Any]]) -> List[str]:
    out: List[str] = []
    for row in rows:
        if row and row[0] is not None and str(row[0]).strip() and str(row[0]) not in out:
            out.append(str(row[0]))
    return out
