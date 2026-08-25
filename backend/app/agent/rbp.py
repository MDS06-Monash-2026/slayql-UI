from __future__ import annotations

from collections import deque
from typing import Any, Dict, List, Optional, Tuple

from backend.app.agent.retrieval import rank_schema
from backend.app.catalog.discovery import CatalogSchema


class RBPGraphEngine:
    def __init__(self, catalog: CatalogSchema):
        self.catalog = catalog
        self.adj: Dict[str, List[Tuple[str, str, str]]] = {}
        self._build_graph()

    def _build_graph(self) -> None:
        for table_name, table in self.catalog.tables.items():
            self.adj.setdefault(table_name, [])
            for foreign_key in table.foreign_keys:
                if foreign_key.to_table not in self.catalog.tables:
                    continue
                self.adj[table_name].append((foreign_key.to_table, foreign_key.from_column, foreign_key.to_column))
                self.adj.setdefault(foreign_key.to_table, []).append(
                    (table_name, foreign_key.to_column, foreign_key.from_column)
                )

    def find_shortest_path(self, start_table: str, end_table: str) -> Optional[List[str]]:
        if start_table == end_table:
            return [start_table]
        if start_table not in self.adj or end_table not in self.adj:
            return None
        queue = deque([[start_table]])
        visited = {start_table}
        while queue:
            path = queue.popleft()
            for neighbor, _, _ in self.adj.get(path[-1], []):
                if neighbor == end_table:
                    return path + [neighbor]
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(path + [neighbor])
        return None

    def relationship_details(self, path: List[str]) -> List[Dict[str, str]]:
        details = []
        for source, target in zip(path, path[1:]):
            edge = next((item for item in self.adj.get(source, []) if item[0] == target), None)
            if edge:
                details.append({
                    "from_table": source,
                    "from_column": edge[1],
                    "to_table": target,
                    "to_column": edge[2],
                })
        return details

    def match_schema_entities(self, question: str) -> Dict[str, Any]:
        retrieval = rank_schema(self.catalog, question)
        ranked_tables = [item["table"] for item in retrieval["ranked_tables"]]
        expanded_chain: List[str] = []
        join_relationships: List[Dict[str, str]] = []
        if ranked_tables:
            anchor = ranked_tables[0]
            expanded_chain.append(anchor)
            for target in ranked_tables[1:]:
                path = self.find_shortest_path(anchor, target)
                if not path:
                    if target not in expanded_chain:
                        expanded_chain.append(target)
                    continue
                for table in path:
                    if table not in expanded_chain:
                        expanded_chain.append(table)
                for relationship in self.relationship_details(path):
                    if relationship not in join_relationships:
                        join_relationships.append(relationship)
        return {
            "matched_tables": ranked_tables,
            "ranked_tables": retrieval["ranked_tables"],
            "expanded_chain": expanded_chain,
            "join_relationships": join_relationships,
            "matched_columns": retrieval["matched_columns"],
            "grounded_values": retrieval["grounded_values"],
            "retrieval_evidence": retrieval["evidence"],
            "index_document_count": retrieval["corpus_size"],
        }
