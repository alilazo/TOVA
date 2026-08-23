from __future__ import annotations

import json
import os
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

BASE = os.environ.get("TOVA_API_BASE", "http://127.0.0.1:8000").rstrip("/")
OUT = Path(
    os.environ.get(
        "TOVA_SMOKE_OUT",
        str(Path(tempfile.gettempdir()) / "tova-mvp-smoke" / "last-mission.json"),
    )
)
PROJECT_ROOT = os.environ.get("TOVA_SMOKE_PROJECT_ROOT", "").strip()
PROMPT = os.environ.get("TOVA_SMOKE_PROMPT", "").strip()


def req(method: str, path: str, body: dict[str, object] | None = None) -> Any:
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"} if body is not None else {}
    request = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            raw = response.read().decode()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(f"{method} {path} -> {exc.code}: {detail[:800]}") from exc
    if not raw:
        return None
    return json.loads(raw)



def main() -> None:
    status = req("GET", "/api/runtime/status")
    print("runtime", status.get("state"), status.get("selected_model"))
    if PROJECT_ROOT:
        project = req(
            "POST",
            "/api/projects",
            {"path": PROJECT_ROOT, "create": True},
        )
        prompt = PROMPT or "Write a short README.md that says hello from TOVA."
    else:
        project = req("POST", "/api/projects/sample")
        prompt = PROMPT or str(project["starter_objective"])
    print("project", project.get("id"), project.get("root"))
    session = req(
        "POST",
        f"/api/projects/{project['id']}/mission-sessions",
        {
            "prompt": prompt,
            "model_profile_id": status["selected_profile_id"],
            "model": status["selected_model"],
        },
    )
    mission_id = str(session["active_mission_id"])
    print("session", session.get("id"), "mission", mission_id)
    started = req("POST", f"/api/missions/{mission_id}/start")
    print("started", started.get("status"))
    accepted = False
    approved: set[str] = set()
    terminal: dict[str, object] | None = None
    started_at = time.time()
    timeout_s = int(os.environ.get("TOVA_SMOKE_TIMEOUT", "900"))
    while time.time() - started_at < timeout_s:
        events = req("GET", f"/api/missions/{mission_id}/events")
        types = [str(event["event_type"]) for event in events]
        mission = req("GET", f"/api/missions/{mission_id}")
        print("status", mission.get("status"), "events", len(types), types[-5:])
        if not accepted and "mission.plan.proposed" in types:
            plan = req("GET", f"/api/missions/{mission_id}/plan")
            assignments = plan.get("assignments")
            if not isinstance(assignments, list):
                raise RuntimeError("Proposed plan is missing assignments")
            req(
                "POST",
                f"/api/missions/{mission_id}/plan/accept",
                {
                    "interpretation": plan["interpretation"],
                    "assignments": [
                        {
                            "staff_role": item["staff_role"],
                            "rationale": item["rationale"],
                            "objective": item.get("objective"),
                        }
                        for item in assignments
                        if isinstance(item, dict)
                    ],
                },
            )
            accepted = True
            print("plan accepted")
        approvals = req("GET", f"/api/missions/{mission_id}/approvals")
        if isinstance(approvals, list):
            for item in approvals:
                if not isinstance(item, dict):
                    continue
                approval_id = str(item.get("id") or "")
                if item.get("status") == "pending" and approval_id and approval_id not in approved:
                    req("POST", f"/api/approvals/{approval_id}/accept")
                    approved.add(approval_id)
                    print("approval accepted", approval_id, item.get("command"))
        if mission.get("status") in {"completed", "failed", "cancelled"}:
            terminal = mission
            break
        time.sleep(3)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "mission_id": mission_id,
                "project_id": project["id"],
                "accepted": accepted,
                "status": None if terminal is None else terminal.get("status"),
            }
        ),
        encoding="utf-8",
    )
    print("DONE", OUT.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
