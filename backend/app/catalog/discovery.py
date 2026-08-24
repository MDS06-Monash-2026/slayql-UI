import aiosqlite
import sqlite3
import re
from typing import Dict, List, Any, Optional
from pydantic import BaseModel

class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool = True
    primary_key: bool = False
    sample_values: List[Any] = []

class ForeignKeyInfo(BaseModel):
    from_column: str
    to_table: str
    to_column: str

class TableInfo(BaseModel):
    name: str
    row_count_estimate: int = 0
    columns: List[ColumnInfo] = []
    foreign_keys: List[ForeignKeyInfo] = []
    description: Optional[str] = None

class CatalogSchema(BaseModel):
    engine: str # 'sqlite' | 'postgres'
    database_name: str
    tables: Dict[str, TableInfo] = {}

class CatalogService:
    @staticmethod
    def get_sqlite_catalog(db_path: str) -> CatalogSchema:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all table names
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        table_names = [row[0] for row in cursor.fetchall()]
        
        catalog = CatalogSchema(
            engine="sqlite",
            database_name="SlayQL Demo SQLite",
            tables={}
        )
        
        for tbl in table_names:
            # Row count
            cursor.execute(f"SELECT COUNT(*) FROM `{tbl}`;")
            count = cursor.fetchone()[0]
            
            # Columns
            cursor.execute(f"PRAGMA table_info(`{tbl}`);")
            cols_info = cursor.fetchall()
            columns: List[ColumnInfo] = []
            
            for col in cols_info:
                cid, name, col_type, notnull, dflt_value, pk = col
                # Fetch distinct sample values for grounding (up to 5)
                samples = []
                try:
                    cursor.execute(f"SELECT DISTINCT `{name}` FROM `{tbl}` WHERE `{name}` IS NOT NULL LIMIT 5;")
                    samples = [str(r[0]) for r in cursor.fetchall()]
                except Exception:
                    pass
                    
                columns.append(ColumnInfo(
                    name=name,
                    type=col_type or "TEXT",
                    nullable=not bool(notnull),
                    primary_key=bool(pk),
                    sample_values=samples
                ))
                
            # Foreign keys
            cursor.execute(f"PRAGMA foreign_key_list(`{tbl}`);")
            fks_raw = cursor.fetchall()
            fks: List[ForeignKeyInfo] = []
            for fk in fks_raw:
                # id, seq, table, from, to, on_update, on_delete, match
                _, _, to_table, from_col, to_col, _, _, _ = fk
                fks.append(ForeignKeyInfo(
                    from_column=from_col,
                    to_table=to_table,
                    to_column=to_col
                ))
                
            catalog.tables[tbl] = TableInfo(
                name=tbl,
                row_count_estimate=count,
                columns=columns,
                foreign_keys=fks
            )
            
        conn.close()
        return catalog

    @staticmethod
    def create_custom_table(
        db_path: str,
        table_name: str,
        columns: List[Dict[str, Any]],
        foreign_keys: Optional[List[Dict[str, Any]]] = None,
        initial_rows: Optional[List[Dict[str, Any]]] = None
    ) -> CatalogSchema:
        """
        Dynamically creates a new table in the SQLite database and seeds initial rows if provided.
        """
        # Validate table name
        clean_table_name = re.sub(r'[^a-zA-Z0-9_]', '', table_name).lower()
        if not clean_table_name:
            raise ValueError("Invalid table name")

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        col_defs = []
        for col in columns:
            col_name = re.sub(r'[^a-zA-Z0-9_]', '', col.get("name", "")).lower()
            col_type = col.get("type", "TEXT").upper()
            if col_type not in ["INTEGER", "TEXT", "REAL", "BLOB", "TIMESTAMP", "BOOLEAN", "VARCHAR(255)"]:
                col_type = "TEXT"
            
            clause = f"`{col_name}` {col_type}"
            if col.get("primary_key", False):
                clause += " PRIMARY KEY"
            elif not col.get("nullable", True):
                clause += " NOT NULL"
            col_defs.append(clause)

        # Foreign key clauses
        if foreign_keys:
            for fk in foreign_keys:
                from_col = re.sub(r'[^a-zA-Z0-9_]', '', fk.get("from_column", "")).lower()
                to_tbl = re.sub(r'[^a-zA-Z0-9_]', '', fk.get("to_table", "")).lower()
                to_col = re.sub(r'[^a-zA-Z0-9_]', '', fk.get("to_column", "")).lower()
                if from_col and to_tbl and to_col:
                    col_defs.append(f"FOREIGN KEY (`{from_col}`) REFERENCES `{to_tbl}`(`{to_col}`)")

        create_sql = f"CREATE TABLE IF NOT EXISTS `{clean_table_name}` (\n  " + ",\n  ".join(col_defs) + "\n);"
        cursor.execute(create_sql)

        # Insert initial rows if provided
        if initial_rows:
            for row in initial_rows:
                keys = [k for k in row.keys()]
                placeholders = ", ".join(["?" for _ in keys])
                keys_clause = ", ".join([f"`{k}`" for k in keys])
                values = [row[k] for k in keys]
                insert_sql = f"INSERT INTO `{clean_table_name}` ({keys_clause}) VALUES ({placeholders});"
                cursor.execute(insert_sql, values)

        conn.commit()
        conn.close()

        return CatalogService.get_sqlite_catalog(db_path)

    @staticmethod
    def drop_table(db_path: str, table_name: str) -> CatalogSchema:
        clean_table_name = re.sub(r'[^a-zA-Z0-9_]', '', table_name).lower()
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(f"DROP TABLE IF EXISTS `{clean_table_name}`;")
        conn.commit()
        conn.close()
        return CatalogService.get_sqlite_catalog(db_path)

    @staticmethod
    async def get_sqlite_catalog_async(db_path: str) -> CatalogSchema:
        return CatalogService.get_sqlite_catalog(db_path)
