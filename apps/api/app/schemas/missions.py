from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _require_nonempty_text(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError("must not be empty")
    return stripped


class MissionStatus(StrEnum):
    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"


TeamId = Literal["hipo"]


class MissionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objective: str = Field(min_length=1, max_length=20_000)
    team_id: TeamId = "hipo"
    model_profile_id: str
    model: str

    @field_validator("objective")
    @classmethod
    def objective_must_have_content(cls, value: str) -> str:
        return _require_nonempty_text(value)


class MissionRecord(BaseModel):
    id: str
    project_id: str
    objective: str
    team_id: TeamId = "hipo"
    project_root: str
    model_profile_id: str
    model: str
    status: MissionStatus
    session_id: str | None = None
    turn_index: int | None = None
    context_summary: str = ""


class MissionSessionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=20_000)
    team_id: TeamId = "hipo"
    model_profile_id: str
    model: str

    @field_validator("prompt")
    @classmethod
    def prompt_must_have_content(cls, value: str) -> str:
        return _require_nonempty_text(value)


class MissionTurnCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=20_000)
    team_id: TeamId = "hipo"
    model_profile_id: str
    model: str

    @field_validator("prompt")
    @classmethod
    def prompt_must_have_content(cls, value: str) -> str:
        return _require_nonempty_text(value)


class MissionTurnRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mission_id: str
    prompt: str
    team_id: TeamId = "hipo"
    status: MissionStatus
    model_profile_id: str
    model: str
    created_at: str
    updated_at: str
    summary: str = ""


class MissionSessionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    project_id: str
    project_root: str
    title: str
    team_id: TeamId = "hipo"
    status: MissionStatus
    active_mission_id: str
    created_at: str
    updated_at: str
    turns: list[MissionTurnRecord]
