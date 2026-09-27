"""Build and check the business trap set against the demo database.

Every gold query is executed to confirm it runs. For questions whose expected
outcome is "clarify", the listed interpretations must return different
results, otherwise asking would be unnecessary.

Run:  python -m backend.eval.datasets.build_trap_set
Status: DRAFT. A team member must review each question and gold answer
before results from this set are reported.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[2] / "data" / "slayql_demo.sqlite3"
OUT = Path(__file__).with_name("trap_set.jsonl")

COMPLETED_REVENUE = "SELECT SUM(total_amount) FROM orders WHERE status = 'completed'"

# trap: none | fanout | definition | period | infeasible
# expected: answer | clarify | handoff
ITEMS = [
    # --- Plain questions: should be answered; they also measure false alarms.
    ("plain-01", "en", "none", "answer", "How many customers do we have?", "SELECT COUNT(*) FROM customers"),
    ("plain-02", "en", "none", "answer", "How many orders were placed in 2025?", "SELECT COUNT(*) FROM orders WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'"),
    ("plain-03", "en", "none", "answer", "Which product has the highest unit price?", "SELECT name FROM products ORDER BY unit_price DESC LIMIT 1"),
    ("plain-04", "en", "none", "answer", "How many customers are in each segment?", "SELECT segment, COUNT(*) FROM customers GROUP BY segment"),
    ("plain-05", "en", "none", "answer", "What is the average resolution time in hours for resolved support cases?", "SELECT AVG(resolution_time_hours) FROM support_cases WHERE status = 'resolved'"),
    ("plain-06", "en", "none", "answer", "How many open support cases have urgent priority?", "SELECT COUNT(*) FROM support_cases WHERE status = 'open' AND priority = 'urgent'"),
    ("plain-07", "en", "none", "answer", "Which carrier handled the most shipments?", "SELECT carrier FROM shipments GROUP BY carrier ORDER BY COUNT(*) DESC LIMIT 1"),
    ("plain-08", "en", "none", "answer", "What is the combined annual budget of all teams?", "SELECT SUM(annual_budget) FROM teams"),
    ("plain-09", "en", "none", "answer", "How many employees are active?", "SELECT COUNT(*) FROM employees WHERE status = 'active'"),
    ("plain-10", "en", "none", "answer", "List the names of warehouses with utilization above 80 percent.", "SELECT name FROM warehouses WHERE utilization_percent > 80"),
    ("plain-11", "en", "none", "answer", "How many products are in the Security & Compliance category?", "SELECT COUNT(*) FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = 'Security & Compliance'"),
    ("plain-12", "en", "none", "answer", "What is the average total of completed orders?", "SELECT AVG(total_amount) FROM orders WHERE status = 'completed'"),
    # Summing the "many" side of a join is correct: the grain check must stay quiet.
    ("plain-13", "en", "none", "answer", "How many units of each product were sold in completed orders?", "SELECT p.name, SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id WHERE o.status = 'completed' GROUP BY p.name"),
    ("plain-14", "en", "none", "answer", "What is the total shipping cost of shipments for completed orders?", "SELECT SUM(s.shipping_cost) FROM shipments s JOIN orders o ON o.id = s.order_id WHERE o.status = 'completed'"),
    ("plain-15", "en", "none", "answer", "What is the total value of completed orders for each customer segment?", "SELECT c.segment, SUM(o.total_amount) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'completed' GROUP BY c.segment"),
    # --- Fan-out traps: a natural join repeats the order rows being summed.
    ("fanout-01", "en", "fanout", "answer", "What is total revenue from completed orders?", COMPLETED_REVENUE),
    ("fanout-02", "en", "fanout", "answer", "What is the total value of completed orders that include at least one Developer Tools product?", "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND id IN (SELECT oi.order_id FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id WHERE c.name = 'Developer Tools')"),
    ("fanout-03", "en", "fanout", "answer", "What is the total value of completed orders from Enterprise customers that have been shipped at least once?", "SELECT SUM(o.total_amount) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.segment = 'Enterprise' AND o.status = 'completed' AND EXISTS (SELECT 1 FROM shipments s WHERE s.order_id = o.id)"),
    ("fanout-04", "en", "fanout", "answer", "What is the average total of completed orders that contain more than one line item?", "SELECT AVG(total_amount) FROM orders WHERE status = 'completed' AND id IN (SELECT order_id FROM order_items GROUP BY order_id HAVING COUNT(*) > 1)"),
    ("fanout-05", "en", "fanout", "answer", "What is the total value of completed orders shipped with DHL?", "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND id IN (SELECT order_id FROM shipments WHERE carrier = 'DHL')"),
    ("fanout-06", "en", "fanout", "answer", "What is the total discount given on completed orders that include an AI & Machine Learning product?", "SELECT SUM(discount_amount) FROM orders WHERE status = 'completed' AND id IN (SELECT oi.order_id FROM order_items oi JOIN products p ON p.id = oi.product_id JOIN categories c ON c.id = p.category_id WHERE c.name = 'AI & Machine Learning')"),
    ("fanout-07", "en", "fanout", "answer", "For each customer segment, what is the total value of completed orders that have at least one shipment with an exception?", "SELECT c.segment, SUM(o.total_amount) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status = 'completed' AND o.id IN (SELECT order_id FROM shipments WHERE status = 'exception') GROUP BY c.segment"),
    ("fanout-08", "en", "fanout", "answer", "What is the total tax collected on completed orders that were delivered?", "SELECT SUM(tax_amount) FROM orders WHERE status = 'completed' AND id IN (SELECT order_id FROM shipments WHERE status = 'delivered')"),
    # --- Definition ambiguity: "revenue" or "sales" without saying which orders count.
    ("definition-01", "en", "definition", "clarify", "What is our total revenue?", "SELECT SUM(total_amount) FROM orders"),
    ("definition-02", "en", "definition", "clarify", "What were our total sales in 2025?", "SELECT SUM(total_amount) FROM orders WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'"),
    ("definition-03", "en", "definition", "clarify", "What is total revenue for each customer segment?", "SELECT c.segment, SUM(o.total_amount) FROM orders o JOIN customers c ON c.id = o.customer_id GROUP BY c.segment"),
    ("definition-04", "en", "definition", "clarify", "How much revenue did we make in the first quarter of 2026?", "SELECT SUM(total_amount) FROM orders WHERE order_date >= '2026-01-01' AND order_date < '2026-04-01'"),
    ("definition-05", "en", "definition", "clarify", "What were total sales for Enterprise customers?", "SELECT SUM(o.total_amount) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.segment = 'Enterprise'"),
    # --- Date periods: datetime columns and relative dates beyond the end of the data.
    ("period-01", "en", "period", "answer", "How many orders were placed in January 2026?", "SELECT COUNT(*) FROM orders WHERE order_date >= '2026-01-01' AND order_date < '2026-02-01'"),
    ("period-02", "en", "period", "answer", "How many orders were placed on 11 April 2026?", "SELECT COUNT(*) FROM orders WHERE order_date >= '2026-04-11' AND order_date < '2026-04-12'"),
    ("period-03", "en", "period", "answer", "What was the total value of completed orders in March 2026?", "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND order_date >= '2026-03-01' AND order_date < '2026-04-01'"),
    # The data ends in June 2026, so "last month" means May 2026 in the data.
    ("period-04", "en", "period", "answer", "What was the total value of completed orders last month?", "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND order_date >= '2026-05-01' AND order_date < '2026-06-01'"),
    ("period-05", "en", "period", "answer", "How many support cases were opened in the last 30 days of data?", "SELECT COUNT(*) FROM support_cases WHERE created_at > datetime((SELECT MAX(created_at) FROM support_cases), '-30 days')"),
    # --- Impossible questions: the data cannot answer them, so SlayQL should hand off.
    ("infeasible-01", "en", "infeasible", "handoff", "What is our customer satisfaction score?", ""),
    ("infeasible-02", "en", "infeasible", "handoff", "How much did we spend on marketing campaigns last quarter?", ""),
    ("infeasible-03", "en", "infeasible", "handoff", "Which salesperson closed the most deals?", ""),
    # --- Bahasa Malaysia.
    ("ms-01", "ms", "none", "answer", "Berapa ramai pelanggan yang kita ada?", "SELECT COUNT(*) FROM customers"),
    ("ms-02", "ms", "fanout", "answer", "Berapa jumlah hasil daripada pesanan yang telah selesai?", COMPLETED_REVENUE),
    ("ms-03", "ms", "none", "answer", "Gudang mana yang penggunaannya melebihi 80 peratus?", "SELECT name FROM warehouses WHERE utilization_percent > 80"),
    ("ms-04", "ms", "definition", "clarify", "Berapa jumlah jualan kita?", "SELECT SUM(total_amount) FROM orders"),
    ("ms-05", "ms", "none", "answer", "Berapa banyak pesanan yang dibuat pada tahun 2025?", "SELECT COUNT(*) FROM orders WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'"),
    ("ms-06", "ms", "none", "answer", "Produk mana yang mempunyai harga seunit paling tinggi?", "SELECT name FROM products ORDER BY unit_price DESC LIMIT 1"),
    ("ms-07", "ms", "none", "answer", "Berapa ramai pekerja yang masih aktif?", "SELECT COUNT(*) FROM employees WHERE status = 'active'"),
    ("ms-08", "ms", "fanout", "answer", "Berapa jumlah nilai pesanan yang selesai dan dihantar menggunakan DHL?", "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND id IN (SELECT order_id FROM shipments WHERE carrier = 'DHL')"),
    ("ms-09", "ms", "fanout", "answer", "Berapa jumlah cukai daripada pesanan selesai yang sudah sampai kepada pelanggan?", "SELECT SUM(tax_amount) FROM orders WHERE status = 'completed' AND id IN (SELECT order_id FROM shipments WHERE status = 'delivered')"),
    ("ms-10", "ms", "definition", "clarify", "Berapa jumlah jualan kita pada tahun 2025?", "SELECT SUM(total_amount) FROM orders WHERE order_date >= '2025-01-01' AND order_date < '2026-01-01'"),
    ("ms-11", "ms", "definition", "clarify", "Berapa hasil bagi setiap segmen pelanggan?", "SELECT c.segment, SUM(o.total_amount) FROM orders o JOIN customers c ON c.id = o.customer_id GROUP BY c.segment"),
    # The data ends in June 2026, so "bulan lepas" (last month) means May 2026 in the data.
    ("ms-12", "ms", "period", "answer", "Berapa jumlah nilai pesanan yang selesai pada bulan lepas?", "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND order_date >= '2026-05-01' AND order_date < '2026-06-01'"),
    ("ms-13", "ms", "period", "answer", "Berapa banyak pesanan yang dibuat pada bulan Januari 2026?", "SELECT COUNT(*) FROM orders WHERE order_date >= '2026-01-01' AND order_date < '2026-02-01'"),
    ("ms-14", "ms", "infeasible", "handoff", "Berapakah skor kepuasan pelanggan kita?", ""),
    ("ms-15", "ms", "infeasible", "handoff", "Jurujual mana yang menutup paling banyak urus niaga?", ""),
    # Mixed English and Bahasa Malaysia, as managers often ask.
    ("mixed-01", "mixed", "period", "answer", "Berapa total revenue untuk completed orders bulan Mac 2026?", "SELECT SUM(total_amount) FROM orders WHERE status = 'completed' AND order_date >= '2026-03-01' AND order_date < '2026-04-01'"),
]

# Readings of the ambiguous questions that must differ for "clarify" to be justified.
ALTERNATIVES = {
    "definition-01": ["SELECT SUM(total_amount) FROM orders WHERE status NOT IN ('cancelled', 'refunded')", COMPLETED_REVENUE],
    "definition-02": ["SELECT SUM(total_amount) FROM orders WHERE status NOT IN ('cancelled', 'refunded') AND order_date >= '2025-01-01' AND order_date < '2026-01-01'"],
    "definition-03": ["SELECT c.segment, SUM(o.total_amount) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status NOT IN ('cancelled', 'refunded') GROUP BY c.segment"],
    "definition-04": ["SELECT SUM(total_amount) FROM orders WHERE status NOT IN ('cancelled', 'refunded') AND order_date >= '2026-01-01' AND order_date < '2026-04-01'"],
    "definition-05": ["SELECT SUM(o.total_amount) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.segment = 'Enterprise' AND o.status NOT IN ('cancelled', 'refunded')"],
    "ms-04": ["SELECT SUM(total_amount) FROM orders WHERE status NOT IN ('cancelled', 'refunded')"],
    "ms-10": ["SELECT SUM(total_amount) FROM orders WHERE status NOT IN ('cancelled', 'refunded') AND order_date >= '2025-01-01' AND order_date < '2026-01-01'"],
    "ms-11": ["SELECT c.segment, SUM(o.total_amount) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.status NOT IN ('cancelled', 'refunded') GROUP BY c.segment"],
}


EXTERNAL = Path(__file__).with_name("external_items.jsonl")


def external_items() -> list:
    """Held-out items written by people outside the team (see external_items.example.jsonl).

    They are checked like the team's items and tagged with their author, so results on
    them are reported separately.
    """
    if not EXTERNAL.exists():
        return []
    rows = []
    for number, line in enumerate(EXTERNAL.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not str(row.get("id", "")).startswith("ext-"):
            raise SystemExit(f"external_items.jsonl line {number}: ids must start with ext-")
        if row.get("expected") not in {"answer", "clarify", "handoff"} or not row.get("question"):
            raise SystemExit(f"external_items.jsonl line {number}: needs question and expected (answer, clarify or handoff)")
        if row["expected"] == "clarify" and row.get("alternatives"):
            ALTERNATIVES[row["id"]] = row["alternatives"]
        rows.append((row["id"], row.get("language", "en"), row.get("trap", "none"), row["expected"], row["question"],
                     row.get("gold_sql", ""), row.get("author") or "external"))
    return rows


def main() -> None:
    connection = sqlite3.connect(DB)
    lines = []
    items = [(*item, "team") for item in ITEMS] + external_items()
    for item_id, language, trap, expected, question, gold, author in items:
        preview = None
        if gold:
            rows = connection.execute(gold).fetchall()
            preview = rows[:3]
            for alternative in ALTERNATIVES.get(item_id, []):
                if sorted(connection.execute(alternative).fetchall()) == sorted(rows):
                    raise SystemExit(f"{item_id}: alternative reading gives the same answer, so clarify is not justified")
        if expected == "clarify" and item_id not in ALTERNATIVES:
            raise SystemExit(f"{item_id}: clarify items need alternative readings")
        lines.append(json.dumps({
            "id": item_id,
            "db_id": "slayql_demo",
            "language": language,
            "trap": trap,
            "expected": expected,
            "question": question,
            "gold_sql": gold,
            "alternatives": ALTERNATIVES.get(item_id, []),
            "gold_preview": preview,
            "status": "draft",
            "author": author,
        }, default=str))
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {len(lines)} items to {OUT}")


if __name__ == "__main__":
    main()
