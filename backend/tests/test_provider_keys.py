"""Each model group uses its own key, and a busy key hands over to the next before any output."""
import json

import httpx
import pytest

from backend.app.providers import llm_client as module
from backend.app.providers.llm_client import BUSY_MESSAGE, LLMClient, ProviderError

OVERLOADED = {"error": {"message": "Our servers are currently overloaded. Please try again later."}}
ANSWER = {"id": "r1", "model": "gpt-5.6-terra", "choices": [{"delta": {"content": "SELECT 1"}, "finish_reason": "stop"}]}


def _sse(*chunks):
    return "".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks) + "data: [DONE]\n\n"


def _client(handler):
    client = LLMClient()
    client.api_key = "opentk-key"
    client.chinese_key = "chinese-key"
    client.claude_key = "claude-key"
    client.backup_keys = ["ximei-key-1", "ximei-key-2"]
    client._http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return client


async def _run(client, model="gpt-5.6-terra"):
    return [event async for event in client._stream_completion_once(
        requested_model_id=model, messages=[{"role": "user", "content": "q"}], session_id=None,
        max_tokens=50, reasoning_effort="medium", fallback_text="", use_requested_model=True,
    )]


def test_each_model_group_uses_its_own_key():
    client = _client(lambda request: None)
    assert client._credentials("deepseek-v4.1-flash-1017") == [(client.base_url, "chinese-key")]
    assert client._credentials("qwen3.8-max") == [(client.base_url, "chinese-key")]
    assert client._credentials("claude-sonnet-5") == [(module.XIMEI_URL, "claude-key")]
    assert client._credentials("gpt-5.6-terra") == [
        (client.base_url, "opentk-key"), (module.XIMEI_URL, "ximei-key-1"), (module.XIMEI_URL, "ximei-key-2"),
    ]
    # Opus is never offered, so it can never be picked or fallen back to.
    assert not any("opus" in model_id for model_id in module.MODEL_IDS)


@pytest.mark.asyncio
async def test_a_busy_key_hands_over_to_the_next_key_for_the_same_model():
    sent = []

    def handler(request):
        sent.append((request.url.host, request.headers["Authorization"], json.loads(request.content)["model"]))
        if len(sent) == 1:
            return httpx.Response(200, text=_sse(OVERLOADED), headers={"content-type": "text/event-stream"})
        if len(sent) == 2:
            return httpx.Response(429, json={"error": {"message": "rate limited"}})
        return httpx.Response(200, text=_sse(ANSWER), headers={"content-type": "text/event-stream"})

    events = await _run(_client(handler))
    assert events[-1]["content"] == "SELECT 1"
    assert [auth for _, auth, _ in sent] == ["Bearer opentk-key", "Bearer ximei-key-1", "Bearer ximei-key-2"]
    assert sent[1][0] == "ximei.codes" and {model for _, _, model in sent} == {"gpt-5.6-terra"}


@pytest.mark.asyncio
async def test_every_key_busy_is_a_clear_busy_message_not_a_rejection():
    def handler(request):
        if request.url.host == "ximei.codes":
            return httpx.Response(503, json={"error": {"message": "Service temporarily unavailable"}})
        return httpx.Response(200, text=_sse(OVERLOADED), headers={"content-type": "text/event-stream"})

    with pytest.raises(ProviderError) as error:
        await _run(_client(handler))
    assert str(error.value) == BUSY_MESSAGE


@pytest.mark.asyncio
async def test_a_real_rejection_is_not_retried_on_other_keys():
    sent = []

    def handler(request):
        sent.append(request.url.host)
        return httpx.Response(200, text=_sse({"error": {"message": "Invalid request: unknown field"}}),
                              headers={"content-type": "text/event-stream"})

    with pytest.raises(ProviderError, match="rejected the request"):
        await _run(_client(handler))
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_no_hand_over_once_output_has_started():
    sent = []

    def handler(request):
        sent.append(request.url.host)
        return httpx.Response(200, text=_sse({"choices": [{"delta": {"content": "SELECT"}}]}, OVERLOADED),
                              headers={"content-type": "text/event-stream"})

    with pytest.raises(ProviderError):
        await _run(_client(handler))
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_a_dropped_connection_on_a_single_key_model_is_retried_once():
    sent = []

    def handler(request):
        sent.append(request.headers["Authorization"])
        if len(sent) == 1:
            raise httpx.ReadError("connection dropped")
        return httpx.Response(200, text=_sse(ANSWER), headers={"content-type": "text/event-stream"})

    events = await _run(_client(handler), model="deepseek-v4.1-flash-1017")
    assert events[-1]["content"] == "SELECT 1"
    assert sent == ["Bearer chinese-key", "Bearer chinese-key"]
