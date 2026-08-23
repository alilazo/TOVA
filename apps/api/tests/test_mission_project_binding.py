from pathlib import Path

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.api.missions import get_mission_registry
from app.api.model_profiles import get_model_registry
from app.api.projects import get_project_registry
from app.events.broadcaster import EventBroadcaster
from app.events.memory import InMemoryEventStore
from app.main import app
from app.providers.lm_studio import LMStudioProvider
from app.schemas.missions import MissionCreateRequest, MissionTurnCreateRequest
from app.services.missions import MissionRegistry
from app.services.model_profiles import ModelProfileRegistry
from app.services.projects import ProjectRegistry


@pytest.mark.asyncio
async def test_mission_create_requires_selected_available_model_before_persistence(
    tmp_path: Path,
) -> None:
    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})

    projects = ProjectRegistry()
    missions = MissionRegistry(InMemoryEventStore(), EventBroadcaster())
    models = ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
    )
    profile = await models.discover("http://127.0.0.1:1234/v1")
    models.select(profile.id, "qwen-local")
    project = projects.open(str(tmp_path), create=False)
    app.dependency_overrides[get_project_registry] = lambda: projects
    app.dependency_overrides[get_mission_registry] = lambda: missions
    app.dependency_overrides[get_model_registry] = lambda: models
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            missing = await client.post(
                f"/api/projects/{project.id}/missions",
                json={"objective": "Build something"},
            )
            created = await client.post(
                f"/api/projects/{project.id}/missions",
                json={
                    "objective": "Build something",
                    "model_profile_id": profile.id,
                    "model": "qwen-local",
                },
            )
            unknown = await client.post(
                "/api/projects/project_missing/missions",
                json={
                    "objective": "Build something",
                    "model_profile_id": profile.id,
                    "model": "qwen-local",
                },
            )
        assert created.status_code == 200
        body = created.json()
        assert missing.status_code == 422
        assert "runtime_mode" not in body
        assert body["project_id"] == project.id
        assert Path(body["project_root"]) == Path(project.root)
        assert unknown.status_code == 404
    finally:
        app.dependency_overrides.clear()
        await models.aclose()


@pytest.mark.asyncio
async def test_mission_create_does_not_probe_model_server(tmp_path: Path) -> None:
    requests = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        if requests == 1:
            return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})
        raise httpx.ConnectError("Connection refused", request=request)

    projects = ProjectRegistry()
    missions = MissionRegistry(InMemoryEventStore(), EventBroadcaster())
    models = ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
    )
    profile = await models.discover("http://127.0.0.1:1234/v1")
    models.select(profile.id, "qwen-local")
    project = projects.open(str(tmp_path), create=False)
    app.dependency_overrides[get_project_registry] = lambda: projects
    app.dependency_overrides[get_mission_registry] = lambda: missions
    app.dependency_overrides[get_model_registry] = lambda: models
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                f"/api/projects/{project.id}/missions",
                json={
                    "objective": "Build something",
                    "model_profile_id": profile.id,
                    "model": "qwen-local",
                },
            )
        assert created.status_code == 200
        assert requests == 1
        assert created.json()["id"] in missions._missions
    finally:
        app.dependency_overrides.clear()
        await models.aclose()


@pytest.mark.asyncio
async def test_mission_start_requires_reachable_model(tmp_path: Path) -> None:
    requests = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal requests
        requests += 1
        if requests == 1:
            return httpx.Response(200, json={"data": [{"id": "qwen-local"}]})
        raise httpx.ConnectError("Connection refused", request=request)

    projects = ProjectRegistry()
    missions = MissionRegistry(InMemoryEventStore(), EventBroadcaster())
    models = ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
    )
    profile = await models.discover("http://127.0.0.1:1234/v1")
    models.select(profile.id, "qwen-local")
    project = projects.open(str(tmp_path), create=False)
    app.dependency_overrides[get_project_registry] = lambda: projects
    app.dependency_overrides[get_mission_registry] = lambda: missions
    app.dependency_overrides[get_model_registry] = lambda: models
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                f"/api/projects/{project.id}/missions",
                json={
                    "objective": "Build something",
                    "model_profile_id": profile.id,
                    "model": "qwen-local",
                },
            )
            assert created.status_code == 200
            started = await client.post(f"/api/missions/{created.json()['id']}/start")
        assert started.status_code == 503
        detail = started.json()["detail"]
        assert detail["code"] in {"disconnected", "connection_failed", "model_unavailable"}
        assert created.json()["id"] in missions._missions
    finally:
        app.dependency_overrides.clear()
        await models.aclose()


def test_mission_create_rejects_blank_objective() -> None:
    with pytest.raises(ValidationError):
        MissionCreateRequest(
            objective="   ",
            model_profile_id="profile_1",
            model="qwen-local",
        )
    with pytest.raises(ValidationError):
        MissionTurnCreateRequest(
            prompt="   ",
            model_profile_id="profile_1",
            model="qwen-local",
        )
