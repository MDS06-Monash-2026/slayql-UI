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

    # 2. Seed Data
    random.seed(42)

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

    products_data = []
    prod_id = 1
    for cat_id in range(1, len(categories_data) + 1):
        cat_name = categories_data[cat_id - 1][0]
        for i in range(1, 5):
            name = f"{cat_name} Tier-{i} ({'Pro' if i > 2 else 'Standard'})"
            sku = f"SKU-{cat_id:02d}-{i:02d}"
            unit_price = round(random.uniform(50.0, 1500.0) * i, 2)
            cost_price = round(unit_price * random.uniform(0.35, 0.65), 2)
            inventory = random.randint(20, 500)
            status = 'active' if inventory > 10 else ('out_of_stock' if inventory == 0 else 'discontinued')
            products_data.append((name, sku, cat_id, unit_price, cost_price, inventory, status))
            prod_id += 1
    cursor.executemany("""
        INSERT INTO products (name, sku, category_id, unit_price, cost_price, inventory_count, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, products_data)

    first_names = ["Sarah", "Alex", "David", "Elena", "Michael", "Sophia", "James", "Emma", "Liam", "Olivia", "Chen", "Marcus", "Priya", "Lucas", "Aria"]
    last_names = ["Chen", "Smith", "Rodriguez", "Vance", "Taylor", "Kim", "Patel", "Johnson", "Mueller", "O'Connor", "Watanabe", "Dubois", "Al-Mansoor", "Silva", "Novak"]
    companies = ["Acme Corp", "Nexus Tech", "Apex Labs", "CloudScale", "Quantix Data", "Starlight Media", "Vanguard Financial", "Hyperion AI", "Synthetix Bio", "OmniGlobal Systems", "BluePeak Analytics", "Zenith Logistics"]
    cities = [("San Francisco", "USA"), ("New York", "USA"), ("London", "UK"), ("Berlin", "Germany"), ("Tokyo", "Japan"), ("Singapore", "Singapore"), ("Toronto", "Canada"), ("Sydney", "Australia"), ("Paris", "France"), ("Zurich", "Switzerland")]
    segments = ["Enterprise", "Mid-Market", "SMB", "Consumer"]

    customers_data = []
    base_date = datetime(2025, 1, 1)
    for c_id in range(1, 61):
        fn = random.choice(first_names)
        ln = random.choice(last_names)
        full_name = f"{fn} {ln}"
        email = f"{fn.lower()}.{ln.lower()}{c_id}@example.com"
        comp = random.choice(companies) if random.random() > 0.15 else None
        seg = random.choice(segments)
        city, country = random.choice(cities)
        created_at = (base_date + timedelta(days=random.randint(0, 400), hours=random.randint(0, 23))).isoformat()
        customers_data.append((full_name, email, comp, seg, city, country, created_at))
    cursor.executemany("""
        INSERT INTO customers (full_name, email, company, segment, city, country, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, customers_data)

    orders_data = []
    order_items_data = []
    payments_data = []
    support_data = []
    
    order_id = 1
    item_id = 1
    payment_id = 1
    
    for c_id in range(1, 61):
        num_orders = random.randint(1, 6)
        for _ in range(num_orders):
            order_date = (base_date + timedelta(days=random.randint(60, 550), hours=random.randint(8, 20))).strftime('%Y-%m-%d %H:%M:%S')
            status = random.choices(['completed', 'shipped', 'processing', 'cancelled', 'refunded'], weights=[65, 15, 10, 5, 5])[0]
            payment_status = 'paid' if status in ['completed', 'shipped'] else ('refunded' if status == 'refunded' else ('failed' if status == 'cancelled' else 'pending'))
            
            # Pick 1-4 products
            items_count = random.randint(1, 4)
            chosen_prods = random.sample(products_data, items_count)
            subtotal = 0.0
            
            curr_order_items = []
            for prod in chosen_prods:
                # find product id
                p_idx = products_data.index(prod) + 1
                qty = random.randint(1, 5)
                unit_p = prod[3]
                disc = round(unit_p * qty * random.uniform(0.0, 0.15), 2) if random.random() > 0.6 else 0.0
                item_sub = round((unit_p * qty) - disc, 2)
                subtotal += item_sub
                curr_order_items.append((order_id, p_idx, qty, unit_p, disc, item_sub))
            
            discount_amount = round(subtotal * 0.05, 2) if subtotal > 1000 else 0.0
            tax_amount = round((subtotal - discount_amount) * 0.08, 2)
            total_amount = round(subtotal - discount_amount + tax_amount, 2)
            
            orders_data.append((c_id, order_date, status, subtotal, discount_amount, tax_amount, total_amount, payment_status))
            order_items_data.extend(curr_order_items)
            
            # Payment record
            if payment_status in ['paid', 'refunded']:
                provider = random.choice(['Stripe', 'Adyen', 'WireTransfer', 'PayPal'])
                tx_ref = f"TXN-{random.randint(10000000, 99999999)}"
                p_status = 'succeeded'
                payments_data.append((order_id, tx_ref, provider, total_amount, p_status, order_date))
                payment_id += 1
            
            # Support case occasionally
            if random.random() < 0.25:
                subj = random.choice([
                    "Inquiry about billing discrepancy",
                    "Assistance with API rate limits",
                    "Request for invoice breakdown",
                    "Configuration questions for deployment",
                    "Latency spikes observed during peak hours",
                    "Refund request for cancelled subscription"
                ])
                prio = random.choice(['urgent', 'high', 'medium', 'low'])
                case_status = random.choice(['resolved', 'closed', 'in_progress', 'open'])
                res_time = round(random.uniform(0.5, 48.0), 1) if case_status in ['resolved', 'closed'] else None
                support_data.append((c_id, order_id, subj, prio, case_status, res_time, order_date))
                
            order_id += 1

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

    regions_data = [
        ("North America West", "US", 8500000.0), ("North America East", "US", 9200000.0),
        ("Northern Europe", "GB", 6100000.0), ("Central Europe", "DE", 6800000.0),
        ("Southeast Asia", "SG", 7400000.0), ("Northeast Asia", "JP", 7900000.0),
        ("Oceania", "AU", 4200000.0), ("Middle East", "AE", 3900000.0),
    ]
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

    inventory_data = []
    for movement_id in range(1, 701):
        movement_type = random.choices(["receipt", "sale", "transfer", "adjustment", "return"], weights=[28, 42, 15, 8, 7])[0]
        quantity = random.randint(2, 180) * (-1 if movement_type == "sale" else 1)
        inventory_data.append((random.randint(1, len(products_data)), random.randint(1, len(warehouses_data)), random.randint(1, len(suppliers_data)) if movement_type == "receipt" else None, movement_type, quantity, (base_date + timedelta(days=random.randint(1, 600), hours=random.randint(0, 23))).strftime('%Y-%m-%d %H:%M:%S')))
    cursor.executemany("INSERT INTO inventory_movements (product_id, warehouse_id, supplier_id, movement_type, quantity, occurred_at) VALUES (?, ?, ?, ?, ?, ?)", inventory_data)

    shipments_data = []
    shipment_items_data = []
    max_order_item_id = len(order_items_data)
    for shipment_id in range(1, 321):
        order_ref = random.randint(1, len(orders_data))
        shipped_at = base_date + timedelta(days=random.randint(80, 600), hours=random.randint(0, 23))
        shipment_status = random.choices(["label_created", "in_transit", "delivered", "exception"], weights=[8, 22, 65, 5])[0]
        delivered_at = (shipped_at + timedelta(days=random.randint(1, 9))).strftime('%Y-%m-%d %H:%M:%S') if shipment_status == "delivered" else None
        shipments_data.append((order_ref, random.randint(1, len(warehouses_data)), random.choice(["DHL", "FedEx", "UPS", "Maersk Air"]), f"TRK-{shipment_id:07d}", shipment_status, shipped_at.strftime('%Y-%m-%d %H:%M:%S'), delivered_at, round(random.uniform(12, 280), 2)))
        for order_item_ref in random.sample(range(1, max_order_item_id + 1), random.randint(1, 3)):
            shipment_items_data.append((shipment_id, order_item_ref, random.randint(1, 4)))
    cursor.executemany("INSERT INTO shipments (order_id, warehouse_id, carrier, tracking_number, status, shipped_at, delivered_at, shipping_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", shipments_data)
    cursor.executemany("INSERT OR IGNORE INTO shipment_items (shipment_id, order_item_id, quantity) VALUES (?, ?, ?)", shipment_items_data)

    teams_data = []
    team_functions = ["Revenue Operations", "Data Platform", "Customer Success", "Supply Chain", "Security", "Finance"]
    for team_id in range(1, 17):
        teams_data.append((((team_id - 1) % len(regions_data)) + 1, f"{random.choice(team_functions)} {team_id:02d}", random.choice(team_functions), round(random.uniform(350000, 2600000), 2)))
    cursor.executemany("INSERT INTO teams (region_id, name, function, annual_budget) VALUES (?, ?, ?, ?)", teams_data)

    employees_data = []
    job_titles = ["Data Engineer", "Analytics Engineer", "Operations Analyst", "Account Executive", "Platform Engineer", "Team Lead"]
    for employee_id in range(1, 141):
        first_name = random.choice(first_names)
        last_name = random.choice(last_names)
        manager_id = None if employee_id <= 16 else random.randint(1, min(16, employee_id - 1))
        employees_data.append((((employee_id - 1) % len(teams_data)) + 1, manager_id, f"{first_name} {last_name} {employee_id}", random.choice(job_titles), (base_date - timedelta(days=random.randint(30, 1800))).strftime('%Y-%m-%d'), round(random.uniform(62000, 210000), 2), random.choices(["active", "leave", "contract"], weights=[88, 4, 8])[0]))
    cursor.executemany("INSERT INTO employees (team_id, manager_id, full_name, title, hire_date, salary, status) VALUES (?, ?, ?, ?, ?, ?, ?)", employees_data)

    conn.commit()
    conn.close()
    total_rows = sum(len(items) for items in [categories_data, products_data, customers_data, orders_data, order_items_data, payments_data, support_data, regions_data, warehouses_data, suppliers_data, product_suppliers_data, inventory_data, shipments_data, shipment_items_data, teams_data, employees_data])
    print(f"Successfully seeded SQLite demo database at {path} with 16 related tables and {total_rows} total rows.")

if __name__ == "__main__":
    from backend.app.config import settings
    seed_sqlite_demo(settings.SQLITE_DEMO_PATH)
