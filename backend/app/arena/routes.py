"""HTTP API for Trust or Bust (host console, big screen and audience phones)."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.app.agent.pipeline import RUN_METADATA_STORE, SlayQLPipeline
from backend.app.arena.deck import build_deck
from backend.app.arena.service import REVENUE_DEFINITIONS, Session, StumpEntry, arena_service
from backend.app.config import settings
from backend.app.knowledge.store import knowledge_store
from backend.app.verification.models import format_value

DEMO_CONNECTION = "sqlite_demo"
RESULTS_DIR = Path(__file__).resolve().parents[2] / "eval" / "results"
_run_slots: Optional[asyncio.Semaphore] = None


def _slots() -> asyncio.Semaphore:
    global _run_slots
    if _run_slots is None:
        _run_slots = asyncio.Semaphore(max(1, settings.MAX_ACTIVE_RUNS))
    return _run_slots


class CreateSessionRequest(BaseModel):
    card_count: int = Field(default=4, ge=2, le=8)


class JoinRequest(BaseModel):
    nickname: str = Field(default="", max_length=24)
    consent: bool = False


class VoteRequest(BaseModel):
    token: str
    value: Optional[str] = Field(default=None, max_length=60)
    confidence: Optional[int] = Field(default=None, ge=1, le=5)
    decision: Optional[str] = Field(default=None, max_length=60)
    penalty: Optional[float] = Field(default=None, ge=0, le=100)
    role: Optional[str] = Field(default=None, max_length=60)
    has_numbers_person: Optional[str] = Field(default=None, max_length=60)
    barrier: Optional[str] = Field(default=None, max_length=60)


class StumpRequest(BaseModel):
    token: str
    question: str = Field(min_length=3, max_length=300)


class HostRequest(BaseModel):
    host_token: str
    entry_id: Optional[str] = None
    definition_id: Optional[str] = None


def _session_or_404(code: str) -> Session:
    session = arena_service.get(code)
    if not session:
        raise HTTPException(status_code=404, detail="No game with that code. Check the code on the screen.")
    return session


def _require_host(session: Session, host_token: str) -> None:
    if not host_token or host_token != session.host_token:
        raise HTTPException(status_code=403, detail="Host token required.")


async def _cards() -> Dict[str, Dict[str, Any]]:
    return {card["id"]: card for card in await build_deck()}


async def _ask(question: str, penalty: Optional[float]) -> Dict[str, Any]:
    """Run one audience question through the full pipeline, a few at a time."""
    async with _slots():
        run = SlayQLPipeline.create_run(
            question, connection_id=DEMO_CONNECTION, owner_id="arena",
            thinking_effort="medium", penalty=penalty, ephemeral=True,
        )
        await SlayQLPipeline._execute_run(run["run_id"])
    metadata = RUN_METADATA_STORE.get(run["run_id"], {})
    result = metadata.get("result") or {}
    verification = result.get("verification") or {}
    rows = result.get("rows") or []
    preview = "; ".join(", ".join(format_value(v) for v in row) for row in rows[:3]) if rows else ""
    return {
        "run_id": run["run_id"],
        "status": "done" if metadata.get("status") == "completed" else "failed",
        "outcome": verification.get("outcome") or ("handoff" if not rows else None),
        "answer": (result.get("answer") or result.get("error") or "")[:600],
        "preview": preview,
        "definitions_used": [d.get("term") for d in verification.get("definitions_used") or []],
    }


def _session_penalty(session: Session) -> float:
    votes = session.votes.get("penalty", {})
    values = sorted(float(v["penalty"]) for v in votes.values() if isinstance(v.get("penalty"), (int, float)))
    return values[len(values) // 2] if values else settings.VERIFY_DEFAULT_PENALTY


def eval_summary() -> Dict[str, Any]:
    """Per-question outcomes from the evaluation, so the game can recompute any threshold."""
    datasets = {}
    for name in ("bird", "trap"):
        path = RESULTS_DIR / f"{name}.json"
        if not path.exists():
            continue
        report = json.loads(path.read_text(encoding="utf-8"))
        test = report["splits"]["test"]
        datasets[name] = {
            "n": test["n"],
            "model": report["model"],
            "commit": report["commit"],
            "evaluated_at": report["evaluated_at"],
            "calibration": report.get("calibration"),
            "configs": {k: test["configs"][k] for k in ("B0", "B3")},
            "questions": [
                {
                    "p": item["B3"]["p"],
                    "ok": item["B3"]["selected_correct"],
                    "expected": item["expected"],
                    "blocked": item["B3"]["blocking"],
                    "clarify": item["B3"]["options"] >= 2,
                    "b0_answered": item["B0"]["outcome"] == "answer",
                    "b0_correct": item["B0"]["correct"],
                }
                for item in report["items"]
                if item["split"] == "test"
            ],
        }
    return {"datasets": datasets}


def build_router(*, require_admin: Callable[[Request], Dict[str, Any]]) -> APIRouter:
    router = APIRouter(prefix="/api/v1/arena")

    @router.get("/eval-summary")
    async def get_eval_summary():
        return await asyncio.to_thread(eval_summary)

    @router.post("/sessions")
    async def create_session(req: CreateSessionRequest, request: Request):
        require_admin(request)
        deck = await build_deck()
        session = arena_service.create(deck, req.card_count)
        return {"code": session.code, "host_token": session.host_token, "steps": session.steps}

    @router.post("/sessions/{code}/join")
    async def join(code: str, req: JoinRequest):
        session = _session_or_404(code)
        participant = arena_service.join(session, req.nickname, req.consent)
        return {"token": participant.token, "nickname": participant.nickname, "condition": participant.condition}

    @router.get("/sessions/{code}/state")
    async def state(code: str, token: str = Query(default=""), host_token: str = Query(default="")):
        session = _session_or_404(code)
        participant = arena_service.participant(session, token) if token else None
        host = bool(host_token) and host_token == session.host_token
        return arena_service.public_state(session, await _cards(), participant=participant, host=host)

    @router.get("/sessions/{code}/stream")
    async def stream(code: str, token: str = Query(default=""), host_token: str = Query(default="")):
        session = _session_or_404(code)
        participant = arena_service.participant(session, token) if token else None
        host = bool(host_token) and host_token == session.host_token
        cards = await _cards()

        async def events():
            last = -1
            while True:
                changed = session.changed
                if session.version != last:
                    last = session.version
                    snapshot = arena_service.public_state(session, cards, participant=participant, host=host)
                    yield f"event: state\ndata: {json.dumps(snapshot, default=str)}\n\n"
                try:
                    await asyncio.wait_for(changed.wait(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"

        return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @router.post("/sessions/{code}/vote")
    async def vote(code: str, req: VoteRequest):
        session = _session_or_404(code)
        participant = arena_service.participant(session, req.token)
        if not participant:
            raise HTTPException(status_code=403, detail="Join the game first.")
        payload = req.model_dump(exclude={"token"}, exclude_none=True)
        try:
            await asyncio.to_thread(arena_service.vote, session, participant, payload)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"status": "recorded"}

    @router.post("/sessions/{code}/stump")
    async def stump(code: str, req: StumpRequest):
        session = _session_or_404(code)
        participant = arena_service.participant(session, req.token)
        if not participant:
            raise HTTPException(status_code=403, detail="Join the game first.")
        if session.steps[session.step_index]["kind"] != "stump":
            raise HTTPException(status_code=409, detail="Questions open during the Stump SlayQL round.")
        if participant.stump_count >= settings.ARENA_MAX_STUMP_PER_PARTICIPANT:
            raise HTTPException(status_code=429, detail="You have used all your questions. Thanks!")
        participant.stump_count += 1
        participant.score += 1
        entry = StumpEntry(id=f"stump_{uuid.uuid4().hex[:8]}", participant_id=participant.id, question=req.question.strip())
        session.stumps.append(entry)
        session.touch()

        async def process() -> None:
            entry.status = "running"
            session.touch()
            try:
                outcome = await _ask(entry.question, _session_penalty(session))
                entry.run_id, entry.status = outcome["run_id"], outcome["status"]
                entry.outcome, entry.answer, entry.preview = outcome["outcome"], outcome["answer"], outcome["preview"]
            except Exception as exc:  # keep the game going if one run fails
                entry.status, entry.answer = "failed", str(exc)[:200]
            session.touch()

        asyncio.create_task(process())
        return {"entry_id": entry.id, "remaining": settings.ARENA_MAX_STUMP_PER_PARTICIPANT - participant.stump_count}

    @router.post("/sessions/{code}/host/{action}")
    async def host_action(code: str, action: str, req: HostRequest):
        session = _session_or_404(code)
        _require_host(session, req.host_token)
        cards = await _cards()
        if action == "next":
            arena_service.move(session, 1)
        elif action == "back":
            arena_service.move(session, -1)
        elif action == "reveal":
            arena_service.reveal(session, cards)
        elif action in {"show-stump", "hide-stump", "confident-miss"}:
            entry = next((e for e in session.stumps if e.id == req.entry_id), None)
            if not entry:
                raise HTTPException(status_code=404, detail="Question not found.")
            if action == "confident-miss" and not entry.confident_miss:
                entry.confident_miss = True
                session.participants[entry.participant_id].score += 5
            else:
                entry.approved_for_screen = action == "show-stump"
            session.touch()
        elif action == "approve-definition":
            chosen = next((d for d in REVENUE_DEFINITIONS if d["id"] == req.definition_id), None)
            if not chosen:
                raise HTTPException(status_code=400, detail="Unknown definition.")
            definition = await asyncio.to_thread(
                knowledge_store.create_definition,
                connection_id=DEMO_CONNECTION, term="revenue",
                synonyms=["sales", "turnover", "jualan", "hasil", "pendapatan"],
                table_name="orders", column_name=chosen["column"], filter_sql=chosen["filter_sql"],
                description=f"{chosen['label']} (agreed live by the Trust or Bust audience).",
                created_by="Trust or Bust audience", approve=True,
            )
            session.approved_definition = {"label": chosen["label"], "version": definition["version"], "filter_sql": chosen["filter_sql"]}
            session.touch()
        elif action == "reask":
            session.reask = {"status": "running", "question": "What is our total revenue?"}
            session.touch()

            async def process() -> None:
                try:
                    outcome = await _ask("What is our total revenue?", _session_penalty(session))
                    session.reask = {"question": "What is our total revenue?", **outcome}
                except Exception as exc:
                    session.reask = {"status": "failed", "answer": str(exc)[:200]}
                session.touch()

            asyncio.create_task(process())
        else:
            raise HTTPException(status_code=400, detail="Unknown host action.")
        return arena_service.public_state(session, cards, host=True)

    @router.get("/sessions/{code}/export.csv")
    async def export(code: str, host_token: str = Query(default="")):
        session = _session_or_404(code)
        _require_host(session, host_token)
        rows = await asyncio.to_thread(arena_service.store.rows, session.id)
        cards = await _cards()
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["participant_id", "condition", "step_id", "kind", "card_correct", "verifier_miss", "response", "confidence", "response_ms", "payload", "created_at"])
        for row in rows:
            payload = json.loads(row["payload"])
            card = cards.get(row["step_id"].removeprefix("card-")) if row["kind"] == "card" else None
            writer.writerow([
                row["participant_id"], row["condition"], row["step_id"], row["kind"],
                card["correct"] if card else "", card["verifier_miss"] if card else "",
                payload.get("value", ""), payload.get("confidence", ""), payload.get("response_ms", ""),
                json.dumps(payload), row["created_at"],
            ])
        return StreamingResponse(
            iter([buffer.getvalue()]), media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="trust-or-bust-{session.code}.csv"'},
        )

    return router
