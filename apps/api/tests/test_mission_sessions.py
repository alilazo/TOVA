from pathlib import Path

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.missions import get_mission_registry
from app.api.model_profiles import get_model_registry
from app.api.projects import get_project_registry
from app.events.broadcaster import EventBroadcaster
from app.events.memory import InMemoryEventStore
from app.main import app
from app.providers.lm_studio import LMStudioProvider
from app.schemas.missions import MissionCreateRequest, MissionStatus
from app.services.mission_sessions import MissionSessionStore
from app.services.missions import MissionRegistry
from app.services.model_profiles import ModelProfileRegistry
from app.services.projects import ProjectRegistry


async def _configure_selected_model() -> tuple[ModelProfileRegistry, str]:
    async def handler(_request: httpx.Request) -> httpx.Response:
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


def test_session_store_persists_and_reloads_project_sessions(tmp_path: Path) -> None:
    store = MissionSessionStore(tmp_path)

    session = store.create_session(
        project_id="project_1",
        prompt="Build a minimal website",
        model_profile_id="profile_1",
        model="qwen-local",
        mission_id="mission_1",
    )

    assert session.title == "Build a minimal website"
    assert session.active_mission_id == "mission_1"
    assert session.turns[0].prompt == "Build a minimal website"
    assert (tmp_path / ".tova" / "missions" / "sessions.json").is_file()

    reloaded = MissionSessionStore(tmp_path)
    sessions = reloaded.list_sessions(project_id="project_1")
    assert [item.id for item in sessions] == [session.id]
    assert sessions[0].turns[0].mission_id == "mission_1"


@pytest.mark.asyncio
async def test_session_create_route_creates_first_mission_turn_and_persists(
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<button>Click</button>\n", encoding="utf-8")
    (tmp_path / "style.css").write_text("button { color: red; }\n", encoding="utf-8")
    (tmp_path / "script.js").write_text("console.log('ready')\n", encoding="utf-8")
    models, profile_id = await _configure_selected_model()
    projects = ProjectRegistry()
    missions = MissionRegistry(InMemoryEventStore(), EventBroadcaster())
    app.dependency_overrides[get_project_registry] = lambda: projects
    app.dependency_overrides[get_mission_registry] = lambda: missions

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            project = await client.post("/api/projects", json={"path": str(tmp_path)})
            created = await client.post(
                f"/api/projects/{project.json()['id']}/mission-sessions",
                json={
                    "prompt": "Build a minimal website",
                    "model_profile_id": profile_id,
                    "model": "qwen-local",
                },
            )
            sessions = await client.get(
                f"/api/projects/{project.json()['id']}/mission-sessions"
            )
    finally:
        app.dependency_overrides.clear()
        await models.aclose()

    assert created.status_code == 200
    body = created.json()
    assert body["project_id"] == project.json()["id"]
    assert body["turns"][0]["prompt"] == "Build a minimal website"
    assert body["turns"][0]["mission_id"].startswith("mission_")
    mission = missions.get(body["active_mission_id"])
    assert mission.session_id == body["id"]
    assert "index.html" in mission.context_summary
    assert "style.css" in mission.context_summary
    assert "script.js" in mission.context_summary
    assert sessions.json()[0]["id"] == body["id"]
    assert (tmp_path / ".tova" / "missions" / "sessions.json").is_file()


@pytest.mark.asyncio
async def test_followup_turn_creates_new_mission_with_session_context(
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<h1>Original header</h1>\n", encoding="utf-8")
    models, profile_id = await _configure_selected_model()
    projects = ProjectRegistry()
    missions = MissionRegistry(InMemoryEventStore(), EventBroadcaster())
    app.dependency_overrides[get_project_registry] = lambda: projects
    app.dependency_overrides[get_mission_registry] = lambda: missions

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            project = await client.post("/api/projects", json={"path": str(tmp_path)})
            created = await client.post(
                f"/api/projects/{project.json()['id']}/mission-sessions",
                json={
                    "prompt": "Build a minimal website",
                    "model_profile_id": profile_id,
                    "model": "qwen-local",
                },
            )
            session_id = created.json()["id"]
            first_mission_id = created.json()["active_mission_id"]
            MissionSessionStore(tmp_path).update_turn_status(
                session_id,
                first_mission_id,
                status=MissionStatus.COMPLETED,
                summary="Built index.html with a header.",
            )

            followup = await client.post(
                f"/api/mission-sessions/{session_id}/turns",
                json={
                    "prompt": "Fix the header copy",
                    "model_profile_id": profile_id,
                    "model": "qwen-local",
                },
            )
            fetched = await client.get(f"/api/mission-sessions/{session_id}")
    finally:
        app.dependency_overrides.clear()
        await models.aclose()

    assert followup.status_code == 200
    body = followup.json()
    assert len(body["turns"]) == 2
    assert body["turns"][1]["prompt"] == "Fix the header copy"
    assert body["active_mission_id"] != first_mission_id
    next_mission = missions.get(body["active_mission_id"])
    assert next_mission.session_id == session_id
    assert next_mission.turn_index == 2
    assert "Build a minimal website" in next_mission.context_summary
    assert "Built index.html with a header." in next_mission.context_summary
    assert "index.html" in next_mission.context_summary
    assert fetched.json()["id"] == session_id


@pytest.mark.asyncio
async def test_terminal_mission_event_updates_persisted_session_turn(
    tmp_path: Path,
) -> None:
    missions = MissionRegistry(InMemoryEventStore(), EventBroadcaster())
    store = MissionSessionStore(tmp_path)
    mission = await missions.create(
        "project_1",
        request=MissionCreateRequest(
            objective="Build a minimal website",
            model_profile_id="profile_1",
            model="qwen-local",
        ),
        project_root=str(tmp_path),
        session_id="session_1",
        turn_index=1,
    )
    store.create_session(
        project_id="project_1",
        prompt="Build a minimal website",
        model_profile_id="profile_1",
        model="qwen-local",
        mission_id=mission.id,
        session_id="session_1",
    )

    missions.set_status(mission.id, MissionStatus.COMPLETED)
    await missions.emit(
        mission.id,
        "mission.completed",
        {"summary": "Built and QA tested the site."},
    )

    reloaded = MissionSessionStore(tmp_path).get_session("session_1")
    assert reloaded.status == MissionStatus.COMPLETED
    assert reloaded.turns[0].status == MissionStatus.COMPLETED
    assert reloaded.turns[0].summary == "Built and QA tested the site."
