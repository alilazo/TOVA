import pytest

from app.schemas.approvals import (
    ApprovalRecord,
    ApprovalStatus,
    BrowserAuditRequest,
    CommandRequest,
    FileDeleteRequest,
)
from app.services.approvals import ApprovalRegistry


def test_command_request_defaults_kind() -> None:
    command = CommandRequest(
        mission_id="m1",
        staff_id="staff_noah",
        executable="python",
        purpose="run checks",
    )
    assert command.kind == "command"


def test_file_delete_request_round_trips() -> None:
    payload = FileDeleteRequest(
        mission_id="m1",
        staff_id="staff_ava",
        staff_display_name="Ava",
        path="hello.html",
        purpose="Remove unused hello page",
    )
    assert payload.kind == "file_delete"
    record = ApprovalRecord(
        id="approval_x",
        request=payload,
        status=ApprovalStatus.PENDING,
    )
    dumped = record.model_dump()
    restored = ApprovalRecord.model_validate(dumped)
    assert restored.request.kind == "file_delete"
    assert restored.request.path == "hello.html"


@pytest.mark.asyncio
async def test_registry_accepts_file_delete_requests() -> None:
    registry = ApprovalRegistry()
    approval = await registry.request(
        FileDeleteRequest(
            mission_id="m1",
            staff_id="staff_lina",
            staff_display_name="Lina",
            path="gone.css",
            purpose="cleanup",
        )
    )
    assert approval.request.kind == "file_delete"
    pending = registry.list_for_mission("m1")
    assert len(pending) == 1
    assert pending[0].request.path == "gone.css"


def test_browser_audit_request_round_trips() -> None:
    payload = BrowserAuditRequest(
        mission_id="m1",
        staff_id="staff_ava",
        staff_display_name="Ava",
        url="http://127.0.0.1:5173",
        purpose="Verify the generated page",
        acceptance_criteria=["The primary button is visible"],
        viewport={"width": 1440, "height": 900},
        selectors_to_check=["button"],
    )
    record = ApprovalRecord(
        id="approval_browser",
        request=payload,
        status=ApprovalStatus.PENDING,
    )

    restored = ApprovalRecord.model_validate(record.model_dump())

    assert restored.request.kind == "browser_audit"
    assert restored.request.url == "http://127.0.0.1:5173"
    assert restored.request.acceptance_criteria == ["The primary button is visible"]
