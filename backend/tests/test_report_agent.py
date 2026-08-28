import pytest

from backend.app.workbench import report_agent


def _profile():
    return {
        "row_count": 12,
        "columns": [
            {"name": "segment", "type": "string"},
            {"name": "revenue", "type": "number"},
        ],
    }


def test_fallback_report_has_stable_sections_and_governed_widgets():
    report = report_agent.fallback_report({"title": "Revenue review", "layout": "analytical"}, _profile())

    assert report["title"] == "Revenue review"
    assert report["layout"] == "analytical"
    assert report["sections"][0]["id"] == "overview"
    widgets = report["sections"][0]["widgets"]
    assert {item["type"] for item in widgets} >= {"kpi", "chart", "table"}
    assert all(item["id"] for item in widgets)
    assert all(item["field"] in {"row_count", "segment", "revenue"} for item in widgets)
    charts = [item for item in widgets if item["type"] == "chart"]
    assert len(charts) >= 5
    assert len({item["chart_type"] for item in charts}) == len(charts)


def test_normalize_report_replaces_repeated_chart_idioms():
    candidate = {
        "sections": [{
            "widgets": [
                {"id": "a", "type": "chart", "field": "revenue", "chart_type": "bar"},
                {"id": "b", "type": "chart", "field": "revenue", "chart_type": "bar"},
                {"id": "c", "type": "chart", "field": "revenue", "chart_type": "line"},
            ],
        }],
    }
    report = report_agent.normalize_report(candidate, {}, _profile())
    charts = [item for item in report["sections"][0]["widgets"] if item["type"] == "chart"]

    assert len(charts) >= 5
    assert len({item["chart_type"] for item in charts}) == len(charts)


def test_normalize_report_drops_unsafe_fields_and_unknown_columns():
    candidate = {
        "title": "Board report",
        "layout": "not-a-layout",
        "theme": {"palette": "javascript", "density": "dense", "font": "IBM Plex Sans"},
        "sections": [{
            "id": "Overview!",
            "widgets": [
                {"id": "Revenue chart", "type": "chart", "field": "secret_column", "chart_type": "not-an-idiom", "span": 99, "config": {"x_field": "missing"}},
                {"id": "Revenue chart", "type": "unknown", "field": "revenue"},
            ],
        }],
        "ignored": "must not survive",
    }
    report = report_agent.normalize_report(candidate, {}, _profile())

    assert report["layout"] == "executive"
    assert report["theme"]["palette"] == "indigo"
    assert report["theme"]["density"] == "comfortable"
    widget = report["sections"][0]["widgets"][0]
    assert widget["field"] == "row_count"
    assert widget["chart_type"] == "bar"
    assert widget["span"] == 3
    assert "ignored" not in report
    charts = [item for item in report["sections"][0]["widgets"] if item["type"] == "chart"]
    assert len(charts) >= 5
    assert len({item["chart_type"] for item in charts}) == len(charts)


def test_normalize_report_handles_malformed_widget_span():
    report = report_agent.normalize_report(
        {"sections": [{"widgets": [{"type": "chart", "field": "revenue", "span": "wide"}]}]},
        {},
        _profile(),
    )

    assert report["sections"][0]["widgets"][0]["span"] == 1


def test_apply_operations_changes_only_allowlisted_target():
    original = report_agent.fallback_report({}, _profile())
    before_title = original["title"]
    result = report_agent.apply_operations(original, [
        {"op": "set_report", "key": "title", "value": "Updated title"},
        {"op": "set_widget", "widget_id": "chart-primary", "key": "title", "value": "Revenue by segment"},
        {"op": "set_widget", "widget_id": "chart-primary", "key": "field", "value": "secret_column"},
        {"op": "set_widget", "widget_id": "does-not-exist", "key": "title", "value": "Ignored"},
    ], _profile())

    assert before_title != result["title"]
    chart = next(item for item in result["sections"][0]["widgets"] if item["id"] == "chart-primary")
    assert chart["title"] == "Revenue by segment"
    assert chart["field"] == "revenue"


@pytest.mark.asyncio
async def test_generate_report_uses_local_fallback_without_openrouter_key(monkeypatch):
    monkeypatch.setattr(report_agent.openrouter_client, "api_key", None)
    report = await report_agent.generate_report({"title": "Fallback"}, _profile(), {"tables": {}})

    assert report["mode"] == "local_fallback"
    assert report["model"] == report_agent.REPORT_MODEL
    assert report["data_profile"] == _profile()
