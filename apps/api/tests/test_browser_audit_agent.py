import asyncio
from pathlib import Path

import pytest

from app.orchestration.agent_runner import AgentRunner
from app.schemas.approvals import BrowserAuditRequest
from app.schemas.models import ChatCompletionResult, ToolCall
from app.services.approvals import ApprovalRegistry
from app.services.staff_profiles import StaffProfileRepository
from app.tools.browser_qa import BrowserAuditExecution
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace
from tests.test_agent_runtime import FakeProvider, one_assignment_plan


@pytest.mark.asyncio
async def test_ava_runs_browser_audit_after_approval(tmp_path: Path) -> None:
    ava = next(
        profile
        for profile in StaffProfileRepository(
            Path(__file__).parents[3] / "HiPo-Staff" / "staff"
        ).load_all()
        if profile.id == "staff_ava"
    )
    assert "qa.browser.audit" in ava.tools
    assert ava.permissions.get("command_execution") is True
    assert ava.permissions.get("filesystem_write") is False

    executions: list[str] = []

    async def execute(
        request: BrowserAuditRequest,
        output_dir: Path,
    ) -> BrowserAuditExecution:
        executions.append(request.url)
        (output_dir / "screenshot.png").write_bytes(b"png")
        return BrowserAuditExecution(
            ok=True,
            data={
                "url": request.url,
                "title": "Test page",
                "verdict": "needs_improvement",
                "summary": "Primary button overlaps heading",
                "screenshot_path": ".tova/browser-audits/audit/screenshot.png",
                "visible_text": "Hello TOVA",
                "layout_findings": ["button overlaps heading"],
                "console_errors": [],
                "failed_requests": [],
            },
        )

    events: list[tuple[str, dict]] = []

    async def emit(mission_id, event_type, payload, staff_id=None):
        events.append((event_type, payload))
        return object()

    registry = ApprovalRegistry()
    runner = AgentRunner(
        provider=FakeProvider(
            one_assignment_plan(),
            [
                ChatCompletionResult(
                    tool_calls=[
                        ToolCall(
                            id="audit-1",
                            name="qa.browser.audit",
                            arguments={
                                "url": "http://127.0.0.1:5173",
                                "purpose": "Visually inspect the generated page",
                                "acceptance_criteria": ["Button does not overlap text"],
                            },
                        )
                    ]
                ),
                ChatCompletionResult(content='{"summary":"QA found overlap risk"}'),
            ],
        ),
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=registry,
        workspace=ProjectWorkspace(tmp_path),
        emit=emit,
        browser_audit_executor=execute,
    )
    assignment = one_assignment_plan().assignments[0].model_copy(
        update={
            "staff_role": "qa_tester",
            "objective": "Inspect http://127.0.0.1:5173",
            "deliverables": ["QA browser audit"],
        }
    )

    task = asyncio.create_task(runner.run_assignment("mission-browser", ava, assignment))
    pending = []
    for _ in range(50):
        pending = registry.list_pending()
        if pending:
            break
        await asyncio.sleep(0.01)
    assert pending and pending[0].request.kind == "browser_audit"

    await registry.accept(pending[0].id)
    outcome = await task

    assert executions == ["http://127.0.0.1:5173"]
    assert "QA found overlap risk" in outcome.summary
    assert any(event_type == "staff.test.started" for event_type, _ in events)
    result_events = [
        payload for event_type, payload in events if event_type == "staff.test.result"
    ]
    assert result_events
    assert result_events[0]["verdict"] == "needs_improvement"

@pytest.mark.asyncio
async def test_ava_completes_when_qa_artifact_is_final_tool_call(tmp_path: Path) -> None:
    ava = next(
        profile
        for profile in StaffProfileRepository(
            Path(__file__).parents[3] / "HiPo-Staff" / "staff"
        ).load_all()
        if profile.id == "staff_ava"
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
                "title": "Test page",
                "verdict": "pass",
                "summary": "Page passed browser audit",
                "screenshot_path": "screenshot.png",
            },
        )

    events: list[tuple[str, dict]] = []

    async def emit(mission_id, event_type, payload, staff_id=None):
        events.append((event_type, payload))
        return object()

    registry = ApprovalRegistry()
    runner = AgentRunner(
        provider=FakeProvider(
            one_assignment_plan(),
            [
                ChatCompletionResult(
                    tool_calls=[
                        ToolCall(
                            id="audit-1",
                            name="qa.browser.audit",
                            arguments={
                                "url": "http://127.0.0.1:5173",
                                "purpose": "Verify button UI",
                                "acceptance_criteria": ["Button is visible"],
                            },
                        )
                    ]
                ),
                ChatCompletionResult(
                    tool_calls=[
                        ToolCall(
                            id="artifact-1",
                            name="artifact.create",
                            arguments={
                                "title": "QA report",
                                "summary": "Browser audit passed; no regressions found.",
                            },
                        )
                    ]
                ),
            ],
        ),
        model="fake",
        tools=RepositoryToolRegistry(ProjectWorkspace(tmp_path)),
        approvals=registry,
        workspace=ProjectWorkspace(tmp_path),
        emit=emit,
        browser_audit_executor=execute,
        max_iterations=2,
    )
    assignment = one_assignment_plan().assignments[0].model_copy(
        update={
            "staff_role": "qa_tester",
            "objective": "Inspect http://127.0.0.1:5173",
            "deliverables": ["QA browser audit", "QA report"],
        }
    )

    task = asyncio.create_task(runner.run_assignment("mission-browser", ava, assignment))
    for _ in range(50):
        pending = registry.list_pending()
        if pending:
            break
        await asyncio.sleep(0.01)
    else:
        raise AssertionError("Timed out waiting for browser audit approval")

    await registry.accept(pending[0].id)
    outcome = await task

    assert "Browser audit passed" in outcome.summary
    assert any(event_type == "staff.action.completed" for event_type, _ in events)

