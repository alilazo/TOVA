import asyncio
from collections import defaultdict

from app.schemas.events import EventEnvelope


class EventBroadcaster:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[EventEnvelope]]] = defaultdict(set)

    def subscribe(self, mission_id: str) -> asyncio.Queue[EventEnvelope]:
        queue: asyncio.Queue[EventEnvelope] = asyncio.Queue(maxsize=1000)
        self._subscribers[mission_id].add(queue)
        return queue

    def unsubscribe(self, mission_id: str, queue: asyncio.Queue[EventEnvelope]) -> None:
        self._subscribers[mission_id].discard(queue)

    async def publish(self, event: EventEnvelope) -> None:
        for queue in tuple(self._subscribers.get(event.mission_id, ())):
            await queue.put(event.model_copy(deep=True))
