// Recorded runs replayed in the "Watch a question become a checked answer" section.
// Exported from backend/eval/results/trap.json (commit e9c6d69, deepseek-v4-flash, 3 candidates,
// business threshold 0.8): plain = configuration B0, slayql = B3. For fanout-05 the check result
// was not stored in the file, so its finding uses the grain check's wording with the counts from
// backend/data/slayql_demo.sqlite3 (55 joined rows for 44 orders).
export const THRESHOLD = 0.8;

export const REPLAYS = [
  {
    "id": "fanout-05",
    "tag": "Double counting",
    "question": "What is the total value of completed orders shipped with DHL?",
    "language": "en",
    "plain": {
      "sql": "SELECT SUM(o.total_amount) AS total_value\nFROM orders o\nJOIN shipments s ON o.id = s.order_id\nWHERE o.status = 'completed'\n  AND s.carrier = 'DHL';",
      "answer": "928,018.11",
      "correct": false
    },
    "slayql": {
      "outcome": "confident",
      "p": 0.8022,
      "sql": "SELECT SUM(o.total_amount) AS total_value\nFROM orders o\nWHERE o.status = 'completed'\n  AND EXISTS (\n    SELECT 1\n    FROM shipments s\n    WHERE s.order_id = o.id\n      AND s.carrier = 'DHL'\n  );",
      "answer": "779,151.72",
      "findings": [
        {
          "title": "Joins repeat each row of orders about 1.2 times",
          "severity": "blocking",
          "detail": "After the joins, 55 rows remain for 44 distinct orders. SUM(o.total_amount) therefore counts some orders rows more than once."
        }
      ],
      "repaired": true,
      "options": []
    }
  },
  {
    "id": "definition-01",
    "tag": "Two meanings",
    "question": "What is our total revenue?",
    "language": "en",
    "plain": {
      "sql": "SELECT SUM(total_amount) AS total_revenue\nFROM orders;",
      "answer": "3,241,298.23",
      "correct": false
    },
    "slayql": {
      "outcome": "clarify",
      "p": 0.69,
      "sql": "SELECT SUM(total_amount) AS total_revenue\nFROM orders;",
      "answer": "3,241,298.23",
      "findings": [
        {
          "title": "Includes refunded, cancelled orders",
          "detail": "orders.status is not filtered, so every row counts (completed 134, shipped 39, refunded 20, processing 14, cancelled 7). Whether these count depends on the company's definition.",
          "severity": "ambiguity"
        }
      ],
      "repaired": false,
      "options": [
        {
          "label": "As calculated (all records)",
          "answer": "3,241,298.23"
        },
        {
          "label": "Exclude refunded, cancelled orders",
          "answer": "2,938,582.20"
        }
      ]
    }
  },
  {
    "id": "infeasible-03",
    "tag": "Not in the data",
    "question": "Which salesperson closed the most deals?",
    "language": "en",
    "plain": {
      "sql": "SELECT customer_id, COUNT(*) AS closed_deals\nFROM support_cases\nWHERE status = 'closed'\nGROUP BY customer_id\nORDER BY closed_deals DESC\nLIMIT 1;",
      "answer": "41, 3",
      "correct": false
    },
    "slayql": {
      "outcome": "handoff",
      "p": 0.168,
      "sql": "SELECT customer_id, COUNT(*) AS deals_closed\nFROM support_cases\nWHERE status = 'closed'\nGROUP BY customer_id\nORDER BY deals_closed DESC\nLIMIT 1;",
      "answer": "41, 3",
      "findings": [
        {
          "title": "The data has nothing about \"deal\"",
          "detail": "No table, column or value in this database mentions \"deal\". The query labels other data with that name (COUNT(*) AS deals_closed), so the figure would answer a different question.",
          "severity": "blocking"
        }
      ],
      "repaired": false,
      "options": []
    }
  },
  {
    "id": "ms-04",
    "tag": "Bahasa Malaysia",
    "question": "Berapa jumlah jualan kita?",
    "language": "ms",
    "plain": {
      "sql": "SELECT SUM(total_amount) AS total_sales\nFROM orders;",
      "answer": "3,241,298.23",
      "correct": false
    },
    "slayql": {
      "outcome": "clarify",
      "p": 0.69,
      "sql": "SELECT SUM(total_amount) AS total_sales\nFROM orders;",
      "answer": "3,241,298.23",
      "findings": [
        {
          "title": "Includes refunded, cancelled orders",
          "detail": "orders.status is not filtered, so every row counts (completed 134, shipped 39, refunded 20, processing 14, cancelled 7). Whether these count depends on the company's definition.",
          "severity": "ambiguity"
        }
      ],
      "repaired": false,
      "options": [
        {
          "label": "As calculated (all records)",
          "answer": "3,241,298.23"
        },
        {
          "label": "Exclude refunded, cancelled orders",
          "answer": "2,938,582.20"
        }
      ]
    }
  }
];
