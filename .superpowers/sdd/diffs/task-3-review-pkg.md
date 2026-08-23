# Task 3 review package
### apps/api/app/tools/file_delete.py

`python
from collections.abc import Awaitable, Callable
from typing import Any

from app.schemas.approvals import (
    ApprovalStatus,
    FileDeleteRequest,
    FileDeleteResult,
)
from app.services.approvals import ApprovalRegistry
from app.tools.repository import ProjectWorkspace, WorkspaceError

EventSink = Callable[[str, dict[str, Any]], Awaitable[None]]


async def _no_events(_event_type: str, _payload: dict[str, Any]) -> None:
    return None


class ApprovedFileDeleteRunner:
    def __init__(
        self,
        workspace: ProjectWorkspace,
        approvals: ApprovalRegistry,
        *,
        event_sink: EventSink = _no_events,
    ) -> None:
        self.workspace = workspace
        self.approvals = approvals
        self.event_sink = event_sink

    async def run(self, request: FileDeleteRequest) -> FileDeleteResult:
        try:
            target = self.workspace.resolve(request.path, must_exist=True)
            if not target.is_file():
                raise WorkspaceError("Delete target must be a file")
        except WorkspaceError as exc:
            return FileDeleteResult(
                approval_id="",
                path=request.path,
                error=str(exc),
            )

        approval = await self.approvals.request(request)
        await self.event_sink(
            "approval.requested",
            {
                "approval_id": approval.id,
                "kind": "file_delete",
                "staff_id": request.staff_id,
                "staff_display_name": request.staff_display_name,
                "path": request.path,
                "purpose": request.purpose,
            },
        )
        decision = await self.approvals.wait_for_decision(approval.id)
        if decision == ApprovalStatus.REJECTED:
            await self.event_sink("approval.rejected", {"approval_id": approval.id})
            return FileDeleteResult(
                approval_id=approval.id,
                path=request.path,
                rejected=True,
            )

        await self.event_sink("approval.accepted", {"approval_id": approval.id})
        self.approvals.set_status(approval.id, ApprovalStatus.EXECUTING)
        try:
            deleted = self.workspace.delete(request.path)
        except WorkspaceError as exc:
            self.approvals.set_status(approval.id, ApprovalStatus.FAILED)
            return FileDeleteResult(
                approval_id=approval.id,
                path=request.path,
                error=str(exc),
            )
        self.approvals.set_status(approval.id, ApprovalStatus.EXECUTED)
        return FileDeleteResult(approval_id=approval.id, path=deleted["path"])

`
### apps/api/tests/test_file_delete_approvals.py

`python
import asyncio
from pathlib import Path

import pytest

from app.schemas.approvals import ApprovalStatus, FileDeleteRequest
from app.services.approvals import ApprovalRegistry
from app.tools.file_delete import ApprovedFileDeleteRunner
from app.tools.repository import ProjectWorkspace


@pytest.mark.asyncio
async def test_delete_waits_for_approval_then_unlinks(tmp_path: Path) -> None:
    (tmp_path / "hello.html").write_text("hi", encoding="utf-8")
    registry = ApprovalRegistry()
    events: list[tuple[str, dict]] = []

    async def sink(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    runner = ApprovedFileDeleteRunner(
        ProjectWorkspace(tmp_path),
        registry,
        event_sink=sink,
    )
    request = FileDeleteRequest(
        mission_id="mission-1",
        staff_id="staff_ava",
        staff_display_name="Ava",
        path="hello.html",
        purpose="Remove hello.html",
    )
    task = asyncio.create_task(runner.run(request))
    await asyncio.sleep(0)
    pending = registry.list_pending()
    assert len(pending) == 1
    assert pending[0].request.kind == "file_delete"
    assert (tmp_path / "hello.html").exists()
    assert events[0][0] == "approval.requested"
    assert events[0][1]["path"] == "hello.html"

    await registry.accept(pending[0].id)
    result = await task
    assert result.rejected is False
    assert result.path == "hello.html"
    assert not (tmp_path / "hello.html").exists()
    assert registry.get(pending[0].id).status == ApprovalStatus.EXECUTED
    assert ("approval.accepted", {"approval_id": pending[0].id}) in events


@pytest.mark.asyncio
async def test_delete_rejection_leaves_file(tmp_path: Path) -> None:
    (tmp_path / "keep.txt").write_text("keep", encoding="utf-8")
    registry = ApprovalRegistry()
    runner = ApprovedFileDeleteRunner(ProjectWorkspace(tmp_path), registry)
    task = asyncio.create_task(
        runner.run(
            FileDeleteRequest(
                mission_id="m",
                staff_id="staff_ethan",
                staff_display_name="Ethan",
                path="keep.txt",
                purpose="should reject",
            )
        )
    )
    await asyncio.sleep(0)
    await registry.reject(registry.list_pending()[0].id)
    result = await task
    assert result.rejected is True
    assert (tmp_path / "keep.txt").read_text(encoding="utf-8") == "keep"

`
