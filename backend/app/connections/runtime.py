"""Provider-aware connection helpers.

Drivers are imported lazily so SQLite-only deployments can still boot without
installing every cloud database driver.
"""

from __future__ import annotations

import time
import hashlib
import threading
from typing import Any, Dict
from urllib.parse import quote_plus, urlsplit, urlunsplit
import json

from backend.app.catalog.discovery import CatalogSchema, ColumnInfo, ForeignKeyInfo, TableInfo


_CATALOG_CACHE: Dict[str, tuple[float, CatalogSchema]] = {}
_CATALOG_CACHE_LOCK = threading.Lock()
_CATALOG_CACHE_TTL_SECONDS = 300.0


def _catalog_cache_key(provider: str, credentials: Dict[str, Any]) -> str:
    normalized = normalized_credentials(credentials)
    credential_fingerprint = json.dumps(normalized, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(f"{provider.lower()}:{credential_fingerprint}".encode()).hexdigest()


def invalidate_external_catalog(provider: str, credentials: Dict[str, Any]) -> None:
    cache_key = _catalog_cache_key(provider, credentials)
    with _CATALOG_CACHE_LOCK:
        _CATALOG_CACHE.pop(cache_key, None)


# Microsoft SQL Server, used by AutoCount Accounting (usually SQL Server Express).
SQL_SERVER_PROVIDERS = {"sqlserver", "mssql"}


def sqlglot_dialect(engine: str) -> str:
    """The sqlglot dialect for a connection engine."""
    engine = (engine or "sqlite").lower()
    if engine in {"postgresql", "supabase", "postgres"}:
        return "postgres"
    if engine in SQL_SERVER_PROVIDERS:
        return "tsql"
    return engine


def connection_url(provider: str, credentials: Dict[str, Any]) -> str:
    provider = provider.lower()
    credentials = normalized_credentials(credentials)
    if credentials.get("connection_string"):
        return normalize_connection_string(provider, str(credentials["connection_string"]))
    user = quote_plus(str(credentials.get("username", "")))
    password = quote_plus(str(credentials.get("password", "")))
    host = str(credentials.get("host", ""))
    port = credentials.get("port")
    database = quote_plus(str(credentials.get("database", "")))
    authority = f"{user}:{password}@{host}"
    if port:
        authority += f":{int(port)}"
    if provider in {"postgresql", "supabase"}:
        query = "?sslmode=" + str(credentials.get("sslmode", "require"))
        return f"postgresql+psycopg://{authority}/{database}{query}"
    if provider == "mysql":
        return f"mysql+pymysql://{authority}/{database}"
    if provider in SQL_SERVER_PROVIDERS:
        from sqlalchemy.engine import URL

        # host may name an instance, e.g. SERVER\A2006 for an AutoCount Express install.
        return URL.create(
            "mssql+pymssql",
            username=str(credentials.get("username") or "") or None,
            password=str(credentials.get("password") or "") or None,
            host=str(credentials.get("host") or "") or None,
            port=int(port) if port else None,
            database=str(credentials.get("database") or "") or None,
        ).render_as_string(hide_password=False)
    if provider == "snowflake":
        account = str(credentials.get("account", host)).strip()
        query_parts = []
        for key in ("warehouse", "role"):
            if credentials.get(key):
                query_parts.append(f"{key}={quote_plus(str(credentials[key]))}")
        schema = credentials.get("schema")
        suffix = (f"/{database}/{quote_plus(str(schema))}" if schema else f"/{database}")
        query = ("?" + "&".join(query_parts)) if query_parts else ""
        return f"snowflake://{user}:{password}@{account}{suffix}{query}"
    raise ValueError(f"Unsupported provider: {provider}")


def normalize_connection_string(provider: str, value: str) -> str:
    """Select the installed SQLAlchemy driver without exposing or rebuilding credentials."""
    raw_url = value.strip()
    parsed = urlsplit(raw_url)
    if provider.lower() in {"postgresql", "supabase"}:
        if parsed.scheme in {"postgres", "postgresql"}:
            parsed = parsed._replace(scheme="postgresql+psycopg")
            return urlunsplit(parsed)
        if parsed.scheme == "postgresql+psycopg":
            return raw_url
        raise ValueError("Use a PostgreSQL connection URL, not a Supabase HTTP API URL.")
    return raw_url


def normalized_credentials(credentials: Dict[str, Any]) -> Dict[str, Any]:
    """Merge known fields from provider auth JSON without logging or returning secrets."""
    normalized = dict(credentials or {})
    raw_json = normalized.get("auth_json")
    if raw_json:
        try:
            parsed = json.loads(raw_json) if isinstance(raw_json, str) else raw_json
            if isinstance(parsed, dict):
                aliases = {"user": "username", "account_identifier": "account"}
                for key, value in parsed.items():
                    target = aliases.get(key, key)
                    if target in {"account", "username", "password", "private_key", "warehouse", "database", "schema", "role"} and value:
                        normalized.setdefault(target, value)
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise ValueError("Provider auth JSON is not valid JSON") from exc
    return normalized


def engine_options(provider: str, credentials: Dict[str, Any]) -> Dict[str, Any]:
    credentials = normalized_credentials(credentials)
    if provider.lower() != "snowflake" or not credentials.get("private_key"):
        return {"pool_pre_ping": True}
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.serialization import load_pem_private_key

    key = load_pem_private_key(str(credentials["private_key"]).encode(), password=None)
    private_key = key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return {"pool_pre_ping": True, "connect_args": {"private_key": private_key}}


def test_external_connection(provider: str, credentials: Dict[str, Any]) -> Dict[str, Any]:
    from sqlalchemy import create_engine, text

    started = time.perf_counter()
    engine = create_engine(connection_url(provider, credentials), **engine_options(provider, credentials))
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "latency_ms": round((time.perf_counter() - started) * 1000, 1),
            "message": "Credentials verified with a read-only connectivity check.",
        }
    finally:
        engine.dispose()


def get_external_catalog(provider: str, credentials: Dict[str, Any]) -> CatalogSchema:
    from sqlalchemy import create_engine, inspect

    cache_key = _catalog_cache_key(provider, credentials)
    now = time.monotonic()
    with _CATALOG_CACHE_LOCK:
        cached = _CATALOG_CACHE.get(cache_key)
        if cached and now - cached[0] < _CATALOG_CACHE_TTL_SECONDS:
            return cached[1]

    engine = create_engine(connection_url(provider, credentials), **engine_options(provider, credentials))
    try:
        if provider.lower() in SQL_SERVER_PROVIDERS:
            catalog = _sqlserver_catalog(engine, credentials)
            with _CATALOG_CACHE_LOCK:
                _CATALOG_CACHE[cache_key] = (time.monotonic(), catalog)
            return catalog
        inspector = inspect(engine)
        schema_name = credentials.get("schema") if provider == "snowflake" else None
        table_names = inspector.get_table_names(schema=schema_name)
        tables: Dict[str, TableInfo] = {}
        for table_name in table_names:
            columns = []
            for column in inspector.get_columns(table_name, schema=schema_name):
                columns.append(ColumnInfo(
                    name=column["name"],
                    type=str(column.get("type", "TEXT")),
                    nullable=bool(column.get("nullable", True)),
                    primary_key=bool(column.get("primary_key", False)),
                ))
            fks = []
            for fk in inspector.get_foreign_keys(table_name, schema=schema_name):
                for source, target in zip(fk.get("constrained_columns", []), fk.get("referred_columns", [])):
                    fks.append(ForeignKeyInfo(
                        from_column=source,
                        to_table=fk.get("referred_table", ""),
                        to_column=target,
                    ))
            tables[table_name] = TableInfo(name=table_name, columns=columns, foreign_keys=fks)
        catalog = CatalogSchema(
            engine="postgres" if provider in {"postgresql", "supabase"} else provider,
            database_name=str(credentials.get("database") or provider.title()),
            tables=tables,
        )
        with _CATALOG_CACHE_LOCK:
            _CATALOG_CACHE[cache_key] = (time.monotonic(), catalog)
        return catalog
    finally:
        engine.dispose()


# AutoCount databases hold hundreds of tables, so SQL Server's catalog is read in
# four set-based queries instead of one reflection round trip per table.
_SQLSERVER_COLUMNS = """
SELECT c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, c.IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS c
JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
WHERE t.TABLE_TYPE = 'BASE TABLE' AND c.TABLE_SCHEMA = :schema
ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION
"""
_SQLSERVER_PRIMARY_KEYS = """
SELECT k.TABLE_NAME, k.COLUMN_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k ON k.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND k.TABLE_SCHEMA = tc.TABLE_SCHEMA
WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = :schema
"""
_SQLSERVER_FOREIGN_KEYS = """
SELECT OBJECT_NAME(f.parent_object_id), pc.name, OBJECT_NAME(f.referenced_object_id), rc.name
FROM sys.foreign_key_columns f
JOIN sys.columns pc ON pc.object_id = f.parent_object_id AND pc.column_id = f.parent_column_id
JOIN sys.columns rc ON rc.object_id = f.referenced_object_id AND rc.column_id = f.referenced_column_id
WHERE OBJECT_SCHEMA_NAME(f.parent_object_id) = :schema
"""
_SQLSERVER_ROW_COUNTS = """
SELECT OBJECT_NAME(p.object_id), SUM(p.rows)
FROM sys.partitions p
WHERE p.index_id IN (0, 1) AND OBJECT_SCHEMA_NAME(p.object_id) = :schema
GROUP BY p.object_id
"""


def _sqlserver_catalog(engine: Any, credentials: Dict[str, Any]) -> CatalogSchema:
    from sqlalchemy import text

    schema = str(normalized_credentials(credentials).get("schema") or "dbo")
    with engine.connect() as conn:
        columns = conn.execute(text(_SQLSERVER_COLUMNS), {"schema": schema}).fetchall()
        keys = conn.execute(text(_SQLSERVER_PRIMARY_KEYS), {"schema": schema}).fetchall()
        foreign = conn.execute(text(_SQLSERVER_FOREIGN_KEYS), {"schema": schema}).fetchall()
        try:
            counts = conn.execute(text(_SQLSERVER_ROW_COUNTS), {"schema": schema}).fetchall()
        except Exception:  # row counts need VIEW DEFINITION; the catalog works without them
            counts = []
    return build_sqlserver_catalog(columns, keys, foreign, counts, str(credentials.get("database") or "SQL Server"))


def build_sqlserver_catalog(columns, keys, foreign, counts, database: str) -> CatalogSchema:
    primary = {(str(table), str(column)) for table, column in keys}
    row_counts = {str(table): int(rows or 0) for table, rows in counts}
    tables: Dict[str, TableInfo] = {}
    for table, column, data_type, nullable in columns:
        info = tables.setdefault(str(table), TableInfo(name=str(table), row_count_estimate=row_counts.get(str(table), 0)))
        info.columns.append(ColumnInfo(
            name=str(column),
            type=str(data_type).upper(),
            nullable=str(nullable).upper() == "YES",
            primary_key=(str(table), str(column)) in primary,
        ))
    for table, column, to_table, to_column in foreign:
        if str(table) in tables:
            tables[str(table)].foreign_keys.append(ForeignKeyInfo(from_column=str(column), to_table=str(to_table), to_column=str(to_column)))
    return CatalogSchema(engine="sqlserver", database_name=database, tables=tables)
