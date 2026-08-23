# Repository Delete with Approval Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `repository.delete` so Ethan/Lina/Noah/Ava can unlink a single project file only after a blocking Accept/Reject modal that names the staff member and path.

**Architecture:** Extend the approval registry with a discriminated request union (`command` | `file_delete`). Route `repository.delete` through an `ApprovedFileDeleteRunner` that mirrors `ApprovedCommandRunner` (request → wait → accept unlink / reject). Emit versioned `staff.file.deleted`; web reducer clears open/active state and explorer invalidates.

**Tech Stack:** Python/FastAPI/Pydantic, ProjectWorkspace, ApprovalRegistry, React + TanStack Query, Vitest, pytest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-repository-delete-approval-design.md`
- Confirmation: blocking modal Accept/Reject (same trust model as commands)
- Who may delete: Ethan, Lina, Noah, Ava via `filesystem_delete: true`
- Ava: delete only — do **not** set `filesystem_write: true`
- No recursive directory delete in v1
- Keep UI neutral/compact; no decorative game chrome
- Prefer TDD: failing tests before implementation
- Do not commit unless the user explicitly asks
- Event contracts must stay synchronized between `apps/api/app/schemas/events.py` and `apps/web/src/types/events.ts`

---

## File map

| File | Responsibility |
|------|----------------|
| `HiPo-Staff/staff/*.md` | Add `filesystem_delete` (+ Ava `repository.delete` tool list entry) |
| `apps/api/app/tools/repository.py` | `ProjectWorkspace.delete` (single file unlink) |
| `apps/api/app/tools/registry.py` | `repository.delete` handler |
| `apps/api/app/orchestration/tool_definitions.py` | Tool schema for models |
| `apps/api/app/schemas/approvals.py` | Discriminated `CommandRequest` \| `FileDeleteRequest` |
| `apps/api/app/services/approvals.py` | Accept union request type |
| `apps/api/app/tools/file_delete.py` | `ApprovedFileDeleteRunner` (new) |
| `apps/api/app/orchestration/agent_runner.py` | Gate + route delete through approval runner |
| `apps/api/app/orchestration/prompts.py` | Instruct models to delete via `repository.delete` |
| `apps/api/app/schemas/events.py` | Add `staff.file.deleted` |
| `apps/web/src/types/events.ts` | Mirror event type |
| `apps/web/src/features/mission/mission-api.ts` | Discriminated `ApprovalRequest` |
| `apps/web/src/components/approvals/CommandApprovalDialog.tsx` | Render delete vs command copy |
| `apps/web/src/features/mission/mission-event-reducer.ts` | Handle deleted file / clear active |
| `apps/web/src/features/mission/work-log-projection.ts` | Include deleted in outputs/activity as appropriate |
| `apps/web/src/app/App.tsx` | Close tab + invalidate explorer on delete |
| Tests under `apps/api/tests/` and `apps/web/tests/` | Behavior coverage |

---

### Task 1: `ProjectWorkspace.delete` + registry tool

**Files:**
- Modify: `apps/api/app/tools/repository.py`
- Modify: `apps/api/app/tools/registry.py`
- Modify: `apps/api/app/orchestration/tool_definitions.py`
- Test: `apps/api/tests/test_repository_tools.py`

**Interfaces:**
- Consumes: `ProjectWorkspace.resolve`, existing `WorkspaceError`
- Produces: `ProjectWorkspace.delete(relative_path: str) -> dict` with keys `path: str` (posix relative); raises `WorkspaceError` for missing path, directories, or sandbox violations

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/tests/test_repository_tools.py`:

```python
from app.tools.registry import RepositoryToolRegistry


def test_deletes_single_file_and_rejects_directories(tmp_path: Path) -> None:
    (tmp_path / "hello.html").write_text("<p>hi</p>", encoding="utf-8")
    (tmp_path / "subdir").mkdir()
    workspace = ProjectWorkspace(tmp_path)

    result = workspace.delete("hello.html")
    assert result["path"] == "hello.html"
    assert not (tmp_path / "hello.html").exists()

    with pytest.raises(WorkspaceError, match="file"):
        workspace.delete("subdir")


def test_registry_delete_tool_unlinks_file(tmp_path: Path) -> None:
    (tmp_path / "bye.txt").write_text("x", encoding="utf-8")
    registry = RepositoryToolRegistry(ProjectWorkspace(tmp_path))
    outcome = registry.execute("repository.delete", {"path": "bye.txt"})
    assert outcome.ok is True
    assert outcome.data["path"] == "bye.txt"
    assert not (tmp_path / "bye.txt").exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_tools.py -k "delete" -v
```

Expected: FAIL — `ProjectWorkspace` has no `delete` / unknown tool.

- [ ] **Step 3: Implement workspace delete + registry + tool definition**

In `repository.py`, add:

```python
def delete(self, relative_path: str) -> dict[str, str]:
    path = self.resolve(relative_path, must_exist=True)
    if not path.is_file():
        raise WorkspaceError("Delete target must be a file")
    path.unlink()
    return {"path": PurePath(relative_path).as_posix()}
```

In `registry.py` handlers map, add `"repository.delete": self._delete` and:

```python
def _delete(self, arguments: dict[str, Any]) -> ToolExecutionResult:
    path = PathInput.model_validate(arguments).path
    change = self.workspace.delete(path)
    return ToolExecutionResult(
        ok=True,
        summary=f"Deleted {path}",
        data=change,
    )
```

In `tool_definitions.py`, after `repository.apply_patch`, add:

```python
ToolDefinition(
    name="repository.delete",
    description=(
        "Delete one project file after explicit user approval. "
        "Use this to remove a file; do not empty a file to simulate deletion."
    ),
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string"},
            "purpose": {"type": "string"},
        },
        "required": ["path", "purpose"],
        "additionalProperties": False,
    },
),
```

Note: registry `_delete` validates `path` only; `purpose` is required by the LLM tool schema and consumed by the approval runner in Task 3–4, not by `ProjectWorkspace.delete`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_tools.py -k "delete" -v
```

Expected: PASS

- [ ] **Step 5: Commit only if the user asked** — otherwise skip.

---

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

### Task 3: `ApprovedFileDeleteRunner`

**Files:**
- Create: `apps/api/app/tools/file_delete.py`
- Test: `apps/api/tests/test_file_delete_approvals.py` (create)

**Interfaces:**
- Consumes: `ApprovalRegistry`, `ProjectWorkspace.delete`, `FileDeleteRequest`, `FileDeleteResult`
- Produces: `ApprovedFileDeleteRunner.run(request: FileDeleteRequest) -> FileDeleteResult`
- Emits via `event_sink`: `approval.requested` (with `kind`, `path`, `purpose`, `staff_id`, `staff_display_name`, `approval_id`), then `approval.accepted` / `approval.rejected`; on success the agent runner emits `staff.file.deleted` (Task 4)

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/test_file_delete_approvals.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_file_delete_approvals.py -v
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement runner**

Create `apps/api/app/tools/file_delete.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_file_delete_approvals.py -v
```

Expected: PASS

- [ ] **Step 5: Commit only if the user asked** — otherwise skip.

---

### Task 4: Staff permissions, agent runner routing, prompts

**Files:**
- Modify: `HiPo-Staff/staff/ethan-software-engineer.md`
- Modify: `HiPo-Staff/staff/lina-frontend-developer.md`
- Modify: `HiPo-Staff/staff/noah-backend-developer.md`
- Modify: `HiPo-Staff/staff/ava-qa-tester.md`
- Modify: `HiPo-Staff/staff/alex-project-coordinator.md`
- Modify: `HiPo-Staff/staff/maya-researcher.md`
- Modify: `HiPo-Staff/staff/dr-rao-advisor.md`
- Modify: `apps/api/app/orchestration/agent_runner.py`
- Modify: `apps/api/app/orchestration/prompts.py`
- Test: `apps/api/tests/test_repository_delete_agent.py` (create)

**Interfaces:**
- Consumes: `filesystem_delete` permission; `ApprovedFileDeleteRunner`; `FileDeleteRequest`
- Produces: `_allowed_tools` includes `repository.delete` iff `filesystem_delete is True`; on tool call, blocks until approval; emits `staff.file.deleted` on success

- [ ] **Step 1: Write the failing agent tests**

Create `apps/api/tests/test_repository_delete_agent.py`. Reuse `FakeProvider`, plan helpers, and imports from `tests/test_agent_runtime.py` (import if exported; otherwise copy the minimal helpers used by `test_agent_runner_enforces_profile_write_permissions`).

```python
import asyncio
from pathlib import Path

import pytest

from app.orchestration.agent_runner import AgentRunner
from app.schemas.models import ChatCompletionResult, ToolCall
from app.services.approvals import ApprovalRegistry
from app.services.staff_profiles import StaffProfileRepository
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace

# Import FakeProvider + one_assignment_plan from test_agent_runtime (or local copies)


@pytest.mark.asyncio
async def test_ava_can_delete_after_approval_maya_cannot(tmp_path: Path) -> None:
    (tmp_path / "hello.html").write_text("hi", encoding="utf-8")
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    ava = next(p for p in profiles if p.id == "staff_ava")
    maya = next(p for p in profiles if p.id == "staff_maya")
    assert ava.permissions.get("filesystem_delete") is True
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
    assignment = one_assignment_plan().assignments[0]

    task = asyncio.create_task(runner.run_assignment("mission-1", ava, assignment))
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_delete_agent.py -v
```

Expected: FAIL — permission / routing missing.

- [ ] **Step 3: Update staff YAML**

For Ethan, Lina, Noah, Ava under `permissions:` add:

```yaml
  filesystem_delete: true
```

For Alex, Maya, Dr. Rao add:

```yaml
  filesystem_delete: false
```

For Ava `tools:` list, add:

```yaml
  - repository.delete
```

For Ethan/Lina/Noah `tools:` lists, add `repository.delete` when those lists enumerate repository tools.

- [ ] **Step 4: Wire agent_runner + prompts**

In `_allowed_tools`:

```python
if profile.permissions.get("filesystem_delete") is True:
    allowed.add("repository.delete")
```

Handle `repository.delete` like `command.request` (before generic `tools.execute`), building `FileDeleteRequest` with `staff_display_name=profile.display_name`, running `ApprovedFileDeleteRunner`, then emitting `staff.file.deleted` with `file_path` + `title` on success.

Ensure `repository.delete` is **not** executed through the generic `tools.execute` path without approval.

In `prompts.py`, extend file guidance:

```text
When deliverables are files, use repository.write or repository.apply_patch before claiming done.
When the objective is to remove a file, use repository.delete (user approval required). Do not empty a file to simulate deletion.
```

Also add `"staff.file.deleted"` to `apps/api/app/schemas/events.py` in this task if Task 5 has not landed yet — prefer Task 5 for both sides, but agent emit requires the API Literal to include the new type. Add it here or in Task 5 before running this suite; do not leave API/web out of sync.

- [ ] **Step 5: Run tests**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_delete_agent.py tests/test_agent_runtime.py tests/test_file_delete_approvals.py -v
```

Expected: PASS

- [ ] **Step 6: Commit only if the user asked** — otherwise skip.

---

### Task 5: Versioned `staff.file.deleted` on web + reducer

**Files:**
- Modify: `apps/api/app/schemas/events.py` (if not done in Task 4)
- Modify: `apps/web/src/types/events.ts`
- Modify: `apps/web/src/features/mission/mission-event-reducer.ts`
- Modify: `apps/web/src/features/mission/work-log-projection.ts`
- Modify: `apps/web/src/app/App.tsx`
- Test: `apps/web/tests/mission-event-reducer.test.ts`
- Test: `apps/web/tests/work-log-projection.test.ts` (extend if needed)

**Interfaces:**
- Consumes: `EventEnvelope` with `event_type: "staff.file.deleted"`, payload `file_path`
- Produces: projection fields —
  - `lastDeletedFile: string | null` (new)
  - clear `activeFile` / `editorOwnerId` when deleted path was active
  - remove matching `file_output` artifacts
  - bump `fileRevision`
  - App closes ui-store tab + invalidates `project-entries`

- [ ] **Step 1: Write the failing reducer test**

Add to `apps/web/tests/mission-event-reducer.test.ts`:

```ts
it("clears active file and work output when a file is deleted", () => {
  const projection = [
    event(1, "staff.file.created", {
      title: "Wrote hello.html",
      file_path: "hello.html",
    }, "staff_lina"),
    event(2, "staff.file.deleted", {
      title: "Deleted hello.html",
      file_path: "hello.html",
    }, "staff_lina"),
  ].reduce(missionEventReducer, createInitialMissionProjection())

  expect(projection.activeFile).toBe("")
  expect(projection.lastDeletedFile).toBe("hello.html")
  expect(projection.fileRevision).toBe(2)
  expect(
    projection.artifacts.filter((a) => a.type === "file_output"),
  ).toHaveLength(0)
})
```

Extend `MissionProjection` / `createInitialMissionProjection` expectations accordingly (`lastDeletedFile: null` initially).

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts -t "clears active file"
```

Expected: FAIL — unknown event type / no `lastDeletedFile`.

- [ ] **Step 3: Implement event type + reducer + App sync**

1. Add `"staff.file.deleted"` to both event Literal/arrays (API + web), next to other `staff.file.*` entries.

2. In `mission-event-reducer.ts`:
   - Add `lastDeletedFile: string | null` to `MissionProjection` and initialize `null`.
   - Handle delete:

```ts
if (event.event_type === "staff.file.deleted" && payload.file_path) {
  const filePath = payload.file_path
  const wasActive = next.activeFile === filePath
  next = {
    ...next,
    lastDeletedFile: filePath,
    fileRevision: next.fileRevision + 1,
    activeFile: wasActive ? "" : next.activeFile,
    editorOwnerId: wasActive ? null : next.editorOwnerId,
    artifacts: next.artifacts.filter(
      (artifact) =>
        !(artifact.type === "file_output" && artifact.name === filePath),
    ),
  }
}
```

3. In `work-log-projection.ts`, add `"staff.file.deleted"` to `outputFileEvents` so the deleted path appears in work-log outputs.

4. In `App.tsx`, after the existing open-file effect, add:

```tsx
useEffect(() => {
  const deleted = liveRuntime.projection.lastDeletedFile
  if (!deleted) return
  closeFile(deleted)
  void client.invalidateQueries({ queryKey: ["project-entries", project.data?.id] })
  void client.removeQueries({ queryKey: ["project-file", project.data?.id, deleted] })
}, [
  client,
  closeFile,
  liveRuntime.projection.lastDeletedFile,
  liveRuntime.projection.fileRevision,
  project.data?.id,
])
```

- [ ] **Step 4: Run web tests**

```bash
pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts tests/work-log-projection.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit only if the user asked** — otherwise skip.

---

### Task 6: Approval dialog for file deletes

**Files:**
- Modify: `apps/web/src/features/mission/mission-api.ts`
- Modify: `apps/web/src/components/approvals/CommandApprovalDialog.tsx`
- Test: `apps/web/tests/command-approval-dialog.test.tsx` (create)

**Interfaces:**
- Consumes: `ApprovalRequest` with `request.kind === "command" | "file_delete"`
- Produces: delete modal title **File delete approval required**; body **`{staff_display_name} wants to delete `{path}``**; button **Approve and delete**

- [ ] **Step 1: Write the failing UI test**

Create `apps/web/tests/command-approval-dialog.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
import * as missionApi from "@/features/mission/mission-api"

vi.mock("@/features/mission/mission-api", async () => {
  const actual = await vi.importActual<typeof missionApi>(
    "@/features/mission/mission-api",
  )
  return {
    ...actual,
    listApprovals: vi.fn(),
    resolveApproval: vi.fn(),
  }
})

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CommandApprovalDialog missionId="mission-1" />
    </QueryClientProvider>,
  )
}

describe("CommandApprovalDialog", () => {
  it("shows file delete approval copy", async () => {
    vi.mocked(missionApi.listApprovals).mockResolvedValue([
      {
        id: "approval_1",
        status: "pending",
        request: {
          kind: "file_delete",
          mission_id: "mission-1",
          staff_id: "staff_ava",
          staff_display_name: "Ava",
          path: "hello.html",
          purpose: "Remove unused hello page",
        },
      },
    ])
    renderDialog()
    expect(
      await screen.findByText("File delete approval required"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Ava wants to delete/)).toBeInTheDocument()
    expect(screen.getByText("hello.html")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Approve and delete/i }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tova/web exec vitest run tests/command-approval-dialog.test.tsx -v
```

Expected: FAIL — types/UI still command-only.

- [ ] **Step 3: Update types + dialog**

In `mission-api.ts`, replace `ApprovalRequest` with a discriminated union on `request.kind` (`"command"` | `"file_delete"`) matching the API schemas (include `staff_display_name` + `path` for delete).

In `CommandApprovalDialog.tsx`, branch on `pending.request.kind` (treat missing `kind` as `"command"`):

- Delete title: `File delete approval required`
- Description: `TOVA agents cannot delete project files until you approve this exact request.`
- Body: `{staff_display_name} wants to delete `{path}`` plus Purpose
- Primary button: `Approve and delete`
- Keep existing command markup when `kind === "command"`

- [ ] **Step 4: Run UI + related tests**

```bash
pnpm --filter @tova/web exec vitest run tests/command-approval-dialog.test.tsx tests/app-staff-source.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit only if the user asked** — otherwise skip.

---

### Task 7: Workspace verification

**Files:** none new — verify integration

- [ ] **Step 1: Run API suite focused on approvals/tools/agents**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_tools.py tests/test_approval_kinds.py tests/test_file_delete_approvals.py tests/test_repository_delete_agent.py tests/test_command_approvals.py tests/test_agent_runtime.py -v
```

Expected: PASS

- [ ] **Step 2: Run web verify subset**

```bash
pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts tests/work-log-projection.test.ts tests/command-approval-dialog.test.tsx
```

Expected: PASS

- [ ] **Step 3: Optional full verify if deps installed**

```bash
pnpm verify
```

and/or

```bash
uv run python scripts/verify.py
```

from repo root. Do not claim full-workspace green without this evidence.

- [ ] **Step 4: Manual smoke (when API + web are running)**

1. Open a project with `hello.html`
2. Mission: “Delete hello.html”
3. Confirm modal: **`{Name} wants to delete `hello.html``**
4. Approve → file gone from explorer; Reject → file remains

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| `repository.delete` tool | 1, 4 |
| `filesystem_delete` for Ethan/Lina/Noah/Ava | 4 |
| Ava without write | 4 |
| Blocking Accept/Reject modal | 3, 6 |
| Approval payload kind/path/purpose/display name | 2, 3, 6 |
| `staff.file.deleted` + explorer refresh | 5 |
| No recursive directory delete | 1, 3 |
| Instruct models not to empty files | 1 (tool desc), 4 (prompt) |

## Placeholder / consistency self-review

- No TBD steps; types named consistently (`FileDeleteRequest`, `FileDeleteResult`, `ApprovedFileDeleteRunner`, `staff.file.deleted`, `lastDeletedFile`)
- Command approvals remain backward compatible via `kind` default `"command"`
- Delete never runs through unsandboxed host shell as the primary path
