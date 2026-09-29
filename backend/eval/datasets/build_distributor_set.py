"""Build the Malaysian distributor question set on the AutoCount-style sample.

Questions a distributor's owner, sales manager or accounts clerk would ask of an
AutoCount ledger (public/autocount-sample.db, invented data). Written by the team
on 29 September 2026, so it tests realism, not independence.

Every gold query is run; "clarify" items must have readings that give different
results, otherwise asking would be pointless.

Run:  python -m backend.eval.datasets.build_distributor_set
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[3] / "public" / "autocount-sample.db"
OUT = Path(__file__).with_name("distributor_set.jsonl")

LIVE = "Cancelled = 'F'"
Y2025 = "DocDate >= '2025-01-01' AND DocDate < '2026-01-01'"
Y2026 = "DocDate >= '2026-01-01' AND DocDate < '2027-01-01'"
UNPAID = "DocKey NOT IN (SELECT InvoiceDocKey FROM ARPaymentKnockOff)"

# id, language, trap, expected, question, gold SQL
ITEMS = [
    ("dist-01", "en", "none", "answer", "How many debtors do we have?", "SELECT COUNT(*) FROM Debtor"),
    ("dist-02", "en", "none", "answer", "Which sales agent is no longer active?", "SELECT Description FROM SalesAgent WHERE IsActive = 'F'"),
    ("dist-03", "en", "none", "answer", "How many invoices that were not cancelled were issued in August 2026?",
     f"SELECT COUNT(*) FROM IV WHERE {LIVE} AND DocDate >= '2026-08-01' AND DocDate < '2026-09-01'"),
    ("dist-04", "en", "none", "answer", "What is the total invoiced amount, including SST, of non-cancelled invoices in 2025?",
     f"SELECT SUM(TotalIncTax) FROM IV WHERE {LIVE} AND {Y2025}"),
    ("dist-05", "en", "none", "answer", "How many invoices were rejected by LHDN e-invoicing?",
     "SELECT COUNT(*) FROM IV WHERE EInvoiceStatus = 'Rejected'"),
    ("dist-06", "en", "none", "answer", "What is the total value of credit notes issued in 2026?",
     f"SELECT SUM(TotalIncTax) FROM CN WHERE {LIVE} AND {Y2026}"),
    ("dist-07", "en", "none", "answer", "What were total non-cancelled sales, excluding SST, to customers in Johor?",
     f"SELECT SUM(i.TotalExTax) FROM IV i JOIN Debtor d ON d.AccNo = i.DebtorCode WHERE i.{LIVE} AND d.AreaCode = 'JH'"),
    # Fan-out: invoice lines repeat the invoice total.
    ("dist-08", "en", "fanout", "answer", "What is the total invoiced amount, including SST, of non-cancelled invoices that include rice?",
     f"SELECT SUM(TotalIncTax) FROM IV WHERE {LIVE} AND DocKey IN (SELECT d.DocKey FROM IVDTL d JOIN Item t ON t.ItemCode = d.ItemCode WHERE t.ItemGroup = 'BERAS')"),
    ("dist-09", "en", "fanout", "answer", "What is the total invoiced amount, including SST, of non-cancelled invoices that include beverages, for customers in the Klang Valley?",
     f"SELECT SUM(i.TotalIncTax) FROM IV i JOIN Debtor d ON d.AccNo = i.DebtorCode WHERE i.{LIVE} AND d.AreaCode = 'KV' AND i.DocKey IN (SELECT l.DocKey FROM IVDTL l JOIN Item t ON t.ItemCode = l.ItemCode WHERE t.ItemGroup = 'MINUMAN')"),
    # Definitions: "sales" without saying whether cancelled invoices count.
    ("dist-10", "en", "definition", "clarify", "What were our total sales in 2025?", f"SELECT SUM(TotalExTax) FROM IV WHERE {Y2025}"),
    ("dist-11", "ms", "definition", "clarify", "Berapa jumlah jualan kita pada tahun 2026?", f"SELECT SUM(TotalExTax) FROM IV WHERE {Y2026}"),
    ("dist-12", "en", "definition", "clarify", "Which sales agent had the highest sales in 2025, and how much?",
     f"SELECT SalesAgent, SUM(TotalExTax) FROM IV WHERE {Y2025} GROUP BY SalesAgent ORDER BY 2 DESC LIMIT 1"),
    # Periods: the data ends on 15 September 2026, so "last month" is August 2026.
    ("dist-13", "en", "period", "answer", "What were total non-cancelled sales, excluding SST, last month?",
     f"SELECT SUM(TotalExTax) FROM IV WHERE {LIVE} AND DocDate >= '2026-08-01' AND DocDate < '2026-09-01'"),
    ("dist-14", "en", "period", "answer", "How many invoices were issued in the last 30 days of data?",
     "SELECT COUNT(*) FROM IV WHERE DocDate > date((SELECT MAX(DocDate) FROM IV), '-30 days')"),
    # Receivables: an invoice is paid when a receipt knocks it off.
    ("dist-15", "en", "none", "answer", "How many non-cancelled invoices are still unpaid?", f"SELECT COUNT(*) FROM IV WHERE {LIVE} AND {UNPAID}"),
    ("dist-16", "en", "none", "answer", "Which customer owes us the most on unpaid, non-cancelled invoices?",
     f"SELECT d.CompanyName FROM IV i JOIN Debtor d ON d.AccNo = i.DebtorCode WHERE i.{LIVE} AND i.{UNPAID} GROUP BY d.CompanyName ORDER BY SUM(i.TotalIncTax) DESC LIMIT 1"),
    ("dist-17", "en", "none", "answer", "How many customers have unpaid invoices overdue by more than 90 days, as of the latest invoice date?",
     f"SELECT COUNT(DISTINCT DebtorCode) FROM IV WHERE {LIVE} AND {UNPAID} AND DueDate < date((SELECT MAX(DocDate) FROM IV), '-90 days')"),
    # Counting distinct customers, not invoices.
    ("dist-18", "en", "none", "answer", "How many customers bought from us in 2026?",
     f"SELECT COUNT(DISTINCT DebtorCode) FROM IV WHERE {LIVE} AND {Y2026}"),
    ("dist-19", "ms", "none", "answer", "Berapa ramai pelanggan yang membeli daripada kita pada tahun 2026?",
     f"SELECT COUNT(DISTINCT DebtorCode) FROM IV WHERE {LIVE} AND {Y2026}"),
    # The data cannot answer these.
    ("dist-20", "en", "infeasible", "handoff", "Which delivery driver made the most deliveries?", ""),
    ("dist-21", "en", "infeasible", "handoff", "What is our current stock balance for each item?", ""),
    ("dist-22", "ms", "infeasible", "handoff", "Berapakah skor kepuasan pelanggan kita?", ""),
]

# Other valid readings of the ambiguous "sales" questions: with or without cancelled
# invoices, and with or without SST. Answering one with the assumption stated is fair.
ALTERNATIVES = {
    "dist-10": [f"SELECT SUM(TotalExTax) FROM IV WHERE {LIVE} AND {Y2025}", f"SELECT SUM(TotalIncTax) FROM IV WHERE {LIVE} AND {Y2025}",
                f"SELECT SUM(TotalIncTax) FROM IV WHERE {Y2025}"],
    "dist-11": [f"SELECT SUM(TotalExTax) FROM IV WHERE {LIVE} AND {Y2026}", f"SELECT SUM(TotalIncTax) FROM IV WHERE {LIVE} AND {Y2026}",
                f"SELECT SUM(TotalIncTax) FROM IV WHERE {Y2026}"],
    "dist-12": [f"SELECT SalesAgent, SUM(TotalExTax) FROM IV WHERE {LIVE} AND {Y2025} GROUP BY SalesAgent ORDER BY 2 DESC LIMIT 1",
                f"SELECT SalesAgent, SUM(TotalIncTax) FROM IV WHERE {LIVE} AND {Y2025} GROUP BY SalesAgent ORDER BY 2 DESC LIMIT 1"],
}

# Other SQL whose result is also a correct answer.
ACCEPT = {
    "dist-02": ["SELECT SalesAgent FROM SalesAgent WHERE IsActive = 'F'"],
    "dist-16": [f"SELECT d.AccNo FROM IV i JOIN Debtor d ON d.AccNo = i.DebtorCode WHERE i.{LIVE} AND i.{UNPAID} GROUP BY d.AccNo ORDER BY SUM(i.TotalIncTax) DESC LIMIT 1"],
}


def main() -> None:
    connection = sqlite3.connect(DB)
    lines = []
    for item_id, language, trap, expected, question, gold in ITEMS:
        preview = None
        if gold:
            rows = connection.execute(gold).fetchall()
            if not rows or rows == [(None,)]:
                raise SystemExit(f"{item_id}: gold query returns nothing")
            preview = rows[:3]
            for alternative in ALTERNATIVES.get(item_id, []):
                if sorted(connection.execute(alternative).fetchall()) == sorted(rows):
                    raise SystemExit(f"{item_id}: alternative reading gives the same answer, so clarify is not justified")
        if expected == "clarify" and item_id not in ALTERNATIVES:
            raise SystemExit(f"{item_id}: clarify items need alternative readings")
        lines.append(json.dumps({
            "id": item_id, "db_id": "autocount_sample", "language": language, "trap": trap, "expected": expected,
            "question": question, "gold_sql": gold, "alternatives": ALTERNATIVES.get(item_id, []),
            "gold_preview": preview, "status": "team-written", "author": "team", "accept": ACCEPT.get(item_id, []),
        }, default=str))
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {len(lines)} items to {OUT}")
    for line in lines:
        row = json.loads(line)
        print(f"  {row['id']:8} {row['expected']:8} {row['gold_preview']}")


if __name__ == "__main__":
    main()
