import sqlglot
from sqlglot import exp
from typing import List, Dict, Any, Tuple, Optional
from pydantic import BaseModel
from backend.app.catalog.discovery import CatalogSchema

# SQLite exposes these on every ordinary table without declaring them.
SQLITE_PSEUDO_COLUMNS = {"rowid", "oid", "_rowid_"}


class ValidationCheck(BaseModel):
    code: str
    label: str
    status: str # 'passed' | 'warning' | 'failed'
    detail: str

class ValidationResult(BaseModel):
    is_valid: bool
    sanitized_sql: str
    referenced_tables: List[str] = []
    referenced_columns: List[str] = []
    checks: List[ValidationCheck] = []
    error_message: Optional[str] = None

class SqlValidator:
    @staticmethod
    def validate_and_sanitize(
        sql: str,
        dialect: str,
        catalog: CatalogSchema,
        max_rows: int = 200
    ) -> ValidationResult:
        checks: List[ValidationCheck] = []
        sql_clean = sql.strip().rstrip(';')

        # 1. Check syntax and parse
        try:
            parsed_statements = sqlglot.parse(sql_clean, read=dialect)
        except Exception as e:
            checks.append(ValidationCheck(
                code="syntax_parse_error",
                label="SQL Syntax Parsing",
                status="failed",
                detail=f"Failed to parse SQL: {str(e)}"
            ))
            return ValidationResult(
                is_valid=False,
                sanitized_sql=sql_clean,
                checks=checks,
                error_message=f"Syntax error: {str(e)}"
            )

        checks.append(ValidationCheck(
            code="syntax_valid",
            label="SQL Syntax & Dialect",
            status="passed",
            detail=f"Successfully parsed as valid {dialect.upper()} SQL."
        ))

        # 2. Check statement count
        if len(parsed_statements) != 1:
            checks.append(ValidationCheck(
                code="multiple_statements_blocked",
                label="Single Statement Enforcement",
                status="failed",
                detail=f"Rejected query containing {len(parsed_statements)} stacked statements."
            ))
            return ValidationResult(
                is_valid=False,
                sanitized_sql=sql_clean,
                checks=checks,
                error_message="Only single SQL statements are allowed."
            )

        expression = parsed_statements[0]
        if not expression:
            return ValidationResult(is_valid=False, sanitized_sql="", error_message="Empty SQL statement.")

        # 3. Check statement type (SELECT or CTE ending in SELECT)
        is_select = isinstance(expression, (exp.Select, exp.Union)) or (isinstance(expression, exp.Query) and expression.key == "select")
        if isinstance(expression, exp.With):
            # Check CTE returns a SELECT
            is_select = isinstance(expression.this, (exp.Select, exp.Union))

        if not is_select:
            checks.append(ValidationCheck(
                code="non_select_statement_blocked",
                label="Read-Only SELECT Enforcement",
                status="failed",
                detail=f"Statement type '{expression.key.upper()}' is not permitted. Only SELECT queries allowed."
            ))
            return ValidationResult(
                is_valid=False,
                sanitized_sql=sql_clean,
                checks=checks,
                error_message="Only read-only SELECT queries are allowed."
            )

        checks.append(ValidationCheck(
            code="read_only_policy",
            label="Read-Only Policy Check",
            status="passed",
            detail="Verified statement is strictly read-only SELECT."
        ))

        # 4. Check for forbidden DML/DDL sub-expressions
        forbidden_types = (
            exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create,
            exp.Alter, exp.Pragma, exp.Command
        )
        for node in expression.walk():
            if isinstance(node, forbidden_types):
                checks.append(ValidationCheck(
                    code="forbidden_ast_node",
                    label="AST AST Safety Traversal",
                    status="failed",
                    detail=f"Forbidden DML/DDL operation detected: {node.key.upper()}"
                ))
                return ValidationResult(
                    is_valid=False,
                    sanitized_sql=sql_clean,
                    checks=checks,
                    error_message=f"Forbidden operation '{node.key.upper()}' detected."
                )

        # 5. Extract and verify tables. Names defined by the query itself (CTEs)
        # are not catalog tables; catalog lookups ignore case.
        catalog_tables = {name.lower(): info for name, info in catalog.tables.items()}
        cte_names = {cte.alias_or_name.lower() for cte in expression.find_all(exp.CTE) if cte.alias_or_name}
        ref_tables = set()
        for t in expression.find_all(exp.Table):
            tbl_name = t.name.lower()
            if tbl_name and tbl_name not in cte_names:
                ref_tables.add(tbl_name)

        invalid_tables = sorted(tbl for tbl in ref_tables if tbl not in catalog_tables)
        if invalid_tables:
            checks.append(ValidationCheck(
                code="unresolved_tables",
                label="Catalog Table Verification",
                status="failed",
                detail=f"Tables not found in catalog: {', '.join(invalid_tables)}"
            ))
            return ValidationResult(
                is_valid=False,
                sanitized_sql=sql_clean,
                checks=checks,
                error_message=f"Unknown tables: {', '.join(invalid_tables)}"
            )

        checks.append(ValidationCheck(
            code="tables_verified",
            label="Catalog Table Verification",
            status="passed",
            detail=f"All {len(ref_tables)} referenced tables verified against catalog."
        ))

        # 6. Verify columns against the tables they can come from.
        ref_columns, unknown_columns = SqlValidator._check_columns(expression, catalog_tables, cte_names, dialect)
        if unknown_columns:
            listed = ", ".join(unknown_columns)
            hint = (
                " Text values must use single quotes; double quotes name a column."
                if any(not "." in name for name in unknown_columns) and '"' in sql_clean else ""
            )
            checks.append(ValidationCheck(
                code="unresolved_columns",
                label="Column Identifier Grounding",
                status="failed",
                detail=f"Columns not found in the referenced tables: {listed}.{hint}"
            ))
            return ValidationResult(
                is_valid=False,
                sanitized_sql=sql_clean,
                checks=checks,
                error_message=f"Unknown columns: {listed}.{hint}"
            )

        checks.append(ValidationCheck(
            code="identifiers_grounded",
            label="Column Identifier Grounding",
            status="passed",
            detail=f"All {len(ref_columns)} referenced columns exist in the referenced tables."
        ))

        # 7. Apply / enforce LIMIT
        limit_node = expression.find(exp.Limit)
        if not limit_node:
            expression = expression.limit(max_rows)
            checks.append(ValidationCheck(
                code="demo_limit_applied",
                label="Demo Row Limit Guardrail",
                status="passed",
                detail=f"Injected safety LIMIT {max_rows}."
            ))
        else:
            try:
                current_limit = int(limit_node.expression.this)
                if current_limit > max_rows:
                    limit_node.set("expression", exp.Literal.number(max_rows))
                    checks.append(ValidationCheck(
                        code="demo_limit_capped",
                        label="Demo Row Limit Guardrail",
                        status="warning",
                        detail=f"Capped requested limit {current_limit} to maximum {max_rows}."
                    ))
                else:
                    checks.append(ValidationCheck(
                        code="demo_limit_verified",
                        label="Demo Row Limit Guardrail",
                        status="passed",
                        detail=f"Verified row limit ({current_limit} <= {max_rows})."
                    ))
            except Exception:
                pass

        sanitized_sql = expression.sql(dialect=dialect, pretty=True)

        return ValidationResult(
            is_valid=True,
            sanitized_sql=sanitized_sql,
            referenced_tables=list(ref_tables),
            referenced_columns=list(ref_columns),
            checks=checks
        )

    @staticmethod
    def _check_columns(
        expression: exp.Expression,
        catalog_tables: Dict[str, Any],
        cte_names: set,
        dialect: str = "",
    ) -> Tuple[List[str], List[str]]:
        """Return (referenced columns, unknown columns).

        A qualified column (o.status) is checked against its table when the
        qualifier names a catalog table. An unqualified column must exist in some
        referenced table or be a name the query defines (an alias or a column of a
        CTE or subquery). Columns of derived tables are not checked.
        """
        table_columns: Dict[str, set] = {}
        derived: set = set(cte_names)
        for table in expression.find_all(exp.Table):
            name = table.name.lower()
            if name not in cte_names and name in catalog_tables:
                table_columns[name] = {column.name.lower() for column in catalog_tables[name].columns}
        for node in expression.find_all(exp.Subquery, exp.CTE):
            if node.alias_or_name:
                derived.add(node.alias_or_name.lower())
        defined = {alias.alias.lower() for alias in expression.find_all(exp.Alias) if alias.alias}
        for table_alias in expression.find_all(exp.TableAlias):
            defined.update(column.name.lower() for column in table_alias.columns)
        all_columns = set().union(*table_columns.values()) if table_columns else set()
        if dialect == "sqlite":
            all_columns |= SQLITE_PSEUDO_COLUMNS

        def select_sources(select: exp.Select) -> Dict[str, Optional[str]]:
            """Alias -> catalog table read directly by this SELECT (None for derived tables)."""
            found: Dict[str, Optional[str]] = {}
            from_clause = select.args.get("from") or select.args.get("from_")
            nodes = [from_clause.this] if from_clause is not None else []
            nodes += [join.this for join in select.args.get("joins") or []]
            for node in nodes:
                alias = (node.alias_or_name or "").lower()
                if isinstance(node, exp.Table) and node.name.lower() in table_columns:
                    found[alias or node.name.lower()] = node.name.lower()
                    found.setdefault(node.name.lower(), node.name.lower())
                elif alias:
                    found[alias] = None
            return found

        def resolve(column: exp.Column, qualifier: str) -> Optional[str]:
            """The catalog table a qualifier names, looking outwards for correlated references.

            Aliases are scoped: two branches of a UNION may both call different tables "t".
            """
            select = column.find_ancestor(exp.Select)
            while select is not None:
                sources = select_sources(select)
                if qualifier in sources:
                    return sources[qualifier]
                select = select.find_ancestor(exp.Select)
            return None

        referenced: set = set()
        unknown: List[str] = []
        for column in expression.find_all(exp.Column):
            name = column.name.lower() if column.name else ""
            if not name or name == "*" or isinstance(column.this, exp.Star):
                continue
            referenced.add(name)
            qualifier = column.table.lower() if column.table else ""
            if qualifier:
                table = None if qualifier in derived and qualifier not in table_columns else resolve(column, qualifier)
                if table and name not in table_columns[table] and not (dialect == "sqlite" and name in SQLITE_PSEUDO_COLUMNS):
                    unknown.append(f"{column.table}.{column.name}")
            elif name not in all_columns and name not in defined:
                # Derived tables can supply columns we cannot see; only judge
                # unqualified names when every source is a catalog table.
                if not derived:
                    unknown.append(column.name)
        return sorted(referenced), sorted(set(unknown))
