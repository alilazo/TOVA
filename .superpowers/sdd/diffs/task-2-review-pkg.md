# Task 2 review package (no git — file snapshots)
### apps/api/app/schemas/approvals.py

`python
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXECUTING = "executing"
    EXECUTED = "executed"
    FAILED = "failed"


class CommandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["command"] = "command"
    mission_id: str = Field(min_length=1)
    staff_id: str = Field(min_length=1)
    executable: str = Field(min_length=1)
    args: list[str] = []
    cwd: str = "."
    purpose: str = Field(min_length=1, max_length=500)
    timeout_seconds: float = Field(default=60, gt=0, le=600)
    expected_outputs: list[str] = []


class FileDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["file_delete"] = "file_delete"
    mission_id: str = Field(min_length=1)
    staff_id: str = Field(min_length=1)
    staff_display_name: str = Field(min_length=1)
    path: str = Field(min_length=1)
    purpose: str = Field(min_length=1, max_length=500)


ApprovalRequestPayload = Annotated[
    CommandRequest | FileDeleteRequest,
    Field(discriminator="kind"),
]


class ApprovalRecord(BaseModel):
    id: str
    request: ApprovalRequestPayload
    status: ApprovalStatus


class CommandResult(BaseModel):
    approval_id: str
    exit_code: int | None = None
    output: str = ""
    duration_ms: int = 0
    timed_out: bool = False
    rejected: bool = False
    output_truncated: bool = False


class FileDeleteResult(BaseModel):
    approval_id: str
    path: str = ""
    rejected: bool = False
    error: str | None = None

`
### apps/api/app/services/approvals.py

`python
import asyncio
from uuid import uuid4

from app.schemas.approvals import ApprovalRecord, ApprovalStatus, ApprovalRequestPayload


class ApprovalRegistry:
    def __init__(self) -> None:
        self._records: dict[str, ApprovalRecord] = {}
        self._decisions: dict[str, asyncio.Future[ApprovalStatus]] = {}
        self._lock = asyncio.Lock()

    async def request(self, request: ApprovalRequestPayload) -> ApprovalRecord:
        async with self._lock:
            approval = ApprovalRecord(
                id=f"approval_{uuid4().hex}",
                request=request,
                status=ApprovalStatus.PENDING,
            )
            self._records[approval.id] = approval
            self._decisions[approval.id] = asyncio.get_running_loop().create_future()
            return approval.model_copy(deep=True)

    async def accept(self, approval_id: str) -> ApprovalRecord:
        return await self._decide(approval_id, ApprovalStatus.ACCEPTED)

    async def reject(self, approval_id: str) -> ApprovalRecord:
        return await self._decide(approval_id, ApprovalStatus.REJECTED)

    async def _decide(
        self, approval_id: str, status: ApprovalStatus
    ) -> ApprovalRecord:
        async with self._lock:
            record = self._records.get(approval_id)
            if record is None:
                raise KeyError(approval_id)
            if record.status != ApprovalStatus.PENDING:
                raise ValueError("Approval is no longer pending")
            record.status = status
            future = self._decisions[approval_id]
            if not future.done():
                future.set_result(status)
            return record.model_copy(deep=True)

    async def wait_for_decision(self, approval_id: str) -> ApprovalStatus:
        future = self._decisions.get(approval_id)
        if future is None:
            raise KeyError(approval_id)
        return await asyncio.shield(future)

    def set_status(self, approval_id: str, status: ApprovalStatus) -> None:
        self._records[approval_id].status = status

    def get(self, approval_id: str) -> ApprovalRecord:
        record = self._records.get(approval_id)
        if record is None:
            raise KeyError(approval_id)
        return record.model_copy(deep=True)

    def list_pending(self) -> list[ApprovalRecord]:
        return [
            record.model_copy(deep=True)
            for record in self._records.values()
            if record.status == ApprovalStatus.PENDING
        ]

    def list_for_mission(self, mission_id: str) -> list[ApprovalRecord]:
        return [
            record.model_copy(deep=True)
            for record in self._records.values()
            if record.request.mission_id == mission_id
        ]

`
### apps/api/tests/test_approval_kinds.py

`python
import pytest

from app.schemas.approvals import (
    ApprovalRecord,
    ApprovalStatus,
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

`
