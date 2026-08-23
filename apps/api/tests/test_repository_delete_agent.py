import asyncio
from pathlib import Path

import pytest

from app.orchestration.agent_runner import AgentRunner
from app.schemas.models import ChatCompletionResult, ToolCall
from app.services.approvals import ApprovalRegistry
from app.services.staff_profiles import StaffProfileRepository
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace
from tests.test_agent_runtime import FakeProvider, one_assignment_plan


@pytest.mark.asyncio
async def test_lina_can_delete_after_approval_maya_cannot(tmp_path: Path) -> None:
    (tmp_path / "hello.html").write_text("hi", encoding="utf-8")
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    lina = next(p for p in profiles if p.id == "staff_lina")
    maya = next(p for p in profiles if p.id == "staff_maya")
    assert lina.permissions.get("filesystem_delete") is True
    assert maya.permissions.get("filesystem_delete") is not True

    events: list[str] = []
    registry = ApprovalRegistry()

    async def emit(mission_id, event_type, payload, staff_id=None):
        events.append(event_type)
        return object()

    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="del1",
                        name="repository.delete",
                        arguments={
                            "path": "hello.html",
                            "purpose": "Remove hello.html",
                        },
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Deleted hello.html"}'),
        ],
    )
    workspace = ProjectWorkspace(tmp_path)
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=registry,
        workspace=workspace,
        emit=emit,
    )
    assignment = one_assignment_plan().assignments[0].model_copy(
        update={
            "staff_role": lina.role_key,
            "objective": "Remove hello.html",
            "deliverables": ["hello.html"],
        }
    )

    task = asyncio.create_task(runner.run_assignment("mission-1", lina, assignment))
    pending = []
    for _ in range(50):
        pending = registry.list_pending()
        if pending:
            break
        await asyncio.sleep(0.01)
    assert pending and pending[0].request.kind == "file_delete"
    await registry.accept(pending[0].id)
    await task
    assert not (tmp_path / "hello.html").exists()
    assert "staff.file.deleted" in events

    (tmp_path / "nope.txt").write_text("x", encoding="utf-8")
    provider2 = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="del2",
                        name="repository.delete",
                        arguments={"path": "nope.txt", "purpose": "no"},
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Denied"}'),
        ],
    )
    runner2 = AgentRunner(
        provider=provider2,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=emit,
    )
    await runner2.run_assignment("mission-2", maya, assignment)
    assert (tmp_path / "nope.txt").exists()


@pytest.mark.asyncio
async def test_write_capable_completes_after_approved_delete_without_write(
    tmp_path: Path,
) -> None:
    """Ethan can finish after delete-only work; delete counts as a file mutation."""
    (tmp_path / "obsolete.txt").write_text("gone soon", encoding="utf-8")
    ethan = next(
        p
        for p in StaffProfileRepository(
            Path(__file__).parents[3] / "HiPo-Staff" / "staff"
        ).load_all()
        if p.id == "staff_ethan"
    )
    assert ethan.permissions.get("filesystem_write") is True
    assert ethan.permissions.get("filesystem_delete") is True

    events: list[str] = []
    registry = ApprovalRegistry()

    async def emit(mission_id, event_type, payload, staff_id=None):
        events.append(event_type)
        return object()

    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="del-eth",
                        name="repository.delete",
                        arguments={
                            "path": "obsolete.txt",
                            "purpose": "Remove obsolete file",
                        },
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Removed obsolete.txt"}'),
        ],
    )
    workspace = ProjectWorkspace(tmp_path)
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=registry,
        workspace=workspace,
        emit=emit,
    )
    assignment = one_assignment_plan().assignments[0].model_copy(
        update={
            "staff_role": ethan.role_key,
            "objective": "Remove obsolete file",
            "deliverables": ["obsolete.txt"],
        }
    )

    task = asyncio.create_task(runner.run_assignment("mission-del", ethan, assignment))
    pending = []
    for _ in range(50):
        pending = registry.list_pending()
        if pending:
            break
        await asyncio.sleep(0.01)
    assert pending and pending[0].request.kind == "file_delete"
    await registry.accept(pending[0].id)
    outcome = await task

    assert not (tmp_path / "obsolete.txt").exists()
    assert "staff.file.deleted" in events
    assert "staff.action.completed" in events
    assert "Removed obsolete.txt" in outcome.summary
    assert not any(
        e == "staff.file.created" or e == "staff.file.updated" for e in events
    )
