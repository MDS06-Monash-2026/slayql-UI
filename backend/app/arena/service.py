"""Trust or Bust: live audience sessions for the demo-day game and user study.

Sessions live in memory (one event at a time); every vote and poll answer is
also written to the control database so the study data survives a restart and
can be exported. Participants are anonymous: the export never contains
nicknames, and votes are stored only for participants who gave consent.
"""
from __future__ import annotations

import asyncio
import json
import random
import secrets
import statistics
import string
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import insert, select

from backend.app.control_database import control_database

DECISIONS = ["Set sales targets", "Pay commission", "Order stock", "Report to the bank", "Quote a customer", "Explore ideas"]
REVENUE_DEFINITIONS = [
    {"id": "all", "label": "All orders", "filter_sql": "", "column": None},
    {"id": "not-cancelled", "label": "Exclude cancelled and refunded orders", "filter_sql": "status NOT IN ('cancelled', 'refunded')", "column": "status"},
    {"id": "completed", "label": "Completed orders only", "filter_sql": "status = 'completed'", "column": "status"},
]
EXIT_QUESTIONS = {
    "role": ["Student", "Lecturer or judge", "Industry", "Other"],
    "has_numbers_person": ["Yes", "No", "Not sure"],
    "barrier": ["Data privacy", "Accuracy", "Cost", "Works with AutoCount or SQL Account", "Language", "Other"],
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Participant:
    id: str
    token: str
    nickname: str
    condition: str  # "plain" or "evidence" (study condition for the card rounds)
    consent: bool
    joined_at: str
    score: int = 0
    stump_count: int = 0


@dataclass
class StumpEntry:
    id: str
    participant_id: str
    question: str
    status: str = "queued"  # queued | running | done | failed
    run_id: Optional[str] = None
    outcome: Optional[str] = None
    answer: str = ""
    preview: str = ""
    approved_for_screen: bool = False
    confident_miss: bool = False


@dataclass
class Session:
    id: str
    code: str
    host_token: str
    created_at: str
    steps: List[Dict[str, Any]]
    step_index: int = 0
    revealed: bool = False
    step_opened_at: float = field(default_factory=time.time)
    participants: Dict[str, Participant] = field(default_factory=dict)
    votes: Dict[str, Dict[str, Dict[str, Any]]] = field(default_factory=dict)  # step_id -> participant_id -> vote
    stumps: List[StumpEntry] = field(default_factory=list)
    approved_definition: Optional[Dict[str, Any]] = None
    reask: Optional[Dict[str, Any]] = None
    version: int = 0
    changed: asyncio.Event = field(default_factory=asyncio.Event)

    def touch(self) -> None:
        self.version += 1
        self.changed.set()
        self.changed = asyncio.Event()


def build_steps(deck: List[Dict[str, Any]], card_count: int = 4) -> List[Dict[str, Any]]:
    """Run of show for the stage version (about 13 minutes)."""
    right = [c for c in deck if c["correct"]]
    wrong = [c for c in deck if not c["correct"]]
    rng = random.Random(len(deck))
    half = card_count // 2
    cards = rng.sample(right, min(half, len(right))) + rng.sample(wrong, min(card_count - half, len(wrong)))
    rng.shuffle(cards)
    steps: List[Dict[str, Any]] = [
        {"id": "lobby", "kind": "lobby", "title": "Join Trust or Bust"},
        {"id": "ab", "kind": "ab_poll", "title": "Which tool would you give your sales manager?"},
    ]
    for index, card in enumerate(cards, start=1):
        steps.append({"id": f"card-{card['id']}", "kind": "card", "title": f"Board pack question {index}", "card_id": card["id"]})
    steps += [
        {"id": "penalty", "kind": "penalty", "title": "What is a wrong number worth to you?"},
        {"id": "stump", "kind": "stump", "title": "Stump SlayQL"},
        {"id": "definition", "kind": "definition", "title": "Agree what revenue means"},
        {"id": "results", "kind": "results", "title": "What we measured"},
        {"id": "exit", "kind": "exit_poll", "title": "Before you go"},
    ]
    return steps


class ArenaStore:
    """Persists study responses (votes and polls) to the control database."""

    def __init__(self) -> None:
        self.table = control_database.arena_responses

    def record(self, session: Session, participant: Participant, step: Dict[str, Any], payload: Dict[str, Any]) -> None:
        if not participant.consent:
            return
        with control_database.engine.begin() as conn:
            conn.execute(insert(self.table).values(
                id=f"resp_{uuid.uuid4().hex[:12]}",
                session_id=session.id,
                participant_id=participant.id,
                step_id=step["id"],
                kind=step["kind"],
                condition=participant.condition,
                payload=json.dumps(payload, default=str),
                created_at=_now(),
            ))

    def rows(self, session_id: str) -> List[Dict[str, Any]]:
        with control_database.engine.connect() as conn:
            result = conn.execute(select(self.table).where(self.table.c.session_id == session_id).order_by(self.table.c.created_at))
            return [dict(row) for row in result.mappings()]


class ArenaService:
    def __init__(self) -> None:
        self.sessions: Dict[str, Session] = {}
        self.store = ArenaStore()

    # --- lifecycle -----------------------------------------------------------

    def create(self, deck: List[Dict[str, Any]], card_count: int = 4) -> Session:
        code = "".join(random.choice(string.ascii_uppercase.replace("O", "").replace("I", "")) for _ in range(5))
        while code in self.sessions:
            code = "".join(random.choice(string.ascii_uppercase) for _ in range(5))
        session = Session(
            id=f"arena_{uuid.uuid4().hex[:10]}",
            code=code,
            host_token=secrets.token_urlsafe(24),
            created_at=_now(),
            steps=build_steps(deck, card_count),
        )
        self.sessions[code] = session
        return session

    def get(self, code: str) -> Optional[Session]:
        return self.sessions.get((code or "").upper())

    def join(self, session: Session, nickname: str, consent: bool) -> Participant:
        conditions = [p.condition for p in session.participants.values()]
        # Balanced random assignment: whichever condition has fewer members, ties broken randomly.
        plain, evidence = conditions.count("plain"), conditions.count("evidence")
        condition = "plain" if plain < evidence else "evidence" if evidence < plain else random.choice(["plain", "evidence"])
        participant = Participant(
            id=f"p_{uuid.uuid4().hex[:10]}",
            token=secrets.token_urlsafe(18),
            nickname=(nickname or "").strip()[:24] or f"Player {len(session.participants) + 1}",
            condition=condition,
            consent=bool(consent),
            joined_at=_now(),
        )
        session.participants[participant.id] = participant
        session.touch()
        return participant

    def participant(self, session: Session, token: str) -> Optional[Participant]:
        return next((p for p in session.participants.values() if secrets.compare_digest(p.token, token or "")), None)

    # --- host controls -------------------------------------------------------

    def move(self, session: Session, delta: int) -> None:
        session.step_index = max(0, min(len(session.steps) - 1, session.step_index + delta))
        session.revealed = False
        session.step_opened_at = time.time()
        session.touch()

    def reveal(self, session: Session, card_lookup: Dict[str, Dict[str, Any]]) -> None:
        step = session.steps[session.step_index]
        if session.revealed:
            return
        session.revealed = True
        if step["kind"] == "card":
            card = card_lookup[step["card_id"]]
            for participant_id, vote in session.votes.get(step["id"], {}).items():
                trusted = vote.get("value") == "trust"
                if trusted == card["correct"]:
                    session.participants[participant_id].score += 1
        session.touch()

    # --- participant actions -------------------------------------------------

    def vote(self, session: Session, participant: Participant, payload: Dict[str, Any]) -> None:
        step = session.steps[session.step_index]
        allowed = {"ab_poll", "card", "penalty", "definition", "exit_poll"}
        if step["kind"] not in allowed:
            raise ValueError("There is nothing to vote on right now.")
        if session.revealed:
            raise ValueError("Voting has closed for this question.")
        record = {**payload, "response_ms": int((time.time() - session.step_opened_at) * 1000)}
        session.votes.setdefault(step["id"], {})[participant.id] = record
        self.store.record(session, participant, step, record)
        session.touch()

    # --- views ---------------------------------------------------------------

    def aggregate(self, session: Session, step: Dict[str, Any], card_lookup: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        votes = session.votes.get(step["id"], {})
        kind = step["kind"]
        if kind == "card":
            by_condition: Dict[str, Dict[str, int]] = {"plain": {"trust": 0, "bust": 0}, "evidence": {"trust": 0, "bust": 0}}
            for participant_id, vote in votes.items():
                condition = session.participants[participant_id].condition
                if vote.get("value") in ("trust", "bust"):
                    by_condition[condition][vote["value"]] += 1
            return {"votes": len(votes), "by_condition": by_condition}
        if kind in ("ab_poll", "definition"):
            counts: Dict[str, int] = {}
            for vote in votes.values():
                counts[str(vote.get("value"))] = counts.get(str(vote.get("value")), 0) + 1
            return {"votes": len(votes), "counts": counts}
        if kind == "penalty":
            values = [float(v["penalty"]) for v in votes.values() if isinstance(v.get("penalty"), (int, float))]
            per_decision: Dict[str, List[float]] = {}
            for vote in votes.values():
                if isinstance(vote.get("penalty"), (int, float)):
                    per_decision.setdefault(str(vote.get("decision")), []).append(float(vote["penalty"]))
            return {
                "votes": len(values),
                "median_penalty": statistics.median(values) if values else None,
                "by_decision": {k: statistics.median(v) for k, v in per_decision.items()},
            }
        if kind == "exit_poll":
            tallies: Dict[str, Dict[str, int]] = {key: {} for key in EXIT_QUESTIONS}
            for vote in votes.values():
                for key in EXIT_QUESTIONS:
                    answer = vote.get(key)
                    if answer:
                        tallies[key][answer] = tallies[key].get(answer, 0) + 1
            return {"votes": len(votes), "tallies": tallies}
        return {}

    def detection_summary(self, session: Session, card_lookup: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Share of wrong cards caught and right cards wrongly rejected, per condition."""
        summary: Dict[str, Dict[str, float]] = {}
        for condition in ("plain", "evidence"):
            caught = wrong_seen = false_alarms = right_seen = 0
            for step in session.steps:
                if step["kind"] != "card" or step["id"] not in session.votes:
                    continue
                card = card_lookup[step["card_id"]]
                for participant_id, vote in session.votes[step["id"]].items():
                    if session.participants[participant_id].condition != condition:
                        continue
                    if card["correct"]:
                        right_seen += 1
                        false_alarms += vote.get("value") == "bust"
                    else:
                        wrong_seen += 1
                        caught += vote.get("value") == "bust"
            summary[condition] = {
                "wrong_answers_seen": wrong_seen,
                "caught_rate": round(caught / wrong_seen, 3) if wrong_seen else None,
                "right_answers_seen": right_seen,
                "false_alarm_rate": round(false_alarms / right_seen, 3) if right_seen else None,
            }
        return summary

    def public_state(self, session: Session, card_lookup: Dict[str, Dict[str, Any]], participant: Optional[Participant] = None, host: bool = False) -> Dict[str, Any]:
        step = session.steps[session.step_index]
        view: Dict[str, Any] = {
            "code": session.code,
            "version": session.version,
            "step_index": session.step_index,
            "step_count": len(session.steps),
            "step": step,
            "revealed": session.revealed,
            "participants": len(session.participants),
            "aggregate": self.aggregate(session, step, card_lookup) if (session.revealed or host or step["kind"] in ("penalty", "definition")) else {"votes": len(session.votes.get(step["id"], {}))},
            "leaderboard": sorted(
                ({"nickname": p.nickname, "score": p.score} for p in session.participants.values()),
                key=lambda row: -row["score"],
            )[:10],
            "decisions": DECISIONS,
            "definitions": REVENUE_DEFINITIONS,
            "exit_questions": EXIT_QUESTIONS,
            "approved_definition": session.approved_definition,
            "reask": session.reask,
            "wall": [self._stump_view(entry) for entry in session.stumps if entry.approved_for_screen][-12:],
        }
        if step["kind"] == "card":
            card = card_lookup[step["card_id"]]
            view["card"] = {"id": card["id"], "question": card["question"], "answer": card["answer"]}
            if session.revealed:
                view["card"].update({
                    "correct": card["correct"],
                    "explanation": card["explanation"],
                    "evidence": card["evidence"],
                    "verifier_miss": card["verifier_miss"],
                })
            elif participant is not None and participant.condition == "evidence":
                view["card"]["evidence"] = card["evidence"]
            elif host:
                view["card"]["evidence"] = card["evidence"]
        if step["kind"] == "results" or host:
            view["detection"] = self.detection_summary(session, card_lookup)
        if participant is not None:
            view["me"] = {
                "nickname": participant.nickname,
                "condition": participant.condition,
                "score": participant.score,
                "vote": session.votes.get(step["id"], {}).get(participant.id),
                "stumps": [self._stump_view(e) for e in session.stumps if e.participant_id == participant.id],
                "stumps_left": None,
            }
        if host:
            view["host"] = {
                "stumps": [{**self._stump_view(e), "nickname": session.participants[e.participant_id].nickname} for e in session.stumps],
                "consenting": sum(1 for p in session.participants.values() if p.consent),
                "conditions": {c: sum(1 for p in session.participants.values() if p.condition == c) for c in ("plain", "evidence")},
            }
        return view

    @staticmethod
    def _stump_view(entry: StumpEntry) -> Dict[str, Any]:
        return {
            "id": entry.id,
            "question": entry.question,
            "status": entry.status,
            "outcome": entry.outcome,
            "answer": entry.answer,
            "preview": entry.preview,
            "confident_miss": entry.confident_miss,
            "approved_for_screen": entry.approved_for_screen,
        }


arena_service = ArenaService()
