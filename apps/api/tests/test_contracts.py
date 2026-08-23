import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.main import app
from app.orchestration.tool_definitions import agent_tool_definitions
from app.schemas.events import EventEnvelope
from app.schemas.mission_plan import MissionPlan


@pytest.mark.asyncio
async def test_runtime_status_reports_unconfigured_without_selection() -> None:
    import httpx

    from app.api.model_profiles import get_model_registry
    from app.providers.lm_studio import LMStudioProvider
    from app.services.model_profiles import ModelProfileRegistry

    async def handler(request: httpx.Request) -> httpx.Response:
        if "/api/v0/models" in str(request.url):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"id": "laguna-xs-2.1", "state": "not-loaded"},
                    ]
                },
            )
        return httpx.Response(200, json={"data": [{"id": "laguna-xs-2.1"}]})

    registry = ModelProfileRegistry(
        provider_factory=lambda base_url, token: LMStudioProvider(
            base_url=base_url,
            api_token=token,
            client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        )
    )
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "state": "unconfigured",
        "provider": "lm-studio",
        "version": "0.1.0",
        "error": "Local model server is running — load a model",
    }


def test_event_envelope_serializes_versioned_sequence() -> None:
    event = EventEnvelope(
        version="1.0",
        event_id="evt_1",
        event_type="staff.action.started",
        timestamp="2026-07-23T18:00:00Z",
        project_id="project_orion",
        mission_id="mission_orchestration",
        staff_id="staff_maya",
        sequence=1,
        payload={"title": "Maya started repository research"},
    )

    assert event.model_dump(mode="json")["sequence"] == 1
    assert event.model_dump(mode="json")["event_type"] == "staff.action.started"


def test_event_envelope_accepts_model_runtime_events() -> None:
    event = EventEnvelope(
        version="1.0",
        event_id="evt_model",
        event_type="model.request.started",
        timestamp="2026-07-23T18:00:00Z",
        project_id="project_orion",
        mission_id="mission_orchestration",
        sequence=1,
        payload={"operation": "coordinator.plan"},
    )
    assert event.event_type == "model.request.started"


def test_handoff_prepare_tool_exposes_structured_evidence_fields() -> None:
    tools = {tool.name: tool for tool in agent_tool_definitions()}
    handoff_schema = tools["handoff.prepare"].parameters

    assert handoff_schema["required"] == ["to_role", "summary"]
    properties = handoff_schema["properties"]
    assert properties["changed_paths"] == {"type": "array", "items": {"type": "string"}}
    assert properties["test_instructions"] == {
        "type": "array",
        "items": {"type": "string"},
    }
    assert properties["acceptance_criteria"] == {
        "type": "array",
        "items": {"type": "string"},
    }


def test_coordinator_plan_rejects_empty_assignments() -> None:
    with pytest.raises(ValidationError):
        MissionPlan(
            interpretation="Build project creation.",
            mission_summary="Build project creation.",
            assumptions=[],
            risks=[],
            required_roles=["software_engineer"],
            assignments=[],
            handoffs=[],
            validation_strategy=["Run tests"],
            completion_criteria=["Project API works"],
        )
