from __future__ import annotations

import asyncio
import json
import tempfile
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
OBJECTIVE = (
    "Create a small typed application with a README and tests. "
    "Use observable repository tools, request approval before commands, "
    "and finish only after verification."
)
DEADLINE_SECONDS = 180
OUT = Path(__file__).with_name("live-task-9-smoke.json")


async def main() -> None:
    evidence: dict = {"started_at": time.time()}
    root = Path(tempfile.gettempdir()) / f"tova-live-smoke-{int(time.time())}"
    root.mkdir(parents=True, exist_ok=True)
    evidence["project_root"] = str(root)
    print(f"ROOT {root}", flush=True)

    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(base_url=BASE, timeout=timeout) as client:
        status = (await client.get("/api/runtime/status")).json()
        evidence["runtime_status"] = status
        print(f"STATUS {status}", flush=True)
        if status.get("state") != "connected":
            OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
            print("BLOCKED: runtime not connected", flush=True)
            return

        project = (
            await client.post("/api/projects", json={"path": str(root), "create": True})
        ).json()
        evidence["project"] = project
        print(f"PROJECT {project['id']}", flush=True)

        print("CREATE_MISSION...", flush=True)
        mission_resp = await client.post(
            f"/api/projects/{project['id']}/missions",
            json={
                "objective": OBJECTIVE,
                "model_profile_id": status["selected_profile_id"],
                "model": status["selected_model"],
            },
        )
        print(f"CREATE_STATUS {mission_resp.status_code}", flush=True)
        print(mission_resp.text[:500], flush=True)
        mission = mission_resp.json()
        evidence["mission_create_status"] = mission_resp.status_code
        evidence["mission"] = mission
        if mission_resp.status_code != 200:
            OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
            return

        print("START...", flush=True)
        started = await client.post(f"/api/missions/{mission['id']}/start")
        print(f"START_STATUS {started.status_code} {started.text[:300]}", flush=True)
        evidence["mission_start_status"] = started.status_code
        evidence["mission_started"] = started.json()

        seen: dict[str, int] = {}
        approvals_seen: list[dict] = []
        accepted: list[dict] = []
        deadline = time.time() + DEADLINE_SECONDS
        mission_now = evidence["mission_started"]
        while time.time() < deadline:
            events = (await client.get(f"/api/missions/{mission['id']}/events")).json()
            seen = {}
            for event in events:
                et = event.get("event_type", "")
                seen[et] = seen.get(et, 0) + 1

            approvals = (
                await client.get(f"/api/missions/{mission['id']}/approvals")
            ).json()
            for approval in approvals:
                if approval["id"] not in {item["id"] for item in approvals_seen}:
                    approvals_seen.append(approval)
                    print(
                        f"APPROVAL {approval.get('status')} {approval['id']}",
                        flush=True,
                    )
                if approval.get("status") == "pending":
                    accepted_resp = await client.post(
                        f"/api/approvals/{approval['id']}/accept"
                    )
                    accepted.append(accepted_resp.json())
                    print(f"ACCEPTED {approval['id']}", flush=True)

            mission_now = (await client.get(f"/api/missions/{mission['id']}")).json()
            print(
                f"TICK {mission_now.get('status')} {seen} approvals={len(approvals_seen)}",
                flush=True,
            )
            evidence["mission_latest"] = mission_now
            evidence["event_counts"] = seen
            evidence["approvals"] = approvals_seen
            evidence["accepted_approvals"] = accepted
            if mission_now.get("status") in {
                "completed",
                "failed",
                "cancelled",
                "blocked",
                "awaiting_confirmation",
            }:
                break
            await asyncio.sleep(3)

        entries = (await client.get(f"/api/projects/{project['id']}/entries")).json()
        evidence["project_entries"] = entries
        evidence["finished_at"] = time.time()
        evidence["duration_seconds"] = evidence["finished_at"] - evidence["started_at"]
        evidence["checks"] = {
            "runtime_connected": status.get("state") == "connected"
            and bool(status.get("selected_model")),
            "model_request_events": any(k.startswith("model.request") for k in seen),
            "staff_assigned": "staff.assigned" in seen,
            "file_events": any(k.startswith("staff.file.") for k in seen),
            "approvals_gated": len(approvals_seen) > 0,
            "terminal_status": mission_now.get("status")
            in {
                "completed",
                "failed",
                "cancelled",
                "blocked",
                "awaiting_confirmation",
            },
        }

    OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(
        "DONE "
        + json.dumps(
            {
                "status": mission_now.get("status"),
                "checks": evidence["checks"],
                "events": seen,
                "approvals": len(approvals_seen),
                "entries": len(entries),
                "out": str(OUT),
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    asyncio.run(main())
