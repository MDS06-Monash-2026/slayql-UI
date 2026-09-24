"""Extra SQL candidates for consensus, generated independently of the first."""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from backend.app.providers.openrouter_client import openrouter_client

# Each extra candidate gets a different nudge so the attempts are independent
# rather than copies of the same reasoning.
VARIANT_GUIDANCE = (
    "Solve the question independently from scratch. Check the grain of every table: joins must not repeat the rows you aggregate.",
    "Solve the question independently, preferring subqueries or CTEs over wide joins. State every filter explicitly.",
    "Solve the question independently. Where a business term is ambiguous, apply its most common business meaning.",
    "Solve the question independently and check date ranges against the dates present in the data.",
)


async def _collect(guidance: str, **kwargs: Any) -> Dict[str, Any]:
    usage: Dict[str, Any] = {}
    completed: Dict[str, Any] = {}
    try:
        async for event in openrouter_client.stream_sql(guidance=guidance, **kwargs):
            if event["type"] == "usage":
                usage = event.get("usage") or usage
            elif event["type"] == "completed":
                completed = event
    except Exception as error:  # provider failures only drop this candidate
        return {"sql": "", "usage": usage, "error": str(error)[:300], "guidance": guidance}
    usage = completed.get("usage") or usage
    return {"sql": (completed.get("extracted_sql") or "").strip(), "usage": usage, "error": None, "guidance": guidance}


async def generate_variants(
    *,
    count: int,
    requested_model_id: str,
    question: str,
    dialect: str,
    schema_context: str,
    grounding_hints: str,
    retrieval_context: str,
    conversation_messages: Optional[List[Dict[str, str]]] = None,
    definitions_context: str = "",
    reasoning_effort: str = "medium",
    max_tokens: int = 1500,
    session_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Generate `count` extra candidate SQL statements concurrently."""
    if count <= 0:
        return []
    tasks = [
        _collect(
            VARIANT_GUIDANCE[index % len(VARIANT_GUIDANCE)],
            requested_model_id=requested_model_id,
            question=question,
            dialect=dialect,
            schema_context=schema_context,
            grounding_hints=grounding_hints,
            retrieval_context=retrieval_context,
            conversation_messages=conversation_messages,
            session_id=session_id,
            reasoning_effort=reasoning_effort,
            max_tokens=max_tokens,
            definitions_context=definitions_context,
        )
        for index in range(count)
    ]
    return list(await asyncio.gather(*tasks))
