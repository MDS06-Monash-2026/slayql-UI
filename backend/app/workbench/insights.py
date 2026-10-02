"""Deterministic findings from report results.

Every number a report states comes from here, computed from query results.
The narrative model may only rephrase these facts; sentences citing numbers
that no fact contains are removed (see trusted_report.ground_narrative).
"""
from __future__ import annotations

import math
import re
from statistics import median
from typing import Any, Dict, List, Optional, Sequence, Tuple

# A rise in these is bad news, so deltas are coloured the other way round.
UP_IS_BAD = re.compile(r"\b(costs?|discounts?|refund\w*|cancel\w*|returns?|churn|overdue|late|delay\w*|complaints?|cases?|errors?|expenses?|debts?|leak\w*|loss(es)?|lost|hutang)\b", re.I)
PERIOD_VALUE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?([ T].*)?$|^\d{4}-?(Q|W)\d{1,2}$", re.I)


def to_number(value: Any) -> Optional[float]:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(float(value)) else None
    try:
        number = float(str(value).replace(",", ""))
        return number if math.isfinite(number) else None
    except ValueError:
        return None


def format_value(value: Optional[float], kind: str = "number", compact: bool = True) -> str:
    """1,284 / 12.9K / 2.16M; percentages as 12.3%."""
    if value is None:
        return "n/a"
    if kind == "percent":
        # Accept both 0.123 and 12.3 for a percentage.
        shown = value * 100 if abs(value) <= 1 else value
        return f"{shown:.1f}%"
    magnitude = abs(value)
    if compact and magnitude >= 1_000_000_000:
        text = f"{value / 1_000_000_000:.2f}B"
    elif compact and magnitude >= 1_000_000:
        text = f"{value / 1_000_000:.2f}M"
    elif compact and magnitude >= 10_000:
        text = f"{value / 1_000:.1f}K"
    elif float(value).is_integer():
        text = f"{int(value):,}"
    else:
        text = f"{value:,.2f}"
    return text


def format_change(current: float, previous: float) -> Optional[str]:
    if not previous:
        return None
    return f"{(current - previous) / abs(previous) * 100:+.1f}%"


def is_period(values: Sequence[Any]) -> bool:
    texts = [str(v) for v in values if v is not None]
    return bool(texts) and all(PERIOD_VALUE.match(text.strip()) for text in texts)


def _fact(item_id: str, kind: str, text: str, importance: float, **values: Any) -> Dict[str, Any]:
    return {"id": f"{item_id}.{kind}", "item_id": item_id, "kind": kind, "text": text, "importance": round(importance, 3), "values": values}


def kpi_facts(kpi: Dict[str, Any]) -> List[Dict[str, Any]]:
    value, previous = kpi.get("value"), kpi.get("previous")
    if value is None:
        return []
    label, kind = kpi.get("label") or "Value", kpi.get("format") or "number"
    facts = [_fact(kpi["id"], "value", f"{label} is {format_value(value, kind)}.", 0.6, value=value)]
    if previous is not None and previous != 0:
        change = format_change(value, previous)
        direction = "up" if value > previous else "down" if value < previous else "unchanged"
        comparison = kpi.get("comparison_label") or "the previous period"
        bad = (direction == "up") == bool(UP_IS_BAD.search(label)) and direction != "unchanged"
        facts.append(_fact(
            kpi["id"], "change",
            f"{label} is {direction} {change.lstrip('+-')} vs {comparison} ({format_value(previous, kind)} to {format_value(value, kind)}).",
            0.7 + min(0.3, abs(value - previous) / abs(previous)) + (0.1 if bad else 0),
            value=value, previous=previous, change=change, direction=direction, bad=bad,
        ))
    return facts


def _series(rows: List[List[Any]], x: int, y: int) -> List[Tuple[Any, float]]:
    points = []
    for row in rows:
        number = to_number(row[y]) if y < len(row) else None
        if number is not None and x < len(row):
            points.append((row[x], number))
    return points


def panel_facts(panel: Dict[str, Any], columns: List[str], rows: List[List[Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Facts for one chart, plus display hints (which mark to emphasise, partial periods)."""
    item_id = panel["id"]
    hints: Dict[str, Any] = {}
    if not rows or panel.get("chart") in {"table", "scatter"}:
        return ([_fact(item_id, "rows", f"{panel.get('title')}: {len(rows):,} rows.", 0.1, rows=len(rows))] if rows else []), hints
    try:
        x = columns.index(panel.get("x")) if panel.get("x") in columns else 0
        y = columns.index(panel.get("y")) if panel.get("y") in columns else next(
            i for i, _ in enumerate(columns) if i != x and all(to_number(r[i]) is not None for r in rows[:20] if r[i] is not None)
        )
    except StopIteration:
        return [], hints
    if panel.get("series") in columns:
        return _stacked_facts(panel, columns, rows, y), hints

    points = _series(rows, x, y)
    if not points:
        return [], hints
    measure = panel.get("y_label") or str(columns[y]).replace("_", " ")
    kind = panel.get("format") or "number"
    title = panel.get("title") or measure

    if panel.get("chart") in {"line", "area"} or is_period([p[0] for p in points]):
        points.sort(key=lambda p: str(p[0]))
        facts: List[Dict[str, Any]] = []
        # A first period far below the next few usually starts part-way through (e.g. "last 12 months"
        # from the 28th); leave it out of ranges and overall change.
        if len(points) >= 5 and median(p[1] for p in points[1:4]) > 0 and points[0][1] < 0.5 * median(p[1] for p in points[1:4]):
            hints["partial_first"] = str(points[0][0])
            points = points[1:]
        last_x, last_y = points[-1]
        hints["highlight"] = str(last_x)
        if len(points) >= 2:
            prev_x, prev_y = points[-2]
            change = format_change(last_y, prev_y)
            # A latest period far below the recent norm is usually incomplete data, not a collapse.
            recent = [p[1] for p in points[-4:-1]]
            if len(recent) >= 2 and median(recent) > 0 and last_y < 0.5 * median(recent):
                hints["partial"] = str(last_x)
                facts.append(_fact(
                    item_id, "partial",
                    f"{title}: the latest period ({last_x}) is {format_value(last_y, kind)}, under half the recent median of "
                    f"{format_value(median(recent), kind)}; it may be incomplete rather than a real drop.",
                    0.95, period=str(last_x), value=last_y, median=median(recent),
                ))
            elif change:
                direction = "rose" if last_y > prev_y else "fell" if last_y < prev_y else "held steady"
                facts.append(_fact(
                    item_id, "latest",
                    f"{title}: {direction} {change.lstrip('+-')} from {prev_x} to {last_x} ({format_value(prev_y, kind)} to {format_value(last_y, kind)}).",
                    0.6 + min(0.3, abs(last_y - prev_y) / abs(prev_y or 1)), change=change, first=prev_y, last=last_y,
                ))
            peak_x, peak_y = max(points, key=lambda p: p[1])
            low_x, low_y = min(points, key=lambda p: p[1])
            if len(points) >= 4:
                facts.append(_fact(
                    item_id, "range",
                    f"{title}: highest in {peak_x} ({format_value(peak_y, kind)}), lowest in {low_x} ({format_value(low_y, kind)}).",
                    0.45, peak=peak_y, low=low_y,
                ))
            first_x, first_y = points[0]
            overall = format_change(last_y, first_y)
            if overall and len(points) >= 4 and "partial" not in hints:
                facts.append(_fact(
                    item_id, "overall",
                    f"{title}: {overall} overall from {first_x} to {last_x}.", 0.4, change=overall,
                ))
        return facts, hints

    # Categories: who leads, how concentrated, who trails.
    ordered = sorted(points, key=lambda p: -p[1])
    leader_x, leader_y = ordered[0]
    hints["highlight"] = str(leader_x)
    facts = []
    total = sum(p[1] for p in points) if all(p[1] >= 0 for p in points) else None
    if total and len(points) >= 2:
        share = leader_y / total
        facts.append(_fact(
            item_id, "leader",
            f"{title}: {leader_x} leads with {format_value(leader_y, kind)}, {share * 100:.1f}% of the total shown.",
            0.55 + min(0.3, share / 2), share=share, value=leader_y,
        ))
        if len(points) >= 5:
            top3 = sum(p[1] for p in ordered[:3]) / total
            if top3 >= 0.6:
                facts.append(_fact(
                    item_id, "concentration",
                    f"{title}: the top 3 account for {top3 * 100:.1f}% of the total shown.", 0.6, share=top3,
                ))
        second_x, second_y = ordered[1]
        if second_y > 0 and leader_y / second_y >= 1.5:
            facts.append(_fact(
                item_id, "gap",
                f"{title}: {leader_x} is {leader_y / second_y:.1f} times {second_x}.", 0.5, ratio=leader_y / second_y,
            ))
    elif len(points) == 1:
        facts.append(_fact(item_id, "leader", f"{title}: {leader_x} at {format_value(leader_y, kind)}.", 0.3, value=leader_y))
    if len(points) >= 3:
        last_x, last_y = ordered[-1]
        facts.append(_fact(item_id, "trailer", f"{title}: lowest is {last_x} ({format_value(last_y, kind)}).", 0.3, value=last_y))
    return facts, hints


def _stacked_facts(panel: Dict[str, Any], columns: List[str], rows: List[List[Any]], y: int) -> List[Dict[str, Any]]:
    s = columns.index(panel["series"])
    totals: Dict[str, float] = {}
    for row in rows:
        number = to_number(row[y])
        if number is not None:
            totals[str(row[s])] = totals.get(str(row[s]), 0.0) + number
    if not totals:
        return []
    grand = sum(totals.values())
    name, value = max(totals.items(), key=lambda item: item[1])
    kind = panel.get("format") or "number"
    if grand <= 0:
        return []
    return [_fact(
        panel["id"], "largest_series",
        f"{panel.get('title')}: {name} is the largest part, {format_value(value, kind)} ({value / grand * 100:.1f}% of the total shown).",
        0.5, share=value / grand,
    )]


def rank(facts: List[Dict[str, Any]], limit: int = 6) -> List[Dict[str, Any]]:
    return sorted(facts, key=lambda fact: -fact["importance"])[:limit]


# Not part of a date or code such as 2026-05 or Q2.
NUMBER = re.compile(r"(?<![\w.\-/])[-+]?\d[\d,]*(?:\.\d+)?(?:[KMB%x]|\s?times)?(?![\w\-/])", re.I)


def numbers_in(text: str) -> List[str]:
    """Numbers as written (2.16M, 12.3%, 1,284), ignoring years and ordinals of one digit."""
    found = []
    for match in NUMBER.findall(text or ""):
        token = match.strip().replace(" times", "x").lower()
        digits = token.rstrip("kmb%x").lstrip("+-").replace(",", "")
        if not digits:
            continue
        if re.fullmatch(r"(19|20)\d{2}", digits) or re.fullmatch(r"\d", digits):
            continue
        found.append(token.lstrip("+"))
    return found

