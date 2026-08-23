from app.schemas.mission_plan import (
    MissionPlan,
    MissionPlanAcceptRequest,
    MissionPlanView,
    PlanAssignmentView,
)
from app.schemas.staff import StaffProfileDocument


def plan_to_view(
    plan: MissionPlan,
    profiles: list[StaffProfileDocument],
) -> MissionPlanView:
    by_role = {profile.role_key: profile for profile in profiles}
    assignments = sorted(plan.assignments, key=lambda item: item.sequence)
    return MissionPlanView(
        interpretation=plan.interpretation,
        mission_summary=plan.mission_summary,
        assignments=[
            PlanAssignmentView(
                staff_id=by_role[assignment.staff_role].id,
                staff_role=assignment.staff_role,
                role=by_role[assignment.staff_role].role,
                display_name=by_role[assignment.staff_role].display_name,
                avatar=by_role[assignment.staff_role].avatar,
                objective=assignment.objective,
                rationale=assignment.rationale,
                sequence=assignment.sequence,
            )
            for assignment in assignments
            if assignment.staff_role in by_role
        ],
    )


def apply_plan_edits(
    plan: MissionPlan,
    request: MissionPlanAcceptRequest,
) -> MissionPlan:
    edits = {item.staff_role: item for item in request.assignments}
    updated = plan.model_copy(deep=True)
    updated.interpretation = request.interpretation.strip()
    updated.assignments = [
        assignment for assignment in updated.assignments if assignment.staff_role in edits
    ]
    retained_roles = {assignment.staff_role for assignment in updated.assignments}
    updated.required_roles = [
        role for role in updated.required_roles if role in retained_roles
    ]
    updated.handoffs = [
        handoff
        for handoff in updated.handoffs
        if handoff.from_role in retained_roles and handoff.to_role in retained_roles
    ]
    for assignment in updated.assignments:
        edit = edits.get(assignment.staff_role)
        if edit is None:
            continue
        assignment.rationale = edit.rationale.strip()
        if edit.objective is not None and edit.objective.strip():
            assignment.objective = edit.objective.strip()
        assignment.dependencies = [
            dependency
            for dependency in assignment.dependencies
            if dependency in retained_roles
        ]
        assignment.handoff_to = [
            role for role in assignment.handoff_to if role in retained_roles
        ]
    return updated
