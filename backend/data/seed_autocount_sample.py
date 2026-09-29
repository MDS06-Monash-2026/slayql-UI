"""Build an AutoCount-style sample database for a Malaysian FMCG distributor.

Table and column names follow the layout AutoCount Accounting uses (IV / IVDTL for
sales invoices, CN for credit notes, ARPayment and ARPaymentKnockOff for receipts,
Debtor, Item). It is invented sample data for demonstrations, not a real AutoCount
database, and it covers only the handful of tables SlayQL's examples need.

It contains the traps real ledgers have: invoice lines that multiply invoice totals
when joined, cancelled documents marked Cancelled = 'T', credit notes that reduce
sales, and payments that knock off several invoices at once.

Run:  python -m backend.data.seed_autocount_sample     (writes public/autocount-sample.db)
"""
from __future__ import annotations

import random
import sqlite3
import uuid
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "public" / "autocount-sample.db"
START, END = date(2025, 1, 1), date(2026, 9, 15)
SST_RATE = 0.05  # sales tax on the taxable item groups

AREAS = [
    ("KV", "Klang Valley"), ("JH", "Johor"), ("PG", "Pulau Pinang"), ("PK", "Perak"),
    ("NS", "Negeri Sembilan"), ("MK", "Melaka"), ("PH", "Pahang"), ("KL", "Kelantan"), ("SB", "Sabah"),
]
AGENTS = [
    ("AHMAD", "Ahmad Faizal"), ("MEILING", "Tan Mei Ling"), ("RAVI", "Ravi Chandran"),
    ("SITI", "Siti Aminah"), ("KUMAR", "Kumar Selvam"), ("JASON", "Jason Lim"),
]
GROUPS = [("BERAS", "Rice", False), ("MINYAK", "Cooking oil", False), ("TEPUNG", "Flour and sugar", False),
          ("MINUMAN", "Beverages", True), ("SNEK", "Snacks and instant noodles", True), ("SOS", "Sauces and condiments", True)]
ITEMS = [
    ("BR-10W", "Beras Wangi 10kg", "BERAS", "BAG", 42.90), ("BR-05P", "Beras Putih Tempatan 5kg", "BERAS", "BAG", 21.50),
    ("BR-10B", "Beras Basmathi 10kg", "BERAS", "BAG", 69.00), ("MN-05S", "Minyak Masak Sawit 5kg", "MINYAK", "BTL", 31.80),
    ("MN-02S", "Minyak Masak Sawit 2kg", "MINYAK", "BTL", 13.90), ("MN-01J", "Minyak Jagung 1L", "MINYAK", "BTL", 12.40),
    ("TP-01G", "Tepung Gandum 1kg", "TEPUNG", "PKT", 3.20), ("TP-01B", "Tepung Beras 500g", "TEPUNG", "PKT", 2.60),
    ("GL-01P", "Gula Pasir 1kg", "TEPUNG", "PKT", 3.40), ("GL-02P", "Gula Perang 1kg", "TEPUNG", "PKT", 4.10),
    ("KP-3N1", "Kopi 3-dalam-1 (30 pek)", "MINUMAN", "BOX", 18.90), ("TH-50", "Teh Uncang (50 uncang)", "MINUMAN", "BOX", 9.80),
    ("CK-1.5", "Minuman Coklat Malt 1.5kg", "MINUMAN", "TIN", 36.50), ("SS-500", "Susu Pekat Manis 500g", "MINUMAN", "TIN", 4.20),
    ("MI-KR5", "Mi Segera Perisa Kari (5 pek)", "SNEK", "PKT", 6.30), ("MI-AY5", "Mi Segera Perisa Ayam (5 pek)", "SNEK", "PKT", 6.10),
    ("KR-UBI", "Kerepek Ubi 200g", "SNEK", "PKT", 3.90), ("BS-KRM", "Biskut Krim (18 keping)", "SNEK", "PKT", 5.50),
    ("KC-1L", "Kicap Manis 1L", "SOS", "BTL", 7.80), ("SC-340", "Sos Cili 340g", "SOS", "BTL", 4.60),
    ("SD-425", "Sardin Dalam Sos Tomato 425g", "SOS", "TIN", 6.90), ("BC-1KG", "Belacan 1kg", "SOS", "PKT", 14.50),
]
PREFIXES = ["Syarikat", "Perniagaan", "Kedai Runcit", "Pasar Mini", "Borong", "Kedai Serbaneka", "Pusat Dagangan"]
NAMES = ["Maju Jaya", "Sri Murni", "Ah Seng", "Barakah", "Kim Hock", "Sinar Harapan", "Muthu", "Seri Mewah", "Bintang Timur",
         "Keluarga", "Hup Heng", "Al-Amin", "Cahaya", "Rakyat", "Tanjung", "Sentosa", "Delima", "Meranti", "Pelangi", "Berjaya"]
SUFFIXES = ["Sdn Bhd", "Enterprise", "Trading", "Sdn Bhd", "Enterprise"]
TERMS = [("C.O.D.", 0), ("30 Days", 30), ("30 Days", 30), ("60 Days", 60)]
PAYMENT_METHODS = ["Online Transfer", "Online Transfer", "DuitNow", "Cheque", "Cash"]


def seasonal_weight(day: date) -> float:
    """More orders before Hari Raya, Chinese New Year and year-end."""
    month = (day.year, day.month)
    peaks = {(2025, 1): 1.5, (2025, 3): 1.7, (2025, 12): 1.3, (2026, 2): 1.6, (2026, 3): 1.5}
    return peaks.get(month, 1.0) * (0.35 if day.weekday() == 6 else 1.0)


def build(path: Path = OUT) -> Path:
    rng = random.Random(2026)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    db = sqlite3.connect(path)
    db.executescript("""
    CREATE TABLE Area (AreaCode TEXT PRIMARY KEY, Description TEXT NOT NULL);
    CREATE TABLE SalesAgent (SalesAgent TEXT PRIMARY KEY, Description TEXT NOT NULL, IsActive TEXT NOT NULL);
    CREATE TABLE ItemGroup (ItemGroup TEXT PRIMARY KEY, Description TEXT NOT NULL, SSTApplicable TEXT NOT NULL);
    CREATE TABLE Item (ItemCode TEXT PRIMARY KEY, Description TEXT NOT NULL, ItemGroup TEXT REFERENCES ItemGroup(ItemGroup),
        UOM TEXT, UnitPrice REAL, UnitCost REAL);
    CREATE TABLE Debtor (AccNo TEXT PRIMARY KEY, CompanyName TEXT NOT NULL, AreaCode TEXT REFERENCES Area(AreaCode),
        SalesAgent TEXT REFERENCES SalesAgent(SalesAgent), CreditTerm TEXT, CreditLimit REAL, TIN TEXT);
    CREATE TABLE IV (DocKey INTEGER PRIMARY KEY, DocNo TEXT NOT NULL, DocDate TEXT NOT NULL, DueDate TEXT NOT NULL,
        DebtorCode TEXT REFERENCES Debtor(AccNo), SalesAgent TEXT REFERENCES SalesAgent(SalesAgent),
        TotalExTax REAL, Tax REAL, TotalIncTax REAL, Cancelled TEXT NOT NULL, EInvoiceUUID TEXT, EInvoiceStatus TEXT);
    CREATE TABLE IVDTL (DtlKey INTEGER PRIMARY KEY, DocKey INTEGER REFERENCES IV(DocKey), Seq INTEGER,
        ItemCode TEXT REFERENCES Item(ItemCode), Qty REAL, UnitPrice REAL, Discount REAL, SubTotal REAL);
    CREATE TABLE CN (DocKey INTEGER PRIMARY KEY, DocNo TEXT NOT NULL, DocDate TEXT NOT NULL,
        DebtorCode TEXT REFERENCES Debtor(AccNo), InvoiceDocKey INTEGER REFERENCES IV(DocKey),
        Reason TEXT, TotalIncTax REAL, Cancelled TEXT NOT NULL);
    CREATE TABLE ARPayment (DocKey INTEGER PRIMARY KEY, DocNo TEXT NOT NULL, DocDate TEXT NOT NULL,
        DebtorCode TEXT REFERENCES Debtor(AccNo), PaymentMethod TEXT, PaymentAmt REAL, Cancelled TEXT NOT NULL);
    CREATE TABLE ARPaymentKnockOff (KnockOffKey INTEGER PRIMARY KEY, PaymentDocKey INTEGER REFERENCES ARPayment(DocKey),
        InvoiceDocKey INTEGER REFERENCES IV(DocKey), Amount REAL);
    """)
    db.executemany("INSERT INTO Area VALUES (?, ?)", AREAS)
    db.executemany("INSERT INTO SalesAgent VALUES (?, ?, ?)", [(a, n, "F" if a == "JASON" else "T") for a, n in AGENTS])
    db.executemany("INSERT INTO ItemGroup VALUES (?, ?, ?)", [(g, d, "T" if sst else "F") for g, d, sst in GROUPS])
    taxable = {g for g, _, sst in GROUPS if sst}
    items = []
    for code, desc, group, uom, price in ITEMS:
        cost = round(price * rng.uniform(0.72, 0.86), 2)
        items.append((code, desc, group, uom, price, cost))
    db.executemany("INSERT INTO Item VALUES (?, ?, ?, ?, ?, ?)", items)

    debtors = []
    used = set()
    for index in range(1, 75):
        while True:
            name = f"{rng.choice(PREFIXES)} {rng.choice(NAMES)} {rng.choice(SUFFIXES)}"
            if name not in used:
                used.add(name)
                break
        area = rng.choices([a for a, _ in AREAS], weights=[30, 14, 12, 10, 8, 7, 6, 5, 4])[0]
        term = rng.choice(TERMS)
        debtors.append({
            "AccNo": f"300-{name.split()[-2][0]}{index:03d}", "CompanyName": name, "AreaCode": area,
            "SalesAgent": rng.choice([a for a, _ in AGENTS]), "CreditTerm": term[0], "days": term[1],
            "CreditLimit": rng.choice([5000, 10000, 20000, 50000]), "TIN": f"C{rng.randint(10**9, 10**10 - 1)}",
            # A few big accounts buy far more, as in real distribution.
            "size": rng.choice([1, 1, 1, 2, 2, 3, 6]),
        })
    db.executemany("INSERT INTO Debtor VALUES (?, ?, ?, ?, ?, ?, ?)",
                   [(d["AccNo"], d["CompanyName"], d["AreaCode"], d["SalesAgent"], d["CreditTerm"], d["CreditLimit"], d["TIN"]) for d in debtors])

    invoices, lines, credit_notes, payments, knockoffs = [], [], [], [], []
    doc_key, dtl_key, day = 1, 1, START
    while day <= END:
        for _ in range(rng.choices([0, 1, 2, 3, 4, 5], weights=[3, 6, 7, 5, 3, 1])[0]):
            if rng.random() > seasonal_weight(day) / 1.8:
                continue
            debtor = rng.choices(debtors, weights=[d["size"] for d in debtors])[0]
            total, tax = 0.0, 0.0
            for seq in range(1, rng.randint(1, 6) + 1):
                code, _, group, _, price, _ = rng.choice(items)
                qty = rng.choice([5, 10, 10, 20, 24, 30, 50, 100]) * debtor["size"]
                discount = round(price * qty * rng.choice([0, 0, 0, 0.02, 0.05]), 2)
                subtotal = round(price * qty - discount, 2)
                total += subtotal
                tax += subtotal * SST_RATE if group in taxable else 0
                lines.append((dtl_key, doc_key, seq, code, qty, price, discount, subtotal))
                dtl_key += 1
            total, tax = round(total, 2), round(tax, 2)
            cancelled = "T" if rng.random() < 0.03 else "F"
            einvoice = day >= date(2025, 7, 1)
            invoices.append({
                "DocKey": doc_key, "DocNo": f"I-{doc_key:06d}", "DocDate": day.isoformat(),
                "DueDate": (day + timedelta(days=debtor["days"])).isoformat(), "DebtorCode": debtor["AccNo"],
                "SalesAgent": debtor["SalesAgent"], "TotalExTax": total, "Tax": tax, "TotalIncTax": round(total + tax, 2),
                "Cancelled": cancelled, "EInvoiceUUID": str(uuid.UUID(int=rng.getrandbits(128))) if einvoice else None,
                "EInvoiceStatus": ("Cancelled" if cancelled == "T" else rng.choices(["Valid", "Submitted", "Rejected"], weights=[94, 4, 2])[0]) if einvoice else None,
                "days": debtor["days"],
            })
            doc_key += 1
        day += timedelta(days=1)

    cn_key = 1
    for invoice in invoices:
        if invoice["Cancelled"] == "F" and rng.random() < 0.05:
            cn_date = date.fromisoformat(invoice["DocDate"]) + timedelta(days=rng.randint(3, 40))
            if cn_date <= END:
                credit_notes.append((cn_key, f"CN-{cn_key:05d}", cn_date.isoformat(), invoice["DebtorCode"], invoice["DocKey"],
                                     rng.choice(["Goods returned", "Damaged goods", "Price adjustment", "Short delivery"]),
                                     round(invoice["TotalIncTax"] * rng.uniform(0.05, 0.35), 2), "F"))
                cn_key += 1

    # Receipts: most invoices are paid around their due date; some stay outstanding.
    pay_key, ko_key = 1, 1
    open_by_debtor: dict = {}
    for invoice in invoices:
        if invoice["Cancelled"] == "T":
            continue
        issued = date.fromisoformat(invoice["DocDate"])
        chance_unpaid = 0.25 if issued > END - timedelta(days=75) else 0.06
        if rng.random() < chance_unpaid:
            continue
        paid_on = issued + timedelta(days=max(0, invoice["days"] + rng.randint(-10, 45)))
        if paid_on > END:
            continue
        open_by_debtor.setdefault((invoice["DebtorCode"], paid_on.isocalendar()[:2]), []).append((invoice, paid_on))
    for (debtor_code, _), batch in sorted(open_by_debtor.items(), key=lambda item: min(p for _, p in item[1])):
        paid_on = max(p for _, p in batch)
        amount = round(sum(i["TotalIncTax"] for i, _ in batch), 2)
        payments.append((pay_key, f"OR-{pay_key:06d}", paid_on.isoformat(), debtor_code, rng.choice(PAYMENT_METHODS), amount, "F"))
        for invoice, _ in batch:
            knockoffs.append((ko_key, pay_key, invoice["DocKey"], invoice["TotalIncTax"]))
            ko_key += 1
        pay_key += 1

    db.executemany("INSERT INTO IV VALUES (:DocKey, :DocNo, :DocDate, :DueDate, :DebtorCode, :SalesAgent, :TotalExTax, :Tax, :TotalIncTax, :Cancelled, :EInvoiceUUID, :EInvoiceStatus)", invoices)
    db.executemany("INSERT INTO IVDTL VALUES (?, ?, ?, ?, ?, ?, ?, ?)", lines)
    db.executemany("INSERT INTO CN VALUES (?, ?, ?, ?, ?, ?, ?, ?)", credit_notes)
    db.executemany("INSERT INTO ARPayment VALUES (?, ?, ?, ?, ?, ?, ?)", payments)
    db.executemany("INSERT INTO ARPaymentKnockOff VALUES (?, ?, ?, ?)", knockoffs)
    db.commit()
    db.execute("VACUUM")
    db.close()
    return path


if __name__ == "__main__":
    out = build()
    counts = sqlite3.connect(out).execute(
        "SELECT (SELECT COUNT(*) FROM IV), (SELECT COUNT(*) FROM IVDTL), (SELECT COUNT(*) FROM CN), "
        "(SELECT COUNT(*) FROM ARPayment), (SELECT COUNT(*) FROM ARPaymentKnockOff)").fetchone()
    print(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB): IV {counts[0]}, IVDTL {counts[1]}, CN {counts[2]}, "
          f"ARPayment {counts[3]}, knock-offs {counts[4]}")
