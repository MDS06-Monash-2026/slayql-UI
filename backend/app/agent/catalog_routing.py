"""Answer simple table requests from the catalog, instantly and exactly, without a model call.

Some questions have exactly one right answer that the schema already holds:

- "describe the order_items table" / "what are the columns of customers": the table's columns,
  keys, relationships, row count and example values, straight from the catalog.
- "show me all customers" / "list products": the table's rows (a plain SELECT *, still passed
  through the read-only validator and executor).

Routing them here makes them fast and correct, and stops a question that names a real table from
ever falling through to a generic "ask me about your data" reply. Anything more involved (filters,
joins, metrics) still goes to the SQL agent.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from sqlglot import exp

# Typos included on purpose ("desribe"): people type fast in a chat box.
_DESCRIBE = re.compile(
    r"\b(desc?ri?be?s?|explain|attributes?|columns?|fields?|structure|schema|definition|data ?types?|"
    r"what(?:'s| is) in|what does .* (?:contain|have|store|hold)|tell me about)\b"
)
_TABLES_LIST = re.compile(
    r"\b(list|show|display|what are|which are|give me|tell me)\b.*\btables\b|\bwhat tables\b|^tables\??$"
)
_BROWSE_VERBS = r"(?:show|list|display|get|give|fetch|view|see|print|pull|bring up|return)"
_BROWSE_FILLER = r"(?:\s+(?:me|us))?(?:\s+(?:all|every|each))?(?:\s+(?:of\s+)?(?:the|our|my|a))?(?:\s+(?:list|full list)\s+of)?"
_BROWSE_TAIL = r"(?:\s+(?:table|records?|rows?|data|list|entries|details|info(?:rmation)?))?(?:\s+please)?"


def _normalize(text: str) -> str:
    text = text.casefold()
    text = re.sub(r"[`'\"“”‘’]", "", text)
    text = re.sub(r"[^\w\s-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _variants(table: str) -> List[str]:
    """Ways a person might write a table name: order_items, order items, order-items, order item."""
    base = table.split(".")[-1].casefold()
    spaced = re.sub(r"[_\-]+", " ", base).strip()
    words = spaced.split()
    forms = {base, spaced, spaced.replace(" ", "-"), spaced.replace(" ", "")}
    if words:
        last = words[-1]
        singular = (last[:-3] + "y") if last.endswith("ies") else last[:-1] if last.endswith("s") and not last.endswith("ss") else last
        plural = (last[:-1] + "ies") if last.endswith("y") else last if last.endswith("s") else last + "s"
        for word in {singular, plural}:
            alt = " ".join(words[:-1] + [word])
            forms |= {alt, alt.replace(" ", "_"), alt.replace(" ", "-")}
    return sorted((f for f in forms if len(f) >= 3), key=len, reverse=True)


def mentioned_tables(question: str, catalog: Any) -> List[str]:
    """Catalog tables named in the question, longest name first (order_items before orders)."""
    text = f" {_normalize(question)} "
    found: List[tuple[int, int, str]] = []
    taken: List[range] = []
    candidates = []
    for name in getattr(catalog, "tables", {}) or {}:
        for variant in _variants(name):
            candidates.append((len(variant), variant, name))
    for _, variant, name in sorted(candidates, reverse=True):
        for match in re.finditer(rf"(?<![\w-]){re.escape(variant)}(?![\w-])", text):
            span = range(match.start(), match.end())
            if any(set(span) & set(other) for other in taken):
                continue
            taken.append(span)
            found.append((match.start(), -len(variant), name))
    ordered: List[str] = []
    for _, _, name in sorted(found):
        if name not in ordered:
            ordered.append(name)
    return ordered


def route(question: str, catalog: Any) -> Optional[Dict[str, Any]]:
    """A catalog route for this question, or None to keep the normal routing."""
    normalized = _normalize(question)
    if not normalized:
        return None
    tables = mentioned_tables(question, catalog)
    if tables and _DESCRIBE.search(normalized):
        return {"kind": "describe_table", "tables": tables[:3]}
    if len(tables) == 1:
        variants = "|".join(re.escape(v) for v in _variants(tables[0]))
        browse = re.fullmatch(rf"(?:please\s+)?(?:(?:can|could) you\s+)?(?:{_BROWSE_VERBS}{_BROWSE_FILLER}\s+)?(?:{variants}){_BROWSE_TAIL}", normalized)
        if browse:
            return {"kind": "browse_table", "table": tables[0]}
    if not tables and _TABLES_LIST.search(normalized):
        return {"kind": "list_tables"}
    return None


def apply(decision: Dict[str, Any], found: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Overlay a route() result on an intent decision. Never touches clear multi-step data questions."""
    if not found:
        return decision
    kind = found["kind"]
    if kind == "describe_table":
        return {
            **decision,
            "intent": "schema_overview",
            "is_sql_query": False,
            "requires_sql": False,
            "orchestrator_route": "catalog_agent",
            "tool_name": "catalog_agent",
            "catalog_operation": "describe_table",
            "catalog_tables": found["tables"],
            "reason": f"The request asks for the structure of {', '.join(found['tables'])}; answered from the verified catalog.",
        }
    if kind == "browse_table":
        return {
            **decision,
            "intent": "data_query",
            "is_sql_query": True,
            "requires_sql": True,
            "orchestrator_route": "sql_agent",
            "tool_name": "sql_agent",
            "browse_table": found["table"],
            "reason": f"The request lists the rows of {found['table']}; answered with a direct read-only query.",
        }
    if kind == "list_tables" and decision.get("intent") not in {"schema_overview", "row_count_overview"}:
        return {
            **decision,
            "intent": "schema_overview",
            "is_sql_query": False,
            "requires_sql": False,
            "orchestrator_route": "catalog_agent",
            "tool_name": "catalog_agent",
            "catalog_operation": "overview",
            "reason": "The request asks which tables exist; answered from the verified catalog.",
        }
    return decision


def browse_sql(table: str, dialect: str, limit: int) -> str:
    """SELECT * FROM <table> with every name part quoted for the target dialect."""
    parts = [exp.to_identifier(part, quoted=True) for part in table.split(".")]
    node: exp.Expression = exp.Table(this=parts[-1])
    if len(parts) >= 2:
        node.set("db", parts[-2])
    if len(parts) >= 3:
        node.set("catalog", parts[-3])
    return exp.select("*").from_(node).limit(limit).sql(dialect=dialect)


def describe_tables(catalog: Any, tables: List[str]) -> Dict[str, Any]:
    """Columns, keys, relationships, row count and example values for the named tables."""
    include_rows = getattr(catalog, "engine", "") == "sqlite"
    incoming: Dict[str, List[str]] = {}
    for other in catalog.tables.values():
        for fk in other.foreign_keys:
            incoming.setdefault(fk.to_table, []).append(f"{other.name}.{fk.from_column}")

    columns = ["table_name", "column_name", "type", "key", "nullable", "example_values"]
    column_types = ["string"] * 6
    rows: List[List[Any]] = []
    sentences: List[str] = []
    for name in tables:
        table = catalog.tables.get(name)
        if table is None:
            continue
        fk_by_column = {fk.from_column: fk for fk in table.foreign_keys}
        primary = [c.name for c in table.columns if c.primary_key]
        for column in table.columns:
            fk = fk_by_column.get(column.name)
            key = "primary key" if column.primary_key else f"links to {fk.to_table}.{fk.to_column}" if fk else ""
            examples = ", ".join(str(v) for v in (column.sample_values or [])[:3])
            rows.append([name, column.name, column.type or "", key, "yes" if column.nullable else "no", examples])
        size = f" and {table.row_count_estimate:,} rows" if include_rows else ""
        sentence = f"`{name}` has {len(table.columns)} columns{size}."
        if primary:
            sentence += f" Each row is identified by `{', '.join(primary)}`."
        if table.foreign_keys:
            links = ", ".join(f"`{fk.to_table}` (via `{fk.from_column}`)" for fk in table.foreign_keys)
            sentence += f" It links to {links}."
        if incoming.get(name):
            sentence += f" It is referenced by {', '.join(f'`{ref}`' for ref in sorted(set(incoming[name]))[:6])}."
        sentences.append(sentence)
    answer = " ".join(sentences) + (" The columns are listed below with example values." if rows else "")
    return {
        "answer": answer or "I could not find that table in the selected database.",
        "columns": columns,
        "column_types": column_types,
        "rows": rows,
        "is_truncated": False,
    }


def browse_answer(table: str, catalog: Any, shown: int, is_truncated: bool, limit: int) -> str:
    """Says "all" only when every row is shown. A result that fills the row limit may be cut off."""
    total = int(getattr(catalog.tables.get(table), "row_count_estimate", 0) or 0)
    if shown == 0:
        return f"`{table}` has no rows."
    if is_truncated or shown >= limit or total > shown:
        narrow = " Add a filter (for example a date or a status) to narrow it down."
        if total > shown:
            # SQLite counts are exact; other engines report an estimate from their statistics.
            size = f"{total:,}" if getattr(catalog, "engine", "") == "sqlite" else f"about {total:,}"
            return f"Here are the first {shown:,} of {size} rows in `{table}`.{narrow}"
        return f"Here are the first {shown:,} rows in `{table}`.{narrow}"
    return f"Here are all {shown:,} rows in `{table}`."


def browse_verification(table: str, penalty: float) -> Dict[str, Any]:
    """Trust payload for a direct table listing: exact by construction, so no model or vote."""
    return {
        "outcome": "confident",
        "probability": 1.0,
        "threshold": round(penalty / (1 + penalty), 4),
        "penalty": penalty,
        "summary": f"Lists the rows of {table} directly from the table; no AI interpretation was needed.",
        "findings": [],
        "consensus": {},
        "clarify_options": [],
        "definitions_used": [],
        "features": {},
        "selected_candidate_id": None,
        "direct_table_listing": table,
    }
