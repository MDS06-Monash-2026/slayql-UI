from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional

from pydantic import BaseModel, Field

from backend.app.agent.effort import (
    DEFAULT_THINKING_EFFORT,
    ThinkingEffort,
    get_thinking_profile,
)
from backend.app.agent.rbp import RBPGraphEngine
from backend.app.catalog.discovery import CatalogService
from backend.app.config import settings
from backend.app.connections.registry import get_connection, get_credentials, get_sqlite_path, require_sqlite_path
from backend.app.connections.runtime import get_external_catalog
from backend.app.history.conversation_store import conversation_store
from backend.app.providers.openrouter_client import (
    TEST_EXECUTION_MODEL,
    ProviderError,
    openrouter_client,
)
from backend.app.queries.executor import QueryExecutor
from backend.app.queries.validator import SqlValidator
from backend.app.workbench.gemini_agent import (
    GEMINI_WORKBENCH_MODEL,
    _fallback_chat_intent,
    gemini_workbench_agent,
    materialize_chart_recommendation,
    summarize_result,
)


class SSEEventEnvelope(BaseModel):
    schema_version: int = 1
    event_id: str
    sequence: int
    run_id: str
    conversation_id: str
    occurred_at: str
    stage: str
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)

    def to_sse_format(self) -> str:
        return (
            f"id: {self.event_id}\n"
            f"event: {self.type}\n"
            f"data: {json.dumps(self.model_dump(), ensure_ascii=True, default=str)}\n\n"
        )


RUN_EVENTS_STORE: Dict[str, List[SSEEventEnvelope]] = {}
RUN_CANCEL_FLAGS: Dict[str, bool] = {}
RUN_METADATA_STORE: Dict[str, Dict[str, Any]] = {}
RUN_TASKS: Dict[str, asyncio.Task] = {}
RUN_NOTIFIERS: Dict[str, asyncio.Event] = {}
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}


class SlayQLPipeline:
    @staticmethod
    def create_run(
        question: str,
        model_id: str = TEST_EXECUTION_MODEL,
        connection_id: str = "",
        conversation_id: Optional[str] = None,
        owner_id: str = "anonymous_demo",
        conversation_messages: Optional[List[Dict[str, str]]] = None,
        thinking_effort: ThinkingEffort = DEFAULT_THINKING_EFFORT,
    ) -> Dict[str, Any]:
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        conv_id = conversation_id or f"conv_{uuid.uuid4().hex[:12]}"
        RUN_EVENTS_STORE[run_id] = []
        RUN_CANCEL_FLAGS[run_id] = False
        RUN_NOTIFIERS[run_id] = asyncio.Event()
        RUN_METADATA_STORE[run_id] = {
            "run_id": run_id,
            "conversation_id": conv_id,
            "question": question,
            "requested_model_id": model_id,
            "execution_model_id": TEST_EXECUTION_MODEL,
            "connection_id": connection_id,
            "owner_id": owner_id,
            "conversation_messages": conversation_messages or [],
            "thinking_effort": thinking_effort,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        return {
            "run_id": run_id,
            "conversation_id": conv_id,
            "events_url": f"/api/v1/agent-runs/{run_id}/events",
            "initial_state": "creating_run",
            "requested_model_id": model_id,
            "execution_model_id": TEST_EXECUTION_MODEL,
            "thinking_effort": thinking_effort,
        }

    @staticmethod
    def owns_run(run_id: str, owner_id: str) -> bool:
        metadata = RUN_METADATA_STORE.get(run_id)
        return bool(metadata and metadata.get("owner_id") == owner_id)

    @staticmethod
    def attach_start_persistence(run_id: str, task: asyncio.Task) -> None:
        RUN_METADATA_STORE[run_id]["start_persistence_task"] = task

    @staticmethod
    async def _await_start_persistence(run_id: str) -> None:
        task = RUN_METADATA_STORE[run_id].pop("start_persistence_task", None)
        if task is not None:
            await task

    @staticmethod
    def cancel_run(run_id: str, owner_id: Optional[str] = None) -> bool:
        if run_id not in RUN_CANCEL_FLAGS:
            return False
        if owner_id is not None and not SlayQLPipeline.owns_run(run_id, owner_id):
            return False
        RUN_CANCEL_FLAGS[run_id] = True
        task = RUN_TASKS.get(run_id)
        if task and not task.done():
            task.cancel()
        notifier = RUN_NOTIFIERS.get(run_id)
        if notifier:
            notifier.set()
        return True

    @staticmethod
    async def stream_run_events(run_id: str) -> AsyncGenerator[str, None]:
        if run_id not in RUN_METADATA_STORE:
            yield "event: error\ndata: {\"error\":\"Run not found\"}\n\n"
            return
        task = RUN_TASKS.get(run_id)
        if task is None or task.done() and RUN_METADATA_STORE[run_id]["status"] not in TERMINAL_STATUSES:
            RUN_TASKS[run_id] = asyncio.create_task(SlayQLPipeline._execute_run(run_id))

        cursor = 0
        notifier = RUN_NOTIFIERS[run_id]
        while True:
            events = RUN_EVENTS_STORE[run_id]
            while cursor < len(events):
                yield events[cursor].to_sse_format()
                cursor += 1
            if RUN_METADATA_STORE[run_id]["status"] in TERMINAL_STATUSES:
                break
            try:
                await asyncio.wait_for(notifier.wait(), timeout=15.0)
                notifier.clear()
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"

    @staticmethod
    def _emit(run_id: str, stage: str, event_type: str, payload: Dict[str, Any]) -> None:
        metadata = RUN_METADATA_STORE[run_id]
        sequence = len(RUN_EVENTS_STORE[run_id]) + 1
        event = SSEEventEnvelope(
            event_id=f"{run_id}:{sequence}",
            sequence=sequence,
            run_id=run_id,
            conversation_id=metadata["conversation_id"],
            occurred_at=datetime.now(timezone.utc).isoformat(),
            stage=stage,
            type=event_type,
            payload=payload,
        )
        RUN_EVENTS_STORE[run_id].append(event)
        RUN_NOTIFIERS[run_id].set()

    @staticmethod
    def _event_trace(run_id: str, limit: int = 240) -> List[Dict[str, Any]]:
        events = RUN_EVENTS_STORE.get(run_id, [])
        if len(events) > limit:
            events = events[: limit // 2] + events[-(limit // 2):]
        trace = []
        safe_keys = {
            "attempt", "phase", "kind", "is_repair", "label", "status", "summary", "error", "delta",
            "finish_reason", "requested_model_id", "execution_model_id",
            "resolved_model_id", "resolved_provider", "provider", "response_id",
            "duration_ms", "latency_ms", "row_count", "batch_index", "offset",
            "is_final", "is_valid", "name", "message", "model", "mode", "idiom",
            "reason", "token_usage", "usage",
            "intent", "is_sql_query", "requires_sql", "confidence", "is_follow_up", "resolved_question",
            "orchestrator_route", "tool_name", "catalog_operation", "tool", "agent", "operation",
            "reportable", "resolution_code",
            "is_semantically_valid", "missing_requirements",
            "thinking_effort", "provider_reasoning_effort", "max_repair_attempts",
        }
        for event in events:
            payload = {
                key: value
                for key, value in event.payload.items()
                if key in safe_keys
            }
            if isinstance(payload.get("delta"), str):
                payload["delta"] = payload["delta"][:800]
            if isinstance(event.payload.get("detail"), dict):
                payload["detail"] = {
                    key: value
                    for key, value in event.payload["detail"].items()
                    if key in {"type", "text", "summary", "format", "index", "id"}
                }
            chart = event.payload.get("chart")
            if isinstance(chart, dict):
                payload["chart"] = {
                    key: chart.get(key)
                    for key in ("type", "idiom", "title", "recommendation_reason", "model", "mode")
                    if chart.get(key) is not None
                }
            trace.append({
                "event_id": event.event_id,
                "sequence": event.sequence,
                "occurred_at": event.occurred_at,
                "stage": event.stage,
                "type": event.type,
                "payload": payload,
            })
        return trace

    @staticmethod
    def _cancelled(run_id: str) -> bool:
        if not RUN_CANCEL_FLAGS.get(run_id):
            return False
        metadata = RUN_METADATA_STORE[run_id]
        metadata["status"] = "cancelled"
        SlayQLPipeline._emit(run_id, "cancelled", "run.cancelled", {"reason": "User cancelled"})
        SlayQLPipeline._persist_assistant(
            run_id,
            "This run was cancelled before it completed.",
            {"status": "cancelled", "stream_events": SlayQLPipeline._event_trace(run_id)},
        )
        return True

    @staticmethod
    def _fail(run_id: str, stage: str, message: str) -> None:
        metadata = RUN_METADATA_STORE[run_id]
        metadata["status"] = "failed"
        SlayQLPipeline._emit(run_id, stage, "run.failed", {"error": message})
        SlayQLPipeline._persist_assistant(
            run_id,
            message,
            {
                "status": "failed",
                "error": message,
                "reportable": True,
                "stream_events": SlayQLPipeline._event_trace(run_id),
            },
        )

    @staticmethod
    def _persist_assistant(run_id: str, content: str, payload: Dict[str, Any], sql: Optional[str] = None) -> None:
        metadata = RUN_METADATA_STORE[run_id]
        conversation_store.add_message(
            conversation_id=metadata["conversation_id"],
            owner_id=metadata["owner_id"],
            role="assistant",
            content=content,
            sql=sql,
            payload=payload,
            message_id=f"msg_{run_id}",
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    @staticmethod
    def _dialect(engine: str) -> str:
        if engine in {"postgresql", "supabase"}:
            return "postgres"
        return engine or "sqlite"

    @staticmethod
    def _intent_catalog_summary(catalog: Any) -> Dict[str, Any]:
        return {
            "database_name": catalog.database_name,
            "engine": catalog.engine,
            "table_count": len(catalog.tables),
            "tables": [
                {
                    "name": table.name,
                    "columns": [column.name for column in table.columns[:80]],
                    "relationship_count": len(table.foreign_keys),
                }
                for table in list(catalog.tables.values())[:100]
            ],
        }

    @staticmethod
    def _schema_overview(catalog: Any) -> Dict[str, Any]:
        tables = sorted(catalog.tables.values(), key=lambda table: table.name.casefold())
        visible_tables = tables[:settings.MAX_RESULT_ROWS]
        include_row_counts = catalog.engine == "sqlite"
        columns = ["table_name", "column_count", "columns", "relationship_count"]
        column_types = ["string", "number", "string", "number"]
        rows = [
            [
                table.name,
                len(table.columns),
                ", ".join(column.name for column in table.columns),
                len(table.foreign_keys),
            ]
            for table in visible_tables
        ]
        if include_row_counts:
            columns.append("row_count")
            column_types.append("number")
            for row, table in zip(rows, visible_tables):
                row.append(table.row_count_estimate)

        names = [table.name for table in tables]
        preview = ", ".join(names[:20])
        if len(names) > 20:
            preview += f", and {len(names) - 20} more"
        if names:
            answer = (
                f"The selected database contains {len(names)} table{'s' if len(names) != 1 else ''}: "
                f"{preview}. I listed the catalog details below."
            )
        else:
            answer = "The selected database does not currently expose any user tables."
        return {
            "answer": answer,
            "columns": columns,
            "column_types": column_types,
            "rows": rows,
            "is_truncated": len(tables) > len(visible_tables),
        }

    @staticmethod
    def _related_tables_overview(catalog: Any, question: str) -> Dict[str, Any]:
        """Resolve a catalog-only relationship question without executing SQL."""
        # Include business synonyms so a topic such as "sales" can retrieve
        # tables whose physical schema uses orders, transactions, or revenue.
        search_question = (
            f"{question} sales sale orders order transactions transaction revenue "
            "amount total price customer product"
        )
        graph = RBPGraphEngine(catalog)
        matches = graph.match_schema_entities(search_question)
        ranked = [item["table"] for item in matches.get("ranked_tables", [])]
        # Keep the strongest topic matches as anchors; their FK neighbors are
        # added below. This avoids turning every table with a generic `id` or
        # `amount` column into a sales table.
        anchor_tables = ranked[:3]
        selected: List[str] = []
        reasons: Dict[str, str] = {}
        for table_name in anchor_tables:
            if table_name in catalog.tables and table_name not in selected:
                selected.append(table_name)
                reasons[table_name] = "Matched sales/order/revenue terms in the table or its columns."

        # Include immediate FK neighbors so the answer explains the usable
        # sales model (for example orders -> customers and orders -> products).
        for anchor in list(selected):
            for neighbor, _, _ in graph.adj.get(anchor, []):
                if neighbor in catalog.tables and neighbor not in selected:
                    selected.append(neighbor)
                    reasons[neighbor] = f"Connected to {anchor} by a verified foreign-key relationship."

        total_selected = len(selected)
        selected = selected[: min(settings.MAX_RESULT_ROWS, 12)]
        columns = ["table_name", "why_related", "columns", "relationships"]
        column_types = ["string", "string", "string", "string"]
        rows: List[List[Any]] = []
        for table_name in selected:
            table = catalog.tables[table_name]
            relationships = [
                f"{table_name}.{fk.from_column} -> {fk.to_table}.{fk.to_column}"
                for fk in table.foreign_keys
                if fk.to_table in catalog.tables
            ]
            for neighbor, from_column, to_column in graph.adj.get(table_name, []):
                edge = f"{table_name}.{from_column} -> {neighbor}.{to_column}"
                if edge not in relationships:
                    relationships.append(edge)
            rows.append([
                table_name,
                reasons.get(table_name, "Related catalog table."),
                ", ".join(column.name for column in table.columns),
                "; ".join(relationships) or "No direct foreign-key relationship recorded.",
            ])

        if rows:
            names = ", ".join(f"`{row[0]}`" for row in rows)
            answer = (
                f"The catalog tool found {len(rows)} table{'s' if len(rows) != 1 else ''} related to sales: "
                f"{names}. These matches use verified table/column names and foreign-key relationships; "
                "no data rows were queried."
            )
        else:
            answer = (
                "I could not find a verified sales-related table in this database catalog. "
                "Try naming a business term, table, or column you expect to contain sales data."
            )
        return {
            "answer": answer,
            "columns": columns,
            "column_types": column_types,
            "rows": rows,
            "is_truncated": total_selected > len(rows),
        }

    @staticmethod
    def _row_count_sql(catalog: Any, dialect: str) -> str:
        table_names = sorted(catalog.tables)[:max(1, settings.MAX_RESULT_ROWS - 1)]
        if not table_names:
            return ""

        def identifier(name: str) -> str:
            if dialect == "mysql":
                return f"`{name.replace('`', '``')}`"
            return f'"{name.replace(chr(34), chr(34) * 2)}"'

        def literal(value: str) -> str:
            return "'" + value.replace("'", "''") + "'"

        total_expression = " + ".join(
            f"(SELECT COUNT(*) FROM {identifier(table_name)})"
            for table_name in table_names
        )
        branches = [
            f"SELECT 'All tables' AS table_name, {total_expression} AS row_count, 0 AS sort_order"
        ]
        branches.extend(
            f"SELECT {literal(table_name)} AS table_name, COUNT(*) AS row_count, 1 AS sort_order "
            f"FROM {identifier(table_name)}"
            for table_name in table_names
        )
        return (
            "SELECT table_name, row_count FROM (\n  "
            + "\n  UNION ALL\n  ".join(branches)
            + "\n) AS row_counts\nORDER BY sort_order, table_name"
        )

    @staticmethod
    def _no_query_answer(run_id: str, question: str) -> str:
        responses = [
            "Sorry, I could not map that request to a reliable question about the selected database. Try naming what you want to count, compare, list, or summarize.",
            "I could not identify a safe database query for that request. Please rephrase it with the data, metric, or time range you want to inspect.",
            "That request does not provide enough database intent for a reliable answer. Add the table, business entity, or result you are looking for.",
            "I am not confident this request should become SQL, so I stopped before querying your data. Please add a little more detail about the result you need.",
        ]
        digest = hashlib.sha256(f"{run_id}:{question}".encode("utf-8")).digest()
        return responses[digest[0] % len(responses)]

    @staticmethod
    def _business_guidance_answer(catalog: Any = None) -> str:
        table_names = list(catalog.tables)[:6] if catalog is not None else []
        table_hint = ", ".join(table_names) if table_names else "your connected tables"
        return (
            "For a useful dashboard, start with questions that measure business outcomes: "
            "revenue or volume over time, conversion or completion rates, top and bottom segments, "
            "and operational exceptions. Then add breakdowns by the dimensions your teams act on, "
            "such as customer, product, region, channel, or status. "
            f"This database includes {table_hint}; ask me to turn any of those business questions into a validated SQL query."
        )

    @staticmethod
    def _fast_result_answer(columns: List[str], rows: List[List[Any]], is_truncated: bool) -> str:
        if not rows:
            return "The validated query returned no matching rows."
        if len(rows) == 1:
            values = []
            for index, column in enumerate(columns[:3]):
                value = rows[0][index] if index < len(rows[0]) else None
                values.append(f"{column.replace('_', ' ')}: {value}")
            if values:
                return "Result: " + ", ".join(values) + "."
        suffix = " The result was capped at the configured row limit." if is_truncated else ""
        return f"The validated query returned {len(rows)} rows.{suffix}"

    @staticmethod
    def _complete_without_generated_sql(
        run_id: str,
        *,
        answer: str,
        started: float,
        intent_decision: Dict[str, Any],
        status: str,
        resolution_code: str,
        columns: Optional[List[str]] = None,
        column_types: Optional[List[str]] = None,
        rows: Optional[List[List[Any]]] = None,
        is_truncated: bool = False,
    ) -> None:
        metadata = RUN_METADATA_STORE[run_id]
        result_rows = rows or []
        result_payload = {
            "status": status,
            "answer": answer,
            "sql": "",
            "columns": columns or [],
            "column_types": column_types or [],
            "rows": result_rows,
            "row_count": len(result_rows),
            "is_truncated": is_truncated,
            "chart": None,
            "checks": [],
            "requested_model_id": metadata["requested_model_id"],
            "execution_model_id": TEST_EXECUTION_MODEL,
            "thinking_effort": metadata["thinking_effort"],
            "attempt_count": 0,
            "token_usage": {},
            "reasoning": "",
            "intent_validation": intent_decision,
            "is_sql_query": bool(intent_decision.get("is_sql_query")),
            "orchestrator_route": intent_decision.get("orchestrator_route", "direct_response"),
            "tool_name": intent_decision.get("tool_name"),
            "response_model": intent_decision.get("response_model"),
            "resolution_code": resolution_code,
            "reportable": True,
            "total_duration_ms": int((time.perf_counter() - started) * 1000),
        }
        result_payload["stream_events"] = SlayQLPipeline._event_trace(run_id) + [{
            "event_id": f"{run_id}:terminal",
            "sequence": len(RUN_EVENTS_STORE.get(run_id, [])) + 1,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "stage": "completion",
            "type": "run.completed",
            "payload": {"status": status, "resolution_code": resolution_code},
        }]
        result_payload["stream_events_truncated"] = len(RUN_EVENTS_STORE.get(run_id, [])) > 240
        SlayQLPipeline._persist_assistant(run_id, answer, result_payload)
        metadata["status"] = "completed"
        metadata["result"] = result_payload
        SlayQLPipeline._emit(run_id, "completion", "run.completed", result_payload)

    @staticmethod
    async def _complete_general_turn(
        run_id: str,
        *,
        question: str,
        started: float,
        intent_decision: Dict[str, Any],
        catalog_summary: Optional[Dict[str, Any]] = None,
        catalog: Any = None,
    ) -> None:
        """Generate and stream a Gemini answer for turns that do not require SQL."""
        metadata = RUN_METADATA_STORE[run_id]
        response_start_model = "slayql/local-response" if intent_decision.get("fast_path") else GEMINI_WORKBENCH_MODEL
        SlayQLPipeline._emit(
            run_id,
            "answer_generation",
            "general_response.started",
            {
                "model": response_start_model,
                "summary": (
                    "Local conversational response is ready to stream."
                    if response_start_model == "slayql/local-response"
                    else "Gemini is preparing a conversational response."
                ),
            },
        )
        response = await gemini_workbench_agent.answer_general_question(
            question,
            catalog_summary or (SlayQLPipeline._intent_catalog_summary(catalog) if catalog is not None else {}),
            metadata["conversation_messages"],
        )
        answer = response["answer"]
        SlayQLPipeline._emit(
            run_id,
            "answer_generation",
            "assistant.delta",
            {"delta": answer, "model": response.get("model", GEMINI_WORKBENCH_MODEL), "mode": response.get("mode", "gemini")},
        )
        SlayQLPipeline._emit(
            run_id,
            "answer_generation",
            "general_response.completed",
            {"model": response.get("model", GEMINI_WORKBENCH_MODEL), "mode": response.get("mode", "gemini"), "summary": "Conversational response ready."},
        )
        try:
            await SlayQLPipeline._await_start_persistence(run_id)
        except Exception:
            SlayQLPipeline._fail(run_id, "persistence", "The response was ready, but this conversation could not be saved.")
            return
        intent_decision = {**intent_decision, "response_model": response.get("model", GEMINI_WORKBENCH_MODEL)}
        SlayQLPipeline._complete_without_generated_sql(
            run_id,
            answer=answer,
            started=started,
            intent_decision=intent_decision,
            status="success" if intent_decision["intent"] in {"business_guidance", "general_question"} else "no_query",
            resolution_code=intent_decision["intent"],
        )

    @staticmethod
    def _schema_context(catalog: Any, table_names: List[str]) -> str:
        lines: List[str] = []
        for table_name in table_names[:12]:
            table = catalog.tables.get(table_name)
            if not table:
                continue
            columns = ", ".join(
                f"{column.name} {column.type}{' PRIMARY KEY' if column.primary_key else ''}"
                for column in table.columns
            )
            lines.append(f"TABLE {table_name} ({columns})")
            for foreign_key in table.foreign_keys:
                lines.append(
                    f"FOREIGN KEY {table_name}.{foreign_key.from_column} -> "
                    f"{foreign_key.to_table}.{foreign_key.to_column}"
                )
        return "\n".join(lines)

    @staticmethod
    def _retrieval_context(entity_matches: Dict[str, Any]) -> str:
        ranked = ", ".join(
            f"{item['table']} (BM25={item['score']})"
            for item in entity_matches["ranked_tables"]
        )
        relationships = "; ".join(
            f"{item['from_table']}.{item['from_column']} -> {item['to_table']}.{item['to_column']}"
            for item in entity_matches["join_relationships"]
        )
        return f"Ranked tables: {ranked or 'none'}\nVerified join paths: {relationships or 'none'}"

    @staticmethod
    async def _execute_query(connection: Dict[str, Any], connection_id: str, sql: str):
        if connection.get("engine") == "sqlite":
            return await QueryExecutor.execute_sqlite(
                db_path=require_sqlite_path(connection_id),
                sql=sql,
                timeout_seconds=settings.QUERY_TIMEOUT_SECONDS,
                max_rows=settings.MAX_RESULT_ROWS,
            )
        return await QueryExecutor.execute_external(
            provider=connection["engine"],
            credentials=get_credentials(connection_id),
            sql=sql,
            timeout_seconds=settings.QUERY_TIMEOUT_SECONDS,
            max_rows=settings.MAX_RESULT_ROWS,
        )

    @staticmethod
    async def _execute_run(run_id: str) -> None:
        metadata = RUN_METADATA_STORE[run_id]
        metadata["status"] = "running"
        question = metadata["question"]
        requested_model_id = metadata["requested_model_id"]
        connection_id = metadata["connection_id"]
        conversation_id = metadata["conversation_id"]
        thinking_profile = get_thinking_profile(metadata["thinking_effort"])
        started = time.perf_counter()

        try:
            SlayQLPipeline._emit(
                run_id,
                "preparation",
                "run.accepted",
                {
                    "question": question,
                    "requested_model_id": requested_model_id,
                    "execution_model_id": TEST_EXECUTION_MODEL,
                    "connection_id": connection_id,
                    "thinking_effort": thinking_profile.name,
                    "provider_reasoning_effort": thinking_profile.provider_sql_effort,
                    "max_repair_attempts": thinking_profile.max_repair_attempts,
                },
            )
            SlayQLPipeline._emit(run_id, "preparation", "stream.ready", {"replayable": True})
            if SlayQLPipeline._cancelled(run_id):
                return

            # Route obvious conversational turns before touching the selected
            # source. This keeps greetings fast even when the source is remote,
            # unavailable, or still being indexed.
            preflight = _fallback_chat_intent(question, metadata["conversation_messages"])
            fast_non_sql = preflight["intent"] in {"unsupported", "clarification"}
            local_non_sql = preflight["intent"] in {"business_guidance", "general_question"} and not thinking_profile.use_model_intent
            if fast_non_sql or local_non_sql:
                SlayQLPipeline._emit(
                    run_id,
                    "intent_validation",
                    "intent.validator_started",
                    {
                        "model": "slayql/local-intent",
                        "summary": "Checking whether this turn requires SQL or database metadata.",
                    },
                )
                SlayQLPipeline._emit(
                    run_id,
                    "intent_validation",
                    "intent.validator_completed",
                    {
                        **preflight,
                        "model": "slayql/local-intent",
                        "mode": "local_heuristic",
                        "summary": f"Classified this turn as {preflight['intent'].replace('_', ' ')}.",
                    },
                )
                SlayQLPipeline._emit(
                    run_id,
                    "orchestration",
                    "orchestrator.decision",
                    {
                        "route": "direct_response",
                        "intent": preflight["intent"],
                        "requires_sql": False,
                        "summary": "Orchestrator selected the direct response path.",
                    },
                )
                await SlayQLPipeline._complete_general_turn(
                    run_id,
                    question=question,
                    started=started,
                    intent_decision=preflight,
                )
                return

            stage_started = time.perf_counter()
            SlayQLPipeline._emit(
                run_id,
                "schema_discovery",
                "stage.started",
                {"label": "BM25 schema indexing", "status": "active"},
            )
            connection = get_connection(connection_id)
            if not connection:
                SlayQLPipeline._fail(run_id, "schema_discovery", "Selected data source was not found.")
                return

            try:
                if connection.get("engine") == "sqlite":
                    db_path = get_sqlite_path(connection_id)
                    if not db_path:
                        SlayQLPipeline._fail(
                            run_id,
                            "schema_discovery",
                            "The selected SQLite file is unavailable on this deployment. Re-upload the database file.",
                        )
                        return
                    catalog = CatalogService.get_sqlite_catalog(
                        db_path
                    )
                else:
                    catalog = get_external_catalog(connection["engine"], get_credentials(connection_id))
            except Exception:
                SlayQLPipeline._fail(run_id, "schema_discovery", "Could not inspect the selected data source.")
                return

            intent_started = time.perf_counter()
            SlayQLPipeline._emit(
                run_id,
                "intent_validation",
                "intent.validator_started",
                {
                    "model": (
                        GEMINI_WORKBENCH_MODEL
                        if thinking_profile.use_model_intent
                        else "slayql/local-intent"
                    ),
                    "summary": "Checking whether this turn requires SQL or database metadata.",
                },
            )
            intent_decision = await gemini_workbench_agent.classify_chat_intent(
                question,
                SlayQLPipeline._intent_catalog_summary(catalog),
                metadata["conversation_messages"],
                use_model=thinking_profile.use_model_intent,
            )
            SlayQLPipeline._emit(
                run_id,
                "intent_validation",
                "intent.validator_completed",
                {
                    "model": intent_decision.get("model", GEMINI_WORKBENCH_MODEL),
                    "mode": intent_decision.get("mode", "gemini"),
                    "intent": intent_decision["intent"],
                    "is_sql_query": intent_decision["is_sql_query"],
                    "requires_sql": intent_decision["requires_sql"],
                    "is_follow_up": intent_decision["is_follow_up"],
                    "orchestrator_route": intent_decision.get("orchestrator_route"),
                    "tool_name": intent_decision.get("tool_name"),
                    "catalog_operation": intent_decision.get("catalog_operation"),
                    "confidence": intent_decision["confidence"],
                    "resolved_question": intent_decision["resolved_question"],
                    "reason": intent_decision["reason"],
                    "duration_ms": int((time.perf_counter() - intent_started) * 1000),
                    "summary": f"Classified this turn as {intent_decision['intent'].replace('_', ' ')}.",
                },
            )

            orchestrator_route = intent_decision.get("orchestrator_route") or (
                "sql_agent" if intent_decision.get("is_sql_query") else
                "catalog_agent" if intent_decision.get("intent") == "schema_overview" else
                "direct_response"
            )
            intent_decision = {
                **intent_decision,
                "orchestrator_route": orchestrator_route,
                "tool_name": (
                    "sql_agent" if orchestrator_route == "sql_agent"
                    else "catalog_agent" if orchestrator_route == "catalog_agent"
                    else None
                ),
            }
            SlayQLPipeline._emit(
                run_id,
                "orchestration",
                "orchestrator.decision",
                {
                    "route": orchestrator_route,
                    "intent": intent_decision["intent"],
                    "requires_sql": bool(intent_decision.get("requires_sql")),
                    "summary": f"Orchestrator selected the {orchestrator_route.replace('_', ' ')} path.",
                },
            )
            if orchestrator_route == "sql_agent":
                SlayQLPipeline._emit(
                    run_id,
                    "orchestration",
                    "orchestrator.tool_call.started",
                    {
                        "tool": "sql_agent",
                        "agent": TEST_EXECUTION_MODEL,
                        "operation": "generate_validate_execute_sql",
                        "summary": "Orchestrator delegated the database operation to the SQL agent.",
                    },
                )
            elif orchestrator_route == "catalog_agent":
                SlayQLPipeline._emit(
                    run_id,
                    "orchestration",
                    "orchestrator.tool_call.started",
                    {
                        "tool": "catalog_agent",
                        "agent": "slayql/catalog-agent",
                        "operation": intent_decision.get("catalog_operation") or "overview",
                        "summary": "Orchestrator delegated the request to the verified catalog tool.",
                    },
                )

            if not intent_decision["is_sql_query"]:
                SlayQLPipeline._emit(
                    run_id,
                    "schema_discovery",
                    "stage.evidence",
                    {
                        "summary": f"Inspected {len(catalog.tables)} catalog tables for request routing.",
                        "total_catalog_tables": len(catalog.tables),
                    },
                )
                SlayQLPipeline._emit(
                    run_id,
                    "schema_discovery",
                    "stage.completed",
                    {
                        "label": "BM25 schema indexing",
                        "status": "passed",
                        "duration_ms": int((time.perf_counter() - stage_started) * 1000),
                    },
                )
                if intent_decision["intent"] == "schema_overview":
                    overview = (
                        SlayQLPipeline._related_tables_overview(catalog, question)
                        if intent_decision.get("catalog_operation") == "related_tables"
                        else SlayQLPipeline._schema_overview(catalog)
                    )
                    SlayQLPipeline._emit(
                        run_id,
                        "orchestration",
                        "orchestrator.tool_call.completed",
                        {
                            "tool": "catalog_agent",
                            "agent": "slayql/catalog-agent",
                            "operation": intent_decision.get("catalog_operation") or "overview",
                            "summary": "Verified catalog metadata was used to answer the request.",
                        },
                    )
                    SlayQLPipeline._complete_without_generated_sql(
                        run_id,
                        answer=overview["answer"],
                        started=started,
                        intent_decision=intent_decision,
                        status="success",
                        resolution_code="schema_overview",
                        columns=overview["columns"],
                        column_types=overview["column_types"],
                        rows=overview["rows"],
                        is_truncated=overview["is_truncated"],
                    )
                elif intent_decision["intent"] in {"business_guidance", "general_question", "unsupported", "clarification"}:
                    await SlayQLPipeline._complete_general_turn(
                        run_id,
                        question=question,
                        started=started,
                        intent_decision=intent_decision,
                        catalog=catalog,
                    )
                else:
                    SlayQLPipeline._complete_without_generated_sql(
                        run_id,
                        answer=SlayQLPipeline._no_query_answer(run_id, question),
                        started=started,
                        intent_decision=intent_decision,
                        status="no_query",
                        resolution_code=intent_decision["intent"],
                    )
                return

            effective_question = (
                intent_decision["resolved_question"]
                if intent_decision["is_follow_up"]
                else question
            )
            entity_matches = RBPGraphEngine(catalog).match_schema_entities(effective_question)
            SlayQLPipeline._emit(
                run_id,
                "schema_discovery",
                "stage.evidence",
                {
                    "summary": (
                        f"Indexed {entity_matches['index_document_count']} schema/value documents and "
                        f"ranked {len(entity_matches['ranked_tables'])} candidate tables."
                    ),
                    "ranked_tables": entity_matches["ranked_tables"],
                    "retrieval_evidence": entity_matches["retrieval_evidence"],
                    "total_catalog_tables": len(catalog.tables),
                },
            )
            SlayQLPipeline._emit(
                run_id,
                "schema_discovery",
                "stage.completed",
                {
                    "label": "BM25 schema indexing",
                    "status": "passed",
                    "duration_ms": int((time.perf_counter() - stage_started) * 1000),
                },
            )
            if SlayQLPipeline._cancelled(run_id):
                return

            graph_started = time.perf_counter()
            chain = entity_matches["expanded_chain"]
            SlayQLPipeline._emit(
                run_id,
                "graph_expansion",
                "stage.started",
                {"label": "Foreign-key graph expansion", "status": "active"},
            )
            SlayQLPipeline._emit(
                run_id,
                "graph_expansion",
                "stage.evidence",
                {
                    "summary": f"Expanded a verified relationship context across {len(chain)} tables.",
                    "join_path": chain,
                    "relationships": entity_matches["join_relationships"],
                },
            )
            SlayQLPipeline._emit(
                run_id,
                "graph_expansion",
                "stage.completed",
                {
                    "label": "Foreign-key graph expansion",
                    "status": "passed",
                    "duration_ms": int((time.perf_counter() - graph_started) * 1000),
                },
            )

            grounded_values = entity_matches["grounded_values"]
            SlayQLPipeline._emit(
                run_id,
                "value_grounding",
                "stage.started",
                {"label": "Value and column grounding", "status": "active"},
            )
            SlayQLPipeline._emit(
                run_id,
                "value_grounding",
                "stage.evidence",
                {
                    "summary": f"Grounded {len(grounded_values)} values and {len(entity_matches['matched_columns'])} columns.",
                    "grounded_values": grounded_values,
                    "matched_columns": entity_matches["matched_columns"],
                },
            )
            SlayQLPipeline._emit(
                run_id,
                "value_grounding",
                "stage.completed",
                {"label": "Value and column grounding", "status": "passed", "duration_ms": 0},
            )

            dialect = SlayQLPipeline._dialect(connection.get("engine", "sqlite"))
            schema_context = SlayQLPipeline._schema_context(catalog, chain)
            retrieval_context = SlayQLPipeline._retrieval_context(entity_matches)
            grounding_context = json.dumps(grounded_values, ensure_ascii=True, default=str)
            fallback_table = chain[0] if chain else next(iter(catalog.tables), "")
            fallback_sql = f'SELECT * FROM "{fallback_table}" LIMIT {min(100, settings.MAX_RESULT_ROWS)}'
            deterministic_sql = (
                SlayQLPipeline._row_count_sql(catalog, dialect)
                if intent_decision["intent"] == "row_count_overview"
                else ""
            )
            if intent_decision["intent"] == "row_count_overview" and not deterministic_sql:
                SlayQLPipeline._complete_without_generated_sql(
                    run_id,
                    answer="The selected database does not currently expose any user tables to count.",
                    started=started,
                    intent_decision=intent_decision,
                    status="success",
                    resolution_code="row_count_overview_empty",
                )
                return
            repair_feedback = ""
            final_sql = ""
            final_validation = None
            semantic_validation: Dict[str, Any] = {}
            execution_result = None
            sql_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "cost": 0.0}
            reasoning_parts: List[str] = []
            attempt_count = 0

            for attempt in range(1, thinking_profile.max_repair_attempts + 1):
                attempt_count = attempt
                if SlayQLPipeline._cancelled(run_id):
                    return
                generation_started = time.perf_counter()
                SlayQLPipeline._emit(
                    run_id,
                    "model_generation",
                    "provider.request_started",
                    {
                        "attempt": attempt,
                        "requested_model_id": requested_model_id,
                        "execution_model_id": TEST_EXECUTION_MODEL,
                        "provider": "SlayQL metadata planner" if deterministic_sql else "OpenRouter",
                        "is_repair": attempt > 1,
                        "thinking_effort": thinking_profile.name,
                        "provider_reasoning_effort": thinking_profile.provider_sql_effort,
                    },
                )
                if attempt > 1:
                    SlayQLPipeline._emit(
                        run_id,
                        "model_generation",
                        "agent.repair_started",
                        {"attempt": attempt, "feedback": repair_feedback},
                    )
                completion: Dict[str, Any] = {}
                first_provider_delta = False
                if deterministic_sql:
                    async def deterministic_stream() -> AsyncGenerator[Dict[str, Any], None]:
                        yield {
                            "type": "completed",
                            "content": deterministic_sql,
                            "extracted_sql": deterministic_sql,
                            "reasoning": "",
                            "reasoning_details": [],
                            "usage": {},
                            "finish_reason": "deterministic_metadata",
                            "latency_ms": 0,
                            "requested_model_id": requested_model_id,
                            "model_id": "slayql/metadata-planner",
                            "resolved_model_id": "slayql/metadata-planner",
                            "resolved_provider": "SlayQL",
                            "response_id": None,
                        }
                    provider_stream = deterministic_stream()
                else:
                    provider_stream = openrouter_client.stream_sql(
                        requested_model_id=requested_model_id,
                        question=effective_question,
                        dialect=dialect,
                        schema_context=schema_context,
                        grounding_hints=grounding_context,
                        retrieval_context=retrieval_context,
                        conversation_messages=metadata["conversation_messages"],
                        repair_feedback=repair_feedback,
                        session_id=conversation_id,
                        fallback_sql=fallback_sql,
                        reasoning_effort=thinking_profile.provider_sql_effort,
                        max_tokens=thinking_profile.sql_max_tokens,
                    )
                async for provider_event in provider_stream:
                    event_type = provider_event["type"]
                    if event_type in {"reasoning_delta", "reasoning_detail", "content_delta"} and not first_provider_delta:
                        first_provider_delta = True
                        SlayQLPipeline._emit(
                            run_id,
                            "model_generation",
                            "provider.first_delta",
                            {"attempt": attempt, "kind": event_type},
                        )
                    if event_type == "reasoning_delta":
                        delta = provider_event.get("delta", "")
                        reasoning_parts.append(delta)
                        SlayQLPipeline._emit(
                            run_id,
                            "model_generation",
                            "provider.reasoning_delta",
                            {"attempt": attempt, "delta": delta},
                        )
                    elif event_type == "reasoning_detail":
                        delta = provider_event.get("delta", "")
                        if delta:
                            reasoning_parts.append(delta)
                        SlayQLPipeline._emit(
                            run_id,
                            "model_generation",
                            "provider.reasoning_detail",
                            {
                                "attempt": attempt,
                                "delta": delta,
                                "detail": provider_event.get("detail") or {},
                            },
                        )
                    elif event_type == "content_delta":
                        SlayQLPipeline._emit(
                            run_id,
                            "model_generation",
                            "provider.content_delta",
                            {"attempt": attempt, "delta": provider_event.get("delta", "")},
                        )
                    elif event_type == "usage":
                        SlayQLPipeline._emit(
                            run_id,
                            "model_generation",
                            "provider.usage_finalized",
                            {"attempt": attempt, "usage": provider_event.get("usage") or {}},
                        )
                    elif event_type == "completed":
                        completion = provider_event

                candidate_sql = (completion.get("extracted_sql") or "").strip()
                usage = completion.get("usage") or {}
                for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
                    sql_usage[key] += int(usage.get(key) or 0)
                sql_usage["cost"] += float(usage.get("cost") or 0)
                SlayQLPipeline._emit(
                    run_id,
                    "model_generation",
                    "provider.completed",
                    {
                        "attempt": attempt,
                        "requested_model_id": requested_model_id,
                        "execution_model_id": TEST_EXECUTION_MODEL,
                        "latency_ms": completion.get("latency_ms", 0),
                        "duration_ms": int((time.perf_counter() - generation_started) * 1000),
                        "token_usage": usage,
                        "finish_reason": completion.get("finish_reason", "stop"),
                        "resolved_model_id": completion.get("resolved_model_id", TEST_EXECUTION_MODEL),
                        "resolved_provider": completion.get("resolved_provider"),
                        "response_id": completion.get("response_id"),
                        "thinking_effort": thinking_profile.name,
                        "provider_reasoning_effort": completion.get(
                            "reasoning_effort",
                            thinking_profile.provider_sql_effort,
                        ),
                        "summary": (
                            "Prepared validator-bound row-count SQL from the inspected catalog."
                            if deterministic_sql
                            else "Received a schema-grounded SQL candidate."
                        ),
                    },
                )

                validation_started = time.perf_counter()
                SlayQLPipeline._emit(
                    run_id,
                    "sql_validation",
                    "sql.candidate_ready",
                    {
                        "candidate_id": f"cand_{uuid.uuid4().hex[:8]}",
                        "revision": attempt,
                        "sql": candidate_sql,
                        "dialect": dialect,
                        "generation_source": "openrouter",
                    },
                )
                validation = SqlValidator.validate_and_sanitize(
                    sql=candidate_sql,
                    dialect=dialect,
                    catalog=catalog,
                    max_rows=settings.MAX_RESULT_ROWS,
                )
                for check in validation.checks:
                    SlayQLPipeline._emit(
                        run_id,
                        "sql_validation",
                        "sql.validation_check",
                        {**check.model_dump(), "attempt": attempt},
                    )
                SlayQLPipeline._emit(
                    run_id,
                    "sql_validation",
                    "sql.validation_completed",
                    {
                        "attempt": attempt,
                        "is_valid": validation.is_valid,
                        "sanitized_sql": validation.sanitized_sql,
                        "referenced_tables": validation.referenced_tables,
                        "referenced_columns": validation.referenced_columns,
                        "duration_ms": int((time.perf_counter() - validation_started) * 1000),
                        "summary": "Completed read-only, schema, and dialect validation.",
                    },
                )
                if not validation.is_valid:
                    repair_feedback = (
                        "The previous SQL failed static validation. Correct it using only the verified schema. "
                        f"Validator feedback: {validation.error_message or 'invalid SQL'}"
                    )
                    if not deterministic_sql and attempt < thinking_profile.max_repair_attempts:
                        continue
                    SlayQLPipeline._complete_without_generated_sql(
                        run_id,
                        answer=SlayQLPipeline._no_query_answer(run_id, question),
                        started=started,
                        intent_decision={
                            **intent_decision,
                            "reason": validation.error_message or "No valid SQL was produced.",
                        },
                        status="no_query",
                        resolution_code="sql_validation_failed",
                    )
                    return

                semantic_started = time.perf_counter()
                SlayQLPipeline._emit(
                    run_id,
                    "semantic_validation",
                    "sql.semantic_validation_started",
                    {
                        "attempt": attempt,
                        "model": (
                            GEMINI_WORKBENCH_MODEL
                            if thinking_profile.use_model_semantic_validation
                            else "slayql/local-semantic-validator"
                        ),
                        "summary": "Checking whether the safe SQL answers the user's request.",
                    },
                )
                semantic_validation = await gemini_workbench_agent.validate_sql_semantics(
                    question=effective_question,
                    sql=validation.sanitized_sql,
                    dialect=dialect,
                    catalog_summary=SlayQLPipeline._intent_catalog_summary(catalog),
                    recent_messages=metadata["conversation_messages"],
                    use_model=thinking_profile.use_model_semantic_validation,
                )
                SlayQLPipeline._emit(
                    run_id,
                    "semantic_validation",
                    "sql.semantic_validation_completed",
                    {
                        "attempt": attempt,
                        "model": semantic_validation.get("model", GEMINI_WORKBENCH_MODEL),
                        "mode": semantic_validation.get("mode", "gemini"),
                        "is_semantically_valid": semantic_validation["is_semantically_valid"],
                        "missing_requirements": semantic_validation["missing_requirements"],
                        "reason": semantic_validation["reason"],
                        "duration_ms": int((time.perf_counter() - semantic_started) * 1000),
                        "summary": (
                            "The SQL answers the requested analytical operation."
                            if semantic_validation["is_semantically_valid"]
                            else "The SQL is safe but does not yet answer the request."
                        ),
                    },
                )
                if not semantic_validation["is_semantically_valid"]:
                    missing_requirements = "; ".join(semantic_validation["missing_requirements"])
                    repair_feedback = (
                        "The previous SQL was syntactically safe but semantically incorrect for the user's request. "
                        f"Semantic feedback: {semantic_validation['reason']} "
                        f"Missing requirements: {missing_requirements or 'match the requested result exactly.'}"
                    )
                    if not deterministic_sql and attempt < thinking_profile.max_repair_attempts:
                        continue
                    SlayQLPipeline._complete_without_generated_sql(
                        run_id,
                        answer=SlayQLPipeline._no_query_answer(run_id, question),
                        started=started,
                        intent_decision={
                            **intent_decision,
                            "reason": semantic_validation["reason"],
                        },
                        status="no_query",
                        resolution_code="semantic_validation_failed",
                    )
                    return

                SlayQLPipeline._emit(
                    run_id,
                    "execution",
                    "execution.started",
                    {
                        "attempt": attempt,
                        "database": connection.get("name", connection_id),
                        "timeout_seconds": settings.QUERY_TIMEOUT_SECONDS,
                    },
                )
                result = await SlayQLPipeline._execute_query(
                    connection,
                    connection_id,
                    validation.sanitized_sql,
                )
                if result.error:
                    SlayQLPipeline._emit(
                        run_id,
                        "execution",
                        "execution.failed",
                        {"attempt": attempt, "error": result.error},
                    )
                    repair_feedback = (
                        "The previous SQL passed static validation but failed when executed. "
                        f"Database feedback: {result.error}"
                    )
                    if not deterministic_sql and attempt < thinking_profile.max_repair_attempts:
                        continue
                    SlayQLPipeline._complete_without_generated_sql(
                        run_id,
                        answer=SlayQLPipeline._no_query_answer(run_id, question),
                        started=started,
                        intent_decision={
                            **intent_decision,
                            "reason": "The validated query could not be executed safely.",
                        },
                        status="no_query",
                        resolution_code="sql_execution_failed",
                    )
                    return

                final_sql = validation.sanitized_sql
                final_validation = validation
                execution_result = result
                break

            if execution_result is None or final_validation is None:
                SlayQLPipeline._complete_without_generated_sql(
                    run_id,
                    answer=SlayQLPipeline._no_query_answer(run_id, question),
                    started=started,
                    intent_decision={
                        **intent_decision,
                        "reason": "No executable SQL result was produced.",
                    },
                    status="no_query",
                    resolution_code="no_executable_sql",
                )
                return

            SlayQLPipeline._emit(
                run_id,
                "sql_validation",
                "sql.ready",
                {"sql": final_sql, "attempt": attempt_count},
            )
            SlayQLPipeline._emit(
                run_id,
                "execution",
                "execution.columns",
                {"columns": execution_result.columns, "column_types": execution_result.column_types},
            )
            for offset in range(0, len(execution_result.rows), 50):
                rows = execution_result.rows[offset:offset + 50]
                SlayQLPipeline._emit(
                    run_id,
                    "execution",
                    "execution.rows",
                    {
                        "batch_index": offset // 50,
                        "offset": offset,
                        "rows": rows,
                        "is_final": offset + 50 >= len(execution_result.rows),
                    },
                )
            SlayQLPipeline._emit(
                run_id,
                "execution",
                "execution.completed",
                {
                    "row_count": len(execution_result.rows),
                    "is_truncated": execution_result.is_truncated,
                    "execution_time_ms": execution_result.execution_time_ms,
                    "summary": f"Returned {len(execution_result.rows)} rows from read-only execution.",
                },
            )

            visualization_started = time.perf_counter()
            SlayQLPipeline._emit(
                run_id,
                "visualization",
                "visualization.agent_started",
                {
                    "model": (
                        GEMINI_WORKBENCH_MODEL
                        if thinking_profile.use_model_chart
                        else "slayql/local-chart-planner"
                    ),
                    "summary": "Selecting a chart from the bounded result profile.",
                },
            )
            chart = None
            if not thinking_profile.use_model_chart:
                chart = execution_result.chart_recommendation
                if chart:
                    chart = {
                        **chart,
                        "model": "slayql/local-chart-planner",
                        "mode": "deterministic",
                    }
                SlayQLPipeline._emit(
                    run_id,
                    "visualization",
                    "visualization.agent_completed",
                    {
                        "model": "slayql/local-chart-planner",
                        "mode": "deterministic",
                        "idiom": chart.get("type") if chart else None,
                        "duration_ms": int((time.perf_counter() - visualization_started) * 1000),
                        "summary": "Completed the fast local visualization plan.",
                    },
                )
            else:
                try:
                    result_profile = summarize_result(
                        execution_result.columns,
                        execution_result.column_types,
                        execution_result.rows,
                    )
                    chart_plan = await gemini_workbench_agent.recommend_chart(question, result_profile)
                    chart = materialize_chart_recommendation(
                        chart_plan,
                        execution_result.columns,
                        execution_result.column_types,
                        execution_result.rows,
                    )
                    SlayQLPipeline._emit(
                        run_id,
                        "visualization",
                        "visualization.agent_completed",
                        {
                            "model": chart_plan.get("model", GEMINI_WORKBENCH_MODEL),
                            "mode": chart_plan.get("mode", "gemini"),
                            "idiom": chart_plan.get("idiom"),
                            "reason": chart_plan.get("reason"),
                            "duration_ms": int((time.perf_counter() - visualization_started) * 1000),
                            "summary": "Gemini completed the visualization plan.",
                        },
                    )
                except Exception:
                    fallback_chart = execution_result.chart_recommendation
                    if fallback_chart:
                        fallback_chart = {
                            **fallback_chart,
                            "model": GEMINI_WORKBENCH_MODEL,
                            "mode": "local_fallback",
                        }
                    chart = fallback_chart
                    SlayQLPipeline._emit(
                        run_id,
                        "visualization",
                        "visualization.agent_completed",
                        {
                            "model": GEMINI_WORKBENCH_MODEL,
                            "mode": "local_fallback",
                            "duration_ms": int((time.perf_counter() - visualization_started) * 1000),
                            "summary": "Gemini was unavailable; the bounded local chart fallback was used.",
                        },
                    )
            SlayQLPipeline._emit(
                run_id,
                "visualization",
                "visualization.recommended" if chart else "visualization.not_recommended",
                {"chart": chart, "summary": "Visualization is ready."}
                if chart
                else {"reason": "The result shape is best shown as a table."},
            )

            answer_parts: List[str] = []
            answer_usage: Dict[str, Any] = {}
            answer_completion: Dict[str, Any] = {}
            answer_generation_started = time.perf_counter()
            SlayQLPipeline._emit(
                run_id,
                "answer_generation",
                "stage.started",
                {"label": "Answer synthesis", "status": "active"},
            )
            try:
                first_answer_delta = False
                if not thinking_profile.use_model_answer:
                    local_answer = SlayQLPipeline._fast_result_answer(
                        execution_result.columns,
                        execution_result.rows,
                        execution_result.is_truncated,
                    )
                    answer_parts.append(local_answer)
                    SlayQLPipeline._emit(
                        run_id,
                        "answer_generation",
                        "assistant.delta",
                        {"delta": local_answer},
                    )
                    answer_completion = {
                        "finish_reason": "deterministic_summary",
                        "latency_ms": 0,
                        "resolved_model_id": "slayql/local-result-summary",
                        "resolved_provider": "SlayQL",
                        "reasoning_effort": "none",
                    }
                else:
                    async for answer_event in openrouter_client.stream_answer(
                        requested_model_id=requested_model_id,
                        question=question,
                        sql=final_sql,
                        columns=execution_result.columns,
                        rows=execution_result.rows,
                        session_id=conversation_id,
                        reasoning_effort=thinking_profile.provider_answer_effort,
                        max_tokens=thinking_profile.answer_max_tokens,
                    ):
                        answer_event_type = answer_event["type"]
                        if answer_event_type in {"reasoning_delta", "reasoning_detail", "content_delta"} and not first_answer_delta:
                            first_answer_delta = True
                            SlayQLPipeline._emit(
                                run_id,
                                "answer_generation",
                                "provider.first_delta",
                                {"phase": "answer", "kind": answer_event_type},
                            )
                        if answer_event_type == "reasoning_delta":
                            delta = answer_event.get("delta", "")
                            reasoning_parts.append(delta)
                            SlayQLPipeline._emit(
                                run_id,
                                "answer_generation",
                                "provider.reasoning_delta",
                                {"phase": "answer", "delta": delta},
                            )
                        elif answer_event_type == "reasoning_detail":
                            delta = answer_event.get("delta", "")
                            if delta:
                                reasoning_parts.append(delta)
                            SlayQLPipeline._emit(
                                run_id,
                                "answer_generation",
                                "provider.reasoning_detail",
                                {
                                    "phase": "answer",
                                    "delta": delta,
                                    "detail": answer_event.get("detail") or {},
                                },
                            )
                        elif answer_event_type == "content_delta":
                            delta = answer_event.get("delta", "")
                            answer_parts.append(delta)
                            SlayQLPipeline._emit(
                                run_id,
                                "answer_generation",
                                "assistant.delta",
                                {"delta": delta},
                            )
                        elif answer_event_type == "usage":
                            SlayQLPipeline._emit(
                                run_id,
                                "answer_generation",
                                "provider.usage_finalized",
                                {"phase": "answer", "usage": answer_event.get("usage") or {}},
                            )
                        elif answer_event_type == "completed":
                            answer_completion = answer_event
                            answer_usage = answer_event.get("usage") or {}
                SlayQLPipeline._emit(
                    run_id,
                    "answer_generation",
                    "provider.completed",
                    {
                        "phase": "answer",
                        "requested_model_id": requested_model_id,
                        "execution_model_id": TEST_EXECUTION_MODEL,
                        "latency_ms": answer_completion.get("latency_ms", 0),
                        "duration_ms": int((time.perf_counter() - answer_generation_started) * 1000),
                        "token_usage": answer_usage,
                        "finish_reason": answer_completion.get("finish_reason", "stop"),
                        "resolved_model_id": answer_completion.get("resolved_model_id", TEST_EXECUTION_MODEL),
                        "resolved_provider": answer_completion.get("resolved_provider"),
                        "response_id": answer_completion.get("response_id"),
                        "thinking_effort": thinking_profile.name,
                        "provider_reasoning_effort": answer_completion.get(
                            "reasoning_effort",
                            thinking_profile.provider_answer_effort,
                        ),
                        "summary": "Answer synthesis stream completed.",
                    },
                )
            except ProviderError:
                answer_parts = [SlayQLPipeline._fast_result_answer(
                    execution_result.columns,
                    execution_result.rows,
                    execution_result.is_truncated,
                )]

            answer = "".join(answer_parts).strip() or f"The validated query returned {len(execution_result.rows)} rows."
            SlayQLPipeline._emit(
                run_id,
                "answer_generation",
                "stage.completed",
                {"label": "Answer synthesis", "status": "passed", "summary": answer},
            )
            SlayQLPipeline._emit(
                run_id,
                "orchestration",
                "orchestrator.tool_call.completed",
                {
                    "tool": "sql_agent",
                    "agent": TEST_EXECUTION_MODEL,
                    "operation": "generate_validate_execute_sql",
                    "summary": "The delegated SQL agent validated and executed the read-only query.",
                },
            )
            result_payload = {
                "status": "success",
                "answer": answer,
                "sql": final_sql,
                "columns": execution_result.columns,
                "column_types": execution_result.column_types,
                "rows": execution_result.rows,
                "row_count": len(execution_result.rows),
                "is_truncated": execution_result.is_truncated,
                "chart": chart,
                "checks": [check.model_dump() for check in final_validation.checks],
                "requested_model_id": requested_model_id,
                "execution_model_id": TEST_EXECUTION_MODEL,
                "thinking_effort": thinking_profile.name,
                "attempt_count": attempt_count,
                "token_usage": {"sql": sql_usage, "answer": answer_usage},
                "reasoning": "".join(reasoning_parts)[-8000:],
                "intent_validation": intent_decision,
                "orchestrator_route": intent_decision.get("orchestrator_route", "sql_agent"),
                "tool_name": intent_decision.get("tool_name", "sql_agent"),
                "semantic_validation": semantic_validation,
                "resolution_code": "sql_executed",
                "reportable": True,
                "total_duration_ms": int((time.perf_counter() - started) * 1000),
            }
            result_payload["stream_events"] = SlayQLPipeline._event_trace(run_id) + [{
                "event_id": f"{run_id}:terminal",
                "sequence": len(RUN_EVENTS_STORE.get(run_id, [])) + 1,
                "occurred_at": datetime.now(timezone.utc).isoformat(),
                "stage": "completion",
                "type": "run.completed",
                "payload": {"status": "success"},
            }]
            result_payload["stream_events_truncated"] = len(RUN_EVENTS_STORE.get(run_id, [])) > 240
            SlayQLPipeline._persist_assistant(run_id, answer, result_payload, sql=final_sql)
            metadata["status"] = "completed"
            metadata["result"] = result_payload
            SlayQLPipeline._emit(run_id, "completion", "run.completed", result_payload)
        except ProviderError as exc:
            SlayQLPipeline._fail(run_id, "model_generation", str(exc))
        except asyncio.CancelledError:
            if metadata["status"] not in TERMINAL_STATUSES:
                metadata["status"] = "cancelled"
                SlayQLPipeline._emit(
                    run_id,
                    "cancelled",
                    "run.cancelled",
                    {"reason": "User cancelled"},
                )
                SlayQLPipeline._persist_assistant(
                    run_id,
                    "This run was cancelled before it completed.",
                    {"status": "cancelled", "stream_events": SlayQLPipeline._event_trace(run_id)},
                )
        except Exception:
            SlayQLPipeline._fail(run_id, "completion", "The agent run failed unexpectedly.")
