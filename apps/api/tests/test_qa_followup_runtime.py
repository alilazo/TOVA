import asyncio
from pathlib import Path

import pytest

from app.events.broadcaster import EventBroadcaster
from app.events.memory import InMemoryEventStore
from app.orchestration.agent_runner import AgentRunner
from app.orchestration.coordinator import Coordinator
from app.orchestration.runtime import MissionRuntime
from app.schemas.approvals import BrowserAuditRequest
from app.schemas.mission_plan import MissionPlan, MissionPlanAcceptRequest, PlanAssignmentEdit
from app.schemas.missions import MissionCreateRequest
from app.schemas.models import ChatCompletionResult, ToolCall
from app.services.approvals import ApprovalRegistry
from app.services.missions import MissionRegistry
from app.services.staff_profiles import StaffProfileRepository
from app.tools.browser_qa import BrowserAuditExecution
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace
from tests.test_agent_runtime import FakeProvider


def _plan(role: str, objective: str, deliverables: list[str]) -> MissionPlan:
    return MissionPlan.model_validate(
        {
            "interpretation": objective,
            "mission_summary": objective,
            "assumptions": [],
            "risks": [],
            "required_roles": [role],
            "assignments": [
                {
                    "staff_role": role,
                    "objective": objective,
                    "rationale": f"{role} owns this step.",
                    "deliverables": deliverables,
                    "dependencies": [],
                    "sequence": 1,
                    "can_run_in_parallel": False,
                    "handoff_to": [],
                }
            ],
            "handoffs": [],
            "validation_strategy": ["Inspect evidence"],
            "completion_criteria": deliverables,
        }
    )


@pytest.mark.asyncio
async def test_nonpassing_browser_qa_proposes_user_approved_fix_plan(
    tmp_path: Path,
) -> None:
    provider = FakeProvider(
        [
            _plan("qa_tester", "Audit http://127.0.0.1:5173", ["QA browser audit"]),
            _plan("frontend_developer", "Fix overlapping primary button", ["index.html"]),
        ],
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="audit",
                        name="qa.browser.audit",
                        arguments={
                            "url": "http://127.0.0.1:5173",
                            "purpose": "Check generated page",
                            "acceptance_criteria": ["Primary button does not overlap text"],
                        },
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"QA found overlap risk"}'),
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="fix",
                        name="repository.write",
                        arguments={"path": "index.html", "content": "<button>Fixed</button>"},
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Fixed overlapping primary button"}'),
            ChatCompletionResult(content="Mission completed after QA fix."),
        ],
    )

    async def execute(
        request: BrowserAuditRequest,
        output_dir: Path,
    ) -> BrowserAuditExecution:
        (output_dir / "screenshot.png").write_bytes(b"png")
        return BrowserAuditExecution(
            ok=True,
            data={
                "url": request.url,
                "title": "Fixture",
                "verdict": "needs_improvement",
                "summary": "Primary button overlaps text",
                "screenshot_path": ".tova/browser-audits/audit/screenshot.png",
                "layout_findings": ["button overlaps heading"],
            },
        )

    store = InMemoryEventStore()
    missions = MissionRegistry(store, EventBroadcaster())
    mission = await missions.create(
        "project-1",
        MissionCreateRequest(
            objective="Create and QA a landing page",
            model_profile_id="profile_test",
            model="fake-test-model",
        ),
        project_root=str(tmp_path),
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    workspace = ProjectWorkspace(tmp_path)
    approvals = ApprovalRegistry()
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=approvals,
        workspace=workspace,
        emit=missions.emit,
        browser_audit_executor=execute,
    )
    runtime = MissionRuntime(
        provider=provider,
        model="fake",
        coordinator=Coordinator(provider, "fake"),
        agent_runner=runner,
        profiles=profiles,
        missions=missions,
    )

    await missions.start(mission.id)
    run_task = asyncio.create_task(runtime.run(missions.get(mission.id)))
    accept_task = asyncio.create_task(_accept_plan_count(missions, mission.id, count=2))
    approval_task = asyncio.create_task(_accept_browser_audit(approvals))
    await asyncio.gather(run_task, accept_task, approval_task)

    events = await store.list_after(mission.id, 0)
    assert [event.event_type for event in events].count("mission.plan.proposed") == 2
    assert "QA follow-up fix required" in str(events)
    assert (tmp_path / "index.html").read_text(encoding="utf-8") == "<button>Fixed</button>"
    assert missions.get(mission.id).status.value == "completed"


async def _accept_plan_count(
    missions: MissionRegistry,
    mission_id: str,
    *,
    count: int,
) -> None:
    accepted = 0
    while accepted < count:
        await asyncio.sleep(0.01)
        try:
            view = missions.get_proposed_plan(mission_id)
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
        except (LookupError, ValueError):
            continue
        accepted += 1


async def _accept_browser_audit(approvals: ApprovalRegistry) -> None:
    for _ in range(200):
        pending = approvals.list_pending()
        if pending:
            await approvals.accept(pending[0].id)
            return
        await asyncio.sleep(0.01)
    raise AssertionError("Timed out waiting for browser audit approval")
