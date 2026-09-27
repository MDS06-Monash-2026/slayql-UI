"""Rehearse a full Trust or Bust game with simulated phones.

Every player holds the live event stream open, as a real phone does, and votes
in each round while a host steps through the whole game. It reports how long a
host action takes to reach every phone, vote latency, and any errors.

Usage (local API):
  python -m backend.eval.arena_load_test --base http://127.0.0.1:8765 --players 50
  python -m backend.eval.arena_load_test --base https://your-site --players 50 --stump 2
--stump asks that many real questions in the Stump round (each is a paid model call).
Point it at production only on purpose: it signs in as the demo reviewer and
creates a game session there.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import statistics
import time
from typing import Any, Dict, List, Optional

import httpx

STUMP_QUESTIONS = ["Which warehouse is the busiest?", "Berapa jumlah pesanan tahun 2025?", "What is the average order value?"]


class Phone:
    def __init__(self, index: int) -> None:
        self.index = index
        self.token = ""
        self.condition = ""
        self.version = -1
        self.step_id = ""
        self.seen_at: Dict[int, float] = {}
        self.errors: List[str] = []

    async def listen(self, client: httpx.AsyncClient, base: str, code: str, stop: asyncio.Event) -> None:
        try:
            async with client.stream("GET", f"{base}/api/v1/arena/sessions/{code}/stream", params={"token": self.token}, timeout=None) as response:
                async for line in response.aiter_lines():
                    if stop.is_set():
                        return
                    if line.startswith("data: "):
                        state = json.loads(line[6:])
                        self.version = state.get("version", self.version)
                        self.step_id = (state.get("step") or {}).get("id", self.step_id)
                        self.seen_at.setdefault(self.version, time.perf_counter())
        except Exception as error:  # pragma: no cover - reported, not raised
            if not stop.is_set():
                self.errors.append(f"stream: {error}")


def ballot(kind: str, rng: random.Random) -> Optional[Dict[str, Any]]:
    if kind == "card":
        return {"value": rng.choice(["trust", "bust"]), "confidence": rng.randint(1, 5)}
    if kind == "ab_poll":
        return {"value": rng.choice(["A", "B"])}
    if kind == "penalty":
        return {"decision": rng.choice(["Set sales targets", "Pay commission", "Order stock"]), "penalty": rng.choice([1, 2, 4, 9, 19])}
    if kind == "definition":
        return {"value": rng.choice(["all", "not-cancelled", "completed"])}
    if kind == "exit_poll":
        return {"role": rng.choice(["Student", "Industry"]), "has_numbers_person": rng.choice(["Yes", "No"]), "barrier": rng.choice(["Accuracy", "Cost"])}
    return None


def pct(values: List[float], q: float) -> float:
    values = sorted(values)
    return values[min(len(values) - 1, int(q * len(values)))] if values else float("nan")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base", default="http://127.0.0.1:8765")
    parser.add_argument("--players", type=int, default=50)
    parser.add_argument("--cards", type=int, default=4)
    parser.add_argument("--stump", type=int, default=0)
    args = parser.parse_args()
    rng = random.Random(7)
    limits = httpx.Limits(max_connections=args.players * 2 + 20, max_keepalive_connections=args.players * 2 + 20)
    async with httpx.AsyncClient(timeout=30, limits=limits) as client:
        session = (await client.post(f"{args.base}/api/v1/auth/login", json={"is_reviewer": True})).json()
        headers = {"Authorization": f"Bearer {session['token']}"}
        created = await client.post(f"{args.base}/api/v1/arena/sessions", json={"card_count": args.cards}, headers=headers)
        created.raise_for_status()
        game = created.json()
        code, host_token, steps = game["code"], game["host_token"], game["steps"]
        print(f"game {code}: {len(steps)} steps, {args.players} phones")

        phones = [Phone(i) for i in range(args.players)]
        started = time.perf_counter()

        async def join(phone: Phone) -> None:
            response = await client.post(f"{args.base}/api/v1/arena/sessions/{code}/join", json={"nickname": f"Phone {phone.index}", "consent": phone.index % 3 != 0})
            response.raise_for_status()
            joined = response.json()
            phone.token, phone.condition = joined["token"], joined["condition"]

        await asyncio.gather(*(join(p) for p in phones))
        print(f"all joined in {time.perf_counter() - started:.2f}s; conditions: "
              f"{sum(p.condition == 'evidence' for p in phones)} evidence / {sum(p.condition == 'plain' for p in phones)} plain")
        stop = asyncio.Event()
        listeners = [asyncio.create_task(p.listen(client, args.base, code, stop)) for p in phones]
        await asyncio.sleep(2)

        propagation: List[float] = []
        vote_latency: List[float] = []
        errors: List[str] = []

        async def host(action: str, **extra: Any) -> Dict[str, Any]:
            sent = time.perf_counter()
            response = await client.post(f"{args.base}/api/v1/arena/sessions/{code}/host/{action}", json={"host_token": host_token, **extra})
            if response.status_code != 200:
                errors.append(f"host {action}: {response.status_code} {response.text[:120]}")
                return {}
            state = response.json()
            version = state.get("version")
            deadline = time.time() + 10
            while time.time() < deadline and not all(v >= version for v in (p.version for p in phones)):
                await asyncio.sleep(0.02)
            late = [p.index for p in phones if p.version < version]
            if late:
                errors.append(f"{len(late)} phones never saw {action} (version {version})")
            reached = [p.seen_at.get(version) for p in phones if p.seen_at.get(version)]
            if reached:
                propagation.append(max(reached) - sent)
            return state

        async def vote(phone: Phone, payload: Dict[str, Any]) -> None:
            sent = time.perf_counter()
            response = await client.post(f"{args.base}/api/v1/arena/sessions/{code}/vote", json={"token": phone.token, **payload})
            vote_latency.append(time.perf_counter() - sent)
            if response.status_code != 200:
                errors.append(f"vote {response.status_code}: {response.text[:100]}")

        for index, step in enumerate(steps):
            if index:
                await host("next")
            kind = step["kind"]
            payloads = [(p, ballot(kind, rng)) for p in phones]
            if any(b for _, b in payloads):
                await asyncio.gather(*(vote(p, b) for p, b in payloads if b))
            if kind == "card":
                await host("reveal")
            if kind == "stump" and args.stump:
                for question in STUMP_QUESTIONS[: args.stump]:
                    response = await client.post(f"{args.base}/api/v1/arena/sessions/{code}/stump", json={"token": phones[0].token, "question": question})
                    if response.status_code != 200:
                        errors.append(f"stump {response.status_code}: {response.text[:100]}")
                await asyncio.sleep(40)
            if kind == "definition":
                await host("approve-definition", definition_id="completed")
                await host("reask")
                await asyncio.sleep(25)
            print(f"  step {index + 1:>2}/{len(steps)} {kind:<11} ok ({len(errors)} errors so far)")

        export = await client.get(f"{args.base}/api/v1/arena/sessions/{code}/export.csv", params={"host_token": host_token})
        rows = max(0, export.text.count("\n") - 1) if export.status_code == 200 else 0
        stop.set()
        for task in listeners:
            task.cancel()
        errors += [e for p in phones for e in p.errors]

    print(f"\nstate reached every phone: p50 {statistics.median(propagation) * 1000:.0f} ms, p95 {pct(propagation, 0.95) * 1000:.0f} ms, max {max(propagation) * 1000:.0f} ms")
    print(f"vote latency: p50 {statistics.median(vote_latency) * 1000:.0f} ms, p95 {pct(vote_latency, 0.95) * 1000:.0f} ms ({len(vote_latency)} votes)")
    print(f"study CSV rows: {rows}; errors: {len(errors)}")
    for error in errors[:10]:
        print("  -", error)


if __name__ == "__main__":
    asyncio.run(main())
