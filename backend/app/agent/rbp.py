from typing import Dict, List, Set, Tuple, Optional
from collections import deque
from backend.app.catalog.discovery import CatalogSchema, TableInfo

class RBPGraphEngine:
    def __init__(self, catalog: CatalogSchema):
        self.catalog = catalog
        self.adj: Dict[str, List[Tuple[str, str, str]]] = {} # table -> list of (neighbor_table, from_col, to_col)
        self._build_graph()

    def _build_graph(self):
        for tbl_name, tbl_info in self.catalog.tables.items():
            if tbl_name not in self.adj:
                self.adj[tbl_name] = []
            for fk in tbl_info.foreign_keys:
                # Directed edge: tbl_name.from_col -> fk.to_table.to_column
                self.adj[tbl_name].append((fk.to_table, fk.from_column, fk.to_column))
                # Reverse edge
                if fk.to_table not in self.adj:
                    self.adj[fk.to_table] = []
                self.adj[fk.to_table].append((tbl_name, fk.to_column, fk.from_column))

    def find_shortest_path(self, start_table: str, end_table: str) -> Optional[List[str]]:
        if start_table == end_table:
            return [start_table]
        if start_table not in self.adj or end_table not in self.adj:
            return None

        queue = deque([[start_table]])
        visited = {start_table}

        while queue:
            path = queue.popleft()
            node = path[-1]

            if node == end_table:
                return path

            for neighbor, _, _ in self.adj.get(node, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(path + [neighbor])
        return None

    def match_schema_entities(self, question: str) -> Dict[str, any]:
        """
        Extracts matched tables, columns, and grounded sample values based on BM25/keyword presence in the question.
        """
        lower_q = question.lower()
        matched_tables: Set[str] = set()
        matched_columns: List[Dict[str, str]] = []
        grounded_values: List[Dict[str, str]] = []

        # 1. Match tables
        for tbl_name, tbl_info in self.catalog.tables.items():
            # Check singular/plural or exact
            stem = tbl_name.rstrip('s').replace('_', ' ')
            if tbl_name in lower_q or stem in lower_q:
                matched_tables.add(tbl_name)

            # Check columns
            for col in tbl_info.columns:
                col_stem = col.name.replace('_', ' ')
                if col.name in lower_q or col_stem in lower_q:
                    matched_tables.add(tbl_name)
                    matched_columns.append({"table": tbl_name, "column": col.name})

                # Check sample values
                for val in col.sample_values:
                    val_str = str(val).lower()
                    if len(val_str) > 2 and val_str in lower_q:
                        matched_tables.add(tbl_name)
                        grounded_values.append({
                            "table": tbl_name,
                            "column": col.name,
                            "value": str(val)
                        })

        # Default fallback to orders/customers/products if no tables matched
        if not matched_tables:
            matched_tables = {"orders", "customers", "products"}

        # 2. Expand FK paths between all matched tables (RBP)
        table_list = list(matched_tables)
        join_chain: List[str] = []
        if len(table_list) > 1:
            main_tbl = table_list[0]
            for target in table_list[1:]:
                path = self.find_shortest_path(main_tbl, target)
                if path:
                    for node in path:
                        if node not in join_chain:
                            join_chain.append(node)
        else:
            join_chain = table_list

        return {
            "matched_tables": list(matched_tables),
            "expanded_chain": join_chain or table_list,
            "matched_columns": matched_columns[:8],
            "grounded_values": grounded_values[:5]
        }
