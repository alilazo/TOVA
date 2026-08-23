from pydantic import BaseModel, ConfigDict, Field


class MissionPlanAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_role: str = Field(
        min_length=1,
        description="Exact available role key assigned to this work.",
    )
    objective: str = Field(min_length=1)
    rationale: str = Field(
        min_length=1,
        description="Concise reason this role was selected for the mission.",
    )
    deliverables: list[str] = Field(min_length=1)
    dependencies: list[str] = Field(
        description=(
            "Exact staff_role keys from other assignments that must complete first. "
            "Use [] when independent."
        )
    )
    sequence: int = Field(ge=1)
    can_run_in_parallel: bool
    handoff_to: list[str] = Field(
        description="Exact assigned staff_role keys receiving this work."
    )


class PlannedHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_role: str = Field(min_length=1)
    to_role: str = Field(min_length=1)
    title: str = Field(min_length=1)
    required_deliverables: list[str] = Field(min_length=1)


class MissionPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interpretation: str = Field(
        min_length=1,
        description="Alex's concise interpretation of the user request.",
    )
    mission_summary: str = Field(min_length=1)
    assumptions: list[str]
    risks: list[str]
    required_roles: list[str] = Field(min_length=1)
    assignments: list[MissionPlanAssignment] = Field(min_length=1)
    handoffs: list[PlannedHandoff]
    validation_strategy: list[str] = Field(min_length=1)
    completion_criteria: list[str] = Field(min_length=1)


class PlanAssignmentView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_id: str
    staff_role: str
    role: str
    display_name: str
    avatar: str
    objective: str
    rationale: str
    sequence: int


class MissionPlanView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interpretation: str
    mission_summary: str
    assignments: list[PlanAssignmentView]


class PlanAssignmentEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_role: str = Field(min_length=1)
    rationale: str = Field(min_length=1)
    objective: str | None = None


class MissionPlanAcceptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interpretation: str = Field(min_length=1)
    assignments: list[PlanAssignmentEdit] = Field(min_length=1)


class MissionPlanRegenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    notes: str = ""
