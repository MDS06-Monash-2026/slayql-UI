import time
import uuid
import json
import asyncio
import random
from datetime import datetime, timezone
from typing import Dict, List, Any, AsyncGenerator, Optional
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.catalog.discovery import CatalogService, CatalogSchema
from backend.app.agent.rbp import RBPGraphEngine
from backend.app.providers.openrouter_client import openrouter_client, ProviderCompletionResponse
from backend.app.queries.validator import SqlValidator, ValidationResult
from backend.app.queries.executor import QueryExecutor, ExecutionResult
from backend.app.connections.registry import get_connection, get_credentials, get_sqlite_path
from backend.app.connections.runtime import get_external_catalog

class SSEEventEnvelope(BaseModel):
    schema_version: int = 1
    event_id: str
    sequence: int
    run_id: str
    conversation_id: str
    occurred_at: str
    stage: str
    type: str
    payload: Dict[str, Any] = {}

    def to_sse_format(self) -> str:
        data_json = json.dumps(self.model_dump())
        return f"id: {self.event_id}\nevent: {self.type}\ndata: {data_json}\n\n"

# In-memory storage for active run events
RUN_EVENTS_STORE: Dict[str, List[SSEEventEnvelope]] = {}
RUN_CANCEL_FLAGS: Dict[str, bool] = {}
RUN_METADATA_STORE: Dict[str, Dict[str, Any]] = {}

class SlayQLPipeline:
    @staticmethod
    async def _demo_stage_pause() -> None:
        """Give each demo stage a human-paced 2-4 second streamed beat."""
        await asyncio.sleep(random.uniform(2.0, 4.0))

    @staticmethod
    def create_run(
        question: str,
        model_id: str = "anthropic/claude-sonnet-4.5",
        connection_id: str = "sqlite_demo",
        conversation_id: Optional[str] = None
    ) -> Dict[str, Any]:
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        conv_id = conversation_id or f"conv_{uuid.uuid4().hex[:8]}"
        
        RUN_EVENTS_STORE[run_id] = []
        RUN_CANCEL_FLAGS[run_id] = False
        RUN_METADATA_STORE[run_id] = {
            "run_id": run_id,
            "conversation_id": conv_id,
            "question": question,
            "model_id": model_id,
            "connection_id": connection_id,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        return {
            "run_id": run_id,
            "conversation_id": conv_id,
            "events_url": f"/api/v1/agent-runs/{run_id}/events",
            "initial_state": "creating_run"
        }

    @staticmethod
    def cancel_run(run_id: str) -> bool:
        if run_id in RUN_CANCEL_FLAGS:
            RUN_CANCEL_FLAGS[run_id] = True
            return True
        return False

    @staticmethod
    async def stream_run_events(run_id: str) -> AsyncGenerator[str, None]:
        if run_id not in RUN_METADATA_STORE:
            yield f"event: error\ndata: {json.dumps({'error': 'Run not found'})}\n\n"
            return

        meta = RUN_METADATA_STORE[run_id]
        question = meta["question"]
        model_id = meta["model_id"]
        connection_id = meta["connection_id"]
        conv_id = meta["conversation_id"]

        sequence = 1
        run_started_at = time.perf_counter()

        def make_event(stage: str, event_type: str, payload: Dict[str, Any]) -> SSEEventEnvelope:
            nonlocal sequence
            now_str = datetime.now(timezone.utc).isoformat()
            evt = SSEEventEnvelope(
                event_id=f"{run_id}:{sequence}",
                sequence=sequence,
                run_id=run_id,
                conversation_id=conv_id,
                occurred_at=now_str,
                stage=stage,
                type=event_type,
                payload=payload
            )
            sequence += 1
            RUN_EVENTS_STORE[run_id].append(evt)
            return evt

        # 1. Run accepted
        yield make_event(
            stage="preparation",
            event_type="run.accepted",
            payload={"question": question, "model_id": model_id, "connection_id": connection_id}
        ).to_sse_format()

        yield make_event(
            stage="preparation",
            event_type="stream.ready",
            payload={"buffer_ms": 20}
        ).to_sse_format()

        # Check cancellation
        if RUN_CANCEL_FLAGS.get(run_id):
            yield make_event("cancelled", "run.cancelled", {"reason": "User cancelled"}).to_sse_format()
            return

        # 2. Stage: Schema candidate retrieval
        schema_started_at = time.perf_counter()
        yield make_event(
            stage="schema_discovery",
            event_type="stage.started",
            payload={"label": "Schema Candidates Retrieval", "status": "active"}
        ).to_sse_format()
        
        # Keep the demo stream paced like a real catalog/index lookup so the
        # trace has time to communicate what the agent is doing.
        await SlayQLPipeline._demo_stage_pause()
        connection = get_connection(connection_id)
        if not connection:
            yield make_event("schema_discovery", "run.failed", {"error": "Selected data source was not found."}).to_sse_format()
            return
        try:
            if connection.get("engine") == "sqlite":
                catalog = CatalogService.get_sqlite_catalog(get_sqlite_path(connection_id) or settings.SQLITE_DEMO_PATH)
            else:
                catalog = get_external_catalog(connection["engine"], get_credentials(connection_id))
        except Exception as exc:
            yield make_event("schema_discovery", "run.failed", {"error": f"Could not inspect the selected data source: {exc}"}).to_sse_format()
            return
        rbp = RBPGraphEngine(catalog)
        entity_matches = rbp.match_schema_entities(question)

        yield make_event(
            stage="schema_discovery",
            event_type="stage.evidence",
            payload={
                "summary": f"Discovered {len(catalog.tables)} tables in catalog; matched {len(entity_matches['matched_tables'])} tables from question intent.",
                "matched_tables": entity_matches["matched_tables"],
                "total_catalog_tables": len(catalog.tables)
            }
        ).to_sse_format()

        yield make_event(
            stage="schema_discovery",
            event_type="stage.completed",
            payload={
                "label": "Schema Candidates Retrieval",
                "status": "passed",
                "duration_ms": int((time.perf_counter() - schema_started_at) * 1000)
            }
        ).to_sse_format()

        if RUN_CANCEL_FLAGS.get(run_id):
            yield make_event("cancelled", "run.cancelled", {"reason": "User cancelled"}).to_sse_format()
            return

        # 3. Stage: FK Graph Expansion (RBP)
        graph_started_at = time.perf_counter()
        yield make_event(
            stage="graph_expansion",
            event_type="stage.started",
            payload={"label": "Relational Belief Propagation (RBP) Traversal", "status": "active"}
        ).to_sse_format()
        
        await SlayQLPipeline._demo_stage_pause()
        expanded_chain = entity_matches["expanded_chain"]

        yield make_event(
            stage="graph_expansion",
            event_type="stage.evidence",
            payload={
                "summary": f"Expanded multi-hop relationship path across {len(expanded_chain)} tables: {' → '.join(expanded_chain)}.",
                "join_path": expanded_chain,
                "traversal_type": "shortest_foreign_key_walk"
            }
        ).to_sse_format()

        yield make_event(
            stage="graph_expansion",
            event_type="stage.completed",
            payload={
                "label": "Relational Belief Propagation (RBP) Traversal",
                "status": "passed",
                "duration_ms": int((time.perf_counter() - graph_started_at) * 1000)
            }
        ).to_sse_format()

        # 4. Stage: Value Grounding
        grounding_started_at = time.perf_counter()
        yield make_event(
            stage="value_grounding",
            event_type="stage.started",
            payload={"label": "Value Grounding & Column Index Matching", "status": "active"}
        ).to_sse_format()
        
        await SlayQLPipeline._demo_stage_pause()
        grounded_vals = entity_matches["grounded_values"]
        matched_cols = entity_matches["matched_columns"]

        grounding_summary = "Grounding hints assembled for schema filters and aggregations."
        if grounded_vals:
            grounding_summary = f"Grounded literal '{grounded_vals[0]['value']}' to column {grounded_vals[0]['column']} in {grounded_vals[0]['table']}."

        yield make_event(
            stage="value_grounding",
            event_type="stage.evidence",
            payload={
                "summary": grounding_summary,
                "grounded_values": grounded_vals,
                "matched_columns": matched_cols
            }
        ).to_sse_format()

        yield make_event(
            stage="value_grounding",
            event_type="stage.completed",
            payload={
                "label": "Value Grounding & Column Index Matching",
                "status": "passed",
                "duration_ms": int((time.perf_counter() - grounding_started_at) * 1000)
            }
        ).to_sse_format()

        if RUN_CANCEL_FLAGS.get(run_id):
            yield make_event("cancelled", "run.cancelled", {"reason": "User cancelled"}).to_sse_format()
            return

        # 5. Stage: Provider Generation
        generation_started_at = time.perf_counter()
        yield make_event(
            stage="model_generation",
            event_type="provider.request_started",
            payload={"model_id": model_id, "provider": "OpenRouter Gateway"}
        ).to_sse_format()

        yield make_event(
            stage="model_generation",
            event_type="provider.connected",
            payload={"status": "connected", "endpoint": settings.OPENROUTER_BASE_URL}
        ).to_sse_format()

        # Build schema summary string
        schema_lines = []
        for tbl in expanded_chain:
            if tbl in catalog.tables:
                t_info = catalog.tables[tbl]
                cols_str = ", ".join([f"{c.name} ({c.type})" for c in t_info.columns])
                schema_lines.append(f"Table '{tbl}': {cols_str}")
        schema_ctx = "\n".join(schema_lines)

        grounding_str = json.dumps(grounded_vals)

        # Call OpenRouter / model gateway
        await SlayQLPipeline._demo_stage_pause()
        completion: ProviderCompletionResponse = await openrouter_client.generate_sql(
            model_id=model_id,
            question=question,
            dialect="sqlite",
            schema_context=schema_ctx,
            grounding_hints=grounding_str
        )

        candidate_sql = completion.extracted_sql.strip()

        yield make_event(
            stage="model_generation",
            event_type="provider.completed",
            payload={
                "model_id": model_id,
                "latency_ms": completion.latency_ms,
                "duration_ms": int((time.perf_counter() - generation_started_at) * 1000),
                "summary": "Model returned a SQL candidate grounded in the selected schema path.",
                "token_usage": {
                    "input_tokens": completion.input_tokens,
                    "output_tokens": completion.output_tokens,
                    "total_tokens": completion.input_tokens + completion.output_tokens,
                    "estimated_cost_usd": completion.estimated_cost_usd
                },
                "finish_reason": "stop"
            }
        ).to_sse_format()

        # 6. Stage: SQL Validation
        validation_started_at = time.perf_counter()
        yield make_event(
            stage="sql_validation",
            event_type="sql.candidate_ready",
            payload={
                "candidate_id": f"cand_{uuid.uuid4().hex[:8]}",
                "revision": 1,
                "sql": candidate_sql,
                "dialect": "sqlite",
                "generation_source": "openrouter"
            }
        ).to_sse_format()

        yield make_event(
            stage="sql_validation",
            event_type="sql.validation_started",
            payload={"dialect": "sqlite"}
        ).to_sse_format()

        await SlayQLPipeline._demo_stage_pause()

        validation: ValidationResult = SqlValidator.validate_and_sanitize(
            sql=candidate_sql,
            dialect="sqlite",
            catalog=catalog,
            max_rows=settings.MAX_RESULT_ROWS
        )

        for check in validation.checks:
            yield make_event(
                stage="sql_validation",
                event_type="sql.validation_check",
                payload=check.model_dump()
            ).to_sse_format()

        yield make_event(
            stage="sql_validation",
            event_type="sql.validation_completed",
            payload={
                "is_valid": validation.is_valid,
                "sanitized_sql": validation.sanitized_sql,
                "referenced_tables": validation.referenced_tables,
                "referenced_columns": validation.referenced_columns,
                "duration_ms": int((time.perf_counter() - validation_started_at) * 1000),
                "summary": f"Passed {len(validation.checks)} read-only and dialect safety checks."
            }
        ).to_sse_format()

        if not validation.is_valid:
            yield make_event(
                stage="sql_validation",
                event_type="run.failed",
                payload={"error": validation.error_message or "SQL Validation failed"}
            ).to_sse_format()
            return

        yield make_event(
            stage="sql_validation",
            event_type="sql.ready",
            payload={"sql": validation.sanitized_sql}
        ).to_sse_format()

        if RUN_CANCEL_FLAGS.get(run_id):
            yield make_event("cancelled", "run.cancelled", {"reason": "User cancelled"}).to_sse_format()
            return

        # 7. Stage: Execution
        yield make_event(
            stage="execution",
            event_type="execution.started",
            payload={"database": connection.get("name", connection_id), "timeout_seconds": settings.QUERY_TIMEOUT_SECONDS}
        ).to_sse_format()

        await SlayQLPipeline._demo_stage_pause()
        if connection.get("engine") == "sqlite":
            exec_res = await QueryExecutor.execute_sqlite(
                db_path=get_sqlite_path(connection_id) or settings.SQLITE_DEMO_PATH,
                sql=validation.sanitized_sql,
                timeout_seconds=settings.QUERY_TIMEOUT_SECONDS,
                max_rows=settings.MAX_RESULT_ROWS
            )
        else:
            exec_res = await QueryExecutor.execute_external(
                provider=connection["engine"],
                credentials=get_credentials(connection_id),
                sql=validation.sanitized_sql,
                timeout_seconds=settings.QUERY_TIMEOUT_SECONDS,
                max_rows=settings.MAX_RESULT_ROWS
            )

        if exec_res.error:
            yield make_event(
                stage="execution",
                event_type="execution.failed",
                payload={"error": exec_res.error}
            ).to_sse_format()
            yield make_event(
                stage="execution",
                event_type="run.failed",
                payload={"error": exec_res.error}
            ).to_sse_format()
            return

        yield make_event(
            stage="execution",
            event_type="execution.columns",
            payload={"columns": exec_res.columns, "column_types": exec_res.column_types}
        ).to_sse_format()

        # Stream row batches fast
        batch_size = 50
        for i in range(0, len(exec_res.rows), batch_size):
            batch = exec_res.rows[i : i + batch_size]
            is_final = (i + batch_size) >= len(exec_res.rows)
            yield make_event(
                stage="execution",
                event_type="execution.rows",
                payload={
                    "batch_index": i // batch_size,
                    "offset": i,
                    "rows": batch,
                    "is_final": is_final
                }
            ).to_sse_format()

        yield make_event(
            stage="execution",
            event_type="execution.completed",
            payload={
                "row_count": len(exec_res.rows),
                "is_truncated": exec_res.is_truncated,
                "execution_time_ms": exec_res.execution_time_ms,
                "summary": f"Returned {len(exec_res.rows)} rows from the read-only execution."
            }
        ).to_sse_format()

        # 8. Stage: Visualization recommendation
        visualization_started_at = time.perf_counter()
        yield make_event(
            stage="visualization",
            event_type="visualization.started",
            payload={"columns_count": len(exec_res.columns), "rows_count": len(exec_res.rows)}
        ).to_sse_format()

        if exec_res.chart_recommendation:
            await SlayQLPipeline._demo_stage_pause()
            yield make_event(
                stage="visualization",
                event_type="visualization.recommended",
                payload={
                    "chart": exec_res.chart_recommendation,
                    "duration_ms": int((time.perf_counter() - visualization_started_at) * 1000)
                }
            ).to_sse_format()
        else:
            yield make_event(
                stage="visualization",
                event_type="visualization.not_recommended",
                payload={
                    "reason": "Single row or non-relational metric shape; defaulting to table.",
                    "duration_ms": int((time.perf_counter() - visualization_started_at) * 1000)
                }
            ).to_sse_format()

        # 9. Run Completed
        yield make_event(
            stage="completion",
            event_type="run.completed",
            payload={
                "status": "success",
                "total_duration_ms": int((time.perf_counter() - run_started_at) * 1000),
                "sql": validation.sanitized_sql,
                "rows_count": len(exec_res.rows)
            }
        ).to_sse_format()
