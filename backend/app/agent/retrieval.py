from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

from backend.app.catalog.discovery import CatalogSchema


TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9]+")
QUERY_ALIASES = {
    "spend": ["amount", "total", "revenue", "sales"],
    "spending": ["amount", "total", "revenue", "sales"],
    "revenue": ["amount", "total", "sales", "price"],
    "sales": ["sale", "order", "orders", "transaction", "revenue", "amount", "total", "price"],
    "sale": ["sales", "order", "transaction", "revenue", "amount", "total", "price"],
    "profit": ["margin", "revenue", "cost", "price"],
    "customer": ["client", "account", "buyer"],
    "employee": ["staff", "worker", "representative"],
    "order": ["sale", "purchase", "transaction"],
    "month": ["date", "time", "year"],
    "trend": ["date", "time", "month", "year"],
    "location": ["address", "city", "region", "territory"],
}


def tokenize(value: Any) -> List[str]:
    text = str(value or "")
    text = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text).replace("_", " ")
    return [token.lower() for token in TOKEN_PATTERN.findall(text)]


def query_tokens(question: str) -> List[str]:
    tokens = tokenize(question)
    expanded = list(tokens)
    for token in tokens:
        stem = token[:-1] if token.endswith("s") and len(token) > 3 else token
        expanded.append(stem)
        expanded.extend(QUERY_ALIASES.get(token, []))
        expanded.extend(QUERY_ALIASES.get(stem, []))
    return expanded


@dataclass(frozen=True)
class SchemaDocument:
    document_id: str
    kind: str
    table: str
    text: str
    column: Optional[str] = None
    value: Optional[str] = None


class BM25Index:
    def __init__(self, documents: Iterable[SchemaDocument], k1: float = 1.5, b: float = 0.75) -> None:
        self.documents = list(documents)
        self.k1 = k1
        self.b = b
        self.term_frequencies = [Counter(tokenize(document.text)) for document in self.documents]
        self.lengths = [sum(frequencies.values()) for frequencies in self.term_frequencies]
        self.average_length = sum(self.lengths) / len(self.lengths) if self.lengths else 1.0
        document_frequencies: Counter[str] = Counter()
        for frequencies in self.term_frequencies:
            document_frequencies.update(frequencies.keys())
        document_count = len(self.documents)
        self.idf = {
            term: math.log(1 + (document_count - frequency + 0.5) / (frequency + 0.5))
            for term, frequency in document_frequencies.items()
        }

    def search(self, question: str, limit: int = 24) -> List[Dict[str, Any]]:
        terms = query_tokens(question)
        scored: List[Dict[str, Any]] = []
        for index, document in enumerate(self.documents):
            frequencies = self.term_frequencies[index]
            length = self.lengths[index]
            score = 0.0
            matched_terms = []
            for term in terms:
                frequency = frequencies.get(term, 0)
                if not frequency:
                    continue
                denominator = frequency + self.k1 * (1 - self.b + self.b * length / self.average_length)
                score += self.idf.get(term, 0.0) * (frequency * (self.k1 + 1) / denominator)
                matched_terms.append(term)
            if score > 0:
                scored.append({
                    "document": document,
                    "score": round(score, 4),
                    "matched_terms": sorted(set(matched_terms)),
                })
        scored.sort(key=lambda item: (-item["score"], item["document"].document_id))
        return scored[:limit]


def build_schema_documents(catalog: CatalogSchema) -> List[SchemaDocument]:
    documents: List[SchemaDocument] = []
    for table_name, table in catalog.tables.items():
        relationship_text = " ".join(
            f"{foreign_key.from_column} references {foreign_key.to_table} {foreign_key.to_column}"
            for foreign_key in table.foreign_keys
        )
        column_text = " ".join(f"{column.name} {column.type}" for column in table.columns)
        documents.append(SchemaDocument(
            document_id=f"table:{table_name}",
            kind="table",
            table=table_name,
            text=f"table {table_name} {table.description or ''} columns {column_text} relationships {relationship_text}",
        ))
        for column in table.columns:
            documents.append(SchemaDocument(
                document_id=f"column:{table_name}.{column.name}",
                kind="column",
                table=table_name,
                column=column.name,
                text=f"table {table_name} column {column.name} type {column.type} {table.description or ''}",
            ))
            for sample_index, sample in enumerate(column.sample_values[:5]):
                sample_text = str(sample)
                documents.append(SchemaDocument(
                    document_id=f"value:{table_name}.{column.name}:{sample_index}",
                    kind="value",
                    table=table_name,
                    column=column.name,
                    value=sample_text,
                    text=f"table {table_name} column {column.name} value {sample_text}",
                ))
    return documents


def rank_schema(catalog: CatalogSchema, question: str, table_limit: int = 5) -> Dict[str, Any]:
    documents = build_schema_documents(catalog)
    results = BM25Index(documents).search(question)
    table_scores: Dict[str, float] = defaultdict(float)
    evidence: List[Dict[str, Any]] = []
    matched_columns = []
    grounded_values = []
    for result in results:
        document: SchemaDocument = result["document"]
        kind_weight = {"table": 1.0, "column": 1.15, "value": 1.35}[document.kind]
        table_scores[document.table] += result["score"] * kind_weight
        evidence.append({
            "document_id": document.document_id,
            "kind": document.kind,
            "table": document.table,
            "column": document.column,
            "score": result["score"],
            "matched_terms": result["matched_terms"],
        })
        if document.kind == "column" and document.column:
            matched_columns.append({
                "table": document.table,
                "column": document.column,
                "score": result["score"],
            })
        if document.kind == "value" and document.column and document.value is not None:
            grounded_values.append({
                "table": document.table,
                "column": document.column,
                "value": document.value,
                "score": result["score"],
            })

    if not table_scores:
        degree = Counter({name: 0 for name in catalog.tables})
        for name, table in catalog.tables.items():
            for foreign_key in table.foreign_keys:
                degree[name] += 1
                if foreign_key.to_table in degree:
                    degree[foreign_key.to_table] += 1
        fallback = sorted(
            catalog.tables.items(),
            key=lambda item: (-degree[item[0]], -item[1].row_count_estimate, item[0]),
        )[:table_limit]
        table_scores.update({name: float(max(1, degree[name])) for name, _ in fallback})

    ranked_tables = [
        {"table": table, "score": round(score, 4)}
        for table, score in sorted(table_scores.items(), key=lambda item: (-item[1], item[0]))[:table_limit]
    ]
    return {
        "corpus_size": len(documents),
        "ranked_tables": ranked_tables,
        "matched_columns": matched_columns[:10],
        "grounded_values": grounded_values[:8],
        "evidence": evidence[:16],
    }
