"""SQL Server (AutoCount) support. No server runs in CI, so these cover everything
up to the network call: URL, dialect, validation and catalog assembly."""
from backend.app.connections.runtime import build_sqlserver_catalog, connection_url, sqlglot_dialect
from backend.app.queries.validator import SqlValidator


def _catalog():
    columns = [
        ("Debtor", "AccNo", "nvarchar", "NO"), ("Debtor", "CompanyName", "nvarchar", "YES"),
        ("IV", "DocKey", "bigint", "NO"), ("IV", "DocNo", "nvarchar", "NO"), ("IV", "DebtorCode", "nvarchar", "YES"),
        ("IV", "DocDate", "datetime", "YES"), ("IV", "NetTotal", "decimal", "YES"), ("IV", "Cancelled", "char", "YES"),
        ("IVDTL", "DtlKey", "bigint", "NO"), ("IVDTL", "DocKey", "bigint", "NO"), ("IVDTL", "SubTotal", "decimal", "YES"),
    ]
    keys = [("Debtor", "AccNo"), ("IV", "DocKey"), ("IVDTL", "DtlKey")]
    foreign = [("IVDTL", "DocKey", "IV", "DocKey"), ("IV", "DebtorCode", "Debtor", "AccNo")]
    counts = [("IV", 1200), ("IVDTL", 5400), ("Debtor", 80)]
    return build_sqlserver_catalog(columns, keys, foreign, counts, "AED_DEMO")


def test_sql_server_url_supports_named_instances():
    url = connection_url("sqlserver", {"host": r"SERVER\A2006", "username": "report_reader", "password": "p@ss;word", "database": "AED_DEMO"})
    assert url.startswith("mssql+pymssql://report_reader:")
    assert "AED_DEMO" in url and "p%40ss%3Bword" in url
    assert sqlglot_dialect("sqlserver") == "tsql"
    assert sqlglot_dialect("supabase") == "postgres"


def test_sql_server_catalog_is_assembled_from_set_based_queries():
    catalog = _catalog()
    assert catalog.engine == "sqlserver"
    assert set(catalog.tables) == {"Debtor", "IV", "IVDTL"}
    iv = catalog.tables["IV"]
    assert iv.row_count_estimate == 1200
    assert [c.name for c in iv.columns if c.primary_key] == ["DocKey"]
    assert iv.foreign_keys[0].to_table == "Debtor"


def test_validator_writes_t_sql_row_limits_and_rejects_writes():
    catalog = _catalog()
    result = SqlValidator.validate_and_sanitize("SELECT DocNo, NetTotal FROM IV ORDER BY NetTotal DESC", dialect="tsql", catalog=catalog, max_rows=200)
    assert result.is_valid, result.error_message
    assert "TOP 200" in result.sanitized_sql and "LIMIT" not in result.sanitized_sql
    # Trust-layer probes are written with LIMIT; they must still run on SQL Server.
    probe = SqlValidator.validate_and_sanitize('SELECT DISTINCT "Cancelled" FROM "IV" WHERE "Cancelled" IS NOT NULL LIMIT 41', dialect="tsql", catalog=catalog)
    assert probe.is_valid and "TOP 41" in probe.sanitized_sql
    assert not SqlValidator.validate_and_sanitize("DELETE FROM IV", dialect="tsql", catalog=catalog).is_valid
    unknown = SqlValidator.validate_and_sanitize("SELECT Salesperson FROM IV", dialect="tsql", catalog=catalog)
    assert not unknown.is_valid and "Salesperson" in unknown.error_message
