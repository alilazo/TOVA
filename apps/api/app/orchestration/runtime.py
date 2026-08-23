import asyncio
import json

from app.orchestration.agent_runner import AgentOutcome, AgentRunner, CompletionProvider
from app.orchestration.coordinator import Coordinator
from app.schemas.mission_plan import MissionPlan, MissionPlanAssignment
from app.schemas.missions import MissionRecord, MissionStatus
from app.schemas.models import ChatCompletionRequest, ChatMessage
from app.schemas.staff import StaffProfileDocument
from app.services.missions import MissionRegistry, PlanDecisionKind
from app.services.plan_review import plan_to_view

_COORDINATOR_ROLE = "project_coordinator"


class MissionRuntime:
    def __init__(
        self,
        *,
        provider: CompletionProvider,
        model: str,
        coordinator: Coordinator,
        agent_runner: AgentRunner,
        profiles: list[StaffProfileDocument],
        missions: MissionRegistry,
        max_concurrency: int = 3,
    ) -> None:
        self.provider = provider
        self.model = model
        self.coordinator = coordinator
        self.agent_runner = agent_runner
        self.profiles = profiles
        self.missions = missions
        self.max_concurrency = max_concurrency

    async def run(self, mission: MissionRecord) -> None:
        try:
            await self.missions.wait_until_running(mission.id)
            await self.missions.emit(
                mission.id,
                "mission.analysis.started",
                {"summary": "Coordinator is creating a bounded mission plan"},
            )
            plan = await self._create_plan(mission, feedback="")
            plan = await self._await_plan_acceptance(mission, plan)
            await self.missions.wait_until_running(mission.id)
            await self.missions.emit(
                mission.id,
                "mission.started",
                {"summary": "Mission started after plan acceptance"},
            )
            await self.missions.emit(
                mission.id,
                "mission.team.assembly.started",
                {"summary": plan.mission_summary, "roles": plan.required_roles},
            )
            profiles = {profile.role_key: profile for profile in self.profiles}
            execution_assignments = self._execution_assignments(plan.assignments)
            for assignment in execution_assignments:
                await self.missions.emit(
                    mission.id,
                    "mission.team.member.selected",
                    {
                        "role": assignment.staff_role,
                        "objective": assignment.objective,
                        "sequence": assignment.sequence,
                    },
                    staff_id=profiles[assignment.staff_role].id,
                )
                await self.missions.emit(
                    mission.id,
                    "staff.assigned",
                    {
                        "role": assignment.staff_role,
                        "objective": assignment.objective,
                        "sequence": assignment.sequence,
                        "rationale": assignment.rationale,
                    },
                    staff_id=profiles[assignment.staff_role].id,
                )
            await self.missions.emit(
                mission.id,
                "mission.team.assembly.completed",
                {"summary": f"Assembled {len(execution_assignments)} assignments"},
            )
            outcomes = await self._run_assignments(mission, execution_assignments, profiles)
            follow_up_prompt = self._qa_follow_up_prompt(outcomes)
            if follow_up_prompt:
                await self.missions.emit(
                    mission.id,
                    "mission.analysis.updated",
                    {
                        "summary": "QA follow-up fix required",
                        "next_action": "Review Alex's proposed fix plan",
                    },
                )
                follow_up_plan = await self._create_plan(mission, feedback=follow_up_prompt)
                follow_up_plan = await self._await_plan_acceptance(mission, follow_up_plan)
                await self.missions.wait_until_running(mission.id)
                await self.missions.emit(
                    mission.id,
                    "mission.team.assembly.started",
                    {
                        "summary": follow_up_plan.mission_summary,
                        "roles": follow_up_plan.required_roles,
                    },
                )
                follow_up_assignments = self._execution_assignments(
                    follow_up_plan.assignments
                )
                for assignment in follow_up_assignments:
                    await self.missions.emit(
                        mission.id,
                        "mission.team.member.selected",
                        {
                            "role": assignment.staff_role,
                            "objective": assignment.objective,
                            "sequence": assignment.sequence,
                        },
                        staff_id=profiles[assignment.staff_role].id,
                    )
                    await self.missions.emit(
                        mission.id,
                        "staff.assigned",
                        {
                            "role": assignment.staff_role,
                            "objective": assignment.objective,
                            "sequence": assignment.sequence,
                            "rationale": assignment.rationale,
                        },
                        staff_id=profiles[assignment.staff_role].id,
                    )
                await self.missions.emit(
                    mission.id,
                    "mission.team.assembly.completed",
                    {
                        "summary": (
                            f"Assembled {len(follow_up_assignments)} "
                            "follow-up assignments"
                        ),
                    },
                )
                follow_up_outcomes = await self._run_assignments(
                    mission,
                    follow_up_assignments,
                    profiles,
                )
                outcomes.update(follow_up_outcomes)
            summary = await self._final_summary(mission, outcomes)
            self.missions.set_status(mission.id, MissionStatus.COMPLETED)
            await self.missions.emit(
                mission.id,
                "mission.completed",
                {"summary": summary, "assignments_completed": len(outcomes)},
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self.missions.set_status(mission.id, MissionStatus.FAILED)
            await self.missions.emit(
                mission.id,
                "mission.failed",
                {"summary": f"Mission failed: {type(exc).__name__}: {str(exc)[:500]}"},
            )

    async def _create_plan(self, mission: MissionRecord, *, feedback: str) -> MissionPlan:
        await self.missions.emit(
            mission.id,
            "model.request.started",
            {"operation": "coordinator.plan"},
        )
        try:
            plan = await self.coordinator.create_plan(
                mission.objective,
                self.profiles,
                operational_context=(
                    f"Selected workforce team: {mission.team_id}\n"
                    f"{mission.context_summary}"
                ).strip(),
                feedback=feedback,
            )
            if self.coordinator.last_repair_errors:
                await self.missions.emit(
                    mission.id,
                    "mission.analysis.updated",
                    {
                        "summary": "Coordinator repaired mission plan",
                        "validation_errors": self.coordinator.last_repair_errors,
                    },
                )
        except Exception as exc:
            await self.missions.emit(
                mission.id,
                "model.request.failed",
                {"operation": "coordinator.plan", "error": type(exc).__name__},
            )
            raise
        await self.missions.wait_until_running(mission.id)
        await self.missions.emit(
            mission.id,
            "model.request.completed",
            {"operation": "coordinator.plan"},
        )
        view = plan_to_view(plan, self.profiles)
        await self.missions.propose_plan(mission.id, plan, view)
        return plan

    async def _await_plan_acceptance(
        self,
        mission: MissionRecord,
        plan: MissionPlan,
    ) -> MissionPlan:
        while True:
            decision = await self.missions.wait_for_plan_decision(mission.id)
            if decision.kind == PlanDecisionKind.ACCEPT:
                if decision.plan is None:
                    raise RuntimeError("Accepted plan decision missing plan payload")
                return decision.plan
            if decision.kind == PlanDecisionKind.DENY:
                raise asyncio.CancelledError
            await self.missions.wait_until_running(mission.id)
            await self._create_plan(mission, feedback=decision.notes)

    async def _run_assignments(
        self,
        mission: MissionRecord,
        assignments: list[MissionPlanAssignment],
        profiles: dict[str, StaffProfileDocument],
    ) -> dict[str, AgentOutcome]:
        pending = {assignment.staff_role: assignment for assignment in assignments}
        outcomes: dict[str, AgentOutcome] = {}
        semaphore = asyncio.Semaphore(self.max_concurrency)
        cancellation = self.missions.cancellation_event(mission.id)
        waiting_handoffs: dict[str, list[dict[str, object]]] = {}

        async def run_one(assignment: MissionPlanAssignment) -> AgentOutcome:
            async with semaphore:
                return await self.agent_runner.run_assignment(
                    mission.id,
                    profiles[assignment.staff_role],
                    assignment,
                    mission_objective=mission.objective,
                    mission_context=mission.context_summary,
                    cancellation=cancellation,
                    pause_gate=lambda: self.missions.wait_until_running(mission.id),
                )

        while pending:
            ready = [
                assignment
                for assignment in pending.values()
                if set(assignment.dependencies).issubset(outcomes)
            ]
            if not ready:
                raise RuntimeError("Mission plan contains a dependency cycle")
            ready.sort(key=lambda assignment: assignment.sequence)
            batch = ready if all(item.can_run_in_parallel for item in ready) else ready[:1]
            received_handoffs: dict[str, list[dict[str, object]]] = {}
            for assignment in batch:
                for handoff in waiting_handoffs.pop(assignment.staff_role, []):
                    recipient = profiles[assignment.staff_role]
                    await self.missions.emit(
                        mission.id,
                        "handoff.accepted",
                        handoff,
                        staff_id=recipient.id,
                    )
                    received_handoffs.setdefault(assignment.staff_role, []).append(handoff)
            results = await asyncio.gather(*(run_one(assignment) for assignment in batch))
            for assignment, result in zip(batch, results, strict=True):
                outcomes[assignment.staff_role] = result
                pending.pop(assignment.staff_role)
                for handoff in received_handoffs.get(assignment.staff_role, []):
                    await self.missions.emit(
                        mission.id,
                        "handoff.completed",
                        handoff,
                        staff_id=profiles[assignment.staff_role].id,
                    )
                for handoff in result.handoffs:
                    to_role = handoff.get("to_role")
                    handoff_recipient = profiles.get(str(to_role))
                    source = profiles[assignment.staff_role]
                    if handoff_recipient is None or not isinstance(
                        handoff.get("handoff_id"),
                        str,
                    ):
                        continue
                    artifact_ids = handoff.get("artifact_ids")
                    payload = {
                        **handoff,
                        "from_staff_id": handoff.get("from_staff_id") or source.id,
                        "to_staff_id": handoff_recipient.id,
                        "artifact_count": len(artifact_ids)
                        if isinstance(artifact_ids, list)
                        else 0,
                    }
                    await self.missions.emit(
                        mission.id,
                        "handoff.started",
                        payload,
                        staff_id=source.id,
                    )
                    waiting_handoffs.setdefault(str(to_role), []).append(payload)
        return outcomes

    def _execution_assignments(
        self,
        assignments: list[MissionPlanAssignment],
    ) -> list[MissionPlanAssignment]:
        if len(assignments) <= 1:
            return assignments
        coordinator_roles = {
            assignment.staff_role
            for assignment in assignments
            if assignment.staff_role == _COORDINATOR_ROLE
        }
        if not coordinator_roles:
            return assignments
        executable_roles = {
            assignment.staff_role
            for assignment in assignments
            if assignment.staff_role not in coordinator_roles
        }
        execution: list[MissionPlanAssignment] = []
        for assignment in assignments:
            if assignment.staff_role in coordinator_roles:
                continue
            copy = assignment.model_copy(deep=True)
            copy.dependencies = [
                dependency
                for dependency in copy.dependencies
                if dependency in executable_roles
            ]
            copy.handoff_to = [
                role for role in copy.handoff_to if role in executable_roles
            ]
            execution.append(copy)
        return execution

    async def _final_summary(
        self,
        mission: MissionRecord,
        outcomes: dict[str, AgentOutcome],
    ) -> str:
        await self.missions.wait_until_running(mission.id)
        await self.missions.emit(
            mission.id,
            "model.request.started",
            {"operation": "coordinator.final_summary"},
        )
        result = await self.provider.complete(
            ChatCompletionRequest(
                model=self.model,
                messages=[
                    ChatMessage(
                        role="system",
                        content=(
                            "Return a concise operational mission summary using only the supplied "
                            "outcomes. Do not expose hidden reasoning."
                        ),
                    ),
                    ChatMessage(
                        role="user",
                        content=json.dumps(
                            {
                                "objective": mission.objective,
                                "outcomes": {
                                    role: outcome.model_dump()
                                    for role, outcome in outcomes.items()
                                },
                            }
                        ),
                    ),
                ],
            )
        )
        await self.missions.wait_until_running(mission.id)
        await self.missions.emit(
            mission.id,
            "model.request.completed",
            {"operation": "coordinator.final_summary"},
        )
        summary = (result.content or "Mission completed.").strip()[:4000]
        lowered = summary.lower()
        if "chain-of-thought" in lowered or "reasoning:" in lowered:
            return "Mission completed; unsafe internal-reasoning content was withheld."
        return summary

    def _qa_follow_up_prompt(self, outcomes: dict[str, AgentOutcome]) -> str:
        for role, outcome in outcomes.items():
            for artifact in outcome.artifacts:
                if artifact.get("type") != "qa_report":
                    continue
                verdict = artifact.get("verdict", "")
                if verdict not in {"fail", "needs_improvement"}:
                    continue
                summary = artifact.get("summary", "Ava reported a browser QA issue.")
                url = artifact.get("url", "")
                screenshot = artifact.get("screenshot_path", "")
                return (
                    "QA follow-up fix required.\n"
                    f"QA role: {role}\n"
                    f"Verdict: {verdict}\n"
                    f"Observed issue: {summary}\n"
                    f"URL: {url}\n"
                    f"Screenshot: {screenshot}\n"
                    "Create a focused fix plan for the engineer role that owns the likely "
                    "defect. Include acceptance criteria and verification steps. Do not "
                    "start engineering work until the user accepts the proposed plan."
                )
        return ""
