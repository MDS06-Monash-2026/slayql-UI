"""Bounded report planning, chart selection, and structure validation.

The LLM proposes a report plan, while this module provides deterministic
capability rules.  It deliberately returns configuration data rather than
HTML or executable Vega expressions.
"""

from __future__ import annotations

import re
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


CHART_REGISTRY: Dict[str, Dict[str, Any]] = {
    "line": {"family": "trend", "purpose": "trend_over_time", "needs": ("temporal", "numeric")},
    "bar": {"family": "comparison", "purpose": "compare_categories", "needs": ("dimension", "numeric")},
    "grouped_bar": {"family": "comparison", "purpose": "compare_categories", "needs": ("dimension", "numeric")},
    "stacked_bar": {"family": "composition", "purpose": "part_to_whole", "needs": ("dimension", "numeric")},
    "area": {"family": "trend", "purpose": "trend_over_time", "needs": ("temporal", "numeric")},
    "scatter": {"family": "relationship", "purpose": "relationship", "needs": ("numeric_pair",)},
    "histogram": {"family": "distribution", "purpose": "distribution", "needs": ("numeric",)},
    "boxplot": {"family": "distribution", "purpose": "distribution_by_group", "needs": ("dimension", "numeric")},
    "heatmap": {"family": "pattern", "purpose": "matrix_pattern", "needs": ("dimension_pair", "numeric")},
    "donut": {"family": "composition", "purpose": "part_to_whole", "needs": ("dimension", "numeric")},
    # A treemap needs a real hierarchy (two categorical levels). A single
    # category plus a measure is a bar chart and must never be labelled a
    # treemap by the composer.
    "treemap": {"family": "hierarchy", "purpose": "hierarchy", "needs": ("dimension_pair", "numeric")},
    "waterfall": {"family": "change", "purpose": "bridge_change", "needs": ("dimension", "numeric")},
    "funnel": {"family": "flow", "purpose": "stage_conversion", "needs": ("dimension", "numeric")},
    "small_multiples": {"family": "comparison", "purpose": "faceted_comparison", "needs": ("dimension_pair", "numeric")},
    "kpi": {"family": "summary", "purpose": "single_value", "needs": ("numeric",)},
}

# These require a dedicated Vega/Vega renderer to be truthful. Until that
# renderer exists, they are deliberately rejected and replaced with a chart
# whose marks match what the user sees.
UNSUPPORTED_HIERARCHY_IDIOMS = {"treemap", "sunburst", "circle_packing"}

# The renderer already supports a wider vocabulary. Register those idioms so
# the composer can request them, while using conservative field requirements.
_EXTRA_CHARTS = {
    "normalized_bar": ("composition", "part_to_whole"), "diverging_bar": ("comparison", "compare_categories"),
    "lollipop": ("comparison", "compare_categories"), "dot_plot": ("comparison", "compare_categories"),
    "bullet": ("performance", "target_comparison"), "radial_bar": ("comparison", "compare_categories"),
    "multi_line": ("trend", "trend_over_time"), "step": ("trend", "trend_over_time"),
    "slope": ("change", "compare_periods"), "bump": ("ranking", "rank_over_time"),
    "stacked_area": ("composition", "trend_over_time"), "streamgraph": ("composition", "trend_over_time"),
    "horizon": ("trend", "trend_over_time"), "sparkline": ("trend", "trend_over_time"),
    "connected_scatter": ("relationship", "relationship"), "bubble": ("relationship", "relationship"),
    "hexbin": ("distribution", "relationship"), "density": ("distribution", "distribution"),
    "violin": ("distribution", "distribution_by_group"), "strip": ("distribution", "distribution_by_group"),
    "beeswarm": ("distribution", "distribution_by_group"), "calendar_heatmap": ("pattern", "matrix_pattern"),
    "correlation_matrix": ("pattern", "matrix_pattern"), "mosaic": ("composition", "part_to_whole"),
    "pie": ("composition", "part_to_whole"), "sunburst": ("hierarchy", "hierarchy"),
    "circle_packing": ("hierarchy", "hierarchy"), "radar": ("multivariate", "compare_categories"),
    "parallel_coordinates": ("multivariate", "relationship"), "ridgeline": ("distribution", "distribution_by_group"),
    "gantt": ("schedule", "schedule"), "timeline": ("events", "events"),
    "sankey": ("flow", "flow"), "chord": ("relationships", "relationship"), "network": ("relationships", "relationship"),
}
for _chart_id, (_family, _purpose) in _EXTRA_CHARTS.items():
    CHART_REGISTRY.setdefault(_chart_id, {"family": _family, "purpose": _purpose, "needs": ("dimension", "numeric")})


def load_report_skills() -> str:
    """Load the repository report contract when available.

    The markdown is guidance for the composer. Enforcement remains in the
    registry and validators below so a missing or edited file cannot bypass
    safety checks.
    """
    path = Path(__file__).resolve().parents[3] / "docs" / "REPORT_SKILLS.md"
    try:
        return path.read_text(encoding="utf-8")[:16000]
    except OSError:
        return ""

_TIME_RE = re.compile(r"(date|time|day|week|month|quarter|year|period|created|updated)", re.I)
_ID_RE = re.compile(r"(^|_)(id|key|code)$|(^|_)(id|key|code)(_|$)", re.I)


def is_identifier_field(name: str) -> bool:
    """Return true for surrogate/foreign-key fields unsuitable as measures."""
    return bool(_ID_RE.search(str(name)))


def field_roles(profile: Dict[str, Any]) -> Dict[str, List[str]]:
    numeric: List[str] = []
    temporal: List[str] = []
    dimensions: List[str] = []
    for item in profile.get("columns", []):
        if not isinstance(item, dict) or not item.get("name"):
            continue
        name = str(item["name"])
        kind = str(item.get("type") or "").lower()
        # Numeric IDs (department_id, customer_key, etc.) are identifiers,
        # even when the database reports them as integers. Plotting them as a
        # measure creates misleading charts such as department name by ID.
        if is_identifier_field(name):
            continue
        if kind in {"number", "numeric", "integer", "float", "decimal"} or "average" in item:
            numeric.append(name)
        elif kind in {"date", "datetime", "timestamp", "temporal"} or _TIME_RE.search(name):
            temporal.append(name)
        elif not _ID_RE.search(name):
            dimensions.append(name)
    return {"numeric": numeric, "temporal": temporal, "dimensions": dimensions}


def plan_topics(question: str, profile: Dict[str, Any], preference: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Create bounded specialist tasks from one business request.

    This is intentionally deterministic. A future LLM planner can enrich the
    labels, but the backend still caps and validates the resulting tasks.
    """
    text = f"{question or ''} {str((preference or {}).get('title') or '')}".lower()
    roles = field_roles(profile)
    tasks: List[Dict[str, Any]] = []

    def add(topic: str, purpose: str, chart: str) -> None:
        if len(tasks) >= 5 or any(t["topic"] == topic for t in tasks):
            return
        tasks.append({"topic": topic, "purpose": purpose, "recommended_chart": chart})

    if any(word in text for word in ("trend", "over time", "monthly", "weekly", "daily", "growth")) and roles["temporal"] and roles["numeric"]:
        add("trend", "show_change_over_time", "line")
    if any(word in text for word in ("branch", "customer", "product", "category", "compare", "top", "ranking", "performance")) and roles["dimensions"] and roles["numeric"]:
        add("comparison", "compare_categories", "bar")
    if any(word in text for word in ("distribution", "spread", "variation", "relationship", "correlation")) and len(roles["numeric"]) >= 2:
        add("relationship", "inspect_numeric_relationship", "scatter")
    if any(word in text for word in ("share", "mix", "composition", "contribution")) and roles["dimensions"] and roles["numeric"]:
        add("composition", "show_part_to_whole", "bar")
    if any(word in text for word in ("overdue", "receivable", "collection", "invoice", "exception", "problem", "risk")):
        add("exceptions", "surface_actionable_records", "bar" if roles["dimensions"] and roles["numeric"] else "table")

    if not tasks:
        if roles["temporal"] and roles["numeric"]:
            add("overview_trend", "show_change_over_time", "line")
        if roles["dimensions"] and roles["numeric"]:
            add("overview_comparison", "compare_categories", "bar")
        if not tasks and roles["numeric"]:
            add("overview_summary", "summarize_numeric_measure", "kpi")
    return tasks[:5]


def chart_is_compatible(chart_id: str, profile: Dict[str, Any], x_field: Optional[str] = None, y_fields: Optional[Iterable[str]] = None) -> bool:
    if chart_id in UNSUPPORTED_HIERARCHY_IDIOMS:
        return False
    definition = CHART_REGISTRY.get(chart_id)
    if not definition:
        return False
    roles = field_roles(profile)
    fields = {str(item.get("name")) for item in profile.get("columns", []) if isinstance(item, dict) and item.get("name")}
    x = x_field if x_field in fields else None
    ys = [field for field in (y_fields or []) if field in fields]
    numeric_y = [field for field in ys if field in roles["numeric"]]
    needs = definition["needs"]
    # Explicit bindings must pass exact role checks. Falling back to “some
    # dimension exists somewhere” allowed unrelated ID/name pairs through.
    if "numeric" in needs and not (numeric_y or roles["numeric"]):
        return False
    if "numeric" in needs and ys and any(field not in roles["numeric"] for field in ys):
        return False
    if "temporal" in needs and x_field and x not in roles["temporal"]:
        return False
    if "temporal" in needs and not x_field and not roles["temporal"]:
        return False
    if "dimension" in needs and x_field and x not in roles["dimensions"]:
        return False
    if "dimension" in needs and not x_field and not roles["dimensions"]:
        return False
    if "numeric_pair" in needs and len(numeric_y or roles["numeric"]) < 2:
        return False
    if "dimension_pair" in needs and len(roles["dimensions"]) + len(roles["temporal"]) < 2:
        return False
    if "dimension_pair" in needs and x_field and x not in (roles["dimensions"] + roles["temporal"]):
        return False
    return True


def recommended_chart(profile: Dict[str, Any], purpose: str = "compare_categories") -> str:
    roles = field_roles(profile)
    if purpose == "show_change_over_time" and roles["temporal"] and roles["numeric"]:
        return "line"
    if purpose == "inspect_numeric_relationship" and len(roles["numeric"]) >= 2:
        return "scatter"
    if purpose == "summarize_numeric_measure" and roles["numeric"]:
        return "kpi"
    if purpose == "surface_actionable_records":
        return "bar" if roles["dimensions"] and roles["numeric"] else "table"
    if roles["dimensions"] and roles["numeric"]:
        return "bar"
    if roles["temporal"] and roles["numeric"]:
        return "line"
    return "kpi" if roles["numeric"] else "table"


def validate_report_structure(report: Dict[str, Any], profile: Dict[str, Any]) -> List[Dict[str, str]]:
    issues: List[Dict[str, str]] = []
    if report.get("layout") not in {"executive", "analytical", "story"}:
        issues.append({"code": "INVALID_LAYOUT", "message": "Report layout is unsupported."})
    sections = report.get("sections") if isinstance(report.get("sections"), list) else []
    if not sections:
        issues.append({"code": "NO_SECTIONS", "message": "Report has no sections."})
    seen: set[str] = set()
    for section in sections:
        widgets = section.get("widgets") if isinstance(section, dict) else []
        for widget in widgets if isinstance(widgets, list) else []:
            widget_id = str(widget.get("id") or "")
            if not widget_id or widget_id in seen:
                issues.append({"code": "DUPLICATE_WIDGET_ID", "message": "Every widget needs a unique stable ID."})
            seen.add(widget_id)
            if not 1 <= int(widget.get("span", 1) or 1) <= 3:
                issues.append({"code": "INVALID_SPAN", "message": f"Widget {widget_id} has an invalid grid span."})
            if widget.get("type") == "chart":
                chart = str(widget.get("chart_type") or "")
                config = widget.get("config") if isinstance(widget.get("config"), dict) else {}
                if not chart_is_compatible(chart, profile, config.get("x_field"), config.get("y_fields")):
                    issues.append({"code": "INCOMPATIBLE_CHART", "message": f"Chart {widget_id} is incompatible with the available fields."})
                if chart in {"treemap", "sunburst", "circle_packing"}:
                    issues.append({"code": "UNSUPPORTED_HIERARCHY_RENDERER", "message": f"Chart {widget_id} uses a hierarchy idiom without a true hierarchy renderer."})
    return issues


def build_pipeline_context(question: str, preference: Dict[str, Any], profile: Dict[str, Any], catalog: Dict[str, Any]) -> Dict[str, Any]:
    tasks = plan_topics(question or str(preference.get("title") or ""), profile, preference)
    return {
        "stages": ["planner", "metadata", "query_plan", "topic_analysis", "chart_selection", "composition", "validation"],
        "topic_tasks": tasks,
        "field_roles": field_roles(profile),
        "chart_registry": [chart_id for chart_id in CHART_REGISTRY if chart_id not in UNSUPPORTED_HIERARCHY_IDIOMS],
        "report_skills": load_report_skills(),
        "catalog_tables": list((catalog or {}).get("tables", {}).keys())[:100],
        "limits": {"max_topics": 5, "max_widgets_per_section": 8},
    }
