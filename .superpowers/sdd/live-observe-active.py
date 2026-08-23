"""Instrumented live mission against the currently active project."""

from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
OBJECTIVE = (
    "Create a tiny hello.html page that shows the text Hello TOVA centered on the page."
)
OUT = Path(__file__).with_name("live-observe-active.json")


def note(log: list[dict], kind: str, **payload: object) -> None:
    entry = {"t": time.time(), "kind": kind, **payload}
    log.append(entry)
    print(f"[{kind}] {json.dumps(payload, default=str)[:320]}", flush=True)


def check_payload_abnormalities(et: str, payload: dict) -> list[str]:
    found: list[str] = []
    blob = json.dumps(payload)
    lowered = blob.lower()
    if "chain-of-thought" in lowered or '"reasoning:"' in lowered:
        found.append(f"cot_leak_in_{et}")
    if et == "staff.action.completed":
        summary = str(payload.get("summary") or "")
        if summary.strip().startswith("```"):
            found.append("fenced_summary_in_staff_action_completed")
        if "```json" in summary.lower():
            found.append("json_fence_in_staff_action_completed")
    return found


async def main() -> None:
    log: list[dict] = []
    deadline = time.time() + 420
    evidence: dict = {
        "objective": OBJECTIVE,
        "started_at": time.time(),
        "log": log,
        "abnormalities": [],
    }

    async with httpx.AsyncClient(base_url=BASE, timeout=httpx.Timeout(90.0, connect=10.0)) as client:
        status_resp = await client.get("/api/runtime/status")
        status = status_resp.json()
        note(log, "runtime_status", status_code=status_resp.status_code, **status)
        if status_resp.status_code != 200 or status.get("state") != "connected":
            evidence["abnormalities"].append("runtime_not_connected")
            OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
            print("DONE", json.dumps({"abnormalities": evidence["abnormalities"]}, indent=2))
            return

        project = (await client.get("/api/projects/active")).json()
        if not project:
            evidence["abnormalities"].append("no_active_project")
            OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
            print("DONE", json.dumps({"abnormalities": evidence["abnormalities"]}, indent=2))
            return
        note(log, "active_project", **project)
        evidence["project"] = project
        root = Path(project["root"])

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
        accepted = False
        staff_before_accept = False

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
                    summary=str(
                        payload.get("summary")
                        or payload.get("interpretation")
                        or payload.get("mission_summary")
                        or ""
                    )[:200],
                )
                for item in check_payload_abnormalities(et, payload):
                    if item not in evidence["abnormalities"]:
                        evidence["abnormalities"].append(item)
                        note(log, "abnormality", code=item)

                if et == "mission.plan.proposed" and not accepted:
                    plan = (await client.get(f"/api/missions/{mission['id']}/plan")).json()
                    note(
                        log,
                        "plan_snapshot",
                        interpretation=(plan.get("interpretation") or "")[:220],
                        summary=(plan.get("mission_summary") or "")[:220],
                        assignments=[
                            {
                                "role": a.get("staff_role"),
                                "name": a.get("display_name"),
                                "rationale": (a.get("rationale") or "")[:160],
                            }
                            for a in plan.get("assignments", [])
                        ],
                    )
                    await asyncio.sleep(2)
                    mid = (await client.get(f"/api/missions/{mission['id']}/events")).json()
                    mid_types = {e["event_type"] for e in mid}
                    if "staff.assigned" in mid_types and "mission.plan.accepted" not in mid_types:
                        staff_before_accept = True
                        evidence["abnormalities"].append("staff_assigned_before_accept")
                    if (
                        "mission.team.assembly.completed" in mid_types
                        and "mission.plan.accepted" not in mid_types
                    ):
                        evidence["abnormalities"].append("assembly_completed_before_accept")

                    resp = await client.post(
                        f"/api/missions/{mission['id']}/plan/accept",
                        json={
                            "interpretation": plan["interpretation"],
                            "assignments": [
                                {
                                    "staff_role": a["staff_role"],
                                    "rationale": a["rationale"],
                                    "objective": a.get("objective"),
                                }
                                for a in plan["assignments"]
                            ],
                        },
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
                        f"mission_failed:{str(payload.get('summary', ''))[:200]}"
                    )

            approvals = (await client.get(f"/api/missions/{mission['id']}/approvals")).json()
            for approval in approvals:
                if approval.get("status") != "pending":
                    continue
                accepted_resp = await client.post(f"/api/approvals/{approval['id']}/accept")
                note(
                    log,
                    "approval_accept",
                    approval_id=approval["id"],
                    status_code=accepted_resp.status_code,
                    executable=(approval.get("request") or {}).get("executable"),
                )

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
            "accepted": accepted,
            "staff_before_accept": staff_before_accept,
        }
        evidence["finished_at"] = time.time()
        evidence["duration_seconds"] = evidence["finished_at"] - evidence["started_at"]

        if "mission.plan.proposed" not in seen_types:
            evidence["abnormalities"].append("missing_plan_proposed")
        if accepted and "mission.plan.accepted" not in seen_types:
            evidence["abnormalities"].append("missing_plan_accepted_event")

        html_path = root / "hello.html"
        if evidence.get("final_status") == "completed":
            if not html_path.exists():
                evidence["abnormalities"].append("completed_without_hello_html")
            else:
                content = html_path.read_text(encoding="utf-8", errors="replace")
                evidence["hello_html_preview"] = content[:500]
                if "Hello TOVA" not in content:
                    evidence["abnormalities"].append("missing_exact_Hello_TOVA_text")
                if not re.search(r"display\s*:\s*flex|text-align\s*:\s*center", content, re.I):
                    # soft signal only if clearly not centered somehow; keep informational
                    if "center" not in content.lower():
                        evidence["abnormalities"].append("no_obvious_centering_styles")

    OUT.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    print(
        "DONE",
        json.dumps(
            {
                "status": evidence.get("final_status"),
                "duration": round(evidence.get("duration_seconds", 0), 1),
                "events": evidence.get("event_counts"),
                "abnormalities": evidence.get("abnormalities"),
                "entries": [e.get("name") for e in evidence.get("entries", [])],
                "out": str(OUT),
            },
            indent=2,
        ),
        flush=True,
    )


if __name__ == "__main__":
    asyncio.run(main())
