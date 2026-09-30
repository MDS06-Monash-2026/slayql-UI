"""Ready-made report packs for common business systems.

A pack is a saved report whose figures are written in advance, so it costs no AI
calls: every figure is still run on the full data and checked, exactly like a
saved report being refreshed. The weekly distributor pack works on AutoCount
(SQL Server) and on AutoCount-style exports (SQLite and others).

Weeks are counted back from the latest invoice date, so a pack run on data that
stops before today still shows a real week instead of zeros.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.app.catalog.discovery import CatalogSchema

DISTRIBUTOR_TABLES = ["IV", "IVDTL", "Item", "ItemGroup", "Debtor", "ARPayment", "ARPaymentKnockOff", "CN"]


class Dialect:
    """The few date and row-limit expressions the packs need, per SQL dialect."""

    def __init__(self, name: str) -> None:
        self.name = name if name in {"sqlite", "tsql", "postgres", "mysql"} else "sqlite"

    def days_before(self, expr: str, days: int) -> str:
        return {
            "sqlite": f"date({expr}, '-{days} day')",
            "tsql": f"DATEADD(day, -{days}, {expr})",
            "postgres": f"(CAST({expr} AS date) - {days})",
            "mysql": f"DATE_SUB({expr}, INTERVAL {days} DAY)",
        }[self.name]

    def month(self, expr: str) -> str:
        return {
            "sqlite": f"strftime('%Y-%m', {expr})",
            "tsql": f"CONVERT(char(7), {expr}, 126)",
            "postgres": f"to_char({expr}, 'YYYY-MM')",
            "mysql": f"DATE_FORMAT({expr}, '%Y-%m')",
        }[self.name]

    def top(self, n: int, select_body: str) -> str:
        """SELECT <body> with at most n rows (body starts after SELECT and includes ORDER BY)."""
        if self.name == "tsql":
            return f"SELECT TOP {n} {select_body}"
        return f"SELECT {select_body} LIMIT {n}"


def _names(catalog: CatalogSchema) -> Optional[Dict[str, str]]:
    """The catalog's own spelling of each table the pack needs, or None if one is missing."""
    by_lower = {name.lower(): name for name in catalog.tables}
    names = {table: by_lower.get(table.lower()) for table in DISTRIBUTOR_TABLES}
    return None if any(value is None for value in names.values()) else names  # type: ignore[return-value]


def distributor_weekly(catalog: CatalogSchema, dialect: str) -> Optional[Dict[str, Any]]:
    t = _names(catalog)
    if not t:
        return None
    d = Dialect(dialect)
    live = "Cancelled <> 'T'"
    # The latest invoice date: "this week" is the 7 days up to it.
    anchor = f"anchor AS (SELECT MAX(DocDate) AS d FROM {t['IV']} WHERE {live})"
    week = f"i.DocDate > {d.days_before('a.d', 7)}"
    last_week = f"i.DocDate > {d.days_before('a.d', 14)} AND i.DocDate <= {d.days_before('a.d', 7)}"
    open_invoices = (
        f"paid AS (SELECT k.InvoiceDocKey AS DocKey, SUM(k.Amount) AS amt FROM {t['ARPaymentKnockOff']} k "
        f"JOIN {t['ARPayment']} p ON p.DocKey = k.PaymentDocKey WHERE p.{live} GROUP BY k.InvoiceDocKey), "
        f"credited AS (SELECT InvoiceDocKey AS DocKey, SUM(TotalIncTax) AS amt FROM {t['CN']} "
        f"WHERE {live} AND InvoiceDocKey IS NOT NULL GROUP BY InvoiceDocKey), "
        f"open_iv AS (SELECT i.DocKey, i.DebtorCode, i.DueDate, "
        f"i.TotalIncTax - COALESCE(p.amt, 0) - COALESCE(c.amt, 0) AS balance FROM {t['IV']} i "
        f"LEFT JOIN paid p ON p.DocKey = i.DocKey LEFT JOIN credited c ON c.DocKey = i.DocKey WHERE i.{live})"
    )
    kpis = [
        {
            "id": "sales-week", "label": "Sales this week", "format": "currency",
            "question": "Sales excluding SST on non-cancelled invoices in the latest 7 days, against the 7 days before",
            "sql": (f"WITH {anchor} SELECT SUM(CASE WHEN {week} THEN i.TotalExTax END) AS value, "
                    f"SUM(CASE WHEN {last_week} THEN i.TotalExTax END) AS previous "
                    f"FROM {t['IV']} i CROSS JOIN anchor a WHERE i.{live}"),
        },
        {
            "id": "collections-week", "label": "Collected this week", "format": "currency",
            "question": "Payments received from customers on non-cancelled receipts in the latest 7 days, against the 7 days before",
            "sql": (f"WITH {anchor} SELECT SUM(CASE WHEN {week} THEN i.PaymentAmt END) AS value, "
                    f"SUM(CASE WHEN {last_week} THEN i.PaymentAmt END) AS previous "
                    f"FROM {t['ARPayment']} i CROSS JOIN anchor a WHERE i.{live}"),
        },
        {
            "id": "outstanding", "label": "Owed by customers", "format": "currency",
            "question": "What customers still owe on non-cancelled invoices after receipts and credit notes",
            "sql": f"WITH {open_invoices} SELECT SUM(balance) AS value FROM open_iv WHERE balance > 0.005",
        },
        {
            "id": "overdue-90", "label": "Overdue over 90 days", "format": "currency",
            "question": "What customers still owe on non-cancelled invoices more than 90 days past their due date",
            "sql": (f"WITH {anchor}, {open_invoices} SELECT SUM(o.balance) AS value FROM open_iv o CROSS JOIN anchor a "
                    f"WHERE o.balance > 0.005 AND o.DueDate < {d.days_before('a.d', 90)}"),
        },
    ]
    panels = [
        {
            "id": "sales-by-month", "title": "Sales by month", "chart": "line", "x": "month", "y": "sales",
            "format": "currency", "span": 2, "purpose": "trend",
            "question": "Sales excluding SST on non-cancelled invoices by month, last 12 months",
            "sql": (f"WITH {anchor} SELECT {d.month('i.DocDate')} AS month, SUM(i.TotalExTax) AS sales "
                    f"FROM {t['IV']} i CROSS JOIN anchor a WHERE i.{live} AND i.DocDate > {d.days_before('a.d', 365)} "
                    f"GROUP BY {d.month('i.DocDate')} ORDER BY month"),
        },
        {
            "id": "overdue-customers", "title": "Customers with the most overdue", "chart": "bar_h",
            "x": "customer", "y": "overdue", "format": "currency", "span": 1, "purpose": "ranking",
            "question": "Customers who owe the most on invoices past their due date",
            "sql": (f"WITH {anchor}, {open_invoices} " + d.top(10,
                    f"dr.CompanyName AS customer, SUM(o.balance) AS overdue FROM open_iv o "
                    f"JOIN {t['Debtor']} dr ON dr.AccNo = o.DebtorCode CROSS JOIN anchor a "
                    f"WHERE o.balance > 0.005 AND o.DueDate < a.d GROUP BY dr.CompanyName ORDER BY overdue DESC")),
        },
        {
            "id": "top-items", "title": "Top items in the last 30 days", "chart": "bar_h",
            "x": "item", "y": "sales", "format": "currency", "span": 1, "purpose": "ranking",
            "question": "Items with the highest sales on non-cancelled invoices in the latest 30 days",
            "sql": (f"WITH {anchor} " + d.top(10,
                    f"it.Description AS item, SUM(l.SubTotal) AS sales FROM {t['IVDTL']} l "
                    f"JOIN {t['IV']} i ON i.DocKey = l.DocKey JOIN {t['Item']} it ON it.ItemCode = l.ItemCode "
                    f"CROSS JOIN anchor a WHERE i.{live} AND i.DocDate > {d.days_before('a.d', 30)} "
                    f"GROUP BY it.Description ORDER BY sales DESC")),
        },
        {
            "id": "margin-by-group", "title": "Gross margin by item group, last 90 days", "chart": "bar_h",
            "x": "item_group", "y": "margin", "format": "currency", "span": 1, "purpose": "comparison",
            "question": "Sales minus item cost by item group on non-cancelled invoices in the latest 90 days",
            "sql": (f"WITH {anchor} SELECT g.Description AS item_group, SUM(l.SubTotal - l.Qty * it.UnitCost) AS margin "
                    f"FROM {t['IVDTL']} l JOIN {t['IV']} i ON i.DocKey = l.DocKey "
                    f"JOIN {t['Item']} it ON it.ItemCode = l.ItemCode JOIN {t['ItemGroup']} g ON g.ItemGroup = it.ItemGroup "
                    f"CROSS JOIN anchor a WHERE i.{live} AND i.DocDate > {d.days_before('a.d', 90)} "
                    f"GROUP BY g.Description ORDER BY margin DESC"),
        },
        {
            "id": "sales-by-agent", "title": "Sales by agent, last 30 days", "chart": "bar",
            "x": "agent", "y": "sales", "format": "currency", "span": 1, "purpose": "comparison",
            "question": "Sales excluding SST on non-cancelled invoices by sales agent in the latest 30 days",
            "sql": (f"WITH {anchor} SELECT i.SalesAgent AS agent, SUM(i.TotalExTax) AS sales FROM {t['IV']} i "
                    f"CROSS JOIN anchor a WHERE i.{live} AND i.DocDate > {d.days_before('a.d', 30)} "
                    f"GROUP BY i.SalesAgent ORDER BY sales DESC"),
        },
        {
            "id": "slow-items", "title": "Items with no sales in 90 days", "chart": "table",
            "x": "item", "y": "last_sold", "format": "number", "span": 1, "purpose": "exception",
            "question": "Items not sold on any non-cancelled invoice in the latest 90 days, with the date each last sold",
            "sql": (f"WITH {anchor}, last_sale AS (SELECT l.ItemCode, MAX(i.DocDate) AS last_sold FROM {t['IVDTL']} l "
                    f"JOIN {t['IV']} i ON i.DocKey = l.DocKey WHERE i.{live} GROUP BY l.ItemCode) "
                    f"SELECT it.ItemCode AS item_code, it.Description AS item, s.last_sold FROM {t['Item']} it "
                    f"LEFT JOIN last_sale s ON s.ItemCode = it.ItemCode CROSS JOIN anchor a "
                    f"WHERE s.last_sold IS NULL OR s.last_sold <= {d.days_before('a.d', 90)} ORDER BY s.last_sold"),
        },
    ]
    return {
        "title": "Weekly sales and collections",
        "subtitle": "Sales, cash collected, what customers owe, and what is moving. Weeks end on the latest invoice date.",
        "question": "Weekly distributor pack",
        "kpis": kpis,
        "panels": panels,
    }


TEMPLATES = {
    "distributor-weekly": {
        "title": "Weekly sales and collections (distributor)",
        "description": "Sales and collections this week, what customers owe and what is overdue, top items, margin by item group, and slow-moving stock. For AutoCount data.",
        "build": distributor_weekly,
    },
}


def available_templates(catalog: CatalogSchema, dialect: str) -> List[Dict[str, str]]:
    return [
        {"id": template_id, "title": template["title"], "description": template["description"]}
        for template_id, template in TEMPLATES.items()
        if template["build"](catalog, dialect) is not None
    ]


def build_template(template_id: str, catalog: CatalogSchema, dialect: str) -> Optional[Dict[str, Any]]:
    template = TEMPLATES.get(template_id)
    return template["build"](catalog, dialect) if template else None
