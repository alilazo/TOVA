from __future__ import annotations

import json
import time
import urllib.request

MISSION_ID = "mission_8ecc194be9a04b85b682d620fafbf2f2"
BASE = "http://127.0.0.1:8002"


def req(path: str) -> dict[str, object]:
    with urllib.request.urlopen(BASE + path, timeout=60) as response:
        return json.loads(response.read().decode())


def main() -> None:
    started = time.time()
    while time.time() - started < 360:
        mission = req(f"/api/missions/{MISSION_ID}")
        events = req(f"/api/missions/{MISSION_ID}/events")
        types = [str(event["event_type"]) for event in events]
        print("status", mission.get("status"), "events", len(types), types[-6:])
        if mission.get("status") in {"completed", "failed", "cancelled"}:
            print("DONE", json.dumps({"status": mission.get("status"), "last": types[-3:]}))
            return
        time.sleep(4)
    print("TIMEOUT")


if __name__ == "__main__":
    main()
