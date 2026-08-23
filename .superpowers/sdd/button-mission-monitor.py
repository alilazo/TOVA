"""Poll mission until terminal; tolerate temporary API stalls."""
from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
OUT = Path(__file__).with_name("button-mission-monitor.json")
MARKER = Path(__file__).with_name("button-mission-id.txt")
PROJECT_ROOT = Path(r"F:\Programming Projects\TOVA blank button")


def safe_get(client: httpx.Client, path: str) -> dict | list | None:
    try:
        response = client.get(path)
        response.raise_for_status()
        return response.json()
    except Exception as exc:  # noqa: BLE001
        print("GET_FAIL", path, type(exc).__name__, flush=True)
        return None


def main() -> None:
    deadline = time.time() + 900
    mission_id = ""
    while time.time() < deadline and not mission_id:
        if MARKER.exists():
            mission_id = MARKER.read_text(encoding="utf-8").strip()
        time.sleep(0.5)
    if not mission_id:
        OUT.write_text(json.dumps({"error": "no mission id"}), encoding="utf-8")
        print("NO_MISSION", flush=True)
        return
    print("MISSION", mission_id, flush=True)
    ticks: list[dict] = []
    with httpx.Client(base_url=BASE, timeout=httpx.Timeout(10.0, connect=5.0)) as c:
        while time.time() < deadline:
            m = safe_get(c, f"/api/missions/{mission_id}")
            events = safe_get(c, f"/api/missions/{mission_id}/events") or []
            counts: dict[str, int] = {}
            assigned: list[dict] = []
            handoffs: list[dict] = []
            if isinstance(events, list):
                for e in events:
                    t = e.get("event_type", "")
                    counts[t] = counts.get(t, 0) + 1
                    if t == "staff.assigned":
                        assigned.append(
                            {
                                "staff_id": e.get("staff_id"),
                                "role": e.get("payload", {}).get("role"),
                                "objective": e.get("payload", {}).get("objective"),
                                "sequence": e.get("payload", {}).get("sequence"),
                            }
                        )
                    if str(t).startswith("handoff."):
                        handoffs.append(
                            {
                                "type": t,
                                "staff_id": e.get("staff_id"),
                                "payload": e.get("payload"),
                            }
                        )
            disk = sorted(p.name for p in PROJECT_ROOT.iterdir()) if PROJECT_ROOT.exists() else []
            status = m.get("status") if isinstance(m, dict) else "unknown"
            tick = {
                "status": status,
                "events": counts,
                "staff_assigned": assigned,
                "handoffs": handoffs,
                "disk": disk,
            }
            ticks.append(tick)
            print("TICK", json.dumps(tick, ensure_ascii=True), flush=True)
            if status in {"completed", "failed", "cancelled", "blocked"}:
                OUT.write_text(
                    json.dumps(
                        {
                            "mission_id": mission_id,
                            "final": tick,
                            "event_types": [
                                {
                                    "seq": e.get("sequence"),
                                    "type": e.get("event_type"),
                                    "staff_id": e.get("staff_id"),
                                    "payload": e.get("payload"),
                                }
                                for e in (events if isinstance(events, list) else [])
                            ],
                            "ticks": ticks,
                        },
                        indent=2,
                    ),
                    encoding="utf-8",
                )
                print("DONE", status, flush=True)
                return
            time.sleep(4)
    OUT.write_text(json.dumps({"mission_id": mission_id, "ticks": ticks[-10:]}, indent=2), encoding="utf-8")
    print("TIMEOUT", flush=True)


if __name__ == "__main__":
    main()
