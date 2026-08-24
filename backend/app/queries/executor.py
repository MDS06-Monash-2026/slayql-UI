import time
import asyncio
import aiosqlite
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel
from backend.app.connections.runtime import connection_url, engine_options

class ExecutionResult(BaseModel):
    columns: List[str]
    column_types: List[str]
    rows: List[List[Any]]
    row_count: int
    execution_time_ms: int
    is_truncated: bool = False
    error: Optional[str] = None
    chart_recommendation: Optional[Dict[str, Any]] = None

class QueryExecutor:
    @staticmethod
    async def execute_sqlite(
        db_path: str,
        sql: str,
        timeout_seconds: float = 10.0,
        max_rows: int = 200
    ) -> ExecutionResult:
        start_time = time.time()
        try:
            async with aiosqlite.connect(db_path) as db:
                # Set row factory or fetch
                cursor = await asyncio.wait_for(
                    db.execute(sql),
                    timeout=timeout_seconds
                )
                
                # Column names and descriptions
                col_names = [d[0] for d in cursor.description] if cursor.description else []
                
                # Fetch up to max_rows + 1 to detect truncation
                raw_rows = await asyncio.wait_for(
                    cursor.fetchmany(max_rows + 1),
                    timeout=timeout_seconds
                )
                
                is_truncated = len(raw_rows) > max_rows
                final_rows = [list(r) for r in raw_rows[:max_rows]]
                row_count = len(final_rows)
                
                # Infer column types from first non-null values
                col_types = []
                for col_idx in range(len(col_names)):
                    sample_type = "string"
                    for r in final_rows:
                        val = r[col_idx]
                        if val is not None:
                            if isinstance(val, (int, float)):
                                sample_type = "number"
                            elif isinstance(val, str) and (len(val) == 10 and val[4] == '-' and val[7] == '-'):
                                sample_type = "date"
                            break
                    col_types.append(sample_type)

                exec_time_ms = int((time.time() - start_time) * 1000)
                
                # Auto-recommend chart
                chart_rec = QueryExecutor._recommend_chart(col_names, col_types, final_rows)

                return ExecutionResult(
                    columns=col_names,
                    column_types=col_types,
                    rows=final_rows,
                    row_count=row_count,
                    execution_time_ms=exec_time_ms,
                    is_truncated=is_truncated,
                    chart_recommendation=chart_rec
                )
        except asyncio.TimeoutError:
            return ExecutionResult(
                columns=[],
                column_types=[],
                rows=[],
                row_count=0,
                execution_time_ms=int((time.time() - start_time) * 1000),
                error=f"Query execution timed out after {timeout_seconds} seconds."
            )
        except Exception as exc:
            return ExecutionResult(
                columns=[],
                column_types=[],
                rows=[],
                row_count=0,
                execution_time_ms=int((time.time() - start_time) * 1000),
                error=f"Execution error: {exc}"
            )

    @staticmethod
    async def execute_external(
        provider: str,
        credentials: Dict[str, Any],
        sql: str,
        timeout_seconds: float = 10.0,
        max_rows: int = 200,
    ) -> ExecutionResult:
        """Execute a validated read-only query through SQLAlchemy in a worker thread."""
        started = time.time()

        def run_query() -> ExecutionResult:
            from sqlalchemy import create_engine, text

            engine = create_engine(connection_url(provider, credentials), **engine_options(provider, credentials))
            try:
                with engine.connect() as conn:
                    result = conn.execute(text(sql))
                    columns = list(result.keys())
                    raw_rows = result.fetchmany(max_rows + 1)
                rows = [list(row) for row in raw_rows[:max_rows]]
                types = []
                for idx in range(len(columns)):
                    sample_type = "string"
                    for row in rows:
                        value = row[idx]
                        if value is not None:
                            if isinstance(value, (int, float)):
                                sample_type = "number"
                            elif hasattr(value, "year"):
                                sample_type = "date"
                            break
                    types.append(sample_type)
                return ExecutionResult(
                    columns=columns,
                    column_types=types,
                    rows=rows,
                    row_count=len(rows),
                    execution_time_ms=int((time.time() - started) * 1000),
                    is_truncated=len(raw_rows) > max_rows,
                    chart_recommendation=QueryExecutor._recommend_chart(columns, types, rows),
                )
            finally:
                engine.dispose()

        try:
            return await asyncio.wait_for(asyncio.to_thread(run_query), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            return ExecutionResult(columns=[], column_types=[], rows=[], row_count=0, execution_time_ms=int((time.time() - started) * 1000), error=f"Query execution timed out after {timeout_seconds} seconds.")
        except Exception as exc:
            return ExecutionResult(columns=[], column_types=[], rows=[], row_count=0, execution_time_ms=int((time.time() - started) * 1000), error=f"Execution error: {exc}")

    @staticmethod
    def _recommend_chart(
        columns: List[str],
        col_types: List[str],
        rows: List[List[Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Deterministic chart recommendation based on columns, data types, and row count.
        """
        if not rows or len(columns) < 2:
            if len(rows) == 1 and len(columns) == 1 and col_types[0] == "number":
                return {
                    "type": "kpi",
                    "title": columns[0].replace("_", " ").title(),
                    "value": rows[0][0],
                    "unit": ""
                }
            return None

        # Find categorical / date columns and numeric columns
        dim_cols = [i for i, t in enumerate(col_types) if t in ("string", "date")]
        num_cols = [i for i, t in enumerate(col_types) if t == "number"]

        if not num_cols:
            return None

        # If we have 1 date/dim and 1 or more numbers
        dim_idx = dim_cols[0] if dim_cols else 0
        dim_name = columns[dim_idx]
        dim_type = col_types[dim_idx]
        
        # Prepare chart series data
        chart_data = []
        for r in rows[:20]: # Keep chart visually clean
            item = {"name": str(r[dim_idx])}
            # Lead with one metric so the recommendation answers the query
            # clearly. Additional numeric columns remain available in the
            # result table instead of competing for attention in the chart.
            for n_idx in num_cols[:1]:
                val = r[n_idx]
                item[columns[n_idx]] = val if isinstance(val, (int, float)) else 0
            chart_data.append(item)

        # Decide chart type
        primary_metric = columns[num_cols[0]]
        if dim_type == "date" or "month" in dim_name.lower() or "date" in dim_name.lower() or "year" in dim_name.lower():
            rec_type = "line"
        elif len(rows) <= 6 and "category" in dim_name.lower():
            rec_type = "pie"
        else:
            rec_type = "bar"

        return {
            "type": rec_type,
            "title": f"{primary_metric.replace('_', ' ').title()} by {dim_name.replace('_', ' ').title()}",
            "x_axis_key": "name",
            "x_axis_label": dim_name.replace('_', ' ').title(),
            "y_axis_label": primary_metric.replace('_', ' ').title(),
            "metric_keys": [primary_metric],
            "available_metric_keys": [columns[i] for i in num_cols],
            "recommendation_reason": (
                "Time-ordered results are best read as a trend."
                if rec_type == "line"
                else "A small categorical result set is easiest to compare as a share."
                if rec_type == "pie"
                else "A categorical result set is easiest to compare side by side."
            ),
            "data": chart_data
        }
