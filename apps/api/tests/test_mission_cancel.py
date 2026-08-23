from pathlib import Path

import pytest

from app.events.broadcaster import EventBroadcaster
from app.events.memory import InMemoryEventStore
from app.schemas.missions import MissionCreateRequest, MissionStatus
from app.services.missions import MissionRegistry


@pytest.mark.asyncio
async def test_cancel_emits_cancelled_event_not_failed(tmp_path: Path) -> None:
    store = InMemoryEventStore()
    registry = MissionRegistry(store, EventBroadcaster())
    mission = await registry.create(
        "project_sample",
        MissionCreateRequest(
            objective="Stop this mission",
            model_profile_id="profile_local",
            model="qwen-local",
        ),
        project_root=str(tmp_path),
    )
    cancelled = await registry.cancel(mission.id)
    assert cancelled.status == MissionStatus.CANCELLED
    events = await store.list_after(mission.id, 0)
    assert events[-1].event_type == "mission.cancelled"
    assert events[-1].payload.get("summary") == "Mission cancelled"
    assert all(event.event_type != "mission.failed" for event in events)
