"""Answer cards for "Would you put this in the board pack?".

Each card pairs a question with one SQL answer on the demo database. Half are
wrong. The evidence shown in the "evidence" condition is produced by running
the real trust layer on that SQL, not written by hand, and one wrong card is a
genuine verifier miss, so the study also measures over-reliance on the badge.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from backend.app.catalog.discovery import CatalogService
from backend.app.config import settings
from backend.app.queries.executor import QueryExecutor
from backend.app.queries.validator import SqlValidator
from backend.app.verification import candidate_from_result, verify
from backend.app.verification.models import result_preview

# The demo data ends in June 2026; relative-date checks use this as "today".
DEMO_TODAY = date(2026, 9, 24)

CARDS: List[Dict[str, Any]] = [
    {
        "id": "revenue-correct",
        "question": "What is total revenue from completed orders?",
        "sql": "SELECT SUM(total_amount) AS revenue FROM orders WHERE status = 'completed'",
        "correct": True,
        "explanation": "Correct: 134 completed orders, each counted once.",
    },
    {
        "id": "revenue-fanout",
        "question": "What is total revenue from completed orders?",
        "sql": "SELECT SUM(o.total_amount) AS revenue FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.status = 'completed'",
        "correct": False,
        "explanation": "Wrong: joining order lines repeats each order once per line, so revenue is about three times too high. The correct figure is 2,159,970.05.",
    },
    {
        "id": "revenue-all-statuses",
        "question": "What is our total revenue for the board pack?",
        "sql": "SELECT SUM(total_amount) AS revenue FROM orders",
        "correct": False,
        "explanation": "Wrong for a board pack: it includes 7 cancelled and 20 refunded orders. Completed orders only give 2,159,970.05.",
    },
    {
        "id": "orders-august-between",
        "question": "How many orders were placed in August 2025?",
        "sql": "SELECT COUNT(*) AS orders FROM orders WHERE order_date BETWEEN '2025-08-01' AND '2025-08-31'",
        "correct": False,
        "correct_sql": "SELECT COUNT(*) FROM orders WHERE order_date >= '2025-08-01' AND order_date < '2025-09-01'",
        "explanation": "Wrong: order dates include times, so BETWEEN ... '2025-08-31' drops the orders placed during 31 August. The correct count is 14.",
    },
    {
        "id": "customers-count",
        "question": "How many customers do we have?",
        "sql": "SELECT COUNT(*) AS customers FROM customers",
        "correct": True,
        "explanation": "Correct: 60 customers.",
    },
    {
        "id": "average-order",
        "question": "What is the average value of a completed order?",
        "sql": "SELECT AVG(total_amount) AS average_order FROM orders WHERE status = 'completed'",
        "correct": True,
        "explanation": "Correct: averaged over completed orders only.",
    },
    {
        "id": "warehouses-busy",
        "question": "How many warehouses are more than 80% utilised?",
        "sql": "SELECT COUNT(*) AS warehouses FROM warehouses WHERE utilization_percent > 80",
        "correct": True,
        "explanation": "Correct.",
    },
    {
        "id": "customers-ordering-miss",
        "question": "How many customers have placed at least one order?",
        "sql": "SELECT COUNT(customer_id) AS customers FROM orders",
        "correct": False,
        "verifier_miss": True,
        "explanation": "Wrong: this counts orders (214), not customers, so a customer with several orders is counted several times. The correct figure is 60. SlayQL's checks missed this one: they look for known traps such as double counting from joins, not every counting mistake.",
    },
]

_deck: Optional[List[Dict[str, Any]]] = None


async def build_deck() -> List[Dict[str, Any]]:
    """Run each card's SQL and the trust layer once; cache the result."""
    global _deck
    if _deck is not None:
        return _deck
    path = settings.SQLITE_DEMO_PATH
    catalog = CatalogService.get_sqlite_catalog(path)

    async def run(sql: str):
        validation = SqlValidator.validate_and_sanitize(sql=sql, dialect="sqlite", catalog=catalog, max_rows=settings.MAX_RESULT_ROWS)
        return await QueryExecutor.execute_sqlite(path, validation.sanitized_sql if validation.is_valid else sql)

    deck = []
    for card in CARDS:
        result = await run(card["sql"])
        if card.get("correct_sql"):
            correct = await run(card["correct_sql"])
            if result_preview(correct) == result_preview(result):
                continue  # the trap does not bite on this data, so the card would be misleading
        verification = await verify(
            question=card["question"], dialect="sqlite", catalog=catalog, run_sql=run,
            candidates=[candidate_from_result("card", card["sql"], result)], primary_id="card",
            penalty=settings.VERIFY_DEFAULT_PENALTY, today=DEMO_TODAY,
        )
        top = next((f for f in verification.findings if f.severity in {"blocking", "ambiguity"}), None) or (verification.findings[0] if verification.findings else None)
        deck.append({
            "id": card["id"],
            "question": card["question"],
            "answer": result_preview(result),
            "sql": card["sql"],
            "correct": card["correct"],
            "verifier_miss": bool(card.get("verifier_miss")),
            "explanation": card["explanation"],
            "evidence": {
                "outcome": verification.outcome,
                "summary": verification.summary,
                "finding": {"title": top.title, "detail": top.detail} if top else None,
            },
        })
    _deck = deck
    return deck
