import pytest
from backend.app.config import settings
from backend.app.db.seed_demo import seed_sqlite_demo
from backend.app.catalog.discovery import CatalogService
from backend.app.agent.rbp import RBPGraphEngine
from backend.app.queries.validator import SqlValidator
from backend.app.queries.executor import QueryExecutor
from backend.app.providers.openrouter_client import openrouter_client
from backend.app.workbench.gemini_agent import GEMINI_WORKBENCH_MODEL, chart_idiom_payload
from backend.app.workbench.health import inspect_sqlite_health

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
    assert "anthropic/claude-3.5-sonnet" in model_ids
    assert "openai/gpt-4o" in model_ids
    assert "deepseek/deepseek-chat" in model_ids
