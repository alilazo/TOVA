from typing import Protocol

from app.schemas.events import EventEnvelope
from app.schemas.missions import MissionRecord


class EventStore(Protocol):
    """Append-only persistence contract; append must precede broadcast."""

    async def append(self, event: EventEnvelope) -> EventEnvelope: ...

    async def list_after(
        self,
        mission_id: str,
        sequence: int,
    ) -> list[EventEnvelope]: ...

    async def next_sequence(self, mission_id: str) -> int: ...

    async def list_mission_ids(self) -> list[str]: ...

    async def save_mission(self, mission: MissionRecord) -> None: ...

    async def load_missions(self) -> list[MissionRecord]: ...

    def persist_mission(self, mission: MissionRecord) -> None: ...


class EventPublisher(Protocol):
    async def publish(self, event: EventEnvelope) -> None: ...
