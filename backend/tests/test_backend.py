import pytest
from backend.app.config import settings
from backend.app.db.seed_demo import seed_sqlite_demo
from backend.app.catalog.discovery import CatalogService
from backend.app.agent.rbp import RBPGraphEngine
from backend.app.agent.pipeline import SlayQLPipeline
from backend.app.agent.effort import THINKING_PROFILES, get_thinking_profile
from backend.app.queries.validator import SqlValidator
from backend.app.queries.executor import QueryExecutor
from backend.app.providers.openrouter_client import ProviderError, openrouter_client
from backend.app.workbench.gemini_agent import (
    GEMINI_WORKBENCH_MODEL,
    _fallback_chat_intent,
    _fallback_sql_semantic_validation,
    chart_idiom_payload,
    gemini_workbench_agent,
    materialize_chart_recommendation,
)
from backend.app.workbench.health import inspect_sqlite_health
from backend.app.connections.runtime import connection_url
from backend.app.connections.registry import default_connection_id, get_connection, get_credentials

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    seed_sqlite_demo(settings.SQLITE_DEMO_PATH)

def test_catalog_discovery():
    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)
    assert "customers" in catalog.tables
    assert "orders" in catalog.tables
    assert "products" in catalog.tables
    assert "categories" in catalog.tables
    assert "order_items" in catalog.tables
    assert "payments" in catalog.tables
    assert "support_cases" in catalog.tables

    customers_tbl = catalog.tables["customers"]
    assert len(customers_tbl.columns) > 0
    assert customers_tbl.row_count_estimate == 60


def test_thinking_effort_profiles_scale_work_and_reasoning():
    assert list(THINKING_PROFILES) == ["minimal", "low", "medium", "high", "max"]
    minimal = get_thinking_profile("minimal")
    medium = get_thinking_profile("medium")
    maximum = get_thinking_profile("max")

    assert minimal.provider_sql_effort == "minimal"
    assert minimal.max_repair_attempts == 1
    assert minimal.use_model_intent is False
    assert minimal.use_model_semantic_validation is False
    assert minimal.use_model_chart is False
    assert minimal.use_model_answer is False
    assert medium.max_repair_attempts == 2
    assert maximum.provider_sql_effort == "xhigh"
    assert maximum.max_repair_attempts == 3
    assert maximum.sql_max_tokens > medium.sql_max_tokens > minimal.sql_max_tokens


def test_supabase_url_uses_installed_psycopg_driver():
    raw_url = "postgresql://reader:secret@db.example.supabase.co:5432/postgres?sslmode=require"
    normalized = connection_url("supabase", {"connection_string": raw_url})
    assert normalized == raw_url.replace("postgresql://", "postgresql+psycopg://", 1)


def test_database_url_is_backend_only(monkeypatch):
    raw_url = "postgresql://reader:secret@db.example.supabase.co:5432/postgres"
    monkeypatch.setattr(settings, "DATABASE_URL", raw_url)
    assert default_connection_id() is None
    assert get_connection("supabase_default") is None
    assert get_credentials("supabase_default") == {}


def test_demo_catalog_has_complex_company_scale_schema():
    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)
    assert len(catalog.tables) >= 10
    assert sum(table.row_count_estimate for table in catalog.tables.values()) >= 1000
    assert len(catalog.tables["product_suppliers"].foreign_keys) >= 2
    assert len(catalog.tables["shipment_items"].foreign_keys) >= 2


def test_workbench_visualization_registry_and_health_diagnostics():
    idioms = chart_idiom_payload()
    ids = {item["id"] for item in idioms}
    assert len(idioms) >= 50
    assert {"slope", "bump", "sankey", "parallel_coordinates", "kpi"}.issubset(ids)
    assert GEMINI_WORKBENCH_MODEL == "gemini-3.5-flash-lite"

    health = inspect_sqlite_health(settings.SQLITE_DEMO_PATH)
    assert health["integrity"] == "ok"
    assert health["table_count"] >= 10
    assert health["total_rows"] >= 1000


def test_gemini_chart_plan_is_materialized_for_the_renderer():
    chart = materialize_chart_recommendation(
        {
            "idiom": "multi_line",
            "title": "Monthly revenue",
            "reason": "The result is a time series.",
            "x_field": "month",
            "y_fields": ["revenue"],
            "model": GEMINI_WORKBENCH_MODEL,
            "mode": "gemini",
        },
        ["month", "revenue"],
        ["date", "number"],
        [["2026-01", 10], ["2026-02", 14]],
    )
    assert chart is not None
    assert chart["type"] == "line"
    assert chart["idiom"] == "multi_line"
    assert chart["metric_keys"] == ["revenue"]
    assert chart["model"] == GEMINI_WORKBENCH_MODEL


def test_chat_intent_fallback_handles_metadata_and_follow_ups():
    schema_intent = _fallback_chat_intent("What tables are in the database?", [])
    assert schema_intent["intent"] == "schema_overview"
    assert schema_intent["is_sql_query"] is False
    assert schema_intent["requires_sql"] is False

    count_intent = _fallback_chat_intent("How many total rows are in the database?", [])
    assert count_intent["intent"] == "row_count_overview"
    assert count_intent["is_sql_query"] is True
    assert count_intent["requires_sql"] is True

    dashboard_intent = _fallback_chat_intent("What kind of query is important for a dashboard?", [])
    assert dashboard_intent["intent"] == "business_guidance"
    assert dashboard_intent["is_sql_query"] is False

    specific_count = _fallback_chat_intent("How many rows are in customers?", [])
    assert specific_count["intent"] == "data_query"

    follow_up = _fallback_chat_intent(
        "Now keep only active ones",
        [{"role": "user", "content": "List customers"}],
    )
    assert follow_up["intent"] == "data_query"
    assert follow_up["is_follow_up"] is True


@pytest.mark.asyncio
async def test_row_count_metadata_sql_is_validated_and_executable():
    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)
    sql = SlayQLPipeline._row_count_sql(catalog, "sqlite")
    validation = SqlValidator.validate_and_sanitize(sql, "sqlite", catalog)
    assert validation.is_valid is True
    result = await QueryExecutor.execute_sqlite(settings.SQLITE_DEMO_PATH, validation.sanitized_sql)
    assert result.error is None
    assert result.rows[0][0] == "All tables"
    assert result.rows[0][1] == sum(table.row_count_estimate for table in catalog.tables.values())


@pytest.mark.asyncio
async def test_explicit_row_count_language_overrides_broad_model_classification(monkeypatch):
    async def broad_schema_classification(**_kwargs):
        return {
            "intent": "schema_overview",
            "requires_sql": False,
            "is_follow_up": False,
            "resolved_question": "List the schema",
            "confidence": 0.9,
            "reason": "This looks like schema discovery.",
            "model": GEMINI_WORKBENCH_MODEL,
            "mode": "gemini",
        }

    monkeypatch.setattr(gemini_workbench_agent, "_generate_json", broad_schema_classification)
    decision = await gemini_workbench_agent.classify_chat_intent(
        "What tables are here and how many total rows are in the database?",
        {"table_count": 2, "tables": [{"name": "customers"}, {"name": "orders"}]},
        [],
    )
    assert decision["intent"] == "row_count_overview"
    assert decision["requires_sql"] is True


def test_semantic_validator_rejects_safe_but_wrong_fallback_sql():
    inventory = _fallback_sql_semantic_validation(
        "Show the total quantity on hand for each product across all warehouses.",
        'SELECT * FROM "inventory" LIMIT 100',
    )
    assert inventory["is_semantically_valid"] is False
    assert any("aggregate" in item for item in inventory["missing_requirements"])
    assert any("GROUP BY" in item for item in inventory["missing_requirements"])

    ranked = _fallback_sql_semantic_validation(
        "Show the top 10 customers with the highest total invoice amounts.",
        'SELECT * FROM "invoice_items" LIMIT 100',
    )
    assert ranked["is_semantically_valid"] is False
    assert any("ORDER BY" in item for item in ranked["missing_requirements"])
    assert any("LIMIT 10" in item for item in ranked["missing_requirements"])

    valid = _fallback_sql_semantic_validation(
        "Show the total quantity on hand for each product across all warehouses.",
        "SELECT product_id, SUM(quantity_on_hand) AS total_quantity FROM inventory GROUP BY product_id",
    )
    assert valid["is_semantically_valid"] is True


@pytest.mark.asyncio
async def test_missing_openrouter_key_never_returns_silent_sql_fallback(monkeypatch):
    monkeypatch.setattr(openrouter_client, "api_key", None)
    with pytest.raises(ProviderError, match="not configured"):
        async for _event in openrouter_client.stream_sql(
            requested_model_id="deepseek/deepseek-v4-flash",
            question="List customers",
            dialect="sqlite",
            schema_context="TABLE customers (id INTEGER)",
            grounding_hints="",
            retrieval_context="",
        ):
            pass

def test_rbp_graph_traversal():
    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)
    rbp = RBPGraphEngine(catalog)
    path = rbp.find_shortest_path("customers", "products")
    assert path is not None
    # customers -> orders -> order_items -> products
    assert "customers" in path and "products" in path

def test_sql_validator_safe_query():
    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)
    safe_sql = "SELECT id, full_name, segment FROM customers WHERE segment = 'Enterprise' LIMIT 5"
    result = SqlValidator.validate_and_sanitize(safe_sql, dialect="sqlite", catalog=catalog)
    assert result.is_valid is True
    assert "customers" in result.referenced_tables
    assert any(c.code == "read_only_policy" and c.status == "passed" for c in result.checks)

def test_sql_validator_block_dml():
    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)
    dml_sql = "DELETE FROM customers WHERE id = 1"
    result = SqlValidator.validate_and_sanitize(dml_sql, dialect="sqlite", catalog=catalog)
    assert result.is_valid is False
    assert "Only read-only SELECT" in (result.error_message or "")

def test_sql_validator_block_unknown_table():
    catalog = CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)
    bad_sql = "SELECT * FROM secret_passwords"
    result = SqlValidator.validate_and_sanitize(bad_sql, dialect="sqlite", catalog=catalog)
    assert result.is_valid is False
    assert "Unknown tables" in (result.error_message or "")

@pytest.mark.asyncio
async def test_query_executor():
    sql = "SELECT c.segment, COUNT(o.id) AS total_orders FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.segment"
    result = await QueryExecutor.execute_sqlite(settings.SQLITE_DEMO_PATH, sql)
    assert result.error is None
    assert len(result.rows) > 0
    assert "segment" in result.columns
    assert "total_orders" in result.columns
    assert result.chart_recommendation is not None
    assert result.chart_recommendation["type"] in ("bar", "pie", "line")

@pytest.mark.asyncio
async def test_openrouter_model_list():
    models = await openrouter_client.list_models()
    assert len(models) >= 5
    model_ids = [m.id for m in models]
    assert "anthropic/claude-sonnet-5" in model_ids
    assert "openai/gpt-5.6-terra" in model_ids
    assert "deepseek/deepseek-v4-flash" in model_ids
