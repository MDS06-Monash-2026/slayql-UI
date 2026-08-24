"""Provider-aware connection helpers.

Drivers are imported lazily so SQLite-only deployments can still boot without
installing every cloud database driver.
"""

from __future__ import annotations

import time
from typing import Any, Dict
from urllib.parse import quote_plus
import json

from backend.app.catalog.discovery import CatalogSchema, ColumnInfo, ForeignKeyInfo, TableInfo


def connection_url(provider: str, credentials: Dict[str, Any]) -> str:
    provider = provider.lower()
    credentials = normalized_credentials(credentials)
    if credentials.get("connection_string"):
        return str(credentials["connection_string"])
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

    engine = create_engine(connection_url(provider, credentials), **engine_options(provider, credentials))
    try:
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
        return CatalogSchema(
            engine="postgres" if provider in {"postgresql", "supabase"} else provider,
            database_name=str(credentials.get("database") or provider.title()),
            tables=tables,
        )
    finally:
        engine.dispose()
