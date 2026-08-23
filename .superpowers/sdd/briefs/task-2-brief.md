### Task 2: Discriminated approval schemas

**Files:**
- Modify: `apps/api/app/schemas/approvals.py`
- Modify: `apps/api/app/services/approvals.py`
- Test: `apps/api/tests/test_approval_kinds.py` (create)

**Interfaces:**
- Consumes: existing `ApprovalStatus`, `ApprovalRegistry` decision futures
- Produces:
  - `CommandRequest.kind: Literal["command"] = "command"`
  - `FileDeleteRequest(kind="file_delete", mission_id, staff_id, staff_display_name, path, purpose)`
  - `ApprovalRequestPayload = Annotated[CommandRequest | FileDeleteRequest, Field(discriminator="kind")]`
  - `ApprovalRecord.request: ApprovalRequestPayload`
  - `ApprovalRegistry.request(self, request: ApprovalRequestPayload) -> ApprovalRecord`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/test_approval_kinds.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_approval_kinds.py -v
```

Expected: FAIL — `FileDeleteRequest` missing / `request` still `CommandRequest`-only.

- [ ] **Step 3: Implement schemas + registry signature**

Replace/extend `apps/api/app/schemas/approvals.py`:

```python
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
```

Update `apps/api/app/services/approvals.py` imports and `request` parameter type to `ApprovalRequestPayload` (rename param from `command` to `request`). Keep `list_for_mission` using `record.request.mission_id` (both variants have it).

- [ ] **Step 4: Run existing command approval tests + new tests**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_approval_kinds.py tests/test_command_approvals.py -v
```

Expected: PASS (command path unchanged with default `kind="command"`).

- [ ] **Step 5: Commit only if the user asked** — otherwise skip.

---
