from __future__ import annotations

from app.schemas.events import EventEnvelope
from app.schemas.missions import MissionRecord, MissionStatus, TeamId

_STATUS_BY_EVENT: dict[str, MissionStatus] = {
    "mission.started": MissionStatus.RUNNING,
    "mission.resumed": MissionStatus.RUNNING,
    "mission.paused": MissionStatus.PAUSED,
    "mission.completed": MissionStatus.COMPLETED,
    "mission.failed": MissionStatus.FAILED,
    "mission.cancelled": MissionStatus.CANCELLED,
    "mission.plan.denied": MissionStatus.CANCELLED,
}


def reconstruct_mission(events: list[EventEnvelope]) -> MissionRecord | None:
    created = next((event for event in events if event.event_type == "mission.created"), None)
    if created is None:
        return None
    payload = created.payload
    objective = payload.get("objective")
    if not isinstance(objective, str) or not objective.strip():
        return None
    project_root = payload.get("project_root")
    model_profile_id = payload.get("model_profile_id")
    model = payload.get("model")
    if not isinstance(project_root, str) or not project_root:
        return None
    if not isinstance(model_profile_id, str) or not model_profile_id:
        return None
    if not isinstance(model, str) or not model:
        return None
    team_id: TeamId = "hipo"
    session_id = payload.get("session_id")
    turn_index = payload.get("turn_index")
    context_summary = payload.get("context_summary")
    status = MissionStatus.CREATED
    for event in events:
        mapped = _STATUS_BY_EVENT.get(event.event_type)
        if mapped is not None:
            status = mapped
    return MissionRecord(
        id=created.mission_id,
        project_id=created.project_id,
        objective=objective,
        team_id=team_id,
        project_root=project_root,
        model_profile_id=model_profile_id,
        model=model,
        status=status,
        session_id=session_id if isinstance(session_id, str) else None,
        turn_index=turn_index if isinstance(turn_index, int) else None,
        context_summary=context_summary if isinstance(context_summary, str) else "",
    )
