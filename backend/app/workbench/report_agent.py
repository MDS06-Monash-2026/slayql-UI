"""Structured PowerBI-style report generation and targeted editing."""

from __future__ import annotations

import json
import re
from copy import deepcopy
from typing import Any, Dict, Iterable, List, Optional

from backend.app.providers.openrouter_client import ProviderError, openrouter_client
from backend.app.workbench.gemini_agent import CHART_IDIOMS, summarize_result


REPORT_MODEL = "deepseek/deepseek-v4-flash"
ALLOWED_LAYOUTS = {"executive", "analytical", "story"}
ALLOWED_WIDGET_TYPES = {"kpi", "chart", "table", "text"}
ALLOWED_PALETTES = {"indigo", "emerald", "sunset"}
ALLOWED_DENSITIES = {"comfortable", "compact"}
ALLOWED_IDIOMS = {item[0] for item in CHART_IDIOMS}


def _slug(value: str, fallback: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").casefold()).strip("-")
    return text[:48] or fallback


def _columns(profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [item for item in profile.get("columns", []) if isinstance(item, dict) and item.get("name")]


def _numeric_fields(profile: Dict[str, Any]) -> List[str]:
    return [item["name"] for item in _columns(profile) if item.get("type") == "number" or "average" in item]


def _dimension_fields(profile: Dict[str, Any]) -> List[str]:
    numeric = set(_numeric_fields(profile))
    return [item["name"] for item in _columns(profile) if item["name"] not in numeric]


def _safe_span(value: Any) -> int:
    try:
        return max(1, min(int(value or 1), 3))
    except (TypeError, ValueError):
        return 1


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
        widgets.append({"id": "chart-primary", "type": "chart", "title": f"{metric.replace('_', ' ').title()} by {dimension.replace('_', ' ').title() if dimension else 'result'}", "field": metric, "chart_type": "bar" if dimension else "line", "span": 2, "config": {"x_field": dimension or metric, "y_fields": [metric]}})
    elif dimension:
        widgets.append({"id": "chart-primary", "type": "chart", "title": f"{dimension.replace('_', ' ').title()} distribution", "field": dimension, "chart_type": "bar", "span": 2, "config": {"x_field": dimension, "y_fields": []}})
    widgets.append({"id": "table-detail", "type": "table", "title": "Detail view", "field": dimension or "row_count", "chart_type": "table", "span": 3, "config": {"page_size": 10}})
    return {
        "version": 1,
        "id": "report-analytics-briefing",
        "title": preference.get("title") or "Analytics briefing",
        "subtitle": "AI-curated business performance report",
        "narrative": "A governed report generated from the bounded SQL result and its aggregate profile.",
        "layout": preference.get("layout") if preference.get("layout") in ALLOWED_LAYOUTS else "executive",
        "theme": {
            "palette": preference.get("palette") if preference.get("palette") in ALLOWED_PALETTES else "indigo",
            "font": preference.get("font") or "Inter",
            "density": preference.get("density") if preference.get("density") in ALLOWED_DENSITIES else "comfortable",
        },
        "sections": [{"id": "overview", "title": "Overview", "layout": "grid", "widgets": widgets}],
        "data_profile": profile,
        "model": REPORT_MODEL,
        "mode": "local_fallback",
    }


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
    chart_type = str(widget.get("chart_type") or ("kpi" if widget_type == "kpi" else "bar"))
    if widget_type == "table":
        chart_type = "table"
    elif widget_type == "kpi":
        chart_type = "kpi"
    elif chart_type not in ALLOWED_IDIOMS:
        chart_type = "bar"
    config = widget.get("config") if isinstance(widget.get("config"), dict) else {}
    x_field = str(config.get("x_field") or "")
    if x_field not in fields:
        x_field = next((name for name in fields if name != field), field)
    y_fields = [str(item) for item in config.get("y_fields", []) if str(item) in fields][:4]
    if field != "row_count" and field not in y_fields:
        y_fields.insert(0, field)
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
            sections.append({"id": _slug(raw_section.get("id"), f"section-{section_index + 1}"), "title": str(raw_section.get("title") or "Analysis")[:100], "layout": "full" if raw_section.get("layout") == "full" else "grid", "widgets": widgets})
    if sections:
        report["sections"] = sections
    report["data_profile"] = profile
    return report


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
        ):
            if event.get("type") == "content_delta":
                content.append(event.get("delta", ""))
        return _extract_json("".join(content))
    except Exception:
        return fallback


async def generate_report(preference: Dict[str, Any], profile: Dict[str, Any], catalog: Dict[str, Any]) -> Dict[str, Any]:
    fallback = fallback_report(preference, profile)
    prompt = json.dumps({"preferences": preference, "catalog": catalog, "result_profile": profile, "fallback_report": fallback}, ensure_ascii=True, default=str)
    system = "You are a senior Power BI report designer using DeepSeek. Return only JSON for a report document. Create 2-4 KPI cards, charts using only available idioms, a detail table, and a concise narrative. Use stable IDs. Never emit HTML, CSS, JavaScript, SQL, markdown, or claims unsupported by the result profile. Valid types are kpi, chart, table, text; valid layouts are executive, analytical, story."
    candidate = await _complete_json(system, prompt, fallback)
    report = normalize_report(candidate, preference, profile)
    report.update({"model": REPORT_MODEL, "mode": "openrouter" if candidate is not fallback else "local_fallback"})
    return report


def _find_widget(report: Dict[str, Any], widget_id: str) -> Optional[Dict[str, Any]]:
    for section in report.get("sections", []):
        for widget in section.get("widgets", []):
            if widget.get("id") == widget_id:
                return widget
    return None


def apply_operations(report: Dict[str, Any], operations: Iterable[Dict[str, Any]], profile: Dict[str, Any]) -> Dict[str, Any]:
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
            widget = _find_widget(updated, str(operation.get("widget_id") or ""))
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
    return normalize_report(updated, updated.get("theme", {}), profile)


async def edit_report(report: Dict[str, Any], instruction: str, selected_widget_id: Optional[str], profile: Dict[str, Any]) -> Dict[str, Any]:
    fallback_operations = [{"op": "set_report", "key": "narrative", "value": f"Updated report guidance: {instruction[:300]}"}]
    prompt = json.dumps({"instruction": instruction, "selected_widget_id": selected_widget_id, "report": report, "result_profile": profile}, ensure_ascii=True, default=str)
    system = "You edit a Power BI-style report document. Return only JSON with message and operations. Use at most 10 allowlisted operations: set_report(key title|subtitle|narrative|layout|palette|density, value), set_widget(widget_id, key title|field|chart_type|span|x_field, value), add_widget(section_id, widget), remove_widget(widget_id). Target the selected widget when relevant. Never return HTML, CSS, JavaScript, SQL, arbitrary paths, or unknown IDs."
    fallback = {"message": "Applied a safe report note.", "operations": fallback_operations}
    candidate = await _complete_json(system, prompt, fallback)
    operations = candidate.get("operations") if isinstance(candidate.get("operations"), list) else fallback_operations
    return {"report": apply_operations(report, operations, profile), "message": str(candidate.get("message") or "Report updated.")[:500], "model": REPORT_MODEL, "mode": "openrouter" if candidate is not fallback else "local_fallback", "operations_applied": operations[:10]}
