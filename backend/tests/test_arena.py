"""Trust or Bust: a full game from host setup to study export."""
import asyncio

import httpx
import pytest

from backend.app.arena.service import arena_service
from backend.app.main import app


async def _host(client):
    session = (await client.post("/api/v1/auth/login", json={"is_reviewer": True})).json()
    headers = {"Authorization": f"Bearer {session['token']}"}
    created = await client.post("/api/v1/arena/sessions", json={"card_count": 4}, headers=headers)
    assert created.status_code == 200, created.text
    return created.json()


async def _advance_to(client, code, host_token, kind):
    for _ in range(20):
        state = (await client.get(f"/api/v1/arena/sessions/{code}/state?host_token={host_token}")).json()
        if state["step"]["kind"] == kind:
            return state
        await client.post(f"/api/v1/arena/sessions/{code}/host/next", json={"host_token": host_token})
    raise AssertionError(f"never reached {kind}")


@pytest.mark.asyncio
async def test_only_admins_can_host():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/arena/sessions", json={})
        assert response.status_code in {401, 403}


@pytest.mark.asyncio
async def test_card_round_balances_conditions_scores_and_hides_evidence_from_plain_players():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        game = await _host(client)
        code, host = game["code"], game["host_token"]
        players = [(await client.post(f"/api/v1/arena/sessions/{code}/join", json={"nickname": f"P{i}", "consent": i != 3})).json() for i in range(4)]
        assert sorted(p["condition"] for p in players) == ["evidence", "evidence", "plain", "plain"]

        state = await _advance_to(client, code, host, "card")
        for player in players:
            view = (await client.get(f"/api/v1/arena/sessions/{code}/state?token={player['token']}")).json()
            assert ("evidence" in view["card"]) == (player["condition"] == "evidence")
            assert "correct" not in view["card"]
            vote = await client.post(f"/api/v1/arena/sessions/{code}/vote", json={"token": player["token"], "value": "bust", "confidence": 4})
            assert vote.status_code == 200, vote.text

        revealed = (await client.post(f"/api/v1/arena/sessions/{code}/host/reveal", json={"host_token": host})).json()
        correct = revealed["card"]["correct"]
        assert revealed["aggregate"]["votes"] == 4
        late = await client.post(f"/api/v1/arena/sessions/{code}/vote", json={"token": players[0]["token"], "value": "trust"})
        assert late.status_code == 409
        board = {row["nickname"]: row["score"] for row in revealed["leaderboard"]}
        assert all(score == (0 if correct else 1) for score in board.values())

        export = await client.get(f"/api/v1/arena/sessions/{code}/export.csv?host_token={host}")
        assert export.status_code == 200
        lines = export.text.strip().splitlines()
        assert len(lines) == 1 + 3  # header plus the three consenting players
        assert "P0" not in export.text  # nicknames are never exported
        assert (await client.get(f"/api/v1/arena/sessions/{code}/export.csv?host_token=wrong")).status_code == 403


@pytest.mark.asyncio
async def test_stump_question_runs_through_the_trust_layer():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        game = await _host(client)
        code, host = game["code"], game["host_token"]
        player = (await client.post(f"/api/v1/arena/sessions/{code}/join", json={"consent": True})).json()
        early = await client.post(f"/api/v1/arena/sessions/{code}/stump", json={"token": player["token"], "question": "How many customers?"})
        assert early.status_code == 409

        await _advance_to(client, code, host, "stump")
        asked = await client.post(f"/api/v1/arena/sessions/{code}/stump", json={"token": player["token"], "question": "How many customers do we have?"})
        assert asked.status_code == 200, asked.text
        for _ in range(100):
            session = arena_service.get(code)
            if session.stumps[0].status in {"done", "failed"}:
                break
            await asyncio.sleep(0.05)
        entry = session.stumps[0]
        assert entry.status == "done"
        assert entry.outcome in {"confident", "caveat", "clarify", "handoff"}

        shown = (await client.post(f"/api/v1/arena/sessions/{code}/host/show-stump", json={"host_token": host, "entry_id": entry.id})).json()
        assert shown["wall"][0]["question"] == "How many customers do we have?"
        missed = (await client.post(f"/api/v1/arena/sessions/{code}/host/confident-miss", json={"host_token": host, "entry_id": entry.id})).json()
        assert missed["leaderboard"][0]["score"] == 1 + 5


@pytest.mark.asyncio
async def test_audience_definition_is_approved_and_used_when_re_asked():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        game = await _host(client)
        code, host = game["code"], game["host_token"]
        await _advance_to(client, code, host, "definition")
        approved = await client.post(f"/api/v1/arena/sessions/{code}/host/approve-definition", json={"host_token": host, "definition_id": "completed"})
        assert approved.status_code == 200, approved.text
        assert approved.json()["approved_definition"]["filter_sql"] == "status = 'completed'"
        await client.post(f"/api/v1/arena/sessions/{code}/host/reask", json={"host_token": host})
        for _ in range(100):
            reask = arena_service.get(code).reask
            if reask and reask.get("status") in {"done", "failed"}:
                break
            await asyncio.sleep(0.05)
        assert reask["status"] == "done"
        from backend.app.knowledge.store import knowledge_store
        revenue = [d for d in knowledge_store.approved_definitions("sqlite_demo") if d["term"] == "revenue"]
        assert revenue and revenue[0]["filter_sql"] == "status = 'completed'"
        assert "jualan" in revenue[0]["synonyms"]


@pytest.mark.asyncio
async def test_eval_summary_is_available_to_the_game():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        summary = (await client.get("/api/v1/arena/eval-summary")).json()
        assert "trap" in summary["datasets"]
        question = summary["datasets"]["trap"]["questions"][0]
        assert {"p", "ok", "expected", "blocked", "clarify", "b0_answered", "b0_correct"} <= set(question)
