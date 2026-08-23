from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import ValidationError

from app.schemas.events import EventEnvelope
from app.schemas.missions import MissionRecord


def _safe_mission_id(mission_id: str) -> str:
    cleaned = "".join(char for char in mission_id if char.isalnum() or char in {"_", "-"})
    if not cleaned:
        raise ValueError("Invalid mission id")
    return cleaned


class FileEventStore:
    def __init__(self, root: Path) -> None:
        self._root = Path(root)
        self._events: dict[str, list[EventEnvelope]] = {}
        self._missions: dict[str, MissionRecord] = {}
        self._root.mkdir(parents=True, exist_ok=True)
        (self._root / "events").mkdir(parents=True, exist_ok=True)
        (self._root / "missions").mkdir(parents=True, exist_ok=True)
        self._load()

    def _events_path(self, mission_id: str) -> Path:
        return self._root / "events" / f"{_safe_mission_id(mission_id)}.jsonl"

    def _mission_path(self, mission_id: str) -> Path:
        return self._root / "missions" / f"{_safe_mission_id(mission_id)}.json"

    def _load(self) -> None:
        events_dir = self._root / "events"
        for path in sorted(events_dir.glob("*.jsonl")):
            loaded: list[EventEnvelope] = []
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except OSError:
                continue
            for line in lines:
                if not line.strip():
                    continue
                try:
                    loaded.append(EventEnvelope.model_validate_json(line))
                except (ValidationError, json.JSONDecodeError, ValueError):
                    continue
            loaded.sort(key=lambda item: item.sequence)
            if loaded:
                self._events[loaded[0].mission_id] = loaded
        missions_dir = self._root / "missions"
        for path in missions_dir.glob("*.json"):
            try:
                record = MissionRecord.model_validate_json(path.read_text(encoding="utf-8"))
            except (OSError, ValidationError, json.JSONDecodeError, ValueError):
                continue
            self._missions[record.id] = record

    def persist_mission(self, mission: MissionRecord) -> None:
        copy = mission.model_copy(deep=True)
        self._missions[copy.id] = copy
        path = self._mission_path(copy.id)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = copy.model_dump_json()
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(payload, encoding="utf-8")
        tmp.replace(path)

    async def save_mission(self, mission: MissionRecord) -> None:
        self.persist_mission(mission)

    async def load_missions(self) -> list[MissionRecord]:
        return [item.model_copy(deep=True) for item in self._missions.values()]

    async def list_mission_ids(self) -> list[str]:
        ids = set(self._events) | set(self._missions)
        return sorted(ids)

    async def next_sequence(self, mission_id: str) -> int:
        events = self._events.get(mission_id, [])
        if not events:
            return 1
        return max(event.sequence for event in events) + 1

    async def append(self, event: EventEnvelope) -> EventEnvelope:
        events = self._events.setdefault(event.mission_id, [])
        expected = (max(item.sequence for item in events) + 1) if events else 1
        if event.sequence != expected:
            raise ValueError(f"Expected mission sequence {expected}")
        stored = event.model_copy(deep=True)
        path = self._events_path(event.mission_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(stored.model_dump_json() + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        events.append(stored)
        return stored.model_copy(deep=True)

    async def list_after(self, mission_id: str, sequence: int) -> list[EventEnvelope]:
        return [
            event.model_copy(deep=True)
            for event in self._events.get(mission_id, [])
            if event.sequence > sequence
        ]
