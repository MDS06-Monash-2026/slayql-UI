"""Record real chat runs on the shared demo database as fast demo replays.

Run against a local API (never production), e.g.:
    python -m backend.eval.record_demo_cases --base http://127.0.0.1:8765

Each case is asked for real; its full event stream and final result are saved to
backend/app/agent/demo_cases/<id>.json. A case is kept only if it ends with the outcome it is meant
to show, so the demo always displays the intended state.
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime
from pathlib import Path

import httpx

OUT = Path(__file__).resolve().parents[1] / "app" / "agent" / "demo_cases"

CASES = [
    {"id": "checks-passed", "order": 1, "label": "Checks passed", "outcome": "confident",
     "question": "How many orders were placed in September 2026?"},
    {"id": "bahasa", "order": 2, "label": "Bahasa Malaysia", "outcome": "confident",
     "question": "Gudang mana yang penggunaannya melebihi 80 peratus?"},
    {"id": "caveat", "order": 3, "label": "Answer with a caveat", "outcome": "caveat",
     "question": "Berapa jumlah hasil daripada pesanan yang telah selesai?"},
    {"id": "needs-input", "order": 4, "label": "Needs your input", "outcome": "clarify",
     "question": "What were total sales for Enterprise customers?"},
    {"id": "to-analyst", "order": 5, "label": "Sent to an analyst", "outcome": "handoff",
     "question": "Which salesperson closed the most deals in September 2026?"},
]


def parse_sse(lines):
    event = {}
    for raw in lines:
        line = raw.rstrip("\r")
        if not line:
            if event.get("data"):
                yield event.get("event"), json.loads(event["data"])
            event = {}
        elif line.startswith("event:"):
            event["event"] = line[6:].strip()
        elif line.startswith("data:"):
            event["data"] = event.get("data", "") + line[5:].strip()


def record(client: httpx.Client, case: dict, connection_id: str) -> dict | None:
    events, result, start = [], None, None
    with client.stream("POST", "/api/v1/agent-runs/stream", timeout=600, json={
        "question": case["question"], "connection_id": connection_id, "thinking_effort": "medium",
    }) as response:
        response.raise_for_status()
        for name, data in parse_sse(response.iter_lines()):
            kind = data.get("type") or name
            if kind == "run.created":
                continue
            at = datetime.fromisoformat(data["occurred_at"]).timestamp()
            start = start if start is not None else at
            events.append({"t": round(at - start, 3), "stage": data.get("stage"), "type": kind, "payload": data.get("payload") or {}})
            if kind in {"run.completed", "run.failed", "run.cancelled"}:
                result = data.get("payload") or {}
                break
    if not result or result.get("status") != "success":
        print(f"  {case['id']}: run did not succeed ({(result or {}).get('error')})")
        return None
    outcome = (result.get("verification") or {}).get("outcome")
    if outcome != case["outcome"]:
        print(f"  {case['id']}: got outcome {outcome!r}, wanted {case['outcome']!r}; not saved")
        return None
    return {**case, "connection_id": connection_id, "recorded_at": datetime.now().isoformat(timespec="seconds"),
            "events": events, "result": result}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://127.0.0.1:8765")
    parser.add_argument("--connection", default="sqlite_demo")
    parser.add_argument("--only", nargs="*")
    args = parser.parse_args()
    if not args.base.startswith(("http://127.0.0.1", "http://localhost")):
        raise SystemExit("Record against a local API only.")
    OUT.mkdir(parents=True, exist_ok=True)
    with httpx.Client(base_url=args.base) as client:
        session = client.post("/api/v1/auth/login", json={"is_reviewer": True}).json()
        client.headers["Authorization"] = f"Bearer {session['token']}"
        for case in CASES:
            if args.only and case["id"] not in args.only:
                continue
            started = time.time()
            saved = record(client, case, args.connection)
            if saved:
                (OUT / f"{case['id']}.json").write_text(json.dumps(saved, ensure_ascii=False), encoding="utf-8")
                print(f"  {case['id']}: saved ({len(saved['events'])} events, {time.time() - started:.0f}s live)")


if __name__ == "__main__":
    main()
