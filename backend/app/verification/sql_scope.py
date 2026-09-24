"""Small sqlglot helpers shared by the verification checks."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import sqlglot
from sqlglot import exp

from backend.app.catalog.discovery import CatalogSchema, TableInfo


@dataclass
class Source:
    alias: str
    table: TableInfo


def parse(sql: str, dialect: str) -> Optional[exp.Expression]:
    try:
        return sqlglot.parse_one(sql, read=dialect)
    except Exception:
        return None


def catalog_table(catalog: CatalogSchema, name: str) -> Optional[TableInfo]:
    table = catalog.tables.get(name)
    if table:
        return table
    lowered = name.lower()
    return next((info for key, info in catalog.tables.items() if key.lower() == lowered), None)


def primary_key(table: TableInfo) -> Optional[str]:
    keys = [column.name for column in table.columns if column.primary_key]
    return keys[0] if len(keys) == 1 else None


def owning_select(node: exp.Expression) -> Optional[exp.Select]:
    return node.find_ancestor(exp.Select)


def sources(select: exp.Select, catalog: CatalogSchema) -> Dict[str, Source]:
    """Catalog tables read directly by this SELECT, keyed by lower-case alias."""
    found: Dict[str, Source] = {}
    from_clause = _arg(select, "from")
    candidates = [from_clause.this] if from_clause is not None else []
    candidates += [join.this for join in select.args.get("joins") or []]
    for node in candidates:
        if isinstance(node, exp.Table):
            table = catalog_table(catalog, node.name)
            if table:
                found[(node.alias_or_name or node.name).lower()] = Source(alias=node.alias_or_name or node.name, table=table)
    return found


def has_joins(select: exp.Select) -> bool:
    return bool(select.args.get("joins"))


def column_source(column: exp.Column, select_sources: Dict[str, Source]) -> Optional[Source]:
    """Resolve a column to the table it reads, using its qualifier or the catalog."""
    if column.table:
        return select_sources.get(column.table.lower())
    matches = [
        source for source in select_sources.values()
        if any(col.name.lower() == column.name.lower() for col in source.table.columns)
    ]
    return matches[0] if len(matches) == 1 else None


def where_columns(select: exp.Select, select_sources: Dict[str, Source]) -> List[tuple[str, str]]:
    """(table name, column name) pairs referenced by WHERE and JOIN conditions."""
    referenced: List[tuple[str, str]] = []
    nodes: List[exp.Expression] = []
    if select.args.get("where") is not None:
        nodes.append(select.args["where"])
    for join in select.args.get("joins") or []:
        if join.args.get("on") is not None:
            nodes.append(join.args["on"])
    for node in nodes:
        for column in node.find_all(exp.Column):
            source = column_source(column, select_sources)
            if source:
                referenced.append((source.table.name.lower(), column.name.lower()))
    return referenced


def aggregate_selects(tree: exp.Expression) -> List[exp.Select]:
    """SELECT scopes that compute SUM, AVG or COUNT directly."""
    scopes = []
    for select in tree.find_all(exp.Select):
        for aggregate in select.find_all(exp.Sum, exp.Avg, exp.Count):
            if owning_select(aggregate) is select:
                scopes.append(select)
                break
    return scopes


def with_root_ctes(select: exp.Select, tree: exp.Expression) -> exp.Select:
    """Copy of `select` carrying the statement's WITH clause, so CTEs resolve."""
    probe = select.copy()
    root_with = _arg(tree, "with") if isinstance(tree, exp.Select) else None
    if root_with is not None and select is not tree:
        probe.set(_key(probe, "with"), root_with.copy())
    return probe


def strip_shape(select: exp.Select) -> exp.Select:
    for key in ("group", "having", "order", "limit", "offset", "distinct", "qualify"):
        select.set(key, None)
    return select


def _key(node: exp.Expression, name: str) -> str:
    # sqlglot 30 stores FROM and WITH as "from_" and "with_"; older versions do not.
    return f"{name}_" if f"{name}_" in node.arg_types else name


def _arg(node: exp.Expression, name: str):
    return node.args.get(_key(node, name))
