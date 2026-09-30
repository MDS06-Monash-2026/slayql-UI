"""Streaming client for the OpenAI-compatible chat API the app uses.

The provider is a setting (LLM_PROVIDER): "opentk" (the testing environment,
default) or "together". Each offers exactly two models, and the user's choice
runs. Neither provider reports a cost per request: Together's published prices
are used to compute cost; OpenTK publishes none, so its cost is unknown (0) and
only token counts are tracked.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, AsyncGenerator, Awaitable, Callable, Dict, List, Optional, Tuple

import httpx
from pydantic import BaseModel, Field

from backend.app.config import settings

logger = logging.getLogger(__name__)


class ProviderError(RuntimeError):
    """A public-safe provider failure with no credential or upstream body."""


class ModelInfo(BaseModel):
    id: str
    name: str
    provider: str
    description: str
    context_length: int = 0
    # USD per million tokens; 0 when the provider does not publish a price.
    input_price: float = 0.0
    output_price: float = 0.0
    cached_input_price: float = 0.0
    is_available: bool = True
    tags: List[str] = Field(default_factory=list)


PROVIDERS: Dict[str, Dict[str, Any]] = {
    "opentk": {
        "label": "OpenTK",
        "base_url": "https://opentk.ai/v1",
        "key_settings": ("OPENTK_KEY", "OPENTK_API_KEY"),
        # First model: everyday work. Second: difficult work (High/Max effort, report planning).
        "models": [
            ModelInfo(id="gpt-5.6-luna", name="GPT-5.6 Luna", provider="OpenAI",
                      description="Default for everyday questions (OpenTK; price not published).",
                      tags=["default", "fast"]),
            ModelInfo(id="gpt-6.1-sol", name="GPT-6.1 Sol", provider="OpenAI",
                      description="Used for difficult work: High and Max effort, and planning reports (OpenTK; price not published).",
                      tags=["deep"]),
            ModelInfo(id="deepseek-v4.1-flash", name="DeepSeek V4.1 Flash", provider="DeepSeek",
                      description="Alternative fast model (OpenTK testing environment; price not published).",
                      tags=["fast"]),
            ModelInfo(id="glm-5.3", name="GLM 5.3", provider="Zhipu AI",
                      description="Alternative model (OpenTK testing environment; price not published).",
                      tags=["deep"]),
        ],
    },
    # (OpenTK fallbacks are set below the table.)
    "together": {
        "label": "Together AI",
        "base_url": "https://api.together.xyz/v1",
        "key_settings": ("TOGETHER_API_KEY", "TOGETHER_AI_KEY"),
        # Prices from Together's model list (September 2026).
        "models": [
            ModelInfo(id="deepseek-ai/DeepSeek-V4-Flash-0731", name="DeepSeek V4 Flash (0731)", provider="DeepSeek",
                      description="Fast, low-cost default for SQL generation and checking.",
                      context_length=1048576, input_price=0.14, output_price=0.28, cached_input_price=0.03,
                      tags=["default", "fast"]),
            ModelInfo(id="moonshotai/Kimi-K3", name="Kimi K3", provider="Moonshot AI",
                      description="Larger model for harder questions; about 20 times the cost per token.",
                      context_length=1048576, input_price=3.0, output_price=15.0, cached_input_price=0.3,
                      tags=["deep"]),
        ],
    },
}

# When a model fails before answering (rate limit, outage), try these next, in order.
BUILT_IN_FALLBACKS: Dict[str, Dict[str, List[str]]] = {
    "opentk": {
        "gpt-5.6-luna": ["deepseek-v4.1-flash"],
        "gpt-6.1-sol": ["glm-5.3", "gpt-5.6-luna"],
        "deepseek-v4.1-flash": ["gpt-5.6-luna"],
        "glm-5.3": ["gpt-6.1-sol"],
    },
    "together": {
        "deepseek-ai/DeepSeek-V4-Flash-0731": ["moonshotai/Kimi-K3"],
        "moonshotai/Kimi-K3": ["deepseek-ai/DeepSeek-V4-Flash-0731"],
    },
}

PROVIDER_ID = settings.LLM_PROVIDER.lower() if settings.LLM_PROVIDER.lower() in PROVIDERS else "opentk"
PROVIDER = PROVIDERS[PROVIDER_ID]
CURATED_MODELS: List[ModelInfo] = list(PROVIDER["models"])
# Models named in the environment are offered even if not listed above, so moving provider
# (or model) is a configuration change: EXECUTION_MODEL for everyday work, DEEP_MODEL for hard work.
for _configured, _role in ((settings.EXECUTION_MODEL, "everyday questions"), (settings.DEEP_MODEL, "difficult work")):
    if _configured and _configured not in {model.id for model in CURATED_MODELS}:
        CURATED_MODELS.append(ModelInfo(id=_configured, name=_configured, provider=PROVIDER["label"],
                                        description=f"Configured for {_role}.", tags=[]))
MODEL_IDS = {model.id for model in CURATED_MODELS}
DEFAULT_MODEL = settings.EXECUTION_MODEL or CURATED_MODELS[0].id
ALTERNATE_MODEL = DEEP_MODEL = settings.DEEP_MODEL or CURATED_MODELS[1].id
TEST_EXECUTION_MODEL = DEFAULT_MODEL


def _fallback_table() -> Dict[str, List[str]]:
    table = {model: list(chain) for model, chain in BUILT_IN_FALLBACKS.get(PROVIDER_ID, {}).items()}
    for entry in (settings.FALLBACK_MODELS or "").split(","):
        if ":" in entry:
            model, backup = (part.strip() for part in entry.split(":", 1))
            if model and backup:
                table[model] = [backup] + [m for m in table.get(model, []) if m != backup]
    return table


FALLBACKS = _fallback_table()


def fallback_chain(model_id: str) -> List[str]:
    """The model, then the offered models to try if it fails before answering."""
    chain = [model_id]
    for backup in FALLBACKS.get(model_id, []) + [DEFAULT_MODEL]:
        if backup in MODEL_IDS and backup not in chain:
            chain.append(backup)
    return chain
_PRICES = {model.id: model for provider in PROVIDERS.values() for model in provider["models"]}


def usage_cost(model_id: str, usage: Dict[str, Any]) -> float:
    """USD cost of one call from its token usage (cached prompt tokens are cheaper); 0 if unpriced."""
    model = _PRICES.get(model_id)
    if not model or not usage:
        return 0.0
    prompt = int(usage.get("prompt_tokens") or 0)
    completion = int(usage.get("completion_tokens") or 0)
    details = usage.get("prompt_tokens_details") or {}
    cached = min(prompt, int(details.get("cached_tokens") or usage.get("cached_tokens") or 0))
    return ((prompt - cached) * model.input_price + cached * model.cached_input_price
            + completion * model.output_price) / 1_000_000


class ThinkSplitter:
    """Separates inline <think>...</think> reasoning from the visible answer across stream chunks."""

    OPEN, CLOSE = "<think>", "</think>"

    def __init__(self) -> None:
        self.inside = False
        self.pending = ""

    def feed(self, text: str) -> Tuple[str, str]:
        text = self.pending + text
        self.pending = ""
        visible: List[str] = []
        hidden: List[str] = []
        while text:
            tag = self.CLOSE if self.inside else self.OPEN
            index = text.find(tag)
            if index < 0:
                # Hold back a possible partial tag at the end of the chunk.
                keep = next((n for n in range(len(tag) - 1, 0, -1) if text.endswith(tag[:n])), 0)
                emit, self.pending = (text[:-keep], text[-keep:]) if keep else (text, "")
                (hidden if self.inside else visible).append(emit)
                break
            (hidden if self.inside else visible).append(text[:index])
            text = text[index + len(tag):]
            self.inside = not self.inside
        return "".join(visible), "".join(hidden)

    def flush(self) -> Tuple[str, str]:
        rest, self.pending = self.pending, ""
        return ("", rest) if self.inside else (rest, "")


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
    provider_name: str = PROVIDER["label"]
    finish_reason: Optional[str] = None


class LLMClient:
    def __init__(self) -> None:
        self.provider = PROVIDER["label"]
        self.api_key = next((getattr(settings, name, None) for name in PROVIDER["key_settings"] if getattr(settings, name, None)), None)
        self.base_url = (settings.LLM_BASE_URL or PROVIDER["base_url"]).rstrip("/")
        self.execution_model = DEFAULT_MODEL
        self.deep_model = DEEP_MODEL
        self._http_client: Optional[httpx.AsyncClient] = None
        # Models whose deployment rejected the reasoning switch, so it is not sent again.
        self._no_reasoning_param: set = set()

    def model_for_effort(self, requested_model_id: Optional[str], thinking_effort: Optional[str]) -> str:
        """The model a run uses: the user's choice if offered; otherwise the deep model for
        High and Max effort, and the everyday model for the rest."""
        if requested_model_id in MODEL_IDS:
            return requested_model_id
        return self.deep_model if thinking_effort in {"high", "max"} else self.execution_model

    def execution_model_id(self, requested_model_id: Optional[str] = None, *, use_requested_model: bool = False) -> str:
        """The model to run: the one the user picked if it is offered, otherwise the default."""
        if requested_model_id in MODEL_IDS:
            return requested_model_id
        return self.execution_model

    def _client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                timeout=httpx.Timeout(connect=10.0, read=120.0, write=20.0, pool=10.0),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=30.0),
            )
        return self._http_client

    async def aclose(self) -> None:
        if self._http_client is not None and not self._http_client.is_closed:
            await self._http_client.aclose()

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
        guidance: str = "",
        definitions_context: str = "",
    ) -> str:
        repair_section = (
            f"\n### PREVIOUS ATTEMPT FEEDBACK\n{repair_feedback}\n"
            if repair_feedback
            else ""
        )
        definitions_section = (
            f"\n### APPROVED BUSINESS DEFINITIONS\nApply these whenever the question uses the term.\n{definitions_context}\n"
            if definitions_context
            else ""
        )
        guidance_section = f"\n### ADDITIONAL GUIDANCE\n{guidance}\n" if guidance else ""
        return f"""You are SlayQL's SQL planning agent. Generate one accurate, read-only {dialect.upper()} query for the user's latest question.

### BM25 RETRIEVAL EVIDENCE
{retrieval_context or "No additional retrieval evidence."}

### VERIFIED DATABASE SCHEMA
{schema_context}

### GROUNDED VALUES
{grounding_hints or "No literal values were grounded."}
{definitions_section}{repair_section}{guidance_section}
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
        guidance: str = "",
        definitions_context: str = "",
    ) -> AsyncGenerator[Dict[str, Any], None]:
        system_prompt = self.build_system_prompt(
            dialect,
            schema_context,
            grounding_hints,
            retrieval_context,
            repair_feedback,
            guidance,
            definitions_context,
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
        """Run a bounded client-side tool-calling loop over the provider's SSE stream.

        The provider uses the OpenAI-compatible ``tools`` and ``tool_calls``
        message shapes. Tool execution remains local so the model can inspect
        only the verified catalog and can never access credentials or issue SQL
        directly.
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

            working_messages.append({
                "role": "assistant",
                "content": completed.get("content") or None,
                "tool_calls": [
                    {
                        "id": call.get("id"),
                        "type": "function",
                        "function": {"name": call.get("name"), "arguments": call.get("arguments") or "{}"},
                    }
                    for call in tool_calls
                ],
            })
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
                yield {"type": "tool_call_completed", "tool_call": call, "result": result, "round": round_number}

    async def _stream_completion(self, **kwargs: Any) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream one completion; if the model fails before producing anything, try its fallbacks.

        A call that has already streamed output is never retried, so an answer is never
        stitched together from two models.
        """
        first = self.execution_model_id(kwargs["requested_model_id"], use_requested_model=kwargs.get("use_requested_model", False))
        chain = fallback_chain(first)
        for index, model_id in enumerate(chain):
            produced = False
            try:
                async for event in self._stream_completion_once(**{**kwargs, "requested_model_id": model_id}):
                    produced = True
                    if index and event.get("type") == "completed":
                        event["fallback_from"] = first
                    yield event
                return
            except ProviderError as error:
                last = index == len(chain) - 1
                if produced or last or str(error) == "The AI provider is not configured.":
                    raise
                logger.warning("Model %s failed (%s); trying %s", model_id, error, chain[index + 1])

    async def _stream_completion_once(
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
        use_requested_model: bool = False,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        started = time.perf_counter()
        execution_model_id = self.execution_model_id(requested_model_id, use_requested_model=use_requested_model)
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
                "model_id": execution_model_id,
                "resolved_model_id": execution_model_id,
                "resolved_provider": "local",
                "response_id": None,
                "reasoning_effort": reasoning_effort,
            }
            return

        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload: Dict[str, Any] = {
            "model": execution_model_id,
            "messages": messages,
            "temperature": 0,
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if execution_model_id not in self._no_reasoning_param:
            # Hybrid reasoning models think only above "minimal" effort, which keeps the
            # fast path fast. Some deployments reject the switch; see the retry below.
            payload["reasoning"] = {"enabled": reasoning_effort not in {"minimal", "none"}}
        if tools:
            payload["tools"] = tools
            payload["parallel_tool_calls"] = parallel_tool_calls

        content_parts: List[str] = []
        reasoning_parts: List[str] = []
        usage: Dict[str, Any] = {}
        finish_reason: Optional[str] = None
        response_id: Optional[str] = None
        resolved_model_id: Optional[str] = None
        tool_calls: Dict[int, Dict[str, Any]] = {}
        think = ThinkSplitter()

        try:
            for attempt in range(2):
                async with self._client().stream(
                    "POST", f"{self.base_url}/chat/completions", headers=headers, json=payload,
                ) as response:
                    if response.status_code in {400, 422} and attempt == 0 and "reasoning" in payload:
                        # This deployment does not accept the reasoning switch: remember and retry without it.
                        self._no_reasoning_param.add(execution_model_id)
                        payload.pop("reasoning")
                        continue
                    if response.status_code == 402:
                        raise ProviderError("The AI provider account is out of credit.")
                    if response.status_code == 429:
                        raise ProviderError("The AI provider is rate-limiting requests; try again shortly.")
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
                        if isinstance(chunk.get("usage"), dict) and chunk["usage"]:
                            usage = chunk["usage"]
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        choice = choices[0]
                        finish_reason = choice.get("finish_reason") or finish_reason
                        delta = choice.get("delta") or {}

                        reasoning = delta.get("reasoning") or delta.get("reasoning_content")
                        if reasoning:
                            reasoning_parts.append(reasoning)
                            yield {"type": "reasoning_delta", "delta": reasoning}
                        if delta.get("content"):
                            visible, hidden = think.feed(delta["content"])
                            if hidden:
                                reasoning_parts.append(hidden)
                                yield {"type": "reasoning_delta", "delta": hidden}
                            if visible:
                                content_parts.append(visible)
                                yield {"type": "content_delta", "delta": visible}

                        for tool_delta in delta.get("tool_calls") or []:
                            try:
                                index = int(tool_delta.get("index", 0))
                            except (TypeError, ValueError):
                                index = 0
                            current = tool_calls.setdefault(index, {"id": None, "name": "", "arguments": ""})
                            current["id"] = tool_delta.get("id") or current["id"]
                            function_delta = tool_delta.get("function") or {}
                            current["name"] = function_delta.get("name") or current["name"]
                            if function_delta.get("arguments"):
                                current["arguments"] += str(function_delta["arguments"])
                break
        except ProviderError:
            raise
        except (httpx.HTTPError, OSError, ValueError) as exc:
            raise ProviderError("The AI provider request failed.") from exc

        visible, hidden = think.flush()
        if visible:
            content_parts.append(visible)
            yield {"type": "content_delta", "delta": visible}
        if hidden:
            reasoning_parts.append(hidden)
        if usage:
            # Providers report tokens, not money; price them here (0 when unpriced).
            usage = {**usage, "cost": round(usage_cost(execution_model_id, usage), 8)}
            yield {"type": "usage", "usage": usage}

        yield {
            "type": "completed",
            "content": "".join(content_parts).strip(),
            "reasoning": "".join(reasoning_parts).strip(),
            "reasoning_details": [],
            "usage": usage,
            "finish_reason": finish_reason or "stop",
            "latency_ms": int((time.perf_counter() - started) * 1000),
            "requested_model_id": requested_model_id,
            "model_id": execution_model_id,
            "resolved_model_id": resolved_model_id or execution_model_id,
            "resolved_provider": self.provider,
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
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            latency_ms=int(final.get("latency_ms") or 0),
            estimated_cost_usd=float(usage.get("cost") or 0),
            model_id=self.execution_model_id(model_id),
            requested_model_id=model_id,
            finish_reason=final.get("finish_reason"),
        )


llm_client = LLMClient()
