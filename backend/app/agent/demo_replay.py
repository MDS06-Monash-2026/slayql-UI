"""Fast demo replays of recorded chat runs, for presentations.

A demo case is a real run recorded on the shared demo database (`demo_cases/*.json`, made by
`backend/eval/record_demo_cases.py`). Replaying one creates a normal run (real run id, stored like
any other run) and streams the recorded events in a few seconds instead of calling the language
model. Because the run is stored with its result, everything after it works as usual: choosing a
clarify option, saving a definition, the analyst review queue and editing the SQL all run for real.

Only used when a request names a `demo_case`; normal questions never reach this module.
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

CASES_DIR = Path(__file__).parent / "demo_cases"
REPLAY_SECONDS = 4.0  # whole replay, start to answer
MIN_SLEEP = 0.012     # merge smaller gaps so thousands of tiny sleeps don't slow the replay


def _load() -> Dict[str, Dict[str, Any]]:
    cases: Dict[str, Dict[str, Any]] = {}
    if not CASES_DIR.exists():
        return cases
    for path in sorted(CASES_DIR.glob("*.json")):
        try:
            case = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            logger.warning("Skipping unreadable demo case %s", path.name)
            continue
        if case.get("id") and case.get("events") and isinstance(case.get("result"), dict):
            cases[case["id"]] = case
    return cases


CASES = _load()


def list_cases(connection_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Public summary of the cases recorded on a data source (no events or rows)."""
    return [
        {
            "id": case["id"],
            "label": case.get("label") or case["id"],
            "question": case["question"],
            "outcome": case.get("outcome"),
            "order": case.get("order", 99),
        }
        for case in sorted(CASES.values(), key=lambda c: (c.get("order", 99), c["id"]))
        if connection_id is None or case.get("connection_id") == connection_id
    ]


def get_case(case_id: Optional[str]) -> Optional[Dict[str, Any]]:
    return CASES.get(case_id or "")


def _schedule(events: List[Dict[str, Any]], total: float) -> List[float]:
    """Per-event delays (seconds) that keep the recorded rhythm but fit inside `total`."""
    offsets = [float(e.get("t", 0.0)) for e in events]
    span = (offsets[-1] - offsets[0]) if offsets else 0.0
    scale = min(1.0, total / span) if span > 0 else 0.0
    delays, previous = [], offsets[0] if offsets else 0.0
    for offset in offsets:
        delays.append(max(0.0, (offset - previous) * scale))
        previous = offset
    return delays


async def replay(run_id: str, case: Dict[str, Any], seconds: float = REPLAY_SECONDS) -> None:
    """Stream a recorded case into `run_id`, then store and persist its result like a real run."""
    from backend.app.agent.pipeline import RUN_METADATA_STORE, SlayQLPipeline

    metadata = RUN_METADATA_STORE[run_id]
    metadata["status"] = "running"
    try:
        events = [e for e in case["events"] if e.get("type") not in {"run.completed", "run.created"}]
        pending = 0.0
        for event, delay in zip(events, _schedule(events, seconds)):
            pending += delay
            if pending >= MIN_SLEEP:
                await asyncio.sleep(pending)
                pending = 0.0
            SlayQLPipeline._emit(run_id, event.get("stage") or "replay", event["type"], event.get("payload") or {})

        result = dict(case["result"])
        result["demo_replay"] = case["id"]
        verification = result.get("verification") or {}
        if verification.get("outcome") in {"handoff", "clarify"}:
            # Same as a live run: the analyst gets the question, with its evidence, in the review queue.
            await SlayQLPipeline._queue_for_review(
                run_id, question=case["question"], sql=result.get("sql") or "", verification=verification,
            )
        metadata["status"] = "completed"
        metadata["result"] = result
        SlayQLPipeline._emit(run_id, "completion", "run.completed", result)
        SlayQLPipeline._schedule_assistant_persistence(
            run_id,
            result.get("answer") or "",
            {**result, "stream_events": SlayQLPipeline._event_trace(run_id)},
            sql=result.get("sql"),
        )
    except asyncio.CancelledError:
        if metadata.get("status") not in {"completed", "failed", "cancelled"}:
            metadata["status"] = "cancelled"
            payload = {"status": "cancelled", "answer": "This run was cancelled before it completed.", "reportable": False}
            metadata["result"] = payload
            SlayQLPipeline._emit(run_id, "cancelled", "run.cancelled", payload)
    except Exception:
        logger.exception("Demo replay %s failed", case.get("id"))
        if metadata.get("status") not in {"completed", "failed", "cancelled"}:
            SlayQLPipeline._fail(run_id, "completion", "The demo replay failed.")


def start(run_id: str, case: Dict[str, Any]) -> None:
    """Start the replay in place of the live pipeline for this run."""
    from backend.app.agent.pipeline import RUN_TASKS

    RUN_TASKS[run_id] = asyncio.create_task(replay(run_id, case))
