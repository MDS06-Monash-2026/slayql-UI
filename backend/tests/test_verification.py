"""Trust-layer checks against the traps measured on the demo database."""
from datetime import date

import pytest

from backend.app.catalog.discovery import CatalogService
from backend.app.config import settings
from backend.app.queries.executor import QueryExecutor
from backend.app.verification import candidate_from_result, confidence, consensus, run_checks, verify

TODAY = date(2026, 12, 20)  # the demo data ends on 30 September 2026

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
    assert grain[0].data["rows"] == 10669
    assert grain[0].data["keys"] == 4151
    assert "orders" in grain[0].repair_hint


@pytest.mark.asyncio
async def test_unfiltered_statuses_offer_a_clarification():
    findings, options, _ = await _checks("What is our total revenue?", ALL_STATUSES)
    ambiguity = [f for f in findings if f.check == "definition"]
    assert ambiguity and ambiguity[0].severity == "ambiguity"
    assert set(ambiguity[0].data["excluded"]) == {"cancelled", "refunded"}
    assert options and "cancelled" in options[0].label
    # The choice carries the company definition it stands for ("always use this").
    definition = options[0].definition
    assert definition["term"] == "revenue" and "sales" in definition["synonyms"]
    assert definition["table_name"] == "orders" and "'cancelled'" in definition["filter_sql"]


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
    assert period and "2026-09-30" in period[0].repair_hint


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
    may = "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND order_date >= '2026-08-01' AND order_date < '2026-09-01'"
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
async def test_a_filter_value_absent_from_the_data_is_reported_with_the_real_values():
    # A status nobody has is a warning (it may truly be zero); a misspelled one blocks.
    findings, _, _ = await _checks("How much was reversed?", "SELECT SUM(amount) FROM payments WHERE status = 'reversed'")
    assert [f.severity for f in findings if f.check == "filter"] == ["warning"]
    findings, _, _ = await _checks("How many orders were cancelled?", "SELECT COUNT(*) FROM orders WHERE status = 'canceled'")
    misspelled = [f for f in findings if f.check == "filter"]
    assert misspelled and misspelled[0].severity == "blocking" and "'cancelled'" in misspelled[0].repair_hint
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
                                        "SELECT SUM(TotalIncTax) FROM IV WHERE DocDate >= '2025-01-01' AND DocDate < '2026-01-01'")
    assert any(f.check == "definition" and "Cancelled" in f.title for f in findings)
    assert options and "Cancelled" in options[0].label
    assert options[0].definition["filter_sql"] == "Cancelled <> 'T'"
    # Invoice lines multiply invoice totals.
    findings, _, _ = await checks("What were our total sales from rice?",
                                  "SELECT SUM(i.TotalIncTax) FROM IV i JOIN IVDTL d ON d.DocKey = i.DocKey JOIN Item t ON t.ItemCode = d.ItemCode "
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
    assert counted and counted[0].data == {"rows": 4597, "distinct": 361, "entity": "customers"}
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



@pytest.mark.asyncio
async def test_an_approved_rule_applied_to_another_question_is_a_caveat():
    from pathlib import Path
    from backend.data.seed_autocount_sample import build

    path = str(build(Path(settings.CONNECTION_DATA_DIR) / "autocount-spread.db"))
    catalog = CatalogService.get_sqlite_catalog(path)

    async def run(sql):
        return await QueryExecutor.execute_sqlite(path, sql)

    sales = {"id": "def_sales", "term": "sales", "synonyms": ["revenue"], "table": "IV", "column": "Cancelled",
             "filter_sql": "Cancelled <> 'T'", "status": "approved"}

    async def checks(question, sql):
        return await run_checks(question=question, sql=sql, dialect="sqlite", catalog=catalog, run_sql=run,
                                result=await run(sql), today=TODAY, definitions=[sales])

    # "Invoices issued" never chose to leave cancelled invoices out.
    findings, _, used = await checks("How many invoices were issued in 2025?",
                                     "SELECT COUNT(*) FROM IV WHERE Cancelled <> 'T' AND DocDate >= '2025-01-01' AND DocDate < '2026-01-01'")
    spread = [f for f in findings if f.data and f.data.get("spread")]
    assert spread and spread[0].severity == "warning" and '"sales"' in spread[0].title
    # A sales question uses its own rule; a question that names the filter chose it.
    findings, _, _ = await checks("What were sales in 2025?",
                                  "SELECT SUM(TotalExTax) FROM IV WHERE Cancelled <> 'T' AND DocDate >= '2025-01-01' AND DocDate < '2026-01-01'")
    assert not [f for f in findings if f.data and f.data.get("spread")]
    # Customers who bought, or unpaid invoices: leaving cancelled invoices out is expected there.
    findings, _, _ = await checks("How many customers bought from us in 2026?",
                                  "SELECT COUNT(DISTINCT DebtorCode) FROM IV WHERE Cancelled <> 'T' AND DocDate >= '2026-01-01'")
    assert not [f for f in findings if f.data and f.data.get("spread")]
    findings, _, _ = await checks("How many non-cancelled invoices were issued in 2025?",
                                  "SELECT COUNT(*) FROM IV WHERE Cancelled <> 'T' AND DocDate >= '2025-01-01' AND DocDate < '2026-01-01'")
    assert not [f for f in findings if f.data and f.data.get("spread")]


@pytest.mark.asyncio
async def test_exclusions_that_remove_nothing_are_blocking_on_autocount_flags():
    from pathlib import Path
    from backend.data.seed_autocount_sample import build

    path = str(build(Path(settings.CONNECTION_DATA_DIR) / "autocount-filters.db"))
    catalog = CatalogService.get_sqlite_catalog(path)

    async def run(sql):
        return await QueryExecutor.execute_sqlite(path, sql)

    async def checks(sql):
        result = await run(sql)
        return await run_checks(question="What were total non-cancelled sales in 2025?", sql=sql, dialect="sqlite",
                                catalog=catalog, run_sql=run, result=result, today=TODAY)

    # The model guessed a Y/N flag; AutoCount stores T/F, so nothing is excluded.
    for sql in ["SELECT SUM(TotalIncTax) FROM IV WHERE Cancelled <> 'Y'",
                "SELECT SUM(TotalIncTax) FROM IV WHERE COALESCE(Cancelled, '') NOT IN ('Y', 'YES', '1')",
                "SELECT SUM(TotalIncTax) FROM IV WHERE UPPER(Cancelled) <> 'Y'"]:
        findings, _, _ = await checks(sql)
        blocked = [f for f in findings if f.check == "filter" and f.severity == "blocking"]
        assert blocked and "'T'" in blocked[0].repair_hint, sql
    # The right exclusion passes, including on credit notes where nothing is cancelled yet.
    findings, _, _ = await checks("SELECT SUM(TotalIncTax) FROM IV WHERE Cancelled <> 'T'")
    assert not [f for f in findings if f.check == "filter"]
    findings, _, _ = await checks("SELECT SUM(TotalIncTax) FROM CN WHERE Cancelled != 'T'")
    assert not [f for f in findings if f.check == "filter"]
    # An EXISTS that never refers to the invoice filters nothing.
    findings, _, _ = await checks("SELECT SUM(i.TotalIncTax) FROM IV i WHERE i.Cancelled = 'F' AND EXISTS "
                                  "(SELECT 1 FROM ItemGroup g WHERE g.Description = 'Rice')")
    assert [f for f in findings if "EXISTS" in f.title and f.severity == "blocking"]
    findings, _, _ = await checks("SELECT SUM(i.TotalIncTax) FROM IV i WHERE i.Cancelled = 'F' AND EXISTS "
                                  "(SELECT 1 FROM IVDTL d JOIN Item t ON t.ItemCode = d.ItemCode WHERE d.DocKey = i.DocKey AND t.ItemGroup = 'BERAS')")
    assert not [f for f in findings if "EXISTS" in f.title]


@pytest.mark.asyncio
async def test_refusals_written_as_sql_and_unstated_assumptions():
    # A query that reads no table is a refusal, not an answer.
    findings, _, _ = await _checks("Which delivery driver made the most deliveries?",
                                   "SELECT 'No delivery driver information is available' AS message")
    assert [f for f in findings if f.check == "coverage" and f.severity == "blocking"]
    # The subject may be the second word: "which delivery driver".
    findings, _, _ = await _checks("Which delivery driver made the most deliveries?",
                                   "SELECT carrier, COUNT(*) FROM shipments GROUP BY carrier ORDER BY 2 DESC LIMIT 1")
    assert any(f.severity == "blocking" for f in findings if f.check == "coverage")
    # "Revenue" with a status filter the user did not ask for: answered, but the assumption is stated.
    findings, options, _ = await _checks("What is our total revenue?",
                                         "SELECT SUM(total_amount) FROM orders WHERE status NOT IN ('cancelled', 'refunded')")
    assumption = [f for f in findings if f.check == "definition"]
    assert assumption and assumption[0].severity == "warning" and not options



@pytest.mark.asyncio
async def test_admissions_in_comments_and_what_is_our_x_questions():
    sql = ("-- The schema has no product category table, so this cannot filter by category;\n"
           "-- it returns the total of all completed orders instead.\n"
           "SELECT SUM(total_amount) FROM orders WHERE status = 'completed'")
    findings, _, _ = await _checks("What is the revenue from Developer Tools orders?", sql)
    assert [f for f in findings if f.check == "coverage" and "could not answer" in f.title]
    # Ordinary comments are fine.
    findings, _, _ = await _checks("What is total revenue from completed orders?",
                                   "-- completed orders only\nSELECT SUM(total_amount) FROM orders WHERE status = 'completed'")
    assert not [f for f in findings if f.check == "coverage"]
    # "What is our X": X must exist in the data.
    findings, _, _ = await _checks("What is our current stock balance for each warehouse?",
                                   "SELECT name, capacity_units FROM warehouses")
    assert findings == [] or not [f for f in findings if f.check == "coverage" and "warehouse" in f.title]
    findings, _, _ = await _checks("What is our carbon footprint?", "SELECT COUNT(*) FROM support_cases")
    assert [f for f in findings if f.check == "coverage" and f.severity == "blocking"]


@pytest.mark.asyncio
async def test_quantity_times_unit_cost_is_line_level_but_added_totals_still_fan_out():
    # Cost of goods: each line's quantity times its product's cost. Products repeat per line by design.
    cost = ("SELECT SUM(oi.quantity * p.cost_price) FROM order_items oi JOIN products p ON p.id = oi.product_id "
            "JOIN orders o ON o.id = oi.order_id WHERE o.status = 'completed'")
    findings, _, _ = await _checks("What was the cost of goods sold on completed orders?", cost)
    assert not [f for f in findings if f.check == "grain"]
    # Adding an order-level total to line values still counts each order once per line.
    added = ("SELECT SUM(o.total_amount + oi.subtotal) FROM orders o JOIN order_items oi ON oi.order_id = o.id "
             "WHERE o.status = 'completed'")
    findings, _, _ = await _checks("What is revenue plus line subtotals on completed orders?", added)
    assert [f for f in findings if f.check == "grain" and f.severity == "blocking"]
    # And a product of two order-level columns is not rescued by the lines it is joined to.
    scaled = ("SELECT SUM(o.total_amount * o.discount_amount) FROM orders o JOIN order_items oi ON oi.order_id = o.id "
              "WHERE o.status = 'completed'")
    findings, _, _ = await _checks("What is total amount times discount on completed orders?", scaled)
    assert [f for f in findings if f.check == "grain" and f.severity == "blocking"]


@pytest.mark.asyncio
async def test_adverbs_are_not_missing_subjects():
    findings, _, _ = await _checks("What customers still owe us on completed orders?",
                                   "SELECT c.full_name, SUM(o.total_amount) FROM customers c JOIN orders o ON o.customer_id = c.id "
                                   "WHERE o.status = 'completed' GROUP BY c.full_name")
    assert not [f for f in findings if f.check == "coverage"]


@pytest.mark.asyncio
async def test_a_relative_period_measured_from_the_data_states_its_assumption():
    anchored = ("WITH m AS (SELECT MAX(order_date) AS d FROM orders) "
                "SELECT SUM(o.total_amount) FROM orders o, m WHERE o.status = 'completed' "
                "AND o.order_date >= date(m.d, 'start of month', '-1 month') AND o.order_date < date(m.d, 'start of month')")
    findings, _, _ = await _checks("What was the total value of completed orders last month?", anchored)
    notes = [f for f in findings if f.check == "period" and f.severity == "info"]
    assert notes and '"last month"' in notes[0].title and notes[0].data["assumption"]
    # The note never blocks or lowers confidence: it is information, not a problem.
    assert not [f for f in findings if f.severity in {"blocking", "warning"}]
    # A question without a relative period needs no note.
    literal = ("SELECT SUM(total_amount) FROM orders WHERE status = 'completed' "
               "AND order_date >= '2026-05-01' AND order_date < '2026-06-01'")
    # Literal dates inside the data answer "last month" from where the data ends too: say so.
    findings, _, _ = await _checks("What was the total value of completed orders last month?", literal)
    assert [f for f in findings if f.check == "period" and f.severity == "info"]
    # A year may overlap the calendar year, so literal dates need no note there.
    year = ("SELECT SUM(total_amount) FROM orders WHERE status = 'completed' "
            "AND order_date >= '2026-01-01' AND order_date < '2027-01-01'")
    findings, _, _ = await _checks("What was the total value of completed orders this year?", year)
    assert not [f for f in findings if f.check == "period" and f.severity == "info"]
    findings, _, _ = await _checks("What was the total value of completed orders in May 2026?", anchored)
    assert not [f for f in findings if f.check == "period" and f.severity == "info"]


def test_relative_dates_are_anchored_to_where_the_data_ends_in_every_dialect():
    from backend.app.verification.repairs import anchor_relative_dates

    sqlite = anchor_relative_dates(
        "SELECT SUM(total_amount) FROM orders WHERE order_date >= DATE('now', 'start of month', '-1 month')",
        "sqlite", "2026-06-28 10:00:00")
    assert "DATE('2026-06-28 10:00:00', 'start of month', '-1 month')" in sqlite
    assert "CAST('2026-06-28' AS DATE)" in anchor_relative_dates("SELECT 1 FROM t WHERE d >= CURRENT_DATE - 30", "postgres", "2026-06-28")
    assert "GETDATE" not in anchor_relative_dates("SELECT 1 FROM t WHERE d >= DATEADD(day, -30, GETDATE())", "tsql", "2026-06-28 10:00:00")
    assert anchor_relative_dates("SELECT 1 FROM t WHERE d >= '2026-01-01'", "sqlite", "2026-06-28") is None
