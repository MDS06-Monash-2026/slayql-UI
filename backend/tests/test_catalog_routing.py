"""Questions that name a real table get an exact, instant answer instead of a generic reply."""
import json
import time

import httpx
import pytest

from backend.app.agent import catalog_routing
from backend.app.catalog.discovery import CatalogService
from backend.app.config import settings
from backend.app.knowledge.store import knowledge_store, loose_question_key, question_key
from backend.app.main import app
from backend.app.providers.llm_client import ProviderError, llm_client
from backend.app.workbench.gemini_agent import GeminiWorkbenchAgent, _grounded_general_answer


def _catalog():
    return CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)


def _completed(stream_text):
    block = next(b for b in stream_text.split("\n\n") if "event: run.completed\n" in b)
    return json.loads(block.split("data: ", 1)[1])["payload"]


@pytest.fixture
def no_ai(monkeypatch):
    """Every AI provider is down: each call is recorded and fails the way an outage does."""
    calls = []

    def unavailable(name):
        def call(*args, **kwargs):
            calls.append(name)
            raise ProviderError("The AI provider request failed.")
        return call
    for name in ("stream_sql", "stream_answer", "stream_tool_agent"):
        monkeypatch.setattr(llm_client, name, unavailable(name))

    async def no_gemini(self, **kwargs):
        calls.append("gemini")
        raise RuntimeError("provider unavailable")
    monkeypatch.setattr(GeminiWorkbenchAgent, "_generate_json", no_gemini)
    return calls


async def _stream(question, effort="medium"):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/agent-runs/stream", json={
            "question": question, "connection_id": "sqlite_demo", "thinking_effort": effort,
        })
        return response.text


async def _ask(question, effort="medium"):
    started = time.perf_counter()
    text = await _stream(question, effort)
    return _completed(text), time.perf_counter() - started


def test_routes_table_questions_and_leaves_real_data_questions_alone():
    catalog = _catalog()
    expected = {
        "show me all customers": "browse_table",
        "Show me all customers.": "browse_table",
        "customers": "browse_table",
        "can you show me all order items": "browse_table",
        "desribe the order-items table": "describe_table",
        "describe the attributes of order_items table": "describe_table",
        "what columns does the orders table have": "describe_table",
        "list all tables": "list_tables",
        # Filters, counts, joins and metrics still need the SQL agent.
        "show me all customers in Kuala Lumpur": None,
        "how many customers do we have": None,
        "list customers who ordered twice": None,
        "What were total sales for Enterprise customers?": None,
        "describe sales trends over time": None,
        "show customers and their orders": None,
    }
    for question, kind in expected.items():
        found = catalog_routing.route(question, catalog)
        assert (found or {}).get("kind") == kind, question
    assert catalog_routing.mentioned_tables("show order items", catalog) == ["order_items"]


def test_browse_sql_quotes_names_for_each_engine():
    assert catalog_routing.browse_sql("order_items", "sqlite", 200) == 'SELECT * FROM "order_items" LIMIT 200'
    assert catalog_routing.browse_sql("sales.orders", "postgres", 50) == 'SELECT * FROM "sales"."orders" LIMIT 50'
    assert catalog_routing.browse_sql("Customer", "mysql", 10) == "SELECT * FROM `Customer` LIMIT 10"


@pytest.mark.asyncio
@pytest.mark.parametrize("effort", ["medium", "high"])
@pytest.mark.parametrize("question", ["desribe the order-items table", "describe the attributes of order_items table"])
async def test_describe_a_table_answers_from_the_catalog_without_ai(no_ai, question, effort):
    payload, seconds = await _ask(question, effort)
    assert no_ai == []
    assert payload["status"] == "success"
    assert payload["resolution_code"] == "schema_overview"
    assert "`order_items` has 7 columns" in payload["answer"]
    described = {row[1]: row for row in payload["rows"]}
    assert described["order_id"][3] == "links to orders.id"
    assert described["id"][3] == "primary key"
    assert seconds < 5


@pytest.mark.asyncio
@pytest.mark.parametrize("effort", ["medium", "high"])
async def test_show_all_customers_lists_the_rows_without_ai(no_ai, effort):
    payload, seconds = await _ask("show me all customers", effort)
    assert no_ai == []
    assert payload["status"] == "success"
    assert " ".join(payload["sql"].split()) == 'SELECT * FROM "customers" LIMIT ' + str(settings.MAX_RESULT_ROWS)
    assert payload["row_count"] == min(420, settings.MAX_RESULT_ROWS)
    assert payload["verification"]["outcome"] == "confident"
    assert payload["verification"]["direct_table_listing"] == "customers"
    shown = min(420, settings.MAX_RESULT_ROWS)
    # Never claims "all" when the row limit cut the listing short.
    expected = "Here are all 420 rows" if shown == 420 else f"Here are the first {shown:,} of 420 rows"
    assert payload["answer"].startswith(expected)
    assert seconds < 5


@pytest.mark.asyncio
async def test_an_analytical_question_still_goes_to_the_models(no_ai):
    await _stream("What were total sales for Enterprise customers?", "high")
    assert "stream_tool_agent" in no_ai


@pytest.mark.asyncio
async def test_a_general_question_gets_a_grounded_reply_not_a_canned_one(no_ai):
    payload, _ = await _ask("why is the sky blue")
    assert payload["status"] == "success"
    assert "tables" in payload["answer"] and "`customers`" in payload["answer"]
    assert "I can help you explore the connected database" not in payload["answer"]


def test_browse_answer_never_overclaims():
    catalog = _catalog()
    assert catalog_routing.browse_answer("customers", catalog, 200, False, 200).startswith("Here are the first 200 of 420 rows")
    assert catalog_routing.browse_answer("customers", catalog, 420, False, 500) == "Here are all 420 rows in `customers`."
    catalog.engine = "postgres"
    assert "of about 420 rows" in catalog_routing.browse_answer("customers", catalog, 200, False, 200)
    catalog.tables["customers"].row_count_estimate = 0
    assert catalog_routing.browse_answer("customers", catalog, 200, False, 200).startswith("Here are the first 200 rows")
    assert catalog_routing.browse_answer("customers", catalog, 0, False, 200) == "`customers` has no rows."


def test_grounded_general_answer_without_a_catalog_still_helps():
    answer = _grounded_general_answer({})
    assert "What tables are there?" in answer


def test_verified_queries_match_small_rewordings_but_not_different_questions():
    saved = "What were total sales for Enterprise customers?"
    knowledge_store.add_verified_query(
        connection_id="loose_match_source", question=saved,
        sql="SELECT 1", approved_by="analyst@example.com",
    )
    for asked in ["What were the total sales for Enterprise customers?", "Show total sales for Enterprise customers",
                  "total sales for enterprise customers"]:
        assert knowledge_store.find_verified_query("loose_match_source", asked) is not None, asked
    for asked in ["What were total sales for SMB customers?", "How many total sales for Enterprise customers?",
                  "What were total sales for Enterprise customers in 2025?", "customers"]:
        assert knowledge_store.find_verified_query("loose_match_source", asked) is None, asked
    # The exact key is unchanged, so existing callers and stored rows keep working.
    assert question_key(saved) == "what were total sales for enterprise customers"
    assert loose_question_key(saved) == "total sales for enterprise customers"
