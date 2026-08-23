from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.events.broadcaster import EventBroadcaster
from app.events.file_store import FileEventStore
from app.events.reconstruct import reconstruct_mission
from app.schemas.events import EventEnvelope
from app.schemas.missions import MissionCreateRequest, MissionRecord, MissionStatus
from app.services.missions import MissionRegistry


def _event(
    mission_id: str,
    sequence: int,
    event_type: str = "mission.created",
    payload: dict[str, object] | None = None,
) -> EventEnvelope:
    return EventEnvelope(
        version="1.0",
        event_id=f"evt_{sequence}",
        event_type=event_type,  # type: ignore[arg-type]
        timestamp=datetime.now(UTC),
        project_id="project_sample",
        mission_id=mission_id,
        sequence=sequence,
        payload=payload or {"objective": "Fix the Count button"},
    )


@pytest.mark.asyncio
async def test_file_event_store_survives_process_restart(tmp_path: Path) -> None:
    root = tmp_path / "mission-events"
    first = FileEventStore(root)
    event = _event(
        "mission_one",
        1,
        payload={
            "objective": "Fix the Count button",
            "team_id": "hipo",
            "project_root": str(tmp_path / "project"),
            "model_profile_id": "profile_local",
            "model": "qwen-local",
        },
    )
    await first.append(event)
    await first.save_mission(
        MissionRecord(
            id="mission_one",
            project_id="project_sample",
            objective="Fix the Count button",
            project_root=str(tmp_path / "project"),
            model_profile_id="profile_local",
            model="qwen-local",
            status=MissionStatus.COMPLETED,
        )
    )

    second = FileEventStore(root)
    replayed = await second.list_after("mission_one", 0)
    assert len(replayed) == 1
    assert replayed[0].event_type == "mission.created"
    assert replayed[0].payload["objective"] == "Fix the Count button"
    loaded = await second.load_missions()
    assert loaded[0].id == "mission_one"
    assert loaded[0].status == MissionStatus.COMPLETED


@pytest.mark.asyncio
async def test_file_event_store_skips_corrupt_jsonl_lines(tmp_path: Path) -> None:
    root = tmp_path / "mission-events"
    store = FileEventStore(root)
    await store.append(_event("mission_one", 1))
    path = root / "events" / "mission_one.jsonl"
    with path.open("a", encoding="utf-8") as handle:
        handle.write("{not-json\n")
    await store.append(_event("mission_one", 2, "mission.started", {"summary": "go"}))

    restarted = FileEventStore(root)
    replayed = await restarted.list_after("mission_one", 0)
    assert [item.sequence for item in replayed] == [1, 2]


@pytest.mark.asyncio
async def test_mission_registry_restores_from_disk_after_restart(tmp_path: Path) -> None:
    root = tmp_path / "mission-events"
    project = tmp_path / "project"
    project.mkdir()
    first_store = FileEventStore(root)
    first = MissionRegistry(first_store, EventBroadcaster())
    created = await first.create(
        "project_sample",
        MissionCreateRequest(
            objective="Fix the Count button",
            model_profile_id="profile_local",
            model="qwen-local",
        ),
        project_root=str(project),
    )
    first.set_status(created.id, MissionStatus.RUNNING)
    await first.emit(created.id, "mission.started", {"summary": "Mission started"})
    await first.aclose()

    second = MissionRegistry(FileEventStore(root), EventBroadcaster())
    await second.restore()
    restored = second.get(created.id)
    assert restored.objective == "Fix the Count button"
    assert restored.project_root == str(project.resolve())
    assert restored.status == MissionStatus.PAUSED
    events = await second.store.list_after(created.id, 0)
    assert events[0].event_type == "mission.created"
    assert any(event.event_type == "mission.started" for event in events)


def test_reconstruct_mission_uses_created_payload_and_latest_status() -> None:
    events = [
        _event(
            "mission_one",
            1,
            payload={
                "objective": "Fix the Count button",
                "team_id": "hipo",
                "project_root": "/tmp/project",
                "model_profile_id": "profile_local",
                "model": "qwen-local",
            },
        ),
        _event("mission_one", 2, "mission.started", {"summary": "go"}),
        _event("mission_one", 3, "mission.completed", {"summary": "done"}),
    ]
    record = reconstruct_mission(events)
    assert record is not None
    assert record.objective == "Fix the Count button"
    assert record.status == MissionStatus.COMPLETED
    assert record.model == "qwen-local"
