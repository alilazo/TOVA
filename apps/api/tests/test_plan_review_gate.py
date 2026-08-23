import asyncio
from pathlib import Path

import pytest

from app.events.broadcaster import EventBroadcaster
from app.events.memory import InMemoryEventStore
from app.orchestration.agent_runner import AgentRunner
from app.orchestration.coordinator import Coordinator
from app.orchestration.runtime import MissionRuntime
from app.schemas.mission_plan import MissionPlan, MissionPlanAcceptRequest, PlanAssignmentEdit
from app.schemas.missions import MissionCreateRequest
from app.schemas.models import ChatCompletionResult, ToolCall
from app.services.approvals import ApprovalRegistry
from app.services.missions import MissionRegistry
from app.services.plan_review import plan_to_view
from app.services.staff_profiles import StaffProfileRepository
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace
from tests.test_agent_runtime import FakeProvider, one_assignment_plan


def _profiles() -> list:
    return StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()


async def _wait_for_event(
    store: InMemoryEventStore,
    mission_id: str,
    event_type: str,
    *,
    count: int = 1,
) -> list:
    for _ in range(200):
        events = await store.list_after(mission_id, 0)
        matched = [event for event in events if event.event_type == event_type]
        if len(matched) >= count:
            return matched
        await asyncio.sleep(0.01)
    raise AssertionError(f"Timed out waiting for {event_type}")


async def _accept_when_proposed(missions: MissionRegistry, mission_id: str) -> None:
    for _ in range(200):
        try:
            view = missions.get_proposed_plan(mission_id)
        except LookupError:
            await asyncio.sleep(0.01)
            continue
        await missions.accept_plan(
            mission_id,
            MissionPlanAcceptRequest(
                interpretation=view.interpretation,
                assignments=[
                    PlanAssignmentEdit(
                        staff_role=item.staff_role,
                        rationale=item.rationale,
                        objective=item.objective,
                    )
                    for item in view.assignments
                ],
            ),
        )
        return
    raise AssertionError("Timed out waiting for proposed plan")


async def _run_with_auto_accept(
    runtime: MissionRuntime,
    missions: MissionRegistry,
    mission_id: str,
) -> None:
    run_task = asyncio.create_task(runtime.run(missions.get(mission_id)))
    accept_task = asyncio.create_task(_accept_when_proposed(missions, mission_id))
    await asyncio.gather(run_task, accept_task)


@pytest.mark.asyncio
async def test_plan_propose_holds_runtime_until_accept(tmp_path: Path) -> None:
    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="call-1",
                        name="repository.write",
                        arguments={"path": "result.txt", "content": "done\n"},
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Created result.txt"}'),
            ChatCompletionResult(content="Mission completed."),
        ],
    )
    store = InMemoryEventStore()
    missions = MissionRegistry(store, EventBroadcaster())
    mission = await missions.create(
        "project-1",
        MissionCreateRequest(
            objective="Create result",
            model_profile_id="profile_test",
            model="fake-test-model",
        ),
        project_root=str(tmp_path),
    )
    workspace = ProjectWorkspace(tmp_path)
    runtime = MissionRuntime(
        provider=provider,
        model="fake",
        coordinator=Coordinator(provider, "fake"),
        agent_runner=AgentRunner(
            provider=provider,
            model="fake",
            tools=RepositoryToolRegistry(workspace),
            approvals=ApprovalRegistry(),
            workspace=workspace,
            emit=missions.emit,
        ),
        profiles=_profiles(),
        missions=missions,
    )

    await missions.start(mission.id)
    run_task = asyncio.create_task(runtime.run(missions.get(mission.id)))
    proposed = await _wait_for_event(store, mission.id, "mission.plan.proposed")
    assert proposed[0].payload["interpretation"]
    assert proposed[0].payload["assignments"][0]["rationale"]
    events = await store.list_after(mission.id, 0)
    assert not any(event.event_type == "staff.assigned" for event in events)
    assert not any(event.event_type == "mission.team.assembly.completed" for event in events)
    assert not any(event.event_type == "mission.started" for event in events)

    view = missions.get_proposed_plan(mission.id)
    await missions.accept_plan(
        mission.id,
        MissionPlanAcceptRequest(
            interpretation="Edited interpretation",
            assignments=[
                PlanAssignmentEdit(
                    staff_role=item.staff_role,
                    rationale="Edited why",
                    objective=item.objective,
                )
                for item in view.assignments
            ],
        ),
    )
    await run_task

    events = await store.list_after(mission.id, 0)
    assert any(event.event_type == "mission.plan.accepted" for event in events)
    assert any(event.event_type == "staff.assigned" for event in events)
    assert events[-1].event_type == "mission.completed"
    assert (tmp_path / "result.txt").read_text() == "done\n"


@pytest.mark.asyncio
async def test_deny_plan_unblocks_runtime_without_starting_staff(
    tmp_path: Path,
) -> None:
    store = InMemoryEventStore()
    missions = MissionRegistry(store, EventBroadcaster())
    mission = await missions.create(
        "project-1",
        MissionCreateRequest(
            objective="Create result",
            model_profile_id="profile_test",
            model="fake-test-model",
        ),
        project_root=str(tmp_path),
    )
    plan = one_assignment_plan()
    await missions.propose_plan(mission.id, plan, plan_to_view(plan, _profiles()))

    await missions.deny_plan(mission.id, notes="Not needed")
    decision = await missions.wait_for_plan_decision(mission.id)
    events = await store.list_after(mission.id, 0)

    assert decision.kind.value == "deny"
    assert decision.notes == "Not needed"
    assert any(event.event_type == "mission.plan.denied" for event in events)
    assert not any(event.event_type == "mission.started" for event in events)
    assert not any(event.event_type == "staff.assigned" for event in events)


@pytest.mark.asyncio
async def test_runtime_skips_project_coordinator_execution_when_work_is_assigned(
    tmp_path: Path,
) -> None:
    plan = MissionPlan.model_validate(
        {
            "interpretation": "Alex coordinates, Lina builds the site.",
            "mission_summary": "Build a static site.",
            "assumptions": [],
            "risks": [],
            "required_roles": ["project_coordinator", "frontend_developer"],
            "assignments": [
                {
                    "staff_role": "project_coordinator",
                    "objective": "Coordinate the plan and choose implementation staff.",
                    "rationale": "Alex owns coordination.",
                    "deliverables": ["handoff to frontend_developer"],
                    "dependencies": [],
                    "sequence": 1,
                    "can_run_in_parallel": False,
                    "handoff_to": ["frontend_developer"],
                },
                {
                    "staff_role": "frontend_developer",
                    "objective": "Create index.html",
                    "rationale": "Lina owns frontend implementation.",
                    "deliverables": ["index.html"],
                    "dependencies": ["project_coordinator"],
                    "sequence": 2,
                    "can_run_in_parallel": False,
                    "handoff_to": [],
                },
            ],
            "handoffs": [],
            "validation_strategy": ["Inspect index.html"],
            "completion_criteria": ["index.html exists"],
        }
    )
    provider = FakeProvider(
        plan,
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="write-index",
                        name="repository.write",
                        arguments={"path": "index.html", "content": "<button>Click Me</button>"},
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Created index.html"}'),
            ChatCompletionResult(content="Mission completed."),
        ],
    )
    store = InMemoryEventStore()
    missions = MissionRegistry(store, EventBroadcaster())
    mission = await missions.create(
        "project-1",
        MissionCreateRequest(
            objective="Have Alex coordinate and Lina build a site",
            model_profile_id="profile_test",
            model="fake-test-model",
        ),
        project_root=str(tmp_path),
    )
    workspace = ProjectWorkspace(tmp_path)
    runtime = MissionRuntime(
        provider=provider,
        model="fake",
        coordinator=Coordinator(provider, "fake"),
        agent_runner=AgentRunner(
            provider=provider,
            model="fake",
            tools=RepositoryToolRegistry(workspace),
            approvals=ApprovalRegistry(),
            workspace=workspace,
            emit=missions.emit,
        ),
        profiles=_profiles(),
        missions=missions,
    )

    await missions.start(mission.id)
    await _run_with_auto_accept(runtime, missions, mission.id)

    events = await store.list_after(mission.id, 0)
    started_staff = [
        event.staff_id
        for event in events
        if event.event_type == "staff.action.started"
    ]
    assembly_events = [
        event
        for event in events
        if event.event_type == "mission.team.assembly.completed"
    ]
    assert assembly_events[-1].payload["summary"] == "Assembled 1 assignments"
    assert "staff_alex" not in started_staff
    assert "staff_lina" in started_staff
    assert (tmp_path / "index.html").read_text(encoding="utf-8") == (
        "<button>Click Me</button>"
    )


@pytest.mark.asyncio
async def test_accept_plan_can_remove_assignment_from_review(tmp_path: Path) -> None:
    plan = one_assignment_plan()
    extra = plan.assignments[0].model_copy(
        update={
            "staff_role": "qa_tester",
            "objective": "Verify result.txt",
            "rationale": "QA validates the result.",
            "deliverables": ["QA report"],
            "dependencies": ["backend_developer"],
            "sequence": 2,
        }
    )
    plan.assignments.append(extra)
    plan.required_roles.append("qa_tester")
    store = InMemoryEventStore()
    missions = MissionRegistry(store, EventBroadcaster())
    mission = await missions.create(
        "project-1",
        MissionCreateRequest(
            objective="Create result",
            model_profile_id="profile_test",
            model="fake-test-model",
        ),
        project_root=str(tmp_path),
    )
    await missions.propose_plan(mission.id, plan, plan_to_view(plan, _profiles()))

    await missions.accept_plan(
        mission.id,
        MissionPlanAcceptRequest(
            interpretation=plan.interpretation,
            assignments=[
                PlanAssignmentEdit(
                    staff_role="backend_developer",
                    rationale="Keep only implementation.",
                    objective="Create result",
                )
            ],
        ),
    )
    decision = await missions.wait_for_plan_decision(mission.id)

    assert decision.plan is not None
    assert [assignment.staff_role for assignment in decision.plan.assignments] == [
        "backend_developer"
    ]
    assert decision.plan.required_roles == ["backend_developer"]


@pytest.mark.asyncio
async def test_plan_regenerate_emits_second_proposal_without_agents(tmp_path: Path) -> None:
    first = one_assignment_plan(interpretation="First reading")
    second = one_assignment_plan(interpretation="Second reading after feedback")
    provider = FakeProvider(
        [first, second],
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="call-1",
                        name="repository.write",
                        arguments={"path": "result.txt", "content": "done\n"},
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Created result.txt"}'),
            ChatCompletionResult(content="Mission completed."),
        ],
    )
    store = InMemoryEventStore()
    missions = MissionRegistry(store, EventBroadcaster())
    mission = await missions.create(
        "project-1",
        MissionCreateRequest(
            objective="Create result",
            model_profile_id="profile_test",
            model="fake-test-model",
        ),
        project_root=str(tmp_path),
    )
    workspace = ProjectWorkspace(tmp_path)
    runtime = MissionRuntime(
        provider=provider,
        model="fake",
        coordinator=Coordinator(provider, "fake"),
        agent_runner=AgentRunner(
            provider=provider,
            model="fake",
            tools=RepositoryToolRegistry(workspace),
            approvals=ApprovalRegistry(),
            workspace=workspace,
            emit=missions.emit,
        ),
        profiles=_profiles(),
        missions=missions,
    )

    await missions.start(mission.id)
    run_task = asyncio.create_task(runtime.run(missions.get(mission.id)))
    await _wait_for_event(store, mission.id, "mission.plan.proposed", count=1)
    await missions.regenerate_plan(mission.id, notes="Prefer a tighter scope")
    proposed = await _wait_for_event(store, mission.id, "mission.plan.proposed", count=2)
    events = await store.list_after(mission.id, 0)
    assert any(event.event_type == "mission.plan.regenerating" for event in events)
    assert not any(event.event_type == "staff.assigned" for event in events)
    assert proposed[-1].payload["interpretation"] == "Second reading after feedback"
    assert "Prefer a tighter scope" in provider.last_user_prompt

    view = missions.get_proposed_plan(mission.id)
    await missions.accept_plan(
        mission.id,
        MissionPlanAcceptRequest(
            interpretation=view.interpretation,
            assignments=[
                PlanAssignmentEdit(
                    staff_role=item.staff_role,
                    rationale=item.rationale,
                    objective=item.objective,
                )
                for item in view.assignments
            ],
        ),
    )
    await run_task
    assert (tmp_path / "result.txt").read_text() == "done\n"
