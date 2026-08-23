from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8000"
MARKER = Path(__file__).with_name("button-mission-id.txt")


def main() -> None:
    # Missions are in-memory; discover via websocket replay is heavy.
    # Poll project entries + try brute from UI isn't available.
    # Use FastAPI internals: none. Instead open WS and wait for mission events.
    import asyncio

    async def run() -> None:
        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as c:
            active = (await c.get("/api/projects/active")).json()
            print("ACTIVE", active["id"], active["name"], flush=True)
        async with httpx.AsyncClient(base_url=BASE, timeout=None) as c:
            # Try known pattern: GET doesn't list. Use WS /ws/missions? 
            # Check OpenAPI for ws path.
            pass

    asyncio.run(run())


if __name__ == "__main__":
    main()
