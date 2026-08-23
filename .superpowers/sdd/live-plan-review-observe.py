"""Instrumented live mission run for abnormality analysis."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
OBJECTIVE = (
    "Create a tiny hello.html page that shows the text Hello TOVA centered on the page."
)
OUT = Path(__file__).with_name("live-plan-review-observe.json")
ROOT = Path(r"F:\Programming Projects\TOVA-live-hello-observe")


def note(log: list[dict], kind: str, **payload: object) -> None:
    entry = {"t": time.time(), "kind": kind, **payload}
    log.append(entry)
    print(f"[{kind}] {json.dumps(payload, default=str)[:300]}", flush=True)


async def main() -> None:
    log: list[dict] = []
    ROOT.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + 420
    evidence: dict = {
        "objective": OBJECTIVE,
        "project_root": str(ROOT),
        "started_at": time.time(),
        "log": log,
        "abnormalities": [],
    }

    async with httpx.AsyncClient(base_url=BASE, timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        status = (await client.get("/api/runtime/status")).json()
        note(log, "runtime_status", **status)
        if status.get("state") != "connected":
            evidence["abnormalities"].append("runtime_not_connected")
            OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
            return

        project = (
            await client.post("/api/projects", json={"path": str(ROOT), "create": True})
        ).json()
        note(log, "project_opened", id=project["id"], root=project["root"])

        create = await client.post(
            f"/api/projects/{project['id']}/missions",
            json={
                "objective": OBJECTIVE,
                "model_profile_id": status["selected_profile_id"],
                "model": status["selected_model"],
            },
        )
        mission = create.json()
        note(log, "mission_create", status_code=create.status_code, mission=mission)
        if create.status_code != 200:
            evidence["abnormalities"].append(f"mission_create_{create.status_code}")
            OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
            return

        start = await client.post(f"/api/missions/{mission['id']}/start")
        note(log, "mission_start", status_code=start.status_code, body=start.json())

        seen_types: dict[str, int] = {}
        last_seq = 0
        proposed_at: float | None = None
        accepted = False
        staff_before_accept = False
        assembly_before_accept = False

        while time.time() < deadline:
            events = (await client.get(f"/api/missions/{mission['id']}/events")).json()
            for event in events:
                seq = event.get("sequence", 0)
                if seq <= last_seq:
                    continue
                last_seq = seq
                et = event.get("event_type", "")
                seen_types[et] = seen_types.get(et, 0) + 1
                payload = event.get("payload") or {}
                note(
                    log,
                    "event",
                    sequence=seq,
                    event_type=et,
                    staff_id=event.get("staff_id"),
                    payload_keys=sorted(payload.keys()),
                    summary=str(payload.get("summary") or payload.get("interpretation") or "")[:180],
                )

                if et == "mission.plan.proposed":
                    proposed_at = time.time()
                    plan = (await client.get(f"/api/missions/{mission['id']}/plan")).json()
                    note(
                        log,
                        "plan_snapshot",
                        interpretation=(plan.get("interpretation") or "")[:200],
                        summary=(plan.get("mission_summary") or "")[:200],
                        assignments=[
                            {
                                "role": a.get("staff_role"),
                                "name": a.get("display_name"),
                                "rationale": (a.get("rationale") or "")[:160],
                            }
                            for a in plan.get("assignments", [])
                        ],
                    )
                    if not accepted:
                        accept_body = {
                            "interpretation": plan["interpretation"],
                            "assignments": [
                                {
                                    "staff_role": a["staff_role"],
                                    "rationale": a["rationale"],
                                    "objective": a.get("objective"),
                                }
                                for a in plan["assignments"]
                            ],
                        }
                        # Hold briefly to prove gate, then accept.
                        await asyncio.sleep(2)
                        mid_events = (
                            await client.get(f"/api/missions/{mission['id']}/events")
                        ).json()
                        mid_types = {e["event_type"] for e in mid_events}
                        if "staff.assigned" in mid_types and "mission.plan.accepted" not in mid_types:
                            staff_before_accept = True
                            evidence["abnormalities"].append("staff_assigned_before_accept")
                        if (
                            "mission.team.assembly.completed" in mid_types
                            and "mission.plan.accepted" not in mid_types
                        ):
                            assembly_before_accept = True
                            evidence["abnormalities"].append("assembly_completed_before_accept")

                        resp = await client.post(
                            f"/api/missions/{mission['id']}/plan/accept",
                            json=accept_body,
                        )
                        accepted = True
                        note(
                            log,
                            "plan_accept",
                            status_code=resp.status_code,
                            body=resp.json() if resp.status_code < 500 else resp.text[:300],
                        )

                if et == "mission.failed":
                    evidence["abnormalities"].append(
                        f"mission_failed:{payload.get('summary', '')[:200]}"
                    )

                if "chain-of-thought" in json.dumps(payload).lower():
                    evidence["abnormalities"].append(f"cot_leak_in_{et}")

            mission_now = (await client.get(f"/api/missions/{mission['id']}")).json()
            if mission_now.get("status") in {"completed", "failed", "cancelled"}:
                note(log, "mission_terminal", **mission_now)
                evidence["final_status"] = mission_now.get("status")
                break
            await asyncio.sleep(1.5)

        entries = (await client.get(f"/api/projects/{project['id']}/entries")).json()
        evidence["event_counts"] = seen_types
        evidence["entries"] = entries
        evidence["gate"] = {
            "proposed_at": proposed_at,
            "accepted": accepted,
            "staff_before_accept": staff_before_accept,
            "assembly_before_accept": assembly_before_accept,
        }
        evidence["finished_at"] = time.time()
        evidence["duration_seconds"] = evidence["finished_at"] - evidence["started_at"]

        if "mission.plan.proposed" not in seen_types:
            evidence["abnormalities"].append("missing_plan_proposed")
        if accepted and "mission.plan.accepted" not in seen_types:
            evidence["abnormalities"].append("missing_plan_accepted_event")
        if evidence.get("final_status") == "completed" and not any(
            e["name"].endswith(".html") for e in entries if e.get("kind") == "file"
        ):
            evidence["abnormalities"].append("completed_without_html_file")

    OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print("DONE", json.dumps({
        "status": evidence.get("final_status"),
        "duration": round(evidence.get("duration_seconds", 0), 1),
        "events": evidence.get("event_counts"),
        "abnormalities": evidence.get("abnormalities"),
        "entries": [e.get("name") for e in evidence.get("entries", [])],
    }, indent=2), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
