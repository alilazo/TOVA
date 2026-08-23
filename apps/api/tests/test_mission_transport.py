import asyncio
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

import app.main as main
from app.api.missions import get_mission_registry, mission_registry
from app.api.model_profiles import get_model_registry
from app.events.broadcaster import EventBroadcaster
from app.events.memory import InMemoryEventStore
from app.main import app
from app.providers.lm_studio import LMStudioProvider
from app.schemas.events import EventEnvelope
from app.schemas.missions import MissionCreateRequest
from app.services.missions import MissionRegistry
from app.services.model_profiles import ModelProfileRegistry


async def _noop_runtime(_mission: object) -> None:
    return None


async def _configure_selected_model() -> tuple[ModelProfileRegistry, str]:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in request.url.path:
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen-local", "state": "loaded"}]},
            )
        return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})

    models = ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
    )
    profile = await models.discover("http://127.0.0.1:1234/v1")
    models.select(profile.id, "qwen-local")
    app.dependency_overrides[get_model_registry] = lambda: models
    return models, profile.id


@pytest.fixture(autouse=True)
def disable_live_runtime_launcher() -> None:
    mission_registry.set_runtime_launcher(_noop_runtime)
    yield
    mission_registry.set_runtime_launcher(_noop_runtime)


@pytest.mark.asyncio
async def test_event_store_orders_replay_before_broadcast() -> None:
    store = InMemoryEventStore()
    broadcaster = EventBroadcaster()
    queue = broadcaster.subscribe("mission-1")
    event = EventEnvelope(
        version="1.0",
        event_id="evt-1",
        event_type="mission.created",
        timestamp="2026-07-23T18:00:00Z",
        project_id="project-1",
        mission_id="mission-1",
        sequence=1,
        payload={"summary": "created"},
    )

    await store.append(event)
    await broadcaster.publish(event)

    assert (await store.list_after("mission-1", 0))[0].sequence == 1
    assert (await queue.get()).event_id == "evt-1"
    broadcaster.unsubscribe("mission-1", queue)


@pytest.mark.asyncio
async def test_mission_routes_create_control_and_replay(tmp_path: Path) -> None:
    models, profile_id = await _configure_selected_model()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            project = await client.post("/api/projects", json={"path": str(tmp_path)})
            project_id = project.json()["id"]
            created = await client.post(
                f"/api/projects/{project_id}/missions",
                json={
                    "objective": "Inspect project",
                    "model_profile_id": profile_id,
                    "model": "qwen-local",
                },
            )
            mission_id = created.json()["id"]
            started = await client.post(f"/api/missions/{mission_id}/start")
            paused = await client.post(f"/api/missions/{mission_id}/pause")
            resumed = await client.post(f"/api/missions/{mission_id}/resume")
            events = await client.get(f"/api/missions/{mission_id}/events?after_sequence=1")
    finally:
        app.dependency_overrides.clear()
        await models.aclose()

    assert "runtime_mode" not in created.json()
    assert started.json()["status"] == "running"
    assert paused.json()["status"] == "paused"
    assert resumed.json()["status"] == "running"
    sequences = [event["sequence"] for event in events.json()]
    assert sequences == sorted(sequences)
    assert all(sequence > 1 for sequence in sequences)


def _is_load_state_probe(request: httpx.Request) -> bool:
    return "/api/v0/models" in request.url.path


@pytest.mark.asyncio
async def test_mission_start_rechecks_model_reachability_before_launch(
    tmp_path: Path,
) -> None:
    requests = 0
    launched = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        if _is_load_state_probe(request):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen-local", "state": "loaded"}]},
            )
        requests += 1
        return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})

    models = ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
    )
    profile = await models.discover("http://127.0.0.1:1234/v1")
    models.select(profile.id, "qwen-local")
    missions = MissionRegistry(InMemoryEventStore(), EventBroadcaster())

    async def track_launch(_mission: object) -> None:
        launched.set()

    missions.set_runtime_launcher(track_launch)
    app.dependency_overrides[get_model_registry] = lambda: models
    app.dependency_overrides[get_mission_registry] = lambda: missions
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            project = await client.post("/api/projects", json={"path": str(tmp_path)})
            created = await client.post(
                f"/api/projects/{project.json()['id']}/missions",
                json={
                    "objective": "Inspect project",
                    "model_profile_id": profile.id,
                    "model": "qwen-local",
                },
            )
            started = await client.post(f"/api/missions/{created.json()['id']}/start")

        assert created.status_code == 200
        assert started.status_code == 200
        for _ in range(50):
            if launched.is_set():
                break
            await asyncio.sleep(0.02)
        assert launched.is_set()
        assert requests >= 2
        assert missions.get(created.json()["id"]).status.value == "running"
        events = await missions.store.list_after(created.json()["id"], 0)
        assert [event.event_type for event in events] == ["mission.created"]
    finally:
        app.dependency_overrides.clear()
        await models.aclose()


@pytest.mark.asyncio
async def test_launcher_fails_mission_when_second_health_check_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        if _is_load_state_probe(request):
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen-local", "state": "loaded"}]},
            )
        requests += 1
        if requests <= 3:
            return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})
        raise httpx.ConnectError("Connection refused", request=request)

    models = ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
    )
    profile = await models.discover("http://127.0.0.1:1234/v1")
    models.select(profile.id, "qwen-local")
    missions = MissionRegistry(InMemoryEventStore(), EventBroadcaster())
    monkeypatch.setattr(main, "mission_registry", missions)
    missions.set_runtime_launcher(main.launch_live_runtime)
    app.dependency_overrides[get_model_registry] = lambda: models
    app.dependency_overrides[get_mission_registry] = lambda: missions
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            project = await client.post("/api/projects", json={"path": str(tmp_path)})
            created = await client.post(
                f"/api/projects/{project.json()['id']}/missions",
                json={
                    "objective": "Inspect project",
                    "model_profile_id": profile.id,
                    "model": "qwen-local",
                },
            )
            mission_id = created.json()["id"]
            started = await client.post(f"/api/missions/{mission_id}/start")

        assert created.status_code == 200
        assert started.status_code == 200
        for _ in range(50):
            if missions.get(mission_id).status.value == "failed":
                break
            await asyncio.sleep(0.02)
        else:
            raise AssertionError("mission did not fail after launcher health check")
        events = await missions.store.list_after(mission_id, 0)
        assert [event.event_type for event in events] == [
            "mission.created",
            "mission.failed",
        ]
        assert all(event.event_type != "mission.analysis.started" for event in events)
    finally:
        app.dependency_overrides.clear()
        await models.aclose()


@pytest.mark.asyncio
async def test_runtime_waits_while_mission_is_paused(tmp_path: Path) -> None:
    registry = MissionRegistry(InMemoryEventStore(), EventBroadcaster())
    mission = await registry.create(
        "project-pause",
        MissionCreateRequest(
            objective="Wait safely",
            model_profile_id="profile_test",
            model="fake-test-model",
        ),
        project_root=str(tmp_path),
    )
    await registry.start(mission.id)
    await registry.pause(mission.id)

    waiter = asyncio.create_task(registry.wait_until_running(mission.id))
    await asyncio.sleep(0)
    assert not waiter.done()

    await registry.resume(mission.id)
    await asyncio.wait_for(waiter, timeout=1)


def test_websocket_replays_after_sequence(tmp_path: Path) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in request.url.path:
            return httpx.Response(
                200,
                json={"data": [{"id": "qwen-local", "state": "loaded"}]},
            )
        return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})

    models = ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
    )
    profile = asyncio.run(models.discover("http://127.0.0.1:1234/v1"))
    models.select(profile.id, "qwen-local")
    app.dependency_overrides[get_model_registry] = lambda: models
    try:
        with TestClient(app) as client:
            project = client.post("/api/projects", json={"path": str(tmp_path)})
            project_id = project.json()["id"]
            response = client.post(
                f"/api/projects/{project_id}/missions",
                json={
                    "objective": "Watch events",
                    "model_profile_id": profile.id,
                    "model": "qwen-local",
                },
            )
            mission_id = response.json()["id"]
            client.post(f"/api/missions/{mission_id}/start")
            client.post(f"/api/missions/{mission_id}/pause")
            with client.websocket_connect(
                f"/api/ws/missions/{mission_id}?after_sequence=1"
            ) as websocket:
                event = websocket.receive_json()
    finally:
        app.dependency_overrides.clear()
        asyncio.run(models.aclose())
    assert event["sequence"] > 1
    assert event["mission_id"] == mission_id
    assert event["event_type"] == "mission.paused"
