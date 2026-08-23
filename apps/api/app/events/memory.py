import asyncio
from collections import defaultdict

from app.schemas.events import EventEnvelope
from app.schemas.missions import MissionRecord


class InMemoryEventStore:
    def __init__(self) -> None:
        self._events: dict[str, list[EventEnvelope]] = defaultdict(list)
        self._missions: dict[str, MissionRecord] = {}
        self._lock = asyncio.Lock()

    def persist_mission(self, mission: MissionRecord) -> None:
        self._missions[mission.id] = mission.model_copy(deep=True)

    async def save_mission(self, mission: MissionRecord) -> None:
        async with self._lock:
            self.persist_mission(mission)

    async def load_missions(self) -> list[MissionRecord]:
        async with self._lock:
            return [item.model_copy(deep=True) for item in self._missions.values()]

    async def list_mission_ids(self) -> list[str]:
        async with self._lock:
            return sorted(set(self._events) | set(self._missions))

    async def append(self, event: EventEnvelope) -> EventEnvelope:
        async with self._lock:
            events = self._events[event.mission_id]
            expected = len(events) + 1
            if event.sequence != expected:
                raise ValueError(f"Expected mission sequence {expected}")
            events.append(event.model_copy(deep=True))
            return event.model_copy(deep=True)

    async def list_after(self, mission_id: str, sequence: int) -> list[EventEnvelope]:
        async with self._lock:
            return [
                event.model_copy(deep=True)
                for event in self._events.get(mission_id, [])
                if event.sequence > sequence
            ]

    async def next_sequence(self, mission_id: str) -> int:
        async with self._lock:
            return len(self._events.get(mission_id, [])) + 1
