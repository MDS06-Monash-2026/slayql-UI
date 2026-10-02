"""Which charts suit a query result, ranked.

The rules decide what is *possible* from the result's shape; a model (when the effort level allows
it) only chooses among these. A single value can only be a KPI, so no other chart is offered.
Otherwise at most three are offered, or five when the data can honestly be shown more ways
(several measures, a time axis, a second grouping).
"""
from __future__ import annotations

from typing import Any, Dict, List

LABELS = {
    "kpi": "KPI",
    "bar": "Bar",
    "line": "Line",
    "area": "Area",
    "donut": "Donut",
    "pie": "Pie",
    "scatter": "Scatter",
    "histogram": "Histogram",
    "heatmap": "Heatmap",
}

DATE_HINTS = ("date", "month", "year", "week", "day", "period", "quarter", "time")


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _profile(columns: List[str], col_types: List[str], rows: List[List[Any]]):
    """Split columns into measures (numbers), time axes and categories."""
    numeric, temporal, nominal = [], [], []
    for index, name in enumerate(columns):
        values = [row[index] for row in rows[:50] if index < len(row) and row[index] is not None]
        declared = col_types[index] if index < len(col_types) else ""
        named_like_time = any(hint in name.lower() for hint in DATE_HINTS)
        date_strings = bool(values) and all(isinstance(v, str) and len(v) >= 7 and v[4:5] == "-" for v in values[:10])
        all_numbers = bool(values) and all(_is_number(v) for v in values)
        if declared == "date" or date_strings or (named_like_time and not all_numbers):
            temporal.append(name)
        elif named_like_time and all_numbers and all(float(v).is_integer() for v in values):
            temporal.append(name)  # e.g. year = 2025, month = 3
        elif all_numbers:
            numeric.append(name)
        else:
            nominal.append(name)
    return numeric, temporal, nominal


def chart_options(columns: List[str], col_types: List[str], rows: List[List[Any]]) -> List[Dict[str, str]]:
    """Ranked chart options that suit this result (empty when a table is the only sensible view)."""
    if not rows or not columns:
        return []
    numeric, temporal, nominal = _profile(columns, col_types, rows)
    n = len(rows)

    def opt(kind: str, reason: str) -> Dict[str, str]:
        return {"type": kind, "label": LABELS[kind], "reason": reason}

    # One row: the answer is one or a few numbers. Only a KPI makes sense.
    if n == 1:
        return [opt("kpi", "A single value is clearest as a headline number.")] if numeric else []
    if not numeric:
        return []

    options: List[Dict[str, str]] = []
    if temporal:
        options.append(opt("line", "Shows how the value changes over time."))
        options.append(opt("area", "Emphasises the total over time."))
        options.append(opt("bar", "Compares each period side by side."))
        if len(numeric) >= 2 or nominal:
            options.append(opt("heatmap", "Shows a second grouping across periods." if nominal else "Compares several measures across periods."))
    elif nominal:
        categories = len({str(row[columns.index(nominal[0])]) for row in rows})
        options.append(opt("bar", "Compares values across categories."))
        if categories <= 6 and len(numeric) == 1:
            options.append(opt("donut", "Shows each category's share of the whole."))
            options.append(opt("pie", "Shows each category's share of the whole."))
        if len(numeric) >= 2:
            options.append(opt("scatter", "Shows how two measures relate across items."))
        if len(nominal) >= 2:
            options.append(opt("heatmap", "Shows the value for each pair of categories."))
        if categories > 6 and n >= 20:
            options.append(opt("histogram", "Shows how the values are distributed."))
    else:
        # Only numbers, several rows.
        if len(numeric) >= 2:
            options.append(opt("scatter", "Shows how two measures relate."))
        options.append(opt("histogram", "Shows how the values are distributed."))
        options.append(opt("bar", "Compares each row's value."))

    # Three by default; up to five only when the data has more to show.
    rich = len(numeric) >= 2 or (temporal and nominal) or len(nominal) >= 2
    return options[: 5 if rich else 3]


def apply_options(chart: Dict[str, Any] | None, options: List[Dict[str, str]]) -> Dict[str, Any] | None:
    """Attach the options to a chart plan, making sure the chosen type is one of them (first)."""
    if not options:
        return chart
    chart = dict(chart or {})
    chosen = chart.get("type") if chart.get("type") in {o["type"] for o in options} else options[0]["type"]
    chart["type"] = chosen
    chart["options"] = sorted(options, key=lambda o: o["type"] != chosen)
    if not chart.get("recommendation_reason"):
        chart["recommendation_reason"] = next(o["reason"] for o in options if o["type"] == chosen)
    return chart
