from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.model_profiles import get_model_registry
from app.api.projects import get_project_registry
from app.events.broadcaster import EventBroadcaster
from app.events.factory import create_event_store
from app.providers.openai_compatible import ProviderError
from app.schemas.events import EventEnvelope
from app.schemas.mission_plan import (
    MissionPlanAcceptRequest,
    MissionPlanRegenerateRequest,
    MissionPlanView,
)
from app.schemas.missions import (
    MissionCreateRequest,
    MissionRecord,
    MissionSessionCreateRequest,
    MissionSessionRecord,
    MissionTurnCreateRequest,
)
from app.services.mission_sessions import MissionSessionStore
from app.services.missions import MissionRegistry
from app.services.model_profiles import ModelProfileRegistry
from app.services.projects import ProjectRegistry
from app.tools.repository import WorkspaceError

router = APIRouter(prefix="/api")
event_store = create_event_store()
event_broadcaster = EventBroadcaster()
mission_registry = MissionRegistry(event_store, event_broadcaster)


def get_mission_registry() -> MissionRegistry:
    return mission_registry


Registry = Annotated[MissionRegistry, Depends(get_mission_registry)]
Projects = Annotated[ProjectRegistry, Depends(get_project_registry)]
Models = Annotated[ModelProfileRegistry, Depends(get_model_registry)]


def _not_found(exc: KeyError) -> HTTPException:
    return HTTPException(status_code=404, detail="Mission not found")


def _require_selected_model_reference(
    models: ModelProfileRegistry,
    model_profile_id: str,
    model: str,
) -> None:
    try:
        models.resolve(model_profile_id, model)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "selection_mismatch", "message": str(exc)},
        ) from exc


def _session_store(project_root: str) -> MissionSessionStore:
    return MissionSessionStore(project_root)


def _find_session(
    session_id: str,
    projects: ProjectRegistry,
) -> tuple[MissionSessionStore, MissionSessionRecord]:
    for project in projects.list():
        store = _session_store(project.root)
        try:
            return store, store.get_session(session_id)
        except KeyError:
            continue
    raise KeyError(session_id)


@router.post("/projects/{project_id}/missions", response_model=MissionRecord)
async def create_mission(
    project_id: str,
    request: MissionCreateRequest,
    registry: Registry,
    projects: Projects,
    models: Models,
) -> MissionRecord:
    try:
        project = projects.get(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    _require_selected_model_reference(
        models,
        request.model_profile_id,
        request.model,
    )
    try:
        return await registry.create(project_id, request, project_root=project.root)
    except WorkspaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get(
    "/projects/{project_id}/mission-sessions",
    response_model=list[MissionSessionRecord],
)
async def list_mission_sessions(
    project_id: str,
    projects: Projects,
) -> list[MissionSessionRecord]:
    try:
        project = projects.get(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    return _session_store(project.root).list_sessions(project_id=project.id)


@router.post(
    "/projects/{project_id}/mission-sessions",
    response_model=MissionSessionRecord,
)
async def create_mission_session(
    project_id: str,
    request: MissionSessionCreateRequest,
    registry: Registry,
    projects: Projects,
    models: Models,
) -> MissionSessionRecord:
    try:
        project = projects.get(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    _require_selected_model_reference(
        models,
        request.model_profile_id,
        request.model,
    )
    session_id = f"session_{uuid4().hex}"
    mission_request = MissionCreateRequest(
        objective=request.prompt,
        team_id=request.team_id,
        model_profile_id=request.model_profile_id,
        model=request.model,
    )
    try:
        store = _session_store(project.root)
        mission = await registry.create(
            project_id,
            mission_request,
            project_root=project.root,
            session_id=session_id,
            turn_index=1,
            context_summary=store.build_project_context_summary(),
        )
        return store.create_session(
            project_id=project.id,
            prompt=request.prompt,
            team_id=request.team_id,
            model_profile_id=request.model_profile_id,
            model=request.model,
            mission_id=mission.id,
            session_id=session_id,
        )
    except WorkspaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/mission-sessions/{session_id}", response_model=MissionSessionRecord)
async def get_mission_session(
    session_id: str,
    projects: Projects,
) -> MissionSessionRecord:
    try:
        _store, session = _find_session(session_id, projects)
        return session
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Mission session not found") from exc


@router.post(
    "/mission-sessions/{session_id}/turns",
    response_model=MissionSessionRecord,
)
async def create_mission_session_turn(
    session_id: str,
    request: MissionTurnCreateRequest,
    registry: Registry,
    projects: Projects,
    models: Models,
) -> MissionSessionRecord:
    try:
        store, session = _find_session(session_id, projects)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Mission session not found") from exc
    _require_selected_model_reference(
        models,
        request.model_profile_id,
        request.model,
    )
    mission_request = MissionCreateRequest(
        objective=request.prompt,
        team_id=request.team_id,
        model_profile_id=request.model_profile_id,
        model=request.model,
    )
    context_summary = store.build_context_summary(session_id)
    try:
        mission = await registry.create(
            session.project_id,
            mission_request,
            project_root=session.project_root,
            session_id=session.id,
            turn_index=len(session.turns) + 1,
            context_summary=context_summary,
        )
        return store.append_turn(
            session_id,
            prompt=request.prompt,
            team_id=request.team_id,
            model_profile_id=request.model_profile_id,
            model=request.model,
            mission_id=mission.id,
        )
    except WorkspaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/missions/{mission_id}", response_model=MissionRecord)
async def get_mission(mission_id: str, registry: Registry) -> MissionRecord:
    try:
        return registry.get(mission_id)
    except KeyError as exc:
        raise _not_found(exc) from exc


async def _control(
    registry: MissionRegistry,
    mission_id: str,
    action: str,
) -> MissionRecord:
    try:
        method = getattr(registry, action)
        result: MissionRecord = await method(mission_id)
        return result
    except KeyError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/missions/{mission_id}/start", response_model=MissionRecord)
async def start_mission(
    mission_id: str,
    registry: Registry,
    models: Models,
) -> MissionRecord:
    try:
        mission = registry.get(mission_id)
    except KeyError as exc:
        raise _not_found(exc) from exc
    try:
        await models.require_selected_available(
            mission.model_profile_id,
            mission.model,
        )
    except ProviderError as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": exc.code.value, "message": str(exc)},
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "selection_mismatch", "message": str(exc)},
        ) from exc
    return await _control(registry, mission_id, "start")


@router.post("/missions/{mission_id}/pause", response_model=MissionRecord)
async def pause_mission(mission_id: str, registry: Registry) -> MissionRecord:
    return await _control(registry, mission_id, "pause")


@router.post("/missions/{mission_id}/resume", response_model=MissionRecord)
async def resume_mission(mission_id: str, registry: Registry) -> MissionRecord:
    return await _control(registry, mission_id, "resume")


@router.post("/missions/{mission_id}/cancel", response_model=MissionRecord)
async def cancel_mission(mission_id: str, registry: Registry) -> MissionRecord:
    return await _control(registry, mission_id, "cancel")


@router.get("/missions/{mission_id}/plan", response_model=MissionPlanView)
async def get_mission_plan(mission_id: str, registry: Registry) -> MissionPlanView:
    try:
        return registry.get_proposed_plan(mission_id)
    except KeyError as exc:
        raise _not_found(exc) from exc
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/missions/{mission_id}/plan/accept", response_model=MissionPlanView)
async def accept_mission_plan(
    mission_id: str,
    request: MissionPlanAcceptRequest,
    registry: Registry,
) -> MissionPlanView:
    try:
        return await registry.accept_plan(mission_id, request)
    except KeyError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/missions/{mission_id}/plan/regenerate", response_model=dict[str, str])
async def regenerate_mission_plan(
    mission_id: str,
    request: MissionPlanRegenerateRequest,
    registry: Registry,
) -> dict[str, str]:
    try:
        await registry.regenerate_plan(mission_id, request.notes)
    except KeyError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"status": "regenerating"}


@router.post("/missions/{mission_id}/plan/deny", response_model=dict[str, str])
async def deny_mission_plan(
    mission_id: str,
    request: MissionPlanRegenerateRequest,
    registry: Registry,
) -> dict[str, str]:
    try:
        await registry.deny_plan(mission_id, request.notes)
    except KeyError as exc:
        raise _not_found(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"status": "denied"}


@router.get("/missions/{mission_id}/events", response_model=list[EventEnvelope])
async def list_events(
    mission_id: str,
    registry: Registry,
    after_sequence: int = Query(default=0, ge=0),
) -> list[EventEnvelope]:
    try:
        registry.get(mission_id)
    except KeyError as exc:
        raise _not_found(exc) from exc
    return await registry.store.list_after(mission_id, after_sequence)
