"""Trust-layer checks against the traps measured on the demo database."""
from datetime import date

import pytest

from backend.app.catalog.discovery import CatalogService
from backend.app.config import settings
from backend.app.queries.executor import QueryExecutor
from backend.app.verification import candidate_from_result, confidence, consensus, run_checks, verify

TODAY = date(2026, 9, 24)  # the demo data ends on 28 June 2026

CORRECT = "SELECT SUM(total_amount) FROM orders WHERE status = 'completed'"
FAN_OUT = (
    "SELECT SUM(o.total_amount) FROM orders o JOIN order_items oi ON oi.order_id = o.id "
    "WHERE o.status = 'completed'"
)
ALL_STATUSES = "SELECT SUM(total_amount) FROM orders"


def _catalog():
    return CatalogService.get_sqlite_catalog(settings.SQLITE_DEMO_PATH)


async def _run(sql):
    return await QueryExecutor.execute_sqlite(settings.SQLITE_DEMO_PATH, sql)


async def _checks(question, sql):
    result = await _run(sql)
    return await run_checks(
        question=question, sql=sql, dialect="sqlite", catalog=_catalog(),
        run_sql=_run, result=result, today=TODAY,
    )


async def _candidate(candidate_id, sql):
    return candidate_from_result(candidate_id, sql, await _run(sql))


@pytest.mark.asyncio
async def test_correct_revenue_passes_all_checks():
    findings, options, _ = await _checks("What is total revenue from completed orders?", CORRECT)
    assert findings == []
    assert options == []


@pytest.mark.asyncio
async def test_fan_out_join_is_blocking_with_measured_ratio():
    findings, _, _ = await _checks("What is total revenue from completed orders?", FAN_OUT)
    grain = [f for f in findings if f.check == "grain"]
    assert len(grain) == 1
    assert grain[0].severity == "blocking"
    assert grain[0].data["rows"] == 337
    assert grain[0].data["keys"] == 134
    assert "orders" in grain[0].repair_hint


@pytest.mark.asyncio
async def test_unfiltered_statuses_offer_a_clarification():
    findings, options, _ = await _checks("What is our total revenue?", ALL_STATUSES)
    ambiguity = [f for f in findings if f.check == "definition"]
    assert ambiguity and ambiguity[0].severity == "ambiguity"
    assert set(ambiguity[0].data["excluded"]) == {"cancelled", "refunded"}
    assert options and "cancelled" in options[0].label


@pytest.mark.asyncio
async def test_status_check_ignores_questions_without_a_business_measure():
    findings, options, _ = await _checks("How many orders are there?", "SELECT COUNT(*) FROM orders")
    assert not [f for f in findings if f.check == "definition"]
    assert options == []


@pytest.mark.asyncio
async def test_relative_dates_after_the_data_ends_are_blocking():
    sql = "SELECT SUM(total_amount) FROM orders WHERE order_date >= date('now', '-1 month')"
    findings, _, _ = await _checks("Sales last month", sql)
    period = [f for f in findings if f.check == "period" and f.severity == "blocking"]
    assert period and "2026-06-28" in period[0].repair_hint


@pytest.mark.asyncio
async def test_date_only_upper_bound_on_datetime_column_is_blocking():
    sql = "SELECT COUNT(*) FROM orders WHERE order_date BETWEEN '2026-01-01' AND '2026-01-31'"
    findings, _, _ = await _checks("How many orders in January 2026?", sql)
    assert any(f.check == "period" and "last day" in f.title for f in findings)


@pytest.mark.asyncio
async def test_verify_hands_off_unrepaired_fan_out():
    candidates = [await _candidate("a", FAN_OUT)]
    result = await verify(
        question="What is total revenue from completed orders?", dialect="sqlite", catalog=_catalog(),
        run_sql=_run, candidates=candidates, primary_id="a", penalty=4, today=TODAY,
    )
    assert result.outcome == "handoff"


@pytest.mark.asyncio
async def test_verify_is_confident_when_candidates_agree_and_checks_pass():
    candidates = [await _candidate(cid, CORRECT) for cid in ("a", "b", "c")]
    result = await verify(
        question="What is total revenue from completed orders?", dialect="sqlite", catalog=_catalog(),
        run_sql=_run, candidates=candidates, primary_id="a", penalty=4, today=TODAY,
    )
    assert result.outcome == "confident"
    assert result.consensus["agreement"] == 1.0
    assert result.probability >= result.threshold


@pytest.mark.asyncio
async def test_verify_prefers_the_majority_result():
    candidates = [
        await _candidate("a", ALL_STATUSES),
        await _candidate("b", CORRECT),
        await _candidate("c", CORRECT),
    ]
    result = await verify(
        question="Total revenue from completed orders", dialect="sqlite", catalog=_catalog(),
        run_sql=_run, candidates=candidates, primary_id="a", penalty=4, today=TODAY,
    )
    assert result.selected_candidate_id == "b"
    assert result.consensus["agreement"] == pytest.approx(0.667, abs=0.001)


@pytest.mark.asyncio
async def test_verify_asks_when_candidates_all_disagree():
    candidates = [
        await _candidate("a", ALL_STATUSES),
        await _candidate("b", CORRECT),
        await _candidate("c", "SELECT SUM(total_amount) FROM orders WHERE status IN ('completed', 'shipped')"),
    ]
    result = await verify(
        question="How much did we sell?", dialect="sqlite", catalog=_catalog(),
        run_sql=_run, candidates=candidates, primary_id="a", penalty=4, today=TODAY,
    )
    assert result.outcome == "clarify"
    assert len(result.clarify_options) >= 2


def test_threshold_follows_the_penalty():
    assert confidence.threshold(1) == pytest.approx(0.5)
    assert confidence.threshold(4) == pytest.approx(0.8)
    assert confidence.threshold(9) == pytest.approx(0.9)


@pytest.mark.asyncio
async def test_candidates_failing_a_blocking_check_do_not_outvote_a_correct_one():
    may = "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND order_date >= '2026-05-01' AND order_date < '2026-06-01'"
    stale = "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND order_date >= date('now', 'start of month', '-1 month') AND order_date < date('now', 'start of month')"
    candidates = [await _candidate("a", may), await _candidate("b", stale), await _candidate("c", stale)]
    result = await verify(
        question="What was the total value of completed orders last month?", dialect="sqlite", catalog=_catalog(),
        run_sql=_run, candidates=candidates, primary_id="a", penalty=4, today=TODAY,
    )
    assert result.selected_candidate_id == "a"
    assert result.consensus["excluded_by_checks"] == 2
    assert result.outcome == "confident"


@pytest.mark.asyncio
async def test_relabelling_unrelated_data_as_a_missing_concept_is_blocking():
    # The demo data has no salespeople or deals; this is what the model wrote.
    sql = (
        "SELECT customer_id AS salesperson_id, COUNT(*) AS deals_closed FROM support_cases "
        "WHERE status = 'closed' GROUP BY customer_id ORDER BY deals_closed DESC LIMIT 1"
    )
    findings, _, _ = await _checks("Which salesperson closed the most deals?", sql)
    coverage = [f for f in findings if f.check == "coverage"]
    assert len(coverage) == 1 and coverage[0].severity == "blocking"
    assert set(coverage[0].data["terms"]) == {"salesperson", "deal"}


@pytest.mark.asyncio
@pytest.mark.parametrize("question, sql", [
    ("How many orders were placed in January 2026?",
     "SELECT COUNT(*) AS orders_placed_in_january_2026 FROM orders WHERE order_date >= '2026-01-01' AND order_date < '2026-02-01'"),
    ("What is the total tax collected on completed orders?",
     "SELECT SUM(tax_amount) AS total_tax_collected FROM orders WHERE status = 'completed'"),
    ("Berapa ramai pelanggan yang kita ada?", "SELECT COUNT(*) AS jumlah_pelanggan FROM customers"),
    ("What is the average customer spend?", "SELECT AVG(total_amount) AS avg_customer_spend FROM orders"),
])
async def test_labels_that_describe_real_data_are_not_flagged(question, sql):
    findings, _, _ = await _checks(question, sql)
    assert not [f for f in findings if f.check == "coverage"]


@pytest.mark.asyncio
async def test_extra_columns_do_not_count_as_disagreement():
    narrow = await _candidate("a", "SELECT name FROM products ORDER BY unit_price DESC LIMIT 1")
    wide = await _candidate("b", "SELECT id, name, sku, unit_price FROM products ORDER BY unit_price DESC LIMIT 1")
    other = await _candidate("c", "SELECT name FROM products ORDER BY unit_price ASC LIMIT 1")
    groups = consensus.cluster([narrow, wide, other])
    assert [len(group) for group in groups] == [2, 1]
    assert {c.candidate_id for c in groups[0]} == {"a", "b"}


@pytest.mark.asyncio
async def test_english_labels_on_a_malay_question_are_checked():
    sql = (
        "SELECT ROUND(100.0 * SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) / COUNT(*), 2) "
        "AS customer_satisfaction_score FROM support_cases"
    )
    findings, _, _ = await _checks("Berapakah skor kepuasan pelanggan kita?", sql)
    assert [f.data["terms"] for f in findings if f.check == "coverage"] == [["satisfaction"]]


@pytest.mark.asyncio
async def test_a_question_about_cancellations_does_not_ask_whether_to_exclude_them():
    # "refunds" and "cancellations" in the question settle whether refunded and cancelled orders count.
    findings, options, _ = await _checks("What is our revenue including refunds and cancellations?", ALL_STATUSES)
    assert not [f for f in findings if f.check == "definition"]
    assert options == []
    # Labels such as "lost" describe the figure; they are not a missing concept.
    findings, _, _ = await _checks(
        "How much revenue did we lose to cancellations each month?",
        "SELECT strftime('%Y-%m', order_date) AS month, SUM(total_amount) AS lost FROM orders "
        "WHERE status = 'cancelled' GROUP BY month",
    )
    assert findings == []
    # An unfiltered revenue question still asks.
    findings, options, _ = await _checks("What is our total revenue?", ALL_STATUSES)
    assert options


@pytest.mark.asyncio
async def test_a_filter_value_with_the_wrong_case_is_blocking_and_suggests_the_real_one():
    findings, _, _ = await _checks(
        "How many support cases are resolved?", "SELECT COUNT(*) FROM support_cases WHERE status = 'Resolved'"
    )
    wrong_case = [f for f in findings if f.check == "filter"]
    assert wrong_case and wrong_case[0].severity == "blocking"
    assert wrong_case[0].data["suggested"] == "resolved"


@pytest.mark.asyncio
async def test_a_filter_value_absent_from_the_data_is_a_warning_with_the_real_values():
    findings, _, _ = await _checks(
        "How much was refunded?", "SELECT SUM(amount) FROM payments WHERE status = 'reversed'"
    )
    missing = [f for f in findings if f.check == "filter"]
    assert missing and missing[0].severity == "warning"
    assert missing[0].data["values"]
    # A filter that matches real rows is not flagged.
    findings, _, _ = await _checks("How many orders were completed?", "SELECT COUNT(*) FROM orders WHERE status IN ('completed', 'shipped')")
    assert not [f for f in findings if f.check == "filter"]


@pytest.mark.asyncio
async def test_autocount_style_ledger_traps_are_caught():
    from pathlib import Path
    from backend.data.seed_autocount_sample import build

    path = str(build(Path(settings.CONNECTION_DATA_DIR) / "autocount-test.db"))
    catalog = CatalogService.get_sqlite_catalog(path)

    async def run(sql):
        return await QueryExecutor.execute_sqlite(path, sql)

    async def checks(question, sql):
        return await run_checks(question=question, sql=sql, dialect="sqlite", catalog=catalog, run_sql=run, result=await run(sql), today=TODAY)

    # Cancelled invoices are marked with a flag, not a status: SlayQL still asks.
    findings, options, _ = await checks("What were our total sales in 2025?",
                                        "SELECT SUM(NetTotal) FROM IV WHERE DocDate >= '2025-01-01' AND DocDate < '2026-01-01'")
    assert any(f.check == "definition" and "Cancelled" in f.title for f in findings)
    assert options and "Cancelled" in options[0].label
    # Invoice lines multiply invoice totals.
    findings, _, _ = await checks("What were our total sales from rice?",
                                  "SELECT SUM(i.NetTotal) FROM IV i JOIN IVDTL d ON d.DocKey = i.DocKey JOIN Item t ON t.ItemCode = d.ItemCode "
                                  "WHERE t.ItemGroup = 'BERAS' AND i.Cancelled = 'F'")
    assert any(f.check == "grain" and f.severity == "blocking" for f in findings)


def test_an_approved_definition_lifts_confidence_above_strict_thresholds():
    clean = {"agreement": 1.0, "single_candidate": 0.0, "unresolved_blocking": 0.0, "ambiguity": 0.0,
             "warnings": 0.0, "repairs": 0.0, "empty_result": 0.0, "semantic_invalid": 0.0}
    assert confidence.probability(clean) < confidence.threshold(9)
    assert confidence.probability({**clean, "approved_definition": 1.0}) > confidence.threshold(9)


@pytest.mark.asyncio
async def test_review_fixes_for_checks():
    # A derived-metric label is not a missing concept.
    findings, _, _ = await _checks(
        "How many repeat customers do we have?",
        "SELECT COUNT(*) AS repeat_customers FROM (SELECT customer_id FROM orders GROUP BY customer_id HAVING COUNT(*) > 1)",
    )
    assert not [f for f in findings if f.check == "coverage"]
    # A subquery's filter is checked against its own table, not the outer one.
    findings, _, _ = await _checks(
        "How many customers have a shipped order?",
        "SELECT COUNT(*) FROM customers WHERE id IN (SELECT customer_id FROM orders WHERE status = 'shipped')",
    )
    assert not [f for f in findings if f.check == "filter"]


@pytest.mark.asyncio
async def test_todays_date_in_select_is_not_a_period_problem():
    # Ages computed from today are fine; only filters measured from today are checked.
    findings, _, _ = await _checks(
        "How old is each customer account in days?",
        "SELECT full_name, julianday('now') - julianday(created_at) AS account_age_days FROM customers WHERE created_at >= '2025-01-01'",
    )
    assert not [f for f in findings if f.check == "period"]


@pytest.mark.asyncio
async def test_counting_rows_instead_of_distinct_entities_is_blocking():
    findings, _, _ = await _checks("How many customers have placed at least one order?", "SELECT COUNT(customer_id) AS customers FROM orders")
    counted = [f for f in findings if f.check == "grain"]
    assert counted and counted[0].data == {"rows": 214, "distinct": 60, "entity": "customers"}
    # Correct forms pass.
    for sql in ["SELECT COUNT(DISTINCT customer_id) FROM orders",
                "SELECT COUNT(*) FROM customers WHERE id IN (SELECT customer_id FROM orders)"]:
        findings, _, _ = await _checks("How many customers have placed at least one order?", sql)
        assert not [f for f in findings if f.check == "grain"], sql
    # Counting orders when the question asks about orders is fine.
    findings, _, _ = await _checks("How many orders were placed in 2025?", "SELECT COUNT(*) FROM orders WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'")
    assert not [f for f in findings if f.check == "grain"]


@pytest.mark.asyncio
async def test_which_questions_about_things_the_data_lacks_are_handed_off():
    for question in ["Which salesperson closed the most deals?", "Jurujual mana yang menutup paling banyak urus niaga?"]:
        # The SQL answers with customers, and never names the salesperson concept.
        findings, _, _ = await _checks(question, "SELECT customer_id, COUNT(*) AS transaction_count FROM orders GROUP BY customer_id ORDER BY 2 DESC LIMIT 1")
        assert [f for f in findings if f.check == "coverage" and f.severity == "blocking"], question
    for question in ["Which product has the highest unit price?", "Gudang mana yang penggunaannya melebihi 80 peratus?", "Which carrier handled the most shipments?"]:
        findings, _, _ = await _checks(question, "SELECT name FROM products ORDER BY unit_price DESC LIMIT 1")
        assert not [f for f in findings if f.check == "coverage"], question
