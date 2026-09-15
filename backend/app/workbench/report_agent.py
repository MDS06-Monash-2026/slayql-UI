"""Structured PowerBI-style report generation and targeted editing."""

from __future__ import annotations

import json
import re
from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional

from backend.app.providers.openrouter_client import ProviderError, openrouter_client
from backend.app.config import settings
from backend.app.workbench.gemini_agent import CHART_IDIOMS, summarize_result
from backend.app.workbench.report_pipeline import (
    build_pipeline_context,
    chart_is_compatible,
    field_roles,
    recommended_chart,
    UNSUPPORTED_HIERARCHY_IDIOMS,
    validate_report_structure,
)


REPORT_MODEL = settings.REPORT_MODEL or "moonshotai/kimi-k3"
ALLOWED_LAYOUTS = {"executive", "analytical", "story"}
ALLOWED_WIDGET_TYPES = {"kpi", "chart", "table", "text"}
ALLOWED_PALETTES = {"indigo", "emerald", "sunset"}
ALLOWED_DENSITIES = {"comfortable", "compact"}
ALLOWED_FONTS = {"Inter", "IBM Plex Sans", "Source Sans 3", "system-ui"}
ALLOWED_IDIOMS = {item[0] for item in CHART_IDIOMS}
# Kept for backwards compatibility with callers that import this module. Chart
# choice is now driven by topic/data compatibility instead of forced variety.
VARIETY_IDIOMS = ("bar", "line", "area", "scatter", "donut")


def _slug(value: str, fallback: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").casefold()).strip("-")
    return text[:48] or fallback


def _columns(profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [item for item in profile.get("columns", []) if isinstance(item, dict) and item.get("name")]


def _numeric_fields(profile: Dict[str, Any]) -> List[str]:
    return list(field_roles(profile)["numeric"])


def _dimension_fields(profile: Dict[str, Any]) -> List[str]:
    roles = field_roles(profile)
    return roles["dimensions"] or roles["temporal"]


def _safe_span(value: Any) -> int:
    try:
        return max(1, min(int(value or 1), 3))
    except (TypeError, ValueError):
        return 1


def _chart_widget(index: int, idiom: str, metric: Optional[str], dimension: Optional[str]) -> Dict[str, Any]:
    field = metric or dimension or "row_count"
    x_field = dimension or metric or "row_count"
    label_field = metric or dimension or "result"
    return {
        "id": "chart-primary" if index == 0 else f"chart-{index + 1}",
        "type": "chart",
        "title": f"{label_field.replace('_', ' ').title()} {('by ' + dimension.replace('_', ' ').title()) if dimension and metric else 'overview'}",
        "field": field,
        "chart_type": idiom,
        "span": 2 if idiom in {"bar", "line", "area"} else 1,
        "config": {"x_field": x_field, "y_fields": [metric] if metric else []},
    }


MIN_CHARTS = 10
CHART_BUILD_ORDER = (
    "line", "bar", "grouped_bar", "stacked_bar", "area", "scatter",
    "histogram", "boxplot", "heatmap", "donut", "treemap", "waterfall",
    "funnel", "small_multiples", "lollipop",
)


def _chart_binding(idiom: str, profile: Dict[str, Any], metric: Optional[str], dimension: Optional[str]) -> Dict[str, Any]:
    roles = field_roles(profile)
    numeric = roles["numeric"]
    dimensions = roles["dimensions"] or roles["temporal"]
    temporal = roles["temporal"]
    x_field = temporal[0] if idiom in {"line", "multi_line", "area", "stacked_area", "streamgraph", "sparkline", "step"} and temporal else dimension or dimensions[0] if dimensions else metric or "row_count"
    if idiom in {"scatter", "bubble", "connected_scatter"} and numeric:
        x_field = numeric[0]
    if idiom in {"heatmap", "calendar_heatmap", "mosaic"} and dimensions:
        x_field = dimensions[0]
    y_field = numeric[0] if numeric else metric or "row_count"
    y_fields = [y_field]
    if idiom in {"scatter", "bubble", "connected_scatter"} and len(numeric) > 1:
        y_field = numeric[1]
        y_fields = [y_field]
    if idiom in {"heatmap", "calendar_heatmap", "mosaic"} and len(dimensions) > 1:
        y_field = numeric[0] if numeric else dimensions[1]
        y_fields = [y_field]
    return {"x_field": x_field, "y_fields": y_fields, "purpose": "report_insight"}


def _existing_chart_ids(report: Dict[str, Any]) -> set[str]:
    return {
        str(widget.get("id"))
        for section in report.get("sections", [])
        for widget in section.get("widgets", [])
        if isinstance(widget, dict) and widget.get("type") == "chart"
    }


def ensure_minimum_charts(report: Dict[str, Any], profile: Dict[str, Any], minimum: int = MIN_CHARTS) -> Dict[str, Any]:
    """Fill the report with distinct, field-compatible chart proposals."""
    sections = report.setdefault("sections", [])
    if not sections:
        sections.append({"id": "insights", "title": "Insights", "layout": "grid", "widgets": []})
    section = sections[0]
    widgets = section.setdefault("widgets", [])
    metric = next(iter(field_roles(profile)["numeric"]), None)
    roles = field_roles(profile)
    dimension = next(iter(roles["dimensions"] or roles["temporal"]), None)
    used_types = {str(widget.get("chart_type")) for widget in widgets if widget.get("type") == "chart"}
    next_index = len(widgets) + 1
    for idiom in CHART_BUILD_ORDER:
        if len([w for w in widgets if w.get("type") == "chart"]) >= minimum:
            break
        if idiom in used_types or idiom not in ALLOWED_IDIOMS:
            continue
        binding = _chart_binding(idiom, profile, metric, dimension)
        if not chart_is_compatible(idiom, profile, binding["x_field"], binding["y_fields"]):
            continue
        widget = _chart_widget(next_index, idiom, metric, dimension)
        widget["id"] = f"insight-{idiom}-{next_index}"
        widget["config"].update(binding)
        widget["title"] = f"{idiom.replace('_', ' ').title()} insight"
        widgets.append(widget)
        used_types.add(idiom)
        next_index += 1
    return report


def _ensure_chart_variety(report: Dict[str, Any], profile: Dict[str, Any]) -> None:
    """Legacy no-op retained for compatibility.

    Reports should not gain arbitrary charts merely to look varied. The
    pipeline chooses a chart for the analytical purpose and available fields.
    """
    return


def fallback_report(preference: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    numeric = _numeric_fields(profile)
    dimensions = _dimension_fields(profile)
    metric = numeric[0] if numeric else None
    dimension = dimensions[0] if dimensions else None
    widgets = [
        {"id": "kpi-rows", "type": "kpi", "title": "Rows analyzed", "field": "row_count", "chart_type": "kpi", "span": 1, "config": {"format": "number"}},
    ]
    if metric:
        widgets.append({"id": f"kpi-{_slug(metric, 'metric')}", "type": "kpi", "title": metric.replace("_", " ").title(), "field": metric, "chart_type": "kpi", "span": 1, "config": {"format": "number"}})
    if metric and dimension:
        widgets.append(_chart_widget(0, "line" if dimension.lower() in {"date", "month", "week", "year"} else "bar", metric, dimension))
    widgets.append({"id": "table-detail", "type": "table", "title": "Detail view", "field": dimension or "row_count", "chart_type": "table", "span": 3, "config": {"page_size": 10}})
    report = {
        "version": 1,
        "id": "report-analytics-briefing",
        "title": preference.get("title") or "Analytics briefing",
        "subtitle": "AI-curated business performance report",
        "narrative": "A governed report generated from the bounded SQL result and its aggregate profile.",
        "layout": preference.get("layout") if preference.get("layout") in ALLOWED_LAYOUTS else "executive",
        "theme": {
            "palette": preference.get("palette") if preference.get("palette") in ALLOWED_PALETTES else "indigo",
            "font": preference.get("font") if preference.get("font") in ALLOWED_FONTS else "Inter",
            "density": preference.get("density") if preference.get("density") in ALLOWED_DENSITIES else "comfortable",
        },
        "sections": [{"id": "overview", "title": "Overview", "layout": "grid", "widgets": widgets}],
        "data_profile": profile,
        "model": REPORT_MODEL,
        "mode": "local_fallback",
    }
    return ensure_minimum_charts(report, profile)


def _extract_json(text: str) -> Dict[str, Any]:
    cleaned = str(text or "").strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.DOTALL | re.IGNORECASE)
    if fenced:
        cleaned = fenced.group(1)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("The report agent returned no JSON document.")
    value = json.loads(cleaned[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError("The report agent returned an invalid document.")
    return value


def _normalize_widget(widget: Dict[str, Any], index: int, profile: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not isinstance(widget, dict):
        return None
    fields = {item["name"] for item in _columns(profile)} | {"row_count"}
    widget_type = str(widget.get("type") or "chart").lower()
    if widget_type not in ALLOWED_WIDGET_TYPES:
        return None
    field = str(widget.get("field") or "row_count")
    if field not in fields:
        field = "row_count"
    if widget_type == "kpi" and field != "row_count" and field not in field_roles(profile)["numeric"]:
        field = next(iter(field_roles(profile)["numeric"]), "row_count")
    chart_type = str(widget.get("chart_type") or ("kpi" if widget_type == "kpi" else "bar"))
    if widget_type == "table":
        chart_type = "table"
    elif widget_type == "kpi":
        chart_type = "kpi"
    elif chart_type not in ALLOWED_IDIOMS or chart_type in UNSUPPORTED_HIERARCHY_IDIOMS:
        chart_type = "bar"
    config = widget.get("config") if isinstance(widget.get("config"), dict) else {}
    x_field = str(config.get("x_field") or "")
    if x_field not in fields:
        roles = field_roles(profile)
        x_field = next((name for name in roles["temporal"] + roles["dimensions"] if name != field), next(iter(roles["numeric"]), field))
    y_fields = [str(item) for item in config.get("y_fields", []) if str(item) in fields][:4]
    if field != "row_count" and field not in y_fields:
        y_fields.insert(0, field)
    if widget_type == "chart" and not chart_is_compatible(chart_type, profile, x_field, y_fields or [field]):
        chart_type = recommended_chart(profile, str(config.get("purpose") or "compare_categories"))
        if chart_type == "kpi":
            widget_type = "kpi"
            field = next(iter(field_roles(profile)["numeric"]), "row_count")
            y_fields = [field] if field != "row_count" else []
        roles = field_roles(profile)
        safe_binding = _chart_binding(chart_type, profile, next(iter(roles["numeric"]), None), next(iter(roles["dimensions"] or roles["temporal"]), None))
        x_field = safe_binding["x_field"]
        y_fields = safe_binding["y_fields"]
        field = y_fields[0] if y_fields else field
    return {
        "id": _slug(widget.get("id"), f"widget-{index + 1}"),
        "type": widget_type,
        "title": str(widget.get("title") or f"Widget {index + 1}")[:120],
        "field": field,
        "chart_type": chart_type,
        "span": _safe_span(widget.get("span", 1)),
        "config": {"x_field": x_field, "y_fields": y_fields, "format": str(config.get("format") or "number")[:30]},
    }


def normalize_report(candidate: Dict[str, Any], preference: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    fallback = fallback_report(preference, profile)
    report = deepcopy(fallback)
    report.update({key: candidate[key] for key in ("id", "title", "subtitle", "narrative") if candidate.get(key)})
    report["layout"] = candidate.get("layout") if candidate.get("layout") in ALLOWED_LAYOUTS else fallback["layout"]
    raw_theme = candidate.get("theme") if isinstance(candidate.get("theme"), dict) else {}
    report["theme"].update({key: raw_theme[key] for key in ("palette", "font", "density") if raw_theme.get(key)})
    if report["theme"]["palette"] not in ALLOWED_PALETTES:
        report["theme"]["palette"] = fallback["theme"]["palette"]
    if report["theme"]["density"] not in ALLOWED_DENSITIES:
        report["theme"]["density"] = fallback["theme"]["density"]
    if report["theme"]["font"] not in ALLOWED_FONTS:
        report["theme"]["font"] = fallback["theme"]["font"]
    sections = []
    raw_sections = candidate.get("sections") if isinstance(candidate.get("sections"), list) else []
    for section_index, raw_section in enumerate(raw_sections[:4]):
        if not isinstance(raw_section, dict):
            continue
        widgets = []
        raw_widgets = raw_section.get("widgets") if isinstance(raw_section.get("widgets"), list) else []
        for index, widget in enumerate(raw_widgets[:8]):
            normalized = _normalize_widget(widget, index, profile)
            if normalized and normalized["id"] not in {item["id"] for item in widgets}:
                widgets.append(normalized)
        if widgets:
            # Keep scorecards at the top so the UI can render them as one
            # stable executive row before analytical content begins.
            widgets.sort(key=lambda item: 0 if item.get("type") == "kpi" else 1)
            kpis = [item for item in widgets if item.get("type") == "kpi"][:4]
            widgets = kpis + [item for item in widgets if item.get("type") != "kpi"]
            sections.append({"id": _slug(raw_section.get("id"), f"section-{section_index + 1}"), "title": str(raw_section.get("title") or "Analysis")[:100], "layout": "full" if raw_section.get("layout") == "full" else "grid", "widgets": widgets})
    if sections:
        report["sections"] = sections
    report["data_profile"] = profile
    return ensure_minimum_charts(report, profile)


async def _complete_json(system: str, prompt: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
    if not openrouter_client.api_key:
        return fallback
    messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    content = []
    try:
        async for event in openrouter_client._stream_completion(
            requested_model_id=REPORT_MODEL,
            messages=messages,
            session_id=None,
            max_tokens=3500,
            reasoning_effort="minimal",
            fallback_text="",
            use_requested_model=True,
        ):
            if event.get("type") == "content_delta":
                content.append(event.get("delta", ""))
        return _extract_json("".join(content))
    except Exception:
        return fallback


async def review_report_charts(report: Dict[str, Any], profile: Dict[str, Any], pipeline: Dict[str, Any]) -> Dict[str, Any]:
    """Ask a second model pass to review usefulness and duplication."""
    chart_widgets = [
        {
            "id": widget.get("id"),
            "chart_type": widget.get("chart_type"),
            "title": widget.get("title"),
            "field": widget.get("field"),
            "config": widget.get("config", {}),
        }
        for section in report.get("sections", [])
        for widget in section.get("widgets", [])
        if isinstance(widget, dict) and widget.get("type") == "chart"
    ]
    fallback = {
        "approved_widget_ids": [item["id"] for item in chart_widgets],
        "rejected_widget_ids": [],
        "replacement_chart_ids": [],
        "issues": [],
    }
    prompt = json.dumps({"charts": chart_widgets, "profile": profile, "pipeline": pipeline}, ensure_ascii=True, default=str)
    system = (
        "You are the report quality reviewer. Return only JSON with approved_widget_ids, rejected_widget_ids, "
        "replacement_chart_ids and issues. Review whether every chart answers a useful business question, has valid "
        "field bindings, is distinct enough from other charts, and is readable in its slot. Reject decorative, "
        "duplicated or analytically incompatible charts. Preserve at least ten useful charts when the data supports "
        "them; suggest registry chart IDs for replacements. Never emit HTML, CSS, JavaScript, SQL or Vega-Lite code."
    )
    return await _complete_json(system, prompt, fallback)


def apply_chart_review(report: Dict[str, Any], review: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    """Apply only safe reviewer decisions and record unresolved quality issues."""
    rejected = {str(item) for item in review.get("rejected_widget_ids", []) if isinstance(item, str)}
    if not rejected:
        return report
    chart_count = sum(1 for section in report.get("sections", []) for widget in section.get("widgets", []) if widget.get("type") == "chart")
    for section in report.get("sections", []):
        kept = []
        for widget in section.get("widgets", []):
            if widget.get("type") == "chart" and widget.get("id") in rejected and chart_count > MIN_CHARTS:
                continue
            kept.append(widget)
        section["widgets"] = kept
    return report


async def generate_report(preference: Dict[str, Any], profile: Dict[str, Any], catalog: Dict[str, Any]) -> Dict[str, Any]:
    fallback = fallback_report(preference, profile)
    question = str(preference.get("question") or preference.get("title") or "")
    pipeline = build_pipeline_context(question, preference, profile, catalog)
    prompt = json.dumps({"preferences": preference, "catalog": catalog, "result_profile": profile, "pipeline": pipeline, "fallback_report": fallback}, ensure_ascii=True, default=str)
    system = "You are the report composer in a governed multi-stage analytics pipeline. Return only JSON for a report document. Use the supplied topic_tasks to cover relevant topics, but create only evidence-supported widgets. Select chart types from chart_registry and bind real fields. Create at least ten distinct, meaningful chart widgets when the available fields support them; use different analytical purposes and never add a chart solely for decoration. Create 1-4 KPI cards, a detail or exception table when useful, and a concise narrative. Use stable IDs. Never emit HTML, CSS, JavaScript, SQL, markdown, or claims unsupported by the result profile. Valid types are kpi, chart, table, text; valid layouts are executive, analytical, story."
    candidate = await _complete_json(system, prompt, fallback)
    report = normalize_report(candidate, preference, profile)
    report["pipeline"] = pipeline
    review = await review_report_charts(report, profile, pipeline)
    report = apply_chart_review(report, review, profile)
    report["chart_review"] = review
    issues = validate_report_structure(report, profile)
    remaining_ids = {str(widget.get("id")) for section in report.get("sections", []) for widget in section.get("widgets", []) if widget.get("type") == "chart"}
    retained_rejections = [item for item in review.get("rejected_widget_ids", []) if str(item) in remaining_ids]
    if retained_rejections:
        issues.append({"code": "CHART_REVIEW_REJECTED", "message": "The reviewer rejected charts that could not be removed while preserving the ten-chart minimum."})
    issues.extend(
        {"code": "CHART_REVIEW", "message": str(item)[:240]}
        for item in review.get("issues", [])
        if isinstance(item, (str, dict))
    )
    chart_count = sum(1 for section in report.get("sections", []) for widget in section.get("widgets", []) if widget.get("type") == "chart")
    if chart_count < MIN_CHARTS:
        issues.append({"code": "MINIMUM_CHARTS_UNAVAILABLE", "message": f"Only {chart_count} compatible charts could be generated from the available fields; {MIN_CHARTS} are required."})
    report["validation"] = {"status": "passed" if not issues else "review", "issues": issues}
    report.update({"model": REPORT_MODEL, "mode": "openrouter" if candidate is not fallback else "local_fallback"})
    return report


def _find_widget(report: Dict[str, Any], widget_id: str) -> Optional[Dict[str, Any]]:
    for section in report.get("sections", []):
        for widget in section.get("widgets", []):
            if widget.get("id") == widget_id:
                return widget
    return None


def apply_operations(
    report: Dict[str, Any],
    operations: Iterable[Dict[str, Any]],
    profile: Dict[str, Any],
    selected_widget_id: Optional[str] = None,
) -> Dict[str, Any]:
    updated = deepcopy(report)
    fields = {item["name"] for item in _columns(profile)} | {"row_count"}
    for operation in list(operations)[:10]:
        if not isinstance(operation, dict) or operation.get("op") not in {"set_report", "set_widget", "add_widget", "remove_widget"}:
            continue
        op = operation["op"]
        if op == "set_report":
            key = operation.get("key")
            if key in {"title", "subtitle", "narrative"} and isinstance(operation.get("value"), str):
                updated[key] = operation["value"][:500]
            elif key == "layout" and operation.get("value") in ALLOWED_LAYOUTS:
                updated[key] = operation["value"]
            elif key in {"palette", "density"} and operation.get("value") in (ALLOWED_PALETTES if key == "palette" else ALLOWED_DENSITIES):
                updated["theme"][key] = operation["value"]
            continue
        if op == "set_widget":
            target_id = str(operation.get("widget_id") or "")
            if selected_widget_id and target_id != selected_widget_id:
                continue
            widget = _find_widget(updated, target_id)
            if not widget:
                continue
            key, value = operation.get("key"), operation.get("value")
            if key == "title" and isinstance(value, str):
                widget["title"] = value[:120]
            elif key == "field" and value in fields:
                widget["field"] = value
            elif key == "chart_type" and value in ALLOWED_IDIOMS:
                widget["chart_type"] = value
            elif key == "span" and isinstance(value, int):
                widget["span"] = max(1, min(value, 3))
            elif key == "x_field" and value in fields:
                widget.setdefault("config", {})["x_field"] = value
            continue
        if op == "remove_widget":
            widget_id = str(operation.get("widget_id") or "")
            for section in updated.get("sections", []):
                section["widgets"] = [widget for widget in section.get("widgets", []) if widget.get("id") != widget_id]
            continue
        if op == "add_widget":
            section = next((item for item in updated.get("sections", []) if item.get("id") == operation.get("section_id")), None)
            widget = _normalize_widget(operation.get("widget") or {}, 99, profile)
            if section and widget and not _find_widget(updated, widget["id"]):
                section["widgets"].append(widget)
    pipeline = updated.get("pipeline")
    normalized = normalize_report(updated, updated.get("theme", {}), profile)
    if pipeline:
        normalized["pipeline"] = pipeline
    return normalized


async def edit_report(report: Dict[str, Any], instruction: str, selected_widget_id: Optional[str], profile: Dict[str, Any]) -> Dict[str, Any]:
    fallback_operations = [{"op": "set_report", "key": "narrative", "value": f"Updated report guidance: {instruction[:300]}"}]
    prompt = json.dumps({"instruction": instruction, "selected_widget_id": selected_widget_id, "report": report, "result_profile": profile}, ensure_ascii=True, default=str)
    system = "You edit a Power BI-style report document. Return only JSON with message and operations. Use at most 10 allowlisted operations: set_report(key title|subtitle|narrative|layout|palette|density, value), set_widget(widget_id, key title|field|chart_type|span|x_field, value), add_widget(section_id, widget), remove_widget(widget_id). Target the selected widget when relevant. Never return HTML, CSS, JavaScript, SQL, arbitrary paths, or unknown IDs."
    fallback = {"message": "Applied a safe report note.", "operations": fallback_operations}
    candidate = await _complete_json(system, prompt, fallback)
    operations = candidate.get("operations") if isinstance(candidate.get("operations"), list) else fallback_operations
    updated = apply_operations(report, operations, profile, selected_widget_id)
    review = await review_report_charts(updated, profile, updated.get("pipeline", {}))
    updated = apply_chart_review(updated, review, profile)
    updated["chart_review"] = review
    validation = validate_report_structure(updated, profile)
    remaining_ids = {str(widget.get("id")) for section in updated.get("sections", []) for widget in section.get("widgets", []) if widget.get("type") == "chart"}
    if any(str(item) in remaining_ids for item in review.get("rejected_widget_ids", [])):
        validation.append({"code": "CHART_REVIEW_REJECTED", "message": "The reviewer rejected charts that could not be removed while preserving the ten-chart minimum."})
    chart_count = sum(1 for section in updated.get("sections", []) for widget in section.get("widgets", []) if widget.get("type") == "chart")
    if chart_count < MIN_CHARTS:
        validation.append({"code": "MINIMUM_CHARTS_UNAVAILABLE", "message": f"Only {chart_count} compatible charts remain after this edit; {MIN_CHARTS} are required."})
    updated["validation"] = {"status": "passed" if not validation else "review", "issues": validation}
    return {"report": updated, "message": str(candidate.get("message") or "Report updated.")[:500], "model": REPORT_MODEL, "mode": "openrouter" if candidate is not fallback else "local_fallback", "operations_applied": operations[:10]}
