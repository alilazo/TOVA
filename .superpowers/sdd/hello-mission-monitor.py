from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
MISSION_ID = Path(__file__).with_name("hello-mission-id.txt").read_text(encoding="utf-8").strip()
OUT = Path(__file__).with_name("hello-mission-monitor.json")
DEADLINE = time.time() + 420


async def main() -> None:
    accepted: set[str] = set()
    evidence: dict = {"mission_id": MISSION_ID, "accepted": [], "ticks": []}
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        while time.time() < DEADLINE:
            mission = (await client.get(f"/api/missions/{MISSION_ID}")).json()
            events = (await client.get(f"/api/missions/{MISSION_ID}/events")).json()
            counts: dict[str, int] = {}
            for event in events:
                et = event.get("event_type", "")
                counts[et] = counts.get(et, 0) + 1
            approvals = (await client.get(f"/api/missions/{MISSION_ID}/approvals")).json()
            for approval in approvals:
                if approval.get("status") == "pending" and approval["id"] not in accepted:
                    response = await client.post(f"/api/approvals/{approval['id']}/accept")
                    accepted.add(approval["id"])
                    evidence["accepted"].append(response.json())
                    print(f"ACCEPTED {approval['id']}", flush=True)
            entries = (
                await client.get(f"/api/projects/{mission['project_id']}/entries")
            ).json()
            tick = {
                "status": mission.get("status"),
                "events": counts,
                "approvals": len(approvals),
                "entries": [item.get("name") for item in entries],
            }
            evidence["ticks"].append(tick)
            evidence["latest"] = tick
            print(f"TICK {tick}", flush=True)
            if mission.get("status") in {
                "completed",
                "failed",
                "cancelled",
                "blocked",
                "awaiting_confirmation",
            }:
                break
            await asyncio.sleep(3)
    OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(f"DONE {json.dumps(evidence.get('latest'), indent=2)}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
