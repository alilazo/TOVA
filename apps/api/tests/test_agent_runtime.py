import asyncio
from pathlib import Path
from typing import TypeVar

import pytest
from pydantic import BaseModel

from app.events.broadcaster import EventBroadcaster
from app.events.memory import InMemoryEventStore
from app.orchestration.agent_runner import AgentRunner
from app.orchestration.coordinator import Coordinator, PlanContext, ProjectKind
from app.orchestration.runtime import MissionRuntime
from app.providers.openai_compatible import ProviderError, ProviderErrorCode
from app.schemas.mission_plan import (
    MissionPlan,
    MissionPlanAcceptRequest,
    PlanAssignmentEdit,
)
from app.schemas.missions import MissionCreateRequest
from app.schemas.models import ChatCompletionResult, ToolCall
from app.services.approvals import ApprovalRegistry
from app.services.missions import MissionRegistry
from app.services.staff_profiles import StaffProfileRepository
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace

T = TypeVar("T", bound=BaseModel)


class FakeProvider:
    def __init__(
        self,
        plan: MissionPlan | list[MissionPlan],
        completions: list[ChatCompletionResult],
    ) -> None:
        self.plans = plan if isinstance(plan, list) else [plan]
        self.plan_index = 0
        self.completions = completions
        self.last_user_prompt = ""
        self.last_system_prompt = ""
        self.last_completion_messages = []

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        output_type: type[T],
        model: str,
    ) -> T:
        self.last_system_prompt = system_prompt
        del model
        self.last_user_prompt = user_prompt
        current = self.plans[min(self.plan_index, len(self.plans) - 1)]
        self.plan_index += 1
        return output_type.model_validate(current.model_dump())

    async def complete(self, _request: object) -> ChatCompletionResult:
        self.last_completion_messages = getattr(_request, "messages", [])
        return self.completions.pop(0)


def one_assignment_plan(*, interpretation: str = "Create a result file.") -> MissionPlan:
    return MissionPlan.model_validate(
        {
            "interpretation": interpretation,
            "mission_summary": "Update a project file",
            "assumptions": [],
            "risks": [],
            "required_roles": ["backend_developer"],
            "assignments": [{
                "staff_role": "backend_developer",
                "objective": "Create result",
                "rationale": "Backend developer owns repository writes.",
                "deliverables": ["result.txt"],
                "dependencies": [],
                "sequence": 1,
                "can_run_in_parallel": False,
                "handoff_to": [],
            }],
            "handoffs": [],
            "validation_strategy": ["Inspect result"],
            "completion_criteria": ["result exists"],
        }
    )


def frontend_plan_with_deliverables(deliverables: list[str]) -> MissionPlan:
    plan = one_assignment_plan(interpretation="Add another fun button.")
    return plan.model_copy(
        update={
            "required_roles": ["frontend_developer"],
            "assignments": [
                plan.assignments[0].model_copy(
                    update={
                        "staff_role": "frontend_developer",
                        "objective": "Add another fun button",
                        "deliverables": deliverables,
                    }
                )
            ],
        },
        deep=True,
    )


def frontend_to_qa_plan() -> MissionPlan:
    return MissionPlan.model_validate(
        {
            "interpretation": "Lina implements a static page, then Ava validates it.",
            "mission_summary": "Build and QA a static landing page",
            "assumptions": [],
            "risks": [],
            "required_roles": ["frontend_developer", "qa_tester"],
            "assignments": [
                {
                    "staff_role": "frontend_developer",
                    "objective": "Create index.html",
                    "rationale": "Lina owns implementation.",
                    "deliverables": ["index.html"],
                    "dependencies": [],
                    "sequence": 1,
                    "can_run_in_parallel": False,
                    "handoff_to": ["qa_tester"],
                },
                {
                    "staff_role": "qa_tester",
                    "objective": "Validate index.html and report QA evidence.",
                    "rationale": "Ava owns QA evidence.",
                    "deliverables": ["QA report"],
                    "dependencies": ["frontend_developer"],
                    "sequence": 2,
                    "can_run_in_parallel": False,
                    "handoff_to": [],
                },
            ],
            "handoffs": [
                {
                    "from_role": "frontend_developer",
                    "to_role": "qa_tester",
                    "title": "Implementation ready for QA",
                    "required_deliverables": ["index.html"],
                }
            ],
            "validation_strategy": ["Ava verifies index.html"],
            "completion_criteria": ["index.html exists", "QA evidence recorded"],
        }
    )


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


class FailingPlanProvider(FakeProvider):
    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        output_type: type[T],
        model: str,
    ) -> T:
        del system_prompt, user_prompt, output_type, model
        raise ProviderError(ProviderErrorCode.TIMEOUT, "Model request timed out")


@pytest.mark.asyncio
async def test_plan_timeout_emits_model_request_failed(tmp_path: Path) -> None:
    provider = FailingPlanProvider(one_assignment_plan(), [])
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
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    workspace = ProjectWorkspace(tmp_path)
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=missions.emit,
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
    await runtime.run(missions.get(mission.id))

    events = await store.list_after(mission.id, 0)
    types = [event.event_type for event in events]
    assert "model.request.started" in types
    assert "model.request.failed" in types
    assert types[-1] == "mission.failed"


@pytest.mark.asyncio
async def test_fake_provider_completes_mission_with_repository_tool(tmp_path: Path) -> None:
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
            ChatCompletionResult(content="Mission completed with one verified file."),
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
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    workspace = ProjectWorkspace(tmp_path)
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=missions.emit,
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
    await _run_with_auto_accept(runtime, missions, mission.id)

    assert (tmp_path / "result.txt").read_text() == "done\n"
    events = await store.list_after(mission.id, 0)
    assert events[-1].event_type == "mission.completed"
    assert all("chain-of-thought" not in str(event.payload).lower() for event in events)
    file_events = [e for e in events if e.event_type.startswith("staff.file.")]
    assert any(
        e.event_type in {"staff.file.created", "staff.file.updated"}
        and e.payload.get("file_path") == "result.txt"
        and "result.txt" in str(e.payload.get("title", ""))
        for e in file_events
    )


@pytest.mark.asyncio
async def test_runtime_emits_structured_lina_to_ava_handoff(tmp_path: Path) -> None:
    provider = FakeProvider(
        frontend_to_qa_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="write-index",
                        name="repository.write",
                        arguments={
                            "path": "index.html",
                            "content": "<button>Ship it</button>",
                        },
                    ),
                    ToolCall(
                        id="handoff-to-qa",
                        name="handoff.prepare",
                        arguments={
                            "to_role": "qa_tester",
                            "summary": "Implementation is ready for Ava to validate.",
                            "changed_paths": ["index.html"],
                            "test_instructions": ["Open index.html and inspect the button."],
                            "acceptance_criteria": ["The button is visible and readable."],
                        },
                    ),
                ]
            ),
            ChatCompletionResult(
                content='{"summary":"Created index.html and prepared QA handoff."}',
            ),
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="qa-report",
                        name="artifact.create",
                        arguments={
                            "title": "QA evidence",
                            "summary": "Ava verified the button is visible.",
                        },
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"QA passed."}'),
            ChatCompletionResult(content="Mission completed with implementation and QA evidence."),
        ],
    )
    store = InMemoryEventStore()
    missions = MissionRegistry(store, EventBroadcaster())
    mission = await missions.create(
        "project-1",
        MissionCreateRequest(
            objective="Create and QA a simple page",
            model_profile_id="profile_test",
            model="fake-test-model",
        ),
        project_root=str(tmp_path),
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    workspace = ProjectWorkspace(tmp_path)
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=missions.emit,
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
    await _run_with_auto_accept(runtime, missions, mission.id)

    events = await store.list_after(mission.id, 0)
    selected = [event for event in events if event.event_type == "mission.team.member.selected"]
    handoffs = [event for event in events if event.event_type == "handoff.started"]
    assert [event.staff_id for event in selected] == ["staff_lina", "staff_ava"]
    assert len(handoffs) == 1
    assert handoffs[0].payload["from_staff_id"] == "staff_lina"
    assert handoffs[0].payload["to_staff_id"] == "staff_ava"
    assert handoffs[0].payload["changed_paths"] == ["index.html"]
    assert handoffs[0].payload["test_instructions"] == [
        "Open index.html and inspect the button."
    ]
    assert handoffs[0].payload["acceptance_criteria"] == [
        "The button is visible and readable."
    ]
    assert not any(
        event.event_type == "staff.file.updated" and event.staff_id == "staff_ava"
        for event in events
    )


@pytest.mark.asyncio
async def test_coordinator_plan_prompt_includes_session_context() -> None:
    provider = FakeProvider(one_assignment_plan(), [])
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()

    await Coordinator(provider, "fake").create_plan(
        "Fix the header copy",
        profiles,
        operational_context=(
            "Previous prompt: Build a minimal website\n"
            "Result: Built index.html\n"
            "Current project files:\n- index.html"
        ),
    )

    assert "Fix the header copy" in provider.last_user_prompt
    assert "Previous prompt: Build a minimal website" in provider.last_user_prompt
    assert "index.html" in provider.last_user_prompt


def test_plan_context_detects_static_site_from_file_inventory() -> None:
    context = PlanContext.from_text(
        "Current project files:\n"
        "- index.html\n"
        "- script.js\n"
        "- style.css\n"
        "- README.md"
    )

    assert context.project_kind == ProjectKind.STATIC_SITE
    assert context.primary_files == ("index.html", "script.js", "style.css")
    assert "index.html" in context.to_prompt()


def test_plan_context_detects_static_site_with_styles_css() -> None:
    context = PlanContext.from_text(
        "Current project files:\n"
        "- index.html\n"
        "- script.js\n"
        "- styles.css\n"
        "- starter.json"
    )

    assert context.project_kind == ProjectKind.STATIC_SITE
    assert context.primary_files == ("index.html", "script.js", "styles.css")


@pytest.mark.asyncio
async def test_coordinator_normalizes_deliverables_before_returning_plan() -> None:
    provider = FakeProvider(
        frontend_plan_with_deliverables([
            ".\\index.html",
            "./script.js",
            "script.js",
            "style.css",
        ]),
        [],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()

    plan = await Coordinator(provider, "fake").create_plan(
        "Add another fun button",
        profiles,
        operational_context="Current project files:\n- index.html\n- script.js\n- style.css",
    )

    assert plan.assignments[0].deliverables == ["index.html", "script.js", "style.css"]


@pytest.mark.asyncio
async def test_coordinator_uses_compact_prompt_for_simple_static_site_edits() -> None:
    provider = FakeProvider(frontend_plan_with_deliverables(["index.html"]), [])
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()

    await Coordinator(provider, "fake").create_plan(
        "Add another button",
        profiles,
        operational_context="Current project files:\n- index.html\n- script.js\n- style.css",
    )

    assert "Compact planning mode" in provider.last_system_prompt
    assert "frontend_developer:" in provider.last_system_prompt


@pytest.mark.asyncio
async def test_coordinator_rejects_new_src_tree_for_existing_static_site() -> None:
    provider = FakeProvider(
        [
            frontend_plan_with_deliverables([
                "src/components/FunButton.jsx",
                "src/styles/FunButton.css",
            ]),
            frontend_plan_with_deliverables(["index.html", "script.js", "style.css"]),
        ],
        [],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()

    plan = await Coordinator(provider, "fake").create_plan(
        "please add another fun button to the website and run QA after.",
        profiles,
        operational_context=(
            "Current project files:\n"
            "- index.html\n"
            "- script.js\n"
            "- style.css"
        ),
    )

    assert provider.plan_index == 2
    assert "static site" in provider.last_user_prompt
    assert plan.assignments[0].deliverables == ["index.html", "script.js", "style.css"]


@pytest.mark.asyncio
async def test_runtime_emits_plan_repair_evidence(tmp_path: Path) -> None:
    provider = FakeProvider(
        [
            frontend_plan_with_deliverables(["src/components/FunButton.jsx"]),
            frontend_plan_with_deliverables(["index.html", "script.js", "style.css"]),
        ],
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="write-index",
                        name="repository.write",
                        arguments={"path": "index.html", "content": "<button>More</button>\n"},
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Updated static files."}'),
            ChatCompletionResult(content="Mission completed."),
        ],
    )
    store = InMemoryEventStore()
    missions = MissionRegistry(store, EventBroadcaster())
    mission = await missions.create(
        "project-1",
        MissionCreateRequest(
            objective="Add another fun button",
            model_profile_id="profile_test",
            model="fake-test-model",
        ),
        project_root=str(tmp_path),
        context_summary="Current project files:\n- index.html\n- script.js\n- style.css",
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    workspace = ProjectWorkspace(tmp_path)
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=missions.emit,
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
    await _run_with_auto_accept(runtime, missions, mission.id)

    events = await store.list_after(mission.id, 0)
    repair_events = [
        event for event in events
        if event.event_type == "mission.analysis.updated"
        and event.payload.get("summary") == "Coordinator repaired mission plan"
    ]
    assert repair_events
    assert "src/ framework tree" in str(repair_events[0].payload)


@pytest.mark.asyncio
async def test_agent_assignment_prompt_includes_session_context(tmp_path: Path) -> None:
    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="read-header",
                        name="repository.read",
                        arguments={"path": "index.html"},
                    )
                ]
            ),
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="qa-report",
                        name="artifact.create",
                        arguments={
                            "title": "Header review",
                            "summary": "Welcome heading is present.",
                            "type": "qa_report",
                        },
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Reviewed existing context."}'),
        ],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    (tmp_path / "index.html").write_text("<h1>Header</h1>\n", encoding="utf-8")
    profile = next(item for item in profiles if item.role_key == "qa_tester")
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=ApprovalRegistry(),
        workspace=ProjectWorkspace(tmp_path),
        emit=lambda *_args, **_kwargs: asyncio.sleep(0),
    )

    await runner.run_assignment(
        "mission-1",
        profile,
        one_assignment_plan().assignments[0].model_copy(
            update={"staff_role": "qa_tester", "objective": "Review the header"}
        ),
        mission_context="Previous prompt: Build a minimal website\n- index.html",
    )

    user_messages = [
        message.content
        for message in provider.last_completion_messages
        if message.role == "user"
    ]
    assert any("Previous prompt: Build a minimal website" in item for item in user_messages)


@pytest.mark.asyncio
async def test_repeated_tool_call_is_reported_as_recoverable_error(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<button>Click</button>\n", encoding="utf-8")
    repeated_call = ToolCall(
        id="read-index",
        name="repository.read",
        arguments={"path": "index.html"},
    )
    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(tool_calls=[repeated_call.model_copy(update={"id": "read-1"})]),
            ChatCompletionResult(tool_calls=[repeated_call.model_copy(update={"id": "read-2"})]),
            ChatCompletionResult(tool_calls=[repeated_call.model_copy(update={"id": "read-3"})]),
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="qa-report",
                        name="artifact.create",
                        arguments={
                            "title": "Recovered review",
                            "summary": "Recovered after repeated read.",
                            "type": "qa_report",
                        },
                    )
                ]
            ),
        ],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    profile = next(item for item in profiles if item.role_key == "qa_tester")
    events: list[tuple[str, dict]] = []

    async def emit(
        _mission_id: str,
        event_type: str,
        payload: dict,
        *,
        staff_id: str | None = None,
    ) -> object:
        del staff_id
        events.append((event_type, payload))
        return object()

    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=ApprovalRegistry(),
        workspace=ProjectWorkspace(tmp_path),
        emit=emit,
        repeated_call_limit=2,
    )

    outcome = await runner.run_assignment(
        "mission-1",
        profile,
        one_assignment_plan().assignments[0].model_copy(
            update={"staff_role": "qa_tester", "objective": "Review index.html"}
        ),
    )

    assert outcome.summary == "Recovered after repeated read."
    assert any(
        payload.get("summary") == "Repeated tool call suppressed"
        for event_type, payload in events
        if event_type == "staff.action.updated"
    )
    user_messages = [
        message.content
        for message in provider.last_completion_messages
        if message.role == "user"
    ]
    assert any("Do not call repository.read again" in item for item in user_messages)


@pytest.mark.asyncio
async def test_agent_runner_soft_remediates_missing_objective_wording(
    tmp_path: Path,
) -> None:
    weak = "<!DOCTYPE html><html><body><p>hello</p></body></html>\n"
    strong = "<!DOCTYPE html><html><body><p>Hello TOVA</p></body></html>\n"
    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="write-weak",
                        name="repository.write",
                        arguments={"path": "hello.html", "content": weak},
                    )
                ]
            ),
            ChatCompletionResult(
                content='```json\n{"summary":"Created hello.html"}\n```'
            ),
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="write-strong",
                        name="repository.write",
                        arguments={"path": "hello.html", "content": strong},
                    )
                ]
            ),
            ChatCompletionResult(
                content='{"summary":"Created hello.html with Hello TOVA centered."}'
            ),
        ],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    workspace = ProjectWorkspace(tmp_path)
    events: list[tuple[str, dict]] = []

    async def emit(
        _mission_id: str,
        event_type: str,
        payload: dict,
        *,
        staff_id: str | None = None,
    ) -> object:
        del staff_id
        events.append((event_type, payload))
        return object()

    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=emit,
    )
    profile = next(
        item for item in profiles if item.role_key == "frontend_developer"
    )
    assignment = one_assignment_plan().assignments[0].model_copy(
        update={
            "staff_role": "frontend_developer",
            # Vague assignment objective must still remediates using mission wording.
            "objective": "Write the code for hello.html",
            "deliverables": ["hello.html"],
        }
    )

    outcome = await runner.run_assignment(
        "mission-1",
        profile,
        assignment,
        mission_objective=(
            "Create a tiny hello.html page that shows the text Hello TOVA "
            "centered on the page."
        ),
    )

    assert (tmp_path / "hello.html").read_text(encoding="utf-8") == strong
    assert outcome.summary == "Created hello.html with Hello TOVA centered."
    assert "```" not in outcome.summary
    assert provider.completions == []
    completed = [
        payload
        for event_type, payload in events
        if event_type == "staff.action.completed"
    ]
    assert len(completed) == 1
    assert completed[0]["summary"] == outcome.summary


def test_completion_summary_unwraps_markdown_json_fences(tmp_path: Path) -> None:
    async def emit(*_args: object, **_kwargs: object) -> object:
        return object()

    workspace = ProjectWorkspace(tmp_path)
    runner = AgentRunner(
        provider=FakeProvider(one_assignment_plan(), []),
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=emit,
    )
    fenced = (
        '```json\n'
        '{\n'
        '  "summary": "Created hello.html with flexbox centering."\n'
        '}\n'
        '```'
    )
    assert runner._completion_summary(fenced) == (
        "Created hello.html with flexbox centering."
    )
    assert runner._completion_summary(
        '{"summary":"Plain JSON summary"}'
    ) == "Plain JSON summary"


def test_objective_phrases_ignore_staff_and_workflow_labels(tmp_path: Path) -> None:
    async def emit(*_args: object, **_kwargs: object) -> object:
        return object()

    runner = AgentRunner(
        provider=FakeProvider(one_assignment_plan(), []),
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=ApprovalRegistry(),
        workspace=ProjectWorkspace(tmp_path),
        emit=emit,
    )

    phrases = runner._distinctive_phrases(
        'Alex the Project Coordinator should pick the Front-End Developer. '
        'Ava the QA Tester should verify the page. If QA fails, keep the '
        'button labeled "Click Me" and the brand text Hello TOVA. The Front '
        'should not become page copy.'
    )

    assert "Click Me" in phrases
    assert "Hello TOVA" in phrases
    assert "Project Coordinator" not in phrases
    assert "The Front" not in phrases
    assert "End Developer" not in phrases
    assert "QA Tester" not in phrases
    assert "If QA" not in phrases


@pytest.mark.asyncio
async def test_agent_runner_stops_repeated_identical_tool_calls(tmp_path: Path) -> None:
    repeated = ChatCompletionResult(
        tool_calls=[
            ToolCall(
                id="same",
                name="repository.list",
                arguments={"path": "."},
            )
        ]
    )
    provider = FakeProvider(
        one_assignment_plan(),
        [
            repeated,
            repeated,
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="write-result",
                        name="repository.write",
                        arguments={"path": "result.txt", "content": "done\n"},
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Recovered with result.txt"}'),
        ],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    workspace = ProjectWorkspace(tmp_path)

    events: list[tuple[str, dict]] = []

    async def emit(
        _mission_id: str,
        event_type: str,
        payload: dict,
        *,
        staff_id: str | None = None,
    ) -> object:
        del staff_id
        events.append((event_type, payload))
        return object()

    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=emit,
        repeated_call_limit=1,
    )
    assignment = one_assignment_plan().assignments[0]
    profile = next(profile for profile in profiles if profile.role_key == "backend_developer")
    outcome = await runner.run_assignment("mission-1", profile, assignment)

    assert outcome.summary == "Recovered with result.txt"
    assert (tmp_path / "result.txt").read_text(encoding="utf-8") == "done\n"
    assert any(
        payload.get("summary") == "Repeated tool call suppressed"
        for event_type, payload in events
        if event_type == "staff.action.updated"
    )


@pytest.mark.asyncio
async def test_agent_runner_enforces_profile_write_permissions(tmp_path: Path) -> None:
    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="denied",
                        name="repository.write",
                        arguments={"path": "forbidden.txt", "content": "no"},
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Write was denied"}'),
        ],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    workspace = ProjectWorkspace(tmp_path)

    async def emit(*_args: object, **_kwargs: object) -> object:
        return object()

    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=emit,
    )
    profile = next(profile for profile in profiles if profile.role_key == "researcher")
    await runner.run_assignment("mission-1", profile, one_assignment_plan().assignments[0])
    assert not (tmp_path / "forbidden.txt").exists()


def test_agent_runner_grants_tools_by_staff_role(tmp_path: Path) -> None:
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    workspace = ProjectWorkspace(tmp_path)

    async def emit(*_args: object, **_kwargs: object) -> object:
        return object()

    runner = AgentRunner(
        provider=FakeProvider(one_assignment_plan(), []),
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=emit,
    )
    by_role = {profile.role_key: profile for profile in profiles}

    alex_tools = runner._allowed_tools(by_role["project_coordinator"])
    lina_tools = runner._allowed_tools(by_role["frontend_developer"])
    ava_tools = runner._allowed_tools(by_role["qa_tester"])

    assert {"repository.list", "repository.search", "repository.read"} <= alex_tools
    assert "repository.write" not in alex_tools
    assert {"repository.find", "repository.write", "repository.apply_patch"} <= lina_tools
    assert "command.request" in lina_tools
    assert "qa.browser.audit" in ava_tools
    assert "repository.write" not in ava_tools
    assert "repository.delete" not in ava_tools


def _profiles() -> list:
    return StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()


async def _run_mission(
    tmp_path: Path,
    completions: list[ChatCompletionResult],
) -> tuple[MissionRegistry, object, InMemoryEventStore]:
    provider = FakeProvider(one_assignment_plan(), completions)
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
    profiles = _profiles()
    workspace = ProjectWorkspace(tmp_path)
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=missions.emit,
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
    await _run_with_auto_accept(runtime, missions, mission.id)
    return missions, mission, store


@pytest.mark.asyncio
async def test_truncation_then_recovery_completes_with_write(tmp_path: Path) -> None:
    missions, mission, store = await _run_mission(
        tmp_path,
        [
            ChatCompletionResult(
                content="I will create result.txt next...",
                finish_reason="length",
            ),
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
            ChatCompletionResult(content="Mission completed with one verified file."),
        ],
    )

    assert missions.get(mission.id).status.value == "completed"
    assert (tmp_path / "result.txt").read_text() == "done\n"
    events = await store.list_after(mission.id, 0)
    assert events[-1].event_type == "mission.completed"


@pytest.mark.asyncio
async def test_truncation_without_recovery_fails_mission(tmp_path: Path) -> None:
    missions, mission, store = await _run_mission(
        tmp_path,
        [
            ChatCompletionResult(
                content="Still writing the plan for result.txt...",
                finish_reason="length",
            ),
            ChatCompletionResult(
                content="Continuing the unfinished plan...",
                finish_reason="length",
            ),
        ],
    )

    assert missions.get(mission.id).status.value == "failed"
    assert not (tmp_path / "result.txt").exists()
    events = await store.list_after(mission.id, 0)
    assert events[-1].event_type == "mission.failed"


@pytest.mark.asyncio
async def test_write_capable_role_cannot_complete_without_file_mutation(
    tmp_path: Path,
) -> None:
    missions, mission, store = await _run_mission(
        tmp_path,
        [
            ChatCompletionResult(
                content='{"summary":"Created result.txt without tools"}',
                finish_reason="stop",
            ),
            ChatCompletionResult(
                content='{"summary":"Still claiming success without writing"}',
                finish_reason="stop",
            ),
        ],
    )

    assert missions.get(mission.id).status.value == "failed"
    assert not (tmp_path / "result.txt").exists()
    events = await store.list_after(mission.id, 0)
    assert events[-1].event_type == "mission.failed"


@pytest.mark.asyncio
async def test_qa_role_cannot_complete_without_evidence(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<button>Count</button>\n", encoding="utf-8")
    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                content='{"summary":"Looks good without reading files"}',
                finish_reason="stop",
            ),
            ChatCompletionResult(
                content='{"summary":"Still no evidence"}',
                finish_reason="stop",
            ),
        ],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    profile = next(item for item in profiles if item.role_key == "qa_tester")
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=ApprovalRegistry(),
        workspace=ProjectWorkspace(tmp_path),
        emit=lambda *_args, **_kwargs: asyncio.sleep(0),
    )
    with pytest.raises(RuntimeError, match="QA assignment completed without"):
        await runner.run_assignment(
            "mission-1",
            profile,
            one_assignment_plan().assignments[0].model_copy(
                update={"staff_role": "qa_tester", "objective": "Review index.html"}
            ),
        )


@pytest.mark.asyncio
async def test_qa_role_cannot_complete_with_file_reads_only(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<button>Count</button>\n", encoding="utf-8")
    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="read-index",
                        name="repository.read",
                        arguments={"path": "index.html"},
                    )
                ]
            ),
            ChatCompletionResult(
                content='{"summary":"Read the file and it looks fine"}',
                finish_reason="stop",
            ),
            ChatCompletionResult(
                content='{"summary":"Still finishing after a read"}',
                finish_reason="stop",
            ),
        ],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    profile = next(item for item in profiles if item.role_key == "qa_tester")
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=ApprovalRegistry(),
        workspace=ProjectWorkspace(tmp_path),
        emit=lambda *_args, **_kwargs: asyncio.sleep(0),
    )
    with pytest.raises(RuntimeError, match="QA assignment completed without"):
        await runner.run_assignment(
            "mission-1",
            profile,
            one_assignment_plan().assignments[0].model_copy(
                update={"staff_role": "qa_tester", "objective": "Review index.html"}
            ),
        )


@pytest.mark.asyncio
async def test_qa_role_can_complete_with_qa_report_artifact(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<button>Count</button>\n", encoding="utf-8")
    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="qa-report",
                        name="artifact.create",
                        arguments={
                            "title": "Count button review",
                            "summary": "Count button is present and labeled.",
                            "type": "qa_report",
                        },
                    )
                ]
            ),
        ],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    profile = next(item for item in profiles if item.role_key == "qa_tester")
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=ApprovalRegistry(),
        workspace=ProjectWorkspace(tmp_path),
        emit=lambda *_args, **_kwargs: asyncio.sleep(0),
    )
    outcome = await runner.run_assignment(
        "mission-1",
        profile,
        one_assignment_plan().assignments[0].model_copy(
            update={"staff_role": "qa_tester", "objective": "Review index.html"}
        ),
    )
    assert outcome.summary == "Count button is present and labeled."


@pytest.mark.asyncio
async def test_qa_role_can_complete_with_untyped_artifact(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<button>Count</button>\n", encoding="utf-8")
    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="qa-note",
                        name="artifact.create",
                        arguments={
                            "title": "QA Verification: Count Button",
                            "summary": "Welcome heading remains and the count starts at 0.",
                        },
                    )
                ]
            ),
        ],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    profile = next(item for item in profiles if item.role_key == "qa_tester")
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=ApprovalRegistry(),
        workspace=ProjectWorkspace(tmp_path),
        emit=lambda *_args, **_kwargs: asyncio.sleep(0),
    )
    outcome = await runner.run_assignment(
        "mission-1",
        profile,
        one_assignment_plan().assignments[0].model_copy(
            update={"staff_role": "qa_tester", "objective": "Review index.html"}
        ),
    )
    assert "count starts at 0" in outcome.summary


@pytest.mark.asyncio
async def test_repeated_tool_loop_fails_loudly(tmp_path: Path) -> None:
    repeated = ChatCompletionResult(
        tool_calls=[
            ToolCall(
                id="same",
                name="repository.list",
                arguments={"path": "."},
            )
        ]
    )
    provider = FakeProvider(
        one_assignment_plan(),
        [repeated, repeated, repeated, repeated],
    )
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=ApprovalRegistry(),
        workspace=ProjectWorkspace(tmp_path),
        emit=lambda *_args, **_kwargs: asyncio.sleep(0),
        repeated_call_limit=1,
        max_iterations=6,
    )
    profile = next(
        item for item in profiles if item.role_key == "backend_developer"
    )
    with pytest.raises(RuntimeError, match="repeated tool loop"):
        await runner.run_assignment(
            "mission-1",
            profile,
            one_assignment_plan().assignments[0],
        )
