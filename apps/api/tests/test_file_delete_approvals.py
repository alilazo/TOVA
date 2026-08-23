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
