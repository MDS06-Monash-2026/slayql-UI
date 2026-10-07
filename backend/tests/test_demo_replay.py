import json

import httpx
import pytest

from backend.app.agent import demo_replay
from backend.app.main import app


def _events(text):
    for block in text.split("\n\n"):
        data = "".join(line[6:] for line in block.splitlines() if line.startswith("data: "))
        if data:
            yield json.loads(data)


async def _login(client):
    token = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_recorded_demo_cases_cover_every_outcome():
    outcomes = {case["outcome"] for case in demo_replay.list_cases("sqlite_demo")}
    assert {"confident", "caveat", "clarify", "handoff"} <= outcomes
    for case in demo_replay.CASES.values():
        assert case["result"]["verification"]["outcome"] == case["outcome"]


@pytest.mark.asyncio
async def test_demo_replay_streams_fast_and_stays_interactive(monkeypatch):
    monkeypatch.setattr(demo_replay, "REPLAY_SECONDS", 0.05)
    case = next(c for c in demo_replay.list_cases("sqlite_demo") if c["outcome"] == "clarify")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        headers = await _login(client)
        listed = (await client.get("/api/v1/demo-cases", params={"connection_id": "sqlite_demo"})).json()
        assert case["id"] in {c["id"] for c in listed}

        before = (await client.get("/api/v1/credits", headers=headers)).json()["balance"]
        response = await client.post("/api/v1/agent-runs/stream", headers=headers, json={
            "question": "ignored: the recorded question is used",
            "connection_id": "sqlite_demo",
            "demo_case": case["id"],
        })
        events = list(_events(response.text))
        run_id = events[0]["payload"]["run_id"]
        completed = [e for e in events if e["type"] == "run.completed"]
        assert len(completed) == 1
        assert completed[0]["payload"]["verification"]["outcome"] == "clarify"
        assert completed[0]["payload"]["demo_replay"] == case["id"]
        # Replays are free and do not call the model.
        assert (await client.get("/api/v1/credits", headers=headers)).json()["balance"] == before

        # The replayed run is a real run: choosing a meaning executes its SQL.
        chosen = await client.post(f"/api/v1/agent-runs/{run_id}/clarify", headers=headers, json={"option_index": 0})
        assert chosen.status_code == 200
        assert chosen.json()["rows"]


@pytest.mark.asyncio
async def test_demo_replay_rejects_unknown_cases_and_other_databases():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        headers = await _login(client)
        unknown = await client.post("/api/v1/agent-runs", headers=headers, json={
            "question": "x", "connection_id": "sqlite_demo", "demo_case": "no-such-case"})
        assert unknown.status_code == 404
        case_id = next(iter(demo_replay.CASES))
        other = await client.post("/api/v1/agent-runs", headers=headers, json={
            "question": "x", "connection_id": "postgres_demo", "demo_case": case_id})
        assert other.status_code in {400, 404}
