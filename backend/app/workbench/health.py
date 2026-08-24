from __future__ import annotations

import sqlite3
from typing import Any, Dict


def inspect_sqlite_health(db_path: str) -> Dict[str, Any]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        fk_violations = [dict(row) for row in conn.execute("PRAGMA foreign_key_check").fetchall()]
        table_names = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
        tables = []
        missing_fk_indexes = []
        for table in table_names:
            safe_table = table.replace('"', '""')
            row_count = conn.execute(f'SELECT COUNT(*) FROM "{safe_table}"').fetchone()[0]
            indexes = conn.execute(f'PRAGMA index_list("{safe_table}")').fetchall()
            indexed_columns = set()
            for index in indexes:
                index_name = str(index[1]).replace('"', '""')
                indexed_columns.update(row[2] for row in conn.execute(f'PRAGMA index_info("{index_name}")').fetchall())
            foreign_keys = conn.execute(f'PRAGMA foreign_key_list("{safe_table}")').fetchall()
            for fk in foreign_keys:
                from_column = fk[3]
                if from_column not in indexed_columns:
                    missing_fk_indexes.append({"table": table, "column": from_column, "references": f"{fk[2]}.{fk[4]}"})
            tables.append({"name": table, "row_count": row_count, "index_count": len(indexes), "foreign_key_count": len(foreign_keys)})
        return {
            "engine": "sqlite",
            "integrity": integrity,
            "foreign_key_violations": fk_violations[:25],
            "missing_fk_indexes": missing_fk_indexes,
            "tables": tables,
            "total_rows": sum(table["row_count"] for table in tables),
            "table_count": len(tables),
        }
    finally:
        conn.close()
