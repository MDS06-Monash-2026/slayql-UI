"""OpenRouter streaming client used by the SQL agent.

The model picker is intentionally a product-persona surface during testing. Every
request is executed by the server-controlled model below, regardless of the
selected persona.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any, AsyncGenerator, Awaitable, Callable, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

from backend.app.config import settings


TEST_EXECUTION_MODEL = "deepseek/deepseek-v4-flash"


class ProviderError(RuntimeError):
    """A public-safe provider failure with no credential or upstream body."""


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    description: str
    context_length: int = 0
    input_price: float = 0.0
    output_price: float = 0.0
    is_available: bool = True
    tags: List[str] = Field(default_factory=list)


CURATED_MODELS: List[ModelInfo] = [
    ModelInfo(id="google/gemini-3.7-flash", name="Gemini 3.7 Flash", provider="Google", description="Fast Google persona for schema exploration.", tags=["fast", "test-persona"]),
    ModelInfo(id="anthropic/claude-sonnet-5", name="Claude Sonnet 5", provider="Anthropic", description="Balanced Anthropic persona for analytical SQL.", tags=["balanced", "test-persona"]),
    ModelInfo(id="anthropic/claude-fable-5", name="Claude Fable 5", provider="Anthropic", description="Concise Anthropic persona for conversational analysis.", tags=["concise", "test-persona"]),
    ModelInfo(id="anthropic/claude-opus-5", name="Claude Opus 5", provider="Anthropic", description="Deep Anthropic persona for complex relational questions.", tags=["deep", "test-persona"]),
    ModelInfo(id=TEST_EXECUTION_MODEL, name="DeepSeek V4 Flash", provider="DeepSeek", description="Server execution model for the current test deployment.", tags=["execution", "fast"]),
    ModelInfo(id="deepseek/deepseek-v4-pro", name="DeepSeek V4 Pro", provider="DeepSeek", description="DeepSeek pro persona for complex SQL plans.", tags=["deep", "test-persona"]),
    ModelInfo(id="x-ai/grok-4.6", name="Grok 4.6", provider="xAI", description="xAI persona for exploratory data questions.", tags=["explore", "test-persona"]),
    ModelInfo(id="openai/gpt-5.6-terra", name="GPT 5.6 Terra", provider="OpenAI", description="GPT 5.6 Terra analytical persona.", tags=["analytical", "test-persona"]),
    ModelInfo(id="openai/gpt-5.6-luna", name="GPT 5.6 Luna", provider="OpenAI", description="GPT 5.6 Luna conversational persona.", tags=["conversational", "test-persona"]),
    ModelInfo(id="openai/gpt-5.6-solar", name="GPT 5.6 Solar", provider="OpenAI", description="GPT 5.6 Solar deep-reasoning persona.", tags=["deep", "test-persona"]),
]


class ProviderCompletionResponse(BaseModel):
    raw_text: str
    extracted_sql: str = ""
    reasoning_text: str = ""
    reasoning_details: List[Dict[str, Any]] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    estimated_cost_usd: float = 0.0
    model_id: str = TEST_EXECUTION_MODEL
    requested_model_id: str = TEST_EXECUTION_MODEL
    provider_name: str = "OpenRouter"
    finish_reason: Optional[str] = None


class OpenRouterClient:
    def __init__(self) -> None:
        # OPENROUTER_KEY is the production name. The older name remains only
        # as a migration fallback and is never returned by an API response.
        self.api_key = settings.OPENROUTER_KEY or settings.OPENROUTER_API_KEY
        self.base_url = settings.OPENROUTER_BASE_URL.rstrip("/")

    async def list_models(self, query: Optional[str] = None) -> List[ModelInfo]:
        normalized = (query or "").strip().lower()
        if not normalized:
            return CURATED_MODELS
        return [
            model
            for model in CURATED_MODELS
            if normalized in model.id.lower()
            or normalized in model.name.lower()
            or normalized in model.provider.lower()
            or normalized in model.description.lower()
        ]

    @staticmethod
    def build_system_prompt(
        dialect: str,
        schema_context: str,
        grounding_hints: str,
        retrieval_context: str = "",
        repair_feedback: str = "",
    ) -> str:
        repair_section = (
            f"\n### PREVIOUS ATTEMPT FEEDBACK\n{repair_feedback}\n"
            if repair_feedback
            else ""
        )
        return f"""You are SlayQL's SQL planning agent. Generate one accurate, read-only {dialect.upper()} query for the user's latest question.

### BM25 RETRIEVAL EVIDENCE
{retrieval_context or "No additional retrieval evidence."}

### VERIFIED DATABASE SCHEMA
{schema_context}

### GROUNDED VALUES
{grounding_hints or "No literal values were grounded."}
{repair_section}
### RULES
- Use only tables and columns present in the verified schema.
- Prefer the supplied foreign-key relationships for joins.
- Respect prior conversation only when it clarifies the latest question.
- Return a single read-only SELECT statement or CTE ending in SELECT.
- Keep the result to at most 200 rows when a full scan is not required.
- Output only one fenced SQL code block, with no explanation outside it.
"""

    async def stream_sql(
        self,
        *,
        requested_model_id: str,
        question: str,
        dialect: str,
        schema_context: str,
        grounding_hints: str,
        retrieval_context: str,
        conversation_messages: Optional[List[Dict[str, str]]] = None,
        repair_feedback: str = "",
        session_id: Optional[str] = None,
        fallback_sql: str = "SELECT 1 AS result",
        reasoning_effort: str = "medium",
        max_tokens: int = 1500,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        system_prompt = self.build_system_prompt(
            dialect,
            schema_context,
            grounding_hints,
            retrieval_context,
            repair_feedback,
        )
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        for item in (conversation_messages or [])[-8:]:
            role = item.get("role")
            content = (item.get("content") or "").strip()
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content[:4000]})
        messages.append({"role": "user", "content": question})

        async for event in self._stream_completion(
            requested_model_id=requested_model_id,
            messages=messages,
            session_id=session_id,
            max_tokens=max_tokens,
            reasoning_effort=reasoning_effort,
            fallback_text=f"```sql\n{fallback_sql}\n```",
        ):
            if event["type"] == "completed":
                event["extracted_sql"] = self._extract_sql(event.get("content", ""))
            yield event

    async def stream_answer(
        self,
        *,
        requested_model_id: str,
        question: str,
        sql: str,
        columns: List[str],
        rows: List[List[Any]],
        session_id: Optional[str],
        reasoning_effort: str = "minimal",
        max_tokens: int = 360,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        bounded_result = json.dumps(
            {"columns": columns, "rows": rows[:25]},
            ensure_ascii=True,
            default=str,
        )
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a data analyst. Answer the user's question from the query result. "
                    "Be concise, state material caveats such as an empty or truncated result, and do not invent values. "
                    "Do not include chain-of-thought or repeat the SQL."
                ),
            },
            {
                "role": "user",
                "content": f"Question: {question}\nSQL: {sql}\nBounded result: {bounded_result}",
            },
        ]
        fallback = f"The validated query returned {len(rows)} row{'s' if len(rows) != 1 else ''}."
        async for event in self._stream_completion(
            requested_model_id=requested_model_id,
            messages=messages,
            session_id=session_id,
            max_tokens=max_tokens,
            reasoning_effort=reasoning_effort,
            fallback_text=fallback,
        ):
            yield event

    async def stream_tool_agent(
        self,
        *,
        model_id: str,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
        tool_executor: Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]],
        session_id: Optional[str] = None,
        reasoning_effort: str = "minimal",
        max_tokens: int = 900,
        max_tool_rounds: int = 2,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Run a bounded client-side tool-calling loop over OpenRouter SSE.

        OpenRouter standardizes the OpenAI-compatible ``tools`` and
        ``tool_calls`` message shapes. Tool execution remains local so the
        model can inspect only the verified catalog and can never access
        credentials or issue SQL directly.
        """
        working_messages = list(messages)
        round_number = 0
        while round_number <= max(0, max_tool_rounds):
            round_number += 1
            completed: Optional[Dict[str, Any]] = None
            async for event in self._stream_completion(
                requested_model_id=model_id,
                messages=working_messages,
                session_id=session_id,
                max_tokens=max_tokens,
                reasoning_effort=reasoning_effort,
                fallback_text="",
                tools=tools,
                parallel_tool_calls=False,
            ):
                if event.get("type") == "completed":
                    completed = event
                    break
                yield event

            if completed is None:
                return
            tool_calls = completed.get("tool_calls") or []
            if not tool_calls or round_number > max(0, max_tool_rounds):
                yield completed
                return

            assistant_message: Dict[str, Any] = {
                "role": "assistant",
                "content": completed.get("content") or None,
                "tool_calls": [
                    {
                        "id": call.get("id"),
                        "type": "function",
                        "function": {
                            "name": call.get("name"),
                            "arguments": call.get("arguments") or "{}",
                        },
                    }
                    for call in tool_calls
                ],
            }
            # Providers that expose structured reasoning may require the
            # non-encrypted details to be echoed on the next tool round.
            if completed.get("reasoning_details"):
                assistant_message["reasoning_details"] = completed["reasoning_details"]
            working_messages.append(assistant_message)
            for call in tool_calls:
                yield {"type": "tool_call_started", "tool_call": call, "round": round_number}
                try:
                    result = await tool_executor(call)
                except Exception as exc:
                    result = {"ok": False, "error": str(exc)[:500]}
                working_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id"),
                        "name": call.get("name"),
                        "content": json.dumps(result, ensure_ascii=True, default=str)[:12000],
                    }
                )
                yield {
                    "type": "tool_call_completed",
                    "tool_call": call,
                    "result": result,
                    "round": round_number,
                }

    async def _stream_completion(
        self,
        *,
        requested_model_id: str,
        messages: List[Dict[str, str]],
        session_id: Optional[str],
        max_tokens: int,
        reasoning_effort: str,
        fallback_text: str,
        tools: Optional[List[Dict[str, Any]]] = None,
        parallel_tool_calls: bool = False,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        started = time.perf_counter()
        if not self.api_key:
            raise ProviderError("The AI provider is not configured.")
        if self.api_key.startswith("mock_"):
            yield {"type": "content_delta", "delta": fallback_text}
            yield {
                "type": "completed",
                "content": fallback_text,
                "reasoning": "",
                "reasoning_details": [],
                "usage": {},
                "finish_reason": "local_fallback",
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "requested_model_id": requested_model_id,
                "model_id": TEST_EXECUTION_MODEL,
                "resolved_model_id": TEST_EXECUTION_MODEL,
                "resolved_provider": "local",
                "response_id": None,
                "reasoning_effort": reasoning_effort,
            }
            return

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://slayql.ai",
            "X-Title": "SlayQL",
            "Content-Type": "application/json",
        }
        # DeepSeek V4 Flash may still consume a large hidden-reasoning budget
        # when sent `minimal`. Keep the public profile/event as minimal, but
        # use the provider's explicit no-reasoning wire mode for its fast path.
        wire_reasoning_effort = "none" if reasoning_effort == "minimal" else reasoning_effort
        payload: Dict[str, Any] = {
            "model": TEST_EXECUTION_MODEL,
            "messages": messages,
            "temperature": 0,
            "max_tokens": max_tokens,
            "stream": True,
            "reasoning": {
                "effort": wire_reasoning_effort,
                "exclude": wire_reasoning_effort == "none",
            },
        }
        if tools:
            payload["tools"] = tools
            payload["parallel_tool_calls"] = parallel_tool_calls
        if session_id:
            payload["session_id"] = session_id

        content_parts: List[str] = []
        reasoning_parts: List[str] = []
        reasoning_details: List[Dict[str, Any]] = []
        usage: Dict[str, Any] = {}
        finish_reason: Optional[str] = None
        response_id: Optional[str] = None
        resolved_model_id: Optional[str] = None
        resolved_provider: Optional[str] = None
        last_usage_signature = ""
        tool_calls: Dict[int, Dict[str, Any]] = {}

        timeout = httpx.Timeout(connect=10.0, read=120.0, write=20.0, pool=10.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        raw = line[5:].strip()
                        if not raw or raw == "[DONE]":
                            continue
                        try:
                            chunk = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        if chunk.get("error"):
                            raise ProviderError("The AI provider rejected the request.")
                        response_id = chunk.get("id") or response_id
                        resolved_model_id = chunk.get("model") or resolved_model_id
                        resolved_provider = chunk.get("provider") or resolved_provider
                        if isinstance(chunk.get("usage"), dict):
                            usage = chunk["usage"]
                            usage_signature = json.dumps(usage, sort_keys=True, default=str)
                            if usage and usage_signature != last_usage_signature:
                                last_usage_signature = usage_signature
                                yield {"type": "usage", "usage": usage}
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        choice = choices[0]
                        finish_reason = choice.get("finish_reason") or finish_reason
                        delta = choice.get("delta") or {}
                        content = delta.get("content")
                        if content:
                            content_parts.append(content)
                            yield {"type": "content_delta", "delta": content}

                        for tool_delta in delta.get("tool_calls") or []:
                            try:
                                index = int(tool_delta.get("index", 0))
                            except (TypeError, ValueError):
                                index = 0
                            current = tool_calls.setdefault(
                                index,
                                {"id": None, "name": "", "arguments": ""},
                            )
                            current["id"] = tool_delta.get("id") or current["id"]
                            function_delta = tool_delta.get("function") or {}
                            current["name"] = function_delta.get("name") or current["name"]
                            arguments = function_delta.get("arguments")
                            if arguments:
                                current["arguments"] += str(arguments)

                        delta_reasoning_details = delta.get("reasoning_details") or []
                        direct_reasoning = delta.get("reasoning")
                        if direct_reasoning and not delta_reasoning_details:
                            reasoning_parts.append(direct_reasoning)
                            yield {"type": "reasoning_delta", "delta": direct_reasoning}

                        for detail in delta_reasoning_details:
                            if not isinstance(detail, dict):
                                continue
                            detail_type = detail.get("type")
                            # Encrypted reasoning is retained by the provider for
                            # continuity and must not be exposed to the browser.
                            if detail_type == "reasoning.encrypted":
                                continue
                            safe_detail = {
                                key: value
                                for key, value in detail.items()
                                if key in {"type", "text", "summary", "format", "index", "id"}
                            }
                            if safe_detail:
                                reasoning_details.append(safe_detail)
                            detail_text = detail.get("text") or detail.get("summary")
                            if detail_text:
                                reasoning_parts.append(str(detail_text))
                            yield {
                                "type": "reasoning_detail",
                                "detail": safe_detail,
                                "delta": str(detail_text or ""),
                            }
        except ProviderError:
            raise
        except (httpx.HTTPError, OSError, ValueError) as exc:
            raise ProviderError("The AI provider request failed.") from exc

        yield {
            "type": "completed",
            "content": "".join(content_parts).strip(),
            "reasoning": "".join(reasoning_parts).strip(),
            "reasoning_details": reasoning_details,
            "usage": usage,
            "finish_reason": finish_reason or "stop",
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "requested_model_id": requested_model_id,
            "model_id": TEST_EXECUTION_MODEL,
            "resolved_model_id": resolved_model_id or TEST_EXECUTION_MODEL,
            "resolved_provider": resolved_provider,
            "response_id": response_id,
            "reasoning_effort": reasoning_effort,
            "tool_calls": [tool_calls[index] for index in sorted(tool_calls)],
        }

    @staticmethod
    def _extract_sql(text: str) -> str:
        match = re.search(r"```(?:sql)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
        clean = text.strip()
        select_match = re.search(r"\b(?:WITH|SELECT)\b[\s\S]*", clean, re.IGNORECASE)
        return select_match.group(0).strip() if select_match else clean

    async def generate_sql(
        self,
        model_id: str,
        question: str,
        dialect: str,
        schema_context: str,
        grounding_hints: str,
    ) -> ProviderCompletionResponse:
        """Compatibility collector for callers that do not consume the stream."""
        final: Dict[str, Any] = {}
        async for event in self.stream_sql(
            requested_model_id=model_id,
            question=question,
            dialect=dialect,
            schema_context=schema_context,
            grounding_hints=grounding_hints,
            retrieval_context="",
        ):
            if event["type"] == "completed":
                final = event
        usage = final.get("usage") or {}
        return ProviderCompletionResponse(
            raw_text=final.get("content", ""),
            extracted_sql=final.get("extracted_sql", ""),
            reasoning_text=final.get("reasoning", ""),
            reasoning_details=final.get("reasoning_details", []),
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            latency_ms=int(final.get("latency_ms") or 0),
            estimated_cost_usd=float(usage.get("cost") or 0),
            model_id=TEST_EXECUTION_MODEL,
            requested_model_id=model_id,
            finish_reason=final.get("finish_reason"),
        )


openrouter_client = OpenRouterClient()
