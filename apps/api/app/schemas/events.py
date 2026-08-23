from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

EventType = Literal[
    "mission.created",
    "mission.submitted",
    "mission.analysis.started",
    "mission.analysis.updated",
    "mission.plan.proposed",
    "mission.plan.accepted",
    "mission.plan.regenerating",
    "mission.plan.denied",
    "mission.team.assembly.started",
    "mission.team.member.selected",
    "mission.team.assembly.completed",
    "mission.started",
    "mission.paused",
    "mission.resumed",
    "mission.blocked",
    "mission.completed",
    "mission.failed",
    "mission.cancelled",
    "model.connection.changed",
    "model.request.started",
    "model.request.completed",
    "model.request.failed",
    "staff.assigned",
    "staff.status.changed",
    "staff.action.started",
    "staff.action.updated",
    "staff.action.completed",
    "staff.file.opened",
    "staff.file.read",
    "staff.file.created",
    "staff.file.updated",
    "staff.file.saved",
    "staff.file.deleted",
    "staff.command.started",
    "staff.command.output",
    "staff.command.completed",
    "staff.research.started",
    "staff.research.result",
    "staff.decision.recorded",
    "staff.test.started",
    "staff.test.result",
    "handoff.preparing",
    "handoff.started",
    "handoff.accepted",
    "handoff.completed",
    "approval.requested",
    "approval.accepted",
    "approval.rejected",
    "artifact.created",
    "artifact.updated",
    "activity.created",
]


class EventEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal["1.0"]
    event_id: str = Field(min_length=1)
    event_type: EventType
    timestamp: datetime
    project_id: str = Field(min_length=1)
    mission_id: str = Field(min_length=1)
    staff_id: str | None = None
    sequence: int = Field(gt=0)
    payload: dict[str, Any]
