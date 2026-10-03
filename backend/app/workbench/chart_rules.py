"""Which chart fits which question, and whether a result actually fits the chart chosen.

The guide is what the report agent plans with; `problem()` checks a real result against it,
so an unsuitable choice is sent back to the agent before anyone sees it. The frontend
applies the same limits when a period or filter later leaves a chart too little data
(src/components/report/chartFit.js), so every panel stays readable.

Sources: the dashboard-design and dashboard-designer skills (one business question per
visual, defaults cover most needs, specialised charts only when justified), the UI UX Pro
Max chart table (when to use and when not to), and the dataviz rules used across SlayQL
(no dual axes, no pie past five parts, fold the tail into Other).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.app.workbench import insights

GUIDE = """Chart guide. Pick the chart by the job the question does; the data must fit the "needs" column.

| chart | job | needs (x, y, series, label, target are result columns) | never when |
| area | the headline trend of one measure | x = period, y; 4+ periods | fewer than 4 periods |
| line | a trend, or up to 4 groups over time | x = period, y, optional series (2-4 groups); 4+ periods | no time axis; more than 4 groups |
| streamgraph | how the mix of 3-6 groups shifts over time | x = period, series, y; 6+ periods, 3-6 groups | fewer than 6 periods |
| bar | compare a few categories | x = category, y; 2-15 categories | a time axis; shares of a whole |
| bar_h | rank items (top customers, products) | x = label, y; 3-12 rows, ordered by y | fewer than 3 rows |
| stacked_bar | parts of a total across periods or categories | x, series (2-5 values), y | one series; more than 5 parts |
| donut | share of a whole, one part dominant | x = category, y; 2-5 categories | more than 5 parts; near-equal parts |
| waffle | a share or progress, as 100 squares | x = category, y; 2-5 categories | more than 5 parts |
| treemap | share of a total across many items | x = category, y; 6-30 items | fewer than 6 items |
| sunburst | a two-level hierarchy of shares | x = parent, series = child, y; 2-8 parents, 4-60 children | one level; more than 2 levels |
| funnel | drop-off through ordered stages | x = stage, y; 3-8 stages, each no larger than the one before | stages that grow; unordered categories |
| sankey | flows from sources to targets | x = source, series = target, y; 3-40 links, source differs from target | loops; fewer than 3 links |
| heatmap | density over two dimensions (weekday x hour, period x group) | x, series, y; 16+ cells, each dimension at most 12 values | fewer than 16 cells |
| scatter | how two measures relate across entities | label, x = measure, y = measure; 15+ entities | fewer than 15 points; categories |
| boxplot | the spread of values per group (order sizes by segment) | x = group, y = one raw value per record; 2-8 groups, 5+ records each | aggregated values |
| waterfall | how each period rose or fell | x = period, y; 3-12 periods | more than 12 bars |
| bullet | actual against a target per item | x = label, y = actual, target = target column; 1-10 items | no target in the data |
| table | records a manager follows up | at most 20 rows and 6 columns | anything a chart shows better |

Rules:
- Default to area, line, bar, bar_h, stacked_bar and table. Use a specialised chart only when its job is the question.
- One question per panel. Never a dual axis; never a pie or donut past five parts.
- Choose questions that fit the data: a funnel only for a real shrinking process, a bullet only when the data holds targets,
  a scatter only with 15+ entities. If a chart type does not fit any real question, choose a different type."""

# Minimum and maximum of each shape, shared with chartFit.js.
LIMITS = {
    "area": {"periods": (4, 60)},
    "line": {"periods": (4, 60), "series": (0, 4)},
    "streamgraph": {"periods": (6, 60), "series": (3, 6)},
    "bar": {"categories": (2, 15)},
    "bar_h": {"categories": (3, 12)},
    "stacked_bar": {"categories": (2, 24), "series": (2, 5)},
    "donut": {"categories": (2, 5)},
    "waffle": {"categories": (2, 5)},
    "treemap": {"categories": (6, 30)},
    "sunburst": {"categories": (2, 8), "children": (4, 60)},
    "funnel": {"categories": (3, 8)},
    "sankey": {"links": (3, 40)},
    "heatmap": {"cells": (16, 144), "categories": (2, 12), "series": (2, 12)},
    "scatter": {"points": (15, 200)},
    "boxplot": {"categories": (2, 8), "per_group": (5, 10_000)},
    "waterfall": {"periods": (3, 12)},
    "bullet": {"categories": (1, 10)},
    "table": {"rows": (0, 20), "columns": (1, 6)},
}


def _col(columns: List[str], name: Optional[str]) -> int:
    return columns.index(name) if name and name in columns else -1


def problem(panel: Dict[str, Any], columns: List[str], rows: List[List[Any]]) -> Optional[str]:
    """Why this result does not fit its chart, or None when it does."""
    chart = panel.get("chart")
    limits = LIMITS.get(chart)
    if not limits:
        return None
    xi, yi, si = _col(columns, panel.get("x")), _col(columns, panel.get("y")), _col(columns, panel.get("series"))
    if chart == "table":
        if len(columns) > 6:
            return f"a table shows at most 6 columns; it has {len(columns)}"
        if len(rows) > 20:
            return f"a table shows at most 20 rows; it has {len(rows)}"
        return None
    if xi < 0 or yi < 0:
        return None  # missing columns are reported separately
    if not rows:
        return None  # an empty period is fine; the shape is checked on periods with data
    xs = [r[xi] for r in rows]
    distinct_x = len({str(v) for v in xs})
    distinct_s = len({str(r[si]) for r in rows}) if si >= 0 else 0

    def out_of(kind: str, value: int, noun: str) -> Optional[str]:
        low, high = limits[kind]
        if value < low:
            return f"a {chart} needs at least {low} {noun}; this result has {value}"
        if value > high:
            return f"a {chart} shows at most {high} {noun}; this result has {value}"
        return None

    if "periods" in limits:
        issue = out_of("periods", distinct_x, "periods")
        if issue:
            return issue
    if "categories" in limits:
        issue = out_of("categories", distinct_x, "categories" if chart != "funnel" else "stages")
        if issue:
            return issue
    if "series" in limits and (si >= 0 or limits["series"][0] > 0):
        issue = out_of("series", distinct_s, "groups")
        if issue:
            return issue
    if chart == "funnel":
        values = [insights.to_number(r[yi]) or 0 for r in rows]
        if any(later > earlier for earlier, later in zip(values, values[1:])):
            return "funnel stages must shrink in order; these values grow, so use bar_h"
    if chart == "sankey":
        if si < 0:
            return "a sankey needs series = the target column"
        if any(str(r[xi]) == str(r[si]) for r in rows):
            return "a sankey cannot link a node to itself"
        return out_of("links", len(rows), "links")
    if chart == "sunburst":
        if si < 0:
            return "a sunburst needs series = the child column"
        return out_of("children", len({(str(r[xi]), str(r[si])) for r in rows}), "children")
    if chart == "heatmap":
        return out_of("cells", distinct_x * max(distinct_s, 1), "cells")
    if chart == "scatter":
        return out_of("points", len(rows), "points")
    if chart == "boxplot":
        counts: Dict[str, int] = {}
        for v in xs:
            counts[str(v)] = counts.get(str(v), 0) + 1
        if min(counts.values()) < 5:
            return "a boxplot needs one raw value per record and at least 5 records per group"
    if chart == "bullet":
        ti = _col(columns, panel.get("target"))
        if ti < 0 or insights.to_number(rows[0][ti]) is None:
            return "a bullet needs target = a numeric target column"
    if chart == "donut":
        values = sorted((insights.to_number(r[yi]) or 0 for r in rows), reverse=True)
        total = sum(values) or 1
        if len(values) > 2 and values[0] / total < 0.25 and (values[0] - values[-1]) / total < 0.08:
            return "the parts are nearly equal, which a donut hides; use bar_h"
    return None
