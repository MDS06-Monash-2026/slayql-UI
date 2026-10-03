import sqlite3
from pathlib import Path
import random
from datetime import datetime, timedelta

def seed_sqlite_demo(db_path: str):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(str(path))
    cursor = conn.cursor()

    # Drop existing tables safely without file-handle locking issues
    cursor.executescript("""
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS shipment_items;
    DROP TABLE IF EXISTS shipments;
    DROP TABLE IF EXISTS inventory_movements;
    DROP TABLE IF EXISTS product_suppliers;
    DROP TABLE IF EXISTS employees;
    DROP TABLE IF EXISTS teams;
    DROP TABLE IF EXISTS suppliers;
    DROP TABLE IF EXISTS warehouses;
    DROP TABLE IF EXISTS regions;
    DROP TABLE IF EXISTS support_cases;
    DROP TABLE IF EXISTS payments;
    DROP TABLE IF EXISTS order_items;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS customers;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS categories;
    PRAGMA foreign_keys = ON;

    CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        department TEXT NOT NULL,
        description TEXT
    );

    CREATE TABLE products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT UNIQUE NOT NULL,
        category_id INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        cost_price REAL NOT NULL,
        inventory_count INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('active', 'discontinued', 'out_of_stock')),
        FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        company TEXT,
        segment TEXT NOT NULL CHECK (segment IN ('Enterprise', 'Mid-Market', 'SMB', 'Consumer')),
        city TEXT NOT NULL,
        country TEXT NOT NULL,
        created_at TEXT NOT NULL
    );

    CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        order_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('completed', 'processing', 'shipped', 'cancelled', 'refunded')),
        subtotal REAL NOT NULL,
        discount_amount REAL NOT NULL DEFAULT 0.0,
        tax_amount REAL NOT NULL DEFAULT 0.0,
        total_amount REAL NOT NULL,
        payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'pending', 'failed', 'refunded')),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price REAL NOT NULL,
        discount REAL NOT NULL DEFAULT 0.0,
        subtotal REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        transaction_ref TEXT UNIQUE NOT NULL,
        payment_provider TEXT NOT NULL CHECK (payment_provider IN ('Stripe', 'Adyen', 'PayPal', 'WireTransfer')),
        amount REAL NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('succeeded', 'pending', 'failed')),
        processed_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE support_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        order_id INTEGER,
        subject TEXT NOT NULL,
        priority TEXT NOT NULL CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
        status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
        resolution_time_hours REAL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE regions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        country_code TEXT NOT NULL,
        sales_target REAL NOT NULL
    );

    CREATE TABLE warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        region_id INTEGER NOT NULL,
        name TEXT UNIQUE NOT NULL,
        capacity_units INTEGER NOT NULL,
        utilization_percent REAL NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('operational', 'maintenance', 'constrained')),
        FOREIGN KEY (region_id) REFERENCES regions(id)
    );

    CREATE TABLE suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        region_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        reliability_score REAL NOT NULL,
        lead_time_days INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('preferred', 'approved', 'review')),
        FOREIGN KEY (region_id) REFERENCES regions(id)
    );

    CREATE TABLE product_suppliers (
        product_id INTEGER NOT NULL,
        supplier_id INTEGER NOT NULL,
        supplier_sku TEXT NOT NULL,
        unit_cost REAL NOT NULL,
        allocation_percent REAL NOT NULL,
        PRIMARY KEY (product_id, supplier_id),
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        supplier_id INTEGER,
        movement_type TEXT NOT NULL CHECK (movement_type IN ('receipt', 'sale', 'transfer', 'adjustment', 'return')),
        quantity INTEGER NOT NULL,
        occurred_at TEXT NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );

    CREATE TABLE shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        warehouse_id INTEGER NOT NULL,
        carrier TEXT NOT NULL,
        tracking_number TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('label_created', 'in_transit', 'delivered', 'exception')),
        shipped_at TEXT,
        delivered_at TEXT,
        shipping_cost REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    );

    CREATE TABLE shipment_items (
        shipment_id INTEGER NOT NULL,
        order_item_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        PRIMARY KEY (shipment_id, order_item_id),
        FOREIGN KEY (shipment_id) REFERENCES shipments(id),
        FOREIGN KEY (order_item_id) REFERENCES order_items(id)
    );

    CREATE TABLE teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        region_id INTEGER NOT NULL,
        name TEXT UNIQUE NOT NULL,
        function TEXT NOT NULL,
        annual_budget REAL NOT NULL,
        FOREIGN KEY (region_id) REFERENCES regions(id)
    );

    CREATE TABLE employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        manager_id INTEGER,
        full_name TEXT NOT NULL,
        title TEXT NOT NULL,
        hire_date TEXT NOT NULL,
        salary REAL NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'leave', 'contract')),
        FOREIGN KEY (team_id) REFERENCES teams(id),
        FOREIGN KEY (manager_id) REFERENCES employees(id)
    );

    -- Indexes
    CREATE INDEX idx_products_category ON products(category_id);
    CREATE INDEX idx_orders_customer ON orders(customer_id);
    CREATE INDEX idx_orders_date ON orders(order_date);
    CREATE INDEX idx_order_items_order ON order_items(order_id);
    CREATE INDEX idx_order_items_product ON order_items(product_id);
    CREATE INDEX idx_payments_order ON payments(order_id);
    CREATE INDEX idx_support_customer ON support_cases(customer_id);
    CREATE INDEX idx_warehouses_region ON warehouses(region_id);
    CREATE INDEX idx_suppliers_region ON suppliers(region_id);
    CREATE INDEX idx_product_suppliers_product ON product_suppliers(product_id);
    CREATE INDEX idx_inventory_product ON inventory_movements(product_id);
    CREATE INDEX idx_inventory_warehouse ON inventory_movements(warehouse_id);
    CREATE INDEX idx_shipments_order ON shipments(order_id);
    CREATE INDEX idx_shipments_warehouse ON shipments(warehouse_id);
    CREATE INDEX idx_shipment_items_shipment ON shipment_items(shipment_id);
    CREATE INDEX idx_teams_region ON teams(region_id);
    CREATE INDEX idx_employees_team ON employees(team_id);
    """)

    # 2. Seed data: about three years of a growing B2B software reseller, with the patterns a
    # real business has (growth, seasonality, weekday rhythm, shifting product mix, a refund
    # incident, carriers and payment providers that differ, regions above and below target),
    # so dashboards built on it have something to show. Deterministic: the same seed gives the
    # same database, which the tests and the evaluation depend on.
    random.seed(42)
    start, end = datetime(2024, 1, 1), datetime(2026, 9, 30, 18, 0, 0)
    fmt = lambda moment: moment.strftime('%Y-%m-%d %H:%M:%S')  # noqa: E731

    def months_since_start(moment):
        return (moment.year - start.year) * 12 + moment.month - start.month

    categories_data = [
        ("Cloud Infrastructure", "cloud-infra", "Engineering", "Virtual servers, storage volumes, and managed networks"),
        ("Database Systems", "database-systems", "Engineering", "Relational and vector database instances"),
        ("Developer Tools", "dev-tools", "Engineering", "CI/CD pipelines, IDE licenses, and code analyzers"),
        ("Security & Compliance", "security-compliance", "Operations", "Identity access management, audit logs, and firewalls"),
        ("AI & Machine Learning", "ai-ml", "Data Science", "Model inference endpoints, GPUs, and fine-tuning pipelines"),
        ("Business Analytics", "business-analytics", "Product", "BI reporting dashboards and telemetry export connectors"),
        ("Customer Engagement", "customer-engagement", "Sales", "Omnichannel messaging, email automation, and CRM sync")
    ]
    cursor.executemany("INSERT INTO categories (name, slug, department, description) VALUES (?, ?, ?, ?)", categories_data)

    product_names = {
        1: ["Compute Instance S", "Compute Instance M", "Compute Instance L", "Block Storage 1TB", "Object Storage Archive", "Managed Kubernetes", "Load Balancer Pro", "Private Network Link"],
        2: ["Postgres Managed Basic", "Postgres Managed HA", "MySQL Managed", "Vector Store Starter", "Vector Store Scale", "Redis Cache", "Data Warehouse Node", "Backup Vault"],
        3: ["CI Runner Minutes", "Code Review Seats", "IDE Team License", "Static Analyzer", "Artifact Registry", "Feature Flags", "API Gateway Dev", "Test Grid"],
        4: ["Identity SSO", "Audit Log Retention", "Web Firewall", "Secrets Manager", "Endpoint Protection", "Compliance Pack ISO", "Threat Detection", "Key Management"],
        5: ["GPU Inference A10", "GPU Inference H100", "Fine-tuning Pipeline", "Embedding API", "Model Hosting", "Labeling Workforce", "AutoML Studio", "Speech API"],
        6: ["BI Dashboards Seat", "Telemetry Export", "Data Connectors", "Embedded Analytics", "Metrics Store", "Report Scheduler", "Forecasting Module", "Data Catalog"],
        7: ["Email Automation", "SMS Gateway", "WhatsApp Business", "CRM Sync", "Live Chat Seats", "Survey Studio", "Loyalty Engine", "Push Notifications"],
    }
    # How each category's demand moves over the period (index 0 = Jan 2024): AI rises, developer tools fade.
    category_trend = {1: 0.0, 2: 0.01, 3: -0.025, 4: 0.012, 5: 0.06, 6: 0.015, 7: -0.005}
    category_weight = {1: 1.3, 2: 1.1, 3: 1.0, 4: 0.9, 5: 0.6, 6: 0.8, 7: 0.9}
    products_data = []
    for cat_id, names in product_names.items():
        for i, name in enumerate(names, start=1):
            unit_price = round(random.uniform(40.0, 420.0) * (1 + i * 0.45), 2)
            cost_price = round(unit_price * random.uniform(0.32, 0.66), 2)
            inventory = random.choice([0, 3, 7] + [random.randint(25, 900) for _ in range(12)])
            status = 'out_of_stock' if inventory == 0 else ('discontinued' if (cat_id == 3 and i in (7, 8)) else 'active')
            products_data.append((name, f"SKU-{cat_id:02d}-{i:02d}", cat_id, unit_price, cost_price, inventory, status))
    cursor.executemany("""
        INSERT INTO products (name, sku, category_id, unit_price, cost_price, inventory_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, products_data)

    first_names = ["Sarah", "Alex", "David", "Elena", "Michael", "Sophia", "James", "Emma", "Liam", "Olivia", "Chen", "Marcus", "Priya", "Lucas", "Aria",
                   "Aisyah", "Hafiz", "Mei Ling", "Arjun", "Nurul", "Kenji", "Siti", "Daniel", "Farah", "Wei Jie", "Ananya", "Omar", "Hana", "Ravi", "Yuki"]
    last_names = ["Chen", "Smith", "Rodriguez", "Vance", "Taylor", "Kim", "Patel", "Johnson", "Mueller", "O'Connor", "Watanabe", "Dubois", "Al-Mansoor", "Silva", "Novak",
                  "Tan", "Lim", "Abdullah", "Wong", "Ismail", "Nakamura", "Kaur", "Rahman", "Lee", "Ng", "Hassan", "Sato", "Fernandez", "Ong", "Ibrahim"]
    company_words = ["Acme", "Nexus", "Apex", "CloudScale", "Quantix", "Starlight", "Vanguard", "Hyperion", "Synthetix", "OmniGlobal", "BluePeak", "Zenith",
                     "Harbor", "Lumen", "Orbit", "Pinnacle", "Kestrel", "Meridian", "Sentinel", "Tidewater", "Granite", "Aurora", "Vertex", "Cobalt"]
    company_kinds = ["Corp", "Tech", "Labs", "Data", "Media", "Financial", "AI", "Bio", "Systems", "Analytics", "Logistics", "Retail"]
    companies = sorted({f"{random.choice(company_words)} {random.choice(company_kinds)}" for _ in range(160)})[:110]
    # City, country, region name. Regions match the regions table below.
    cities = [("San Francisco", "USA", "North America West"), ("Seattle", "USA", "North America West"), ("Los Angeles", "USA", "North America West"),
              ("New York", "USA", "North America East"), ("Boston", "USA", "North America East"), ("Toronto", "Canada", "North America East"),
              ("London", "UK", "Northern Europe"), ("Dublin", "Ireland", "Northern Europe"), ("Stockholm", "Sweden", "Northern Europe"),
              ("Berlin", "Germany", "Central Europe"), ("Paris", "France", "Central Europe"), ("Zurich", "Switzerland", "Central Europe"),
              ("Singapore", "Singapore", "Southeast Asia"), ("Kuala Lumpur", "Malaysia", "Southeast Asia"), ("Penang", "Malaysia", "Southeast Asia"),
              ("Jakarta", "Indonesia", "Southeast Asia"), ("Bangkok", "Thailand", "Southeast Asia"),
              ("Tokyo", "Japan", "Northeast Asia"), ("Seoul", "South Korea", "Northeast Asia"), ("Osaka", "Japan", "Northeast Asia"),
              ("Sydney", "Australia", "Oceania"), ("Melbourne", "Australia", "Oceania"), ("Auckland", "New Zealand", "Oceania"),
              ("Dubai", "UAE", "Middle East"), ("Riyadh", "Saudi Arabia", "Middle East")]
    city_weights = [9, 5, 4, 9, 4, 4, 7, 3, 2, 6, 5, 3, 7, 9, 4, 3, 3, 6, 3, 2, 4, 3, 2, 3, 2]
    region_names = ["North America West", "North America East", "Northern Europe", "Central Europe", "Southeast Asia", "Northeast Asia", "Oceania", "Middle East"]
    region_index = {name: i + 1 for i, name in enumerate(region_names)}

    customers_data, customer_meta = [], []
    for c_id in range(1, 421):
        fn, ln = random.choice(first_names), random.choice(last_names)
        # Enterprise grows as a share of new customers over the period.
        created = start + timedelta(days=random.betavariate(1.1, 0.9) * 990, hours=random.randint(8, 19))
        late = months_since_start(created) / 33
        seg = random.choices(["Enterprise", "Mid-Market", "SMB", "Consumer"], weights=[10 + 14 * late, 24, 34 - 6 * late, 26 - 6 * late])[0]
        city, country, region = random.choices(cities, weights=city_weights)[0]
        comp = None if seg == "Consumer" and random.random() < 0.7 else random.choice(companies)
        customers_data.append((f"{fn} {ln}", f"{fn.lower().replace(' ', '')}.{ln.lower().replace(chr(39), '')}{c_id}@example.com", comp, seg, city, country, created.isoformat(timespec='seconds')))
        # Some customers buy far more often than others (a long tail).
        customer_meta.append({"id": c_id, "created": created, "segment": seg, "region": region, "activity": random.paretovariate(1.6)})
    cursor.executemany("""
        INSERT INTO customers (full_name, email, company, segment, city, country, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, customers_data)

    season = {1: 0.78, 2: 0.86, 3: 1.0, 4: 0.97, 5: 1.02, 6: 1.05, 7: 0.92, 8: 0.95, 9: 1.08, 10: 1.12, 11: 1.3, 12: 1.38}
    weekday_factor = [1.12, 1.18, 1.15, 1.1, 1.0, 0.42, 0.3]
    segment_items = {"Enterprise": (2, 6), "Mid-Market": (1, 4), "SMB": (1, 3), "Consumer": (1, 2)}
    segment_qty = {"Enterprise": (2, 12), "Mid-Market": (1, 6), "SMB": (1, 4), "Consumer": (1, 2)}
    segment_providers = {"Enterprise": [5, 3, 1, 6], "Mid-Market": [6, 3, 2, 2], "SMB": [6, 2, 3, 1], "Consumer": [5, 1, 5, 0.3]}
    providers = ['Stripe', 'Adyen', 'PayPal', 'WireTransfer']
    provider_failure = {'Stripe': 0.025, 'Adyen': 0.03, 'PayPal': 0.07, 'WireTransfer': 0.012}
    carriers = ["DHL", "FedEx", "UPS", "Maersk Air"]
    carrier_days = {"DHL": (1, 4), "FedEx": (2, 6), "UPS": (2, 5), "Maersk Air": (4, 11)}
    carrier_exception = {"DHL": 0.015, "FedEx": 0.06, "UPS": 0.025, "Maersk Air": 0.035}
    region_carriers = {r: w for r, w in zip(region_names, [[3, 4, 6, 1], [3, 5, 6, 1], [6, 2, 3, 2], [7, 2, 2, 2], [6, 3, 1, 5], [5, 3, 2, 3], [4, 3, 2, 4], [5, 2, 1, 4]])}
    product_ids_by_cat = {cat: [i for i, p in enumerate(products_data, start=1) if p[2] == cat] for cat in product_names}

    orders_data, order_items_data, payments_data, support_data, shipments_data, shipment_items_data = [], [], [], [], [], []
    region_sales = {name: {} for name in region_names}
    tx_refs, tracking = set(), 0
    subjects = {
        "billing": ["Inquiry about billing discrepancy", "Request for invoice breakdown", "Refund request for cancelled subscription", "Duplicate charge on card"],
        "technical": ["Assistance with API rate limits", "Latency spikes observed during peak hours", "Configuration questions for deployment", "Integration failing after update"],
        "delivery": ["Shipment delayed beyond estimate", "Package marked delivered but not received", "Wrong item in shipment"],
        "account": ["Need more seats added to license", "SSO login not working", "Transfer ownership of workspace"],
    }
    customers_by_created = sorted(customer_meta, key=lambda c: c["created"])
    order_id, item_id = 0, 0
    day = start + timedelta(days=4)
    while day <= end:
        m = months_since_start(day)
        expected = 3.1 * (1.028 ** m) * season[day.month] * weekday_factor[day.weekday()]
        count = max(0, int(round(random.gauss(expected, expected ** 0.5))))
        active = [c for c in customers_by_created if c["created"] <= day]
        if not active:
            day += timedelta(days=1)
            continue
        weights = [c["activity"] * (2.4 if c["segment"] == "Enterprise" else 1.0) for c in active]
        for customer in random.choices(active, weights=weights, k=count) if count else []:
            order_id += 1
            moment = day.replace(hour=random.choices(range(7, 23), weights=[2, 5, 8, 9, 9, 7, 8, 9, 9, 8, 7, 5, 4, 3, 2, 1])[0], minute=random.randint(0, 59), second=0)
            seg = customer["segment"]
            age_days = (end - moment).days
            refund_incident = moment.year == 2026 and moment.month == 3
            if age_days <= 3:
                status = random.choices(['processing', 'shipped', 'cancelled'], weights=[75, 22, 3])[0]
            elif age_days <= 12:
                status = random.choices(['shipped', 'completed', 'processing', 'cancelled', 'refunded'], weights=[45, 42, 6, 4, 3])[0]
            else:
                status = random.choices(['completed', 'refunded', 'cancelled'], weights=[90, 12 if refund_incident else 4, 4])[0]
            # Products: category demand moves over time; the March 2026 incident hit Security & Compliance.
            cat_weights = [category_weight[c] * max(0.15, 1 + category_trend[c] * m) for c in product_names]
            chosen = []
            for _ in range(random.randint(*segment_items[seg])):
                cat = random.choices(list(product_names), weights=cat_weights)[0]
                pid = random.choice(product_ids_by_cat[cat])
                if pid not in chosen:
                    chosen.append(pid)
            if status == 'refunded' and refund_incident and random.random() < 0.7:
                chosen = [random.choice(product_ids_by_cat[4])] + chosen[:1]
            subtotal, items = 0.0, []
            for pid in chosen:
                item_id += 1
                qty = random.randint(*segment_qty[seg])
                unit_p = products_data[pid - 1][3]
                rate = {"Enterprise": 0.12, "Mid-Market": 0.07, "SMB": 0.03, "Consumer": 0.0}[seg]
                disc = round(unit_p * qty * random.uniform(0, rate * 1.6), 2) if random.random() < 0.55 else 0.0
                line = round(unit_p * qty - disc, 2)
                subtotal += line
                items.append((item_id, order_id, pid, qty, unit_p, disc, line))
            subtotal = round(subtotal, 2)
            discount_amount = round(subtotal * (0.05 if subtotal > 4000 else 0.02 if subtotal > 1500 else 0.0), 2)
            tax_amount = round((subtotal - discount_amount) * 0.08, 2)
            total_amount = round(subtotal - discount_amount + tax_amount, 2)
            provider = random.choices(providers, weights=segment_providers[seg])[0]
            payment_status = {'completed': 'paid', 'shipped': 'paid', 'refunded': 'refunded', 'cancelled': 'failed'}.get(status, 'pending')
            orders_data.append((customer["id"], fmt(moment), status, subtotal, discount_amount, tax_amount, total_amount, payment_status))
            order_items_data.extend(i[1:] for i in items)
            if status in ('completed', 'shipped'):
                region_sales[customer["region"]][moment.year] = region_sales[customer["region"]].get(moment.year, 0) + total_amount

            # Payments: some attempts fail before one succeeds; pending while processing.
            attempts = []
            if status == 'cancelled':
                attempts = [('failed', provider)]
            else:
                while random.random() < provider_failure[provider] and len(attempts) < 2:
                    attempts.append(('failed', provider))
                attempts.append(('pending' if status == 'processing' else 'succeeded', provider))
            for n, (p_status, prov) in enumerate(attempts):
                ref = f"TXN-{random.randint(10000000, 99999999)}"
                while ref in tx_refs:
                    ref = f"TXN-{random.randint(10000000, 99999999)}"
                tx_refs.add(ref)
                payments_data.append((order_id, ref, prov, total_amount, p_status, fmt(moment + timedelta(minutes=2 + n * 7))))

            # Shipments: from a warehouse in the customer's region; large orders ship in two parts.
            if status not in ('cancelled',) and not (status == 'processing' and random.random() < 0.6):
                parts = 2 if seg == "Enterprise" and len(items) >= 3 and random.random() < 0.45 else 1
                carrier_weights = region_carriers[customer["region"]]
                for part in range(parts):
                    tracking += 1
                    carrier = random.choices(carriers, weights=carrier_weights)[0]
                    shipped = moment + timedelta(days=random.choice([0, 1, 1, 2, 3]), hours=random.randint(2, 9))
                    lo, hi = carrier_days[carrier]
                    transit = random.randint(lo, hi) + (2 if day.month in (11, 12) else 0)
                    delivered = shipped + timedelta(days=transit, hours=random.randint(0, 10))
                    if delivered > end:
                        ship_status = 'label_created' if shipped > end - timedelta(days=1) else 'in_transit'
                        delivered_at = None
                    else:
                        ship_status = 'exception' if random.random() < carrier_exception[carrier] else 'delivered'
                        delivered_at = fmt(delivered) if ship_status == 'delivered' else None
                    warehouse = region_index[customer["region"]] + (8 * (part % 2) if region_index[customer["region"]] <= 4 else 0)
                    cost = round((14 + 6 * len(items)) * {"DHL": 1.25, "FedEx": 1.1, "UPS": 1.0, "Maersk Air": 0.72}[carrier] * random.uniform(0.85, 1.2), 2)
                    shipments_data.append((order_id, warehouse, carrier, f"TRK-{tracking:07d}", ship_status, fmt(shipped), delivered_at, cost))
                    for item in items[part::parts]:
                        shipment_items_data.append((tracking, item[0], item[3]))

            # Support: more on refunds and delivery problems; faster for urgent cases, and faster over time.
            chance = 0.12 + (0.35 if status == 'refunded' else 0) + (0.05 if seg == "Enterprise" else 0)
            if random.random() < chance:
                kind = 'billing' if status in ('refunded', 'cancelled') else random.choices(list(subjects), weights=[3, 5, 3, 2])[0]
                created = moment + timedelta(days=random.randint(0, 14), hours=random.randint(0, 9))
                if created > end:
                    created = end - timedelta(hours=random.randint(1, 30))
                prio = random.choices(['urgent', 'high', 'medium', 'low'], weights=[1.5 if seg == "Enterprise" else 0.8, 3, 5, 3])[0]
                open_days = (end - created).days
                if open_days < 3:
                    case_status = random.choices(['open', 'in_progress', 'resolved'], weights=[5, 4, 2])[0]
                elif open_days < 20:
                    case_status = random.choices(['open', 'in_progress', 'resolved', 'closed'], weights=[1, 2, 5, 3])[0]
                else:
                    case_status = random.choices(['resolved', 'closed', 'open'], weights=[45, 53, 2])[0]
                base = {'urgent': 3.5, 'high': 9.0, 'medium': 22.0, 'low': 46.0}[prio] * (1.25 - 0.012 * m)
                res = round(max(0.3, random.lognormvariate(0, 0.45) * base), 1) if case_status in ('resolved', 'closed') else None
                support_data.append((customer["id"], order_id, random.choice(subjects[kind]), prio, case_status, res, fmt(created)))
        day += timedelta(days=1)

    cursor.executemany("""
        INSERT INTO orders (customer_id, order_date, status, subtotal, discount_amount, tax_amount, total_amount, payment_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, orders_data)
    cursor.executemany("""
        INSERT INTO order_items (order_id, product_id, quantity, unit_price, discount, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
    """, order_items_data)
    cursor.executemany("""
        INSERT INTO payments (order_id, transaction_ref, payment_provider, amount, status, processed_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """, payments_data)
    cursor.executemany("""
        INSERT INTO support_cases (customer_id, order_id, subject, priority, status, resolution_time_hours, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, support_data)

    # Regions: 2026 targets set from 2025 results, so some regions are ahead and some behind.
    region_codes = ["US", "US", "GB", "DE", "SG", "JP", "AU", "AE"]
    stretch = [1.18, 1.32, 1.12, 1.45, 1.05, 1.38, 1.22, 1.6]
    regions_data = [(name, code, round(max(region_sales[name].get(2025, 0), 50000) * s, -3)) for name, code, s in zip(region_names, region_codes, stretch)]
    cursor.executemany("INSERT INTO regions (name, country_code, sales_target) VALUES (?, ?, ?)", regions_data)

    warehouses_data = []
    for warehouse_id in range(1, 13):
        region_id = ((warehouse_id - 1) % len(regions_data)) + 1
        warehouses_data.append((region_id, f"Fulfillment Hub {warehouse_id:02d}", random.randint(18000, 85000), round(random.uniform(48, 96), 1), random.choices(["operational", "maintenance", "constrained"], weights=[82, 8, 10])[0]))
    cursor.executemany("INSERT INTO warehouses (region_id, name, capacity_units, utilization_percent, status) VALUES (?, ?, ?, ?, ?)", warehouses_data)

    suppliers_data = []
    for supplier_id in range(1, 46):
        suppliers_data.append((((supplier_id - 1) % len(regions_data)) + 1, f"Strategic Supplier {supplier_id:03d}", round(random.uniform(72, 99.8), 1), random.randint(2, 35), random.choices(["preferred", "approved", "review"], weights=[35, 55, 10])[0]))
    cursor.executemany("INSERT INTO suppliers (region_id, name, reliability_score, lead_time_days, status) VALUES (?, ?, ?, ?, ?)", suppliers_data)

    product_suppliers_data = []
    for product_id, product in enumerate(products_data, start=1):
        selected_suppliers = random.sample(range(1, 46), random.randint(2, 4))
        remaining_allocation = 100.0
        for index, supplier_id in enumerate(selected_suppliers):
            allocation = remaining_allocation if index == len(selected_suppliers) - 1 else round(random.uniform(15, remaining_allocation - 10 * (len(selected_suppliers) - index - 1)), 1)
            remaining_allocation = round(remaining_allocation - allocation, 1)
            product_suppliers_data.append((product_id, supplier_id, f"SUP-{supplier_id:03d}-{product_id:03d}", round(product[4] * random.uniform(0.88, 1.12), 2), allocation))
    cursor.executemany("INSERT INTO product_suppliers (product_id, supplier_id, supplier_sku, unit_cost, allocation_percent) VALUES (?, ?, ?, ?, ?)", product_suppliers_data)

    # Inventory: weekly receipts per warehouse, sales and returns following the orders.
    inventory_data = []
    supplier_for = {}
    for product_id, supplier_id, *_ in product_suppliers_data:
        supplier_for.setdefault(product_id, []).append(supplier_id)
    week = start
    while week <= end:
        for warehouse_id in range(1, 13):
            for product_id in random.sample(range(1, len(products_data) + 1), 3):
                inventory_data.append((product_id, warehouse_id, random.choice(supplier_for[product_id]), "receipt", random.randint(20, 240), fmt(week + timedelta(days=random.randint(0, 4), hours=random.randint(7, 17)))))
        week += timedelta(days=7)
    for order_index, (customer_id, order_date, status, *_rest) in enumerate(orders_data, start=1):
        if random.random() < 0.35 and status in ('completed', 'shipped', 'refunded'):
            region = customer_meta[customer_id - 1]["region"]
            kind = "return" if status == 'refunded' else "sale"
            inventory_data.append((random.randint(1, len(products_data)), region_index[region], None, kind, random.randint(1, 20) * (-1 if kind == "sale" else 1), order_date))
    for _ in range(420):
        kind = random.choice(["transfer", "adjustment"])
        inventory_data.append((random.randint(1, len(products_data)), random.randint(1, 12), None, kind, random.randint(-40, 60) or 5, fmt(start + timedelta(days=random.randint(0, 1000), hours=random.randint(0, 23)))))
    inventory_data.sort(key=lambda row: row[5])
    cursor.executemany("INSERT INTO inventory_movements (product_id, warehouse_id, supplier_id, movement_type, quantity, occurred_at) VALUES (?, ?, ?, ?, ?, ?)", inventory_data)

    cursor.executemany("INSERT INTO shipments (order_id, warehouse_id, carrier, tracking_number, status, shipped_at, delivered_at, shipping_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", shipments_data)
    cursor.executemany("INSERT OR IGNORE INTO shipment_items (shipment_id, order_item_id, quantity) VALUES (?, ?, ?)", shipment_items_data)

    teams_data = []
    team_functions = ["Revenue Operations", "Data Platform", "Customer Success", "Supply Chain", "Security", "Finance"]
    for team_id in range(1, 25):
        function = team_functions[(team_id - 1) % len(team_functions)]
        teams_data.append((((team_id - 1) % len(regions_data)) + 1, f"{function} {team_id:02d}", function, round(random.uniform(350000, 2600000), 2)))
    cursor.executemany("INSERT INTO teams (region_id, name, function, annual_budget) VALUES (?, ?, ?, ?)", teams_data)

    employees_data = []
    job_titles = {"Data Engineer": (88000, 165000), "Analytics Engineer": (82000, 150000), "Operations Analyst": (62000, 105000),
                  "Account Executive": (70000, 175000), "Platform Engineer": (95000, 190000), "Team Lead": (120000, 230000)}
    for employee_id in range(1, 221):
        title = "Team Lead" if employee_id <= 24 else random.choice(list(job_titles)[:-1])
        manager_id = None if employee_id <= 24 else ((employee_id - 1) % 24) + 1
        low, high = job_titles[title]
        hire = start - timedelta(days=random.randint(0, 2200)) + timedelta(days=random.randint(0, 900))
        employees_data.append((((employee_id - 1) % len(teams_data)) + 1, manager_id, f"{random.choice(first_names)} {random.choice(last_names)} {employee_id}", title,
                               hire.strftime('%Y-%m-%d'), round(random.uniform(low, high), 2), random.choices(["active", "leave", "contract"], weights=[86, 4, 10])[0]))
    cursor.executemany("INSERT INTO employees (team_id, manager_id, full_name, title, hire_date, salary, status) VALUES (?, ?, ?, ?, ?, ?, ?)", employees_data)

    conn.commit()
    conn.close()
    total_rows = sum(len(items) for items in [categories_data, products_data, customers_data, orders_data, order_items_data, payments_data, support_data, regions_data, warehouses_data, suppliers_data, product_suppliers_data, inventory_data, shipments_data, shipment_items_data, teams_data, employees_data])
    print(f"Successfully seeded SQLite demo database at {path} with 16 related tables and {total_rows} total rows.")

if __name__ == "__main__":
    from backend.app.config import settings
    seed_sqlite_demo(settings.SQLITE_DEMO_PATH)
