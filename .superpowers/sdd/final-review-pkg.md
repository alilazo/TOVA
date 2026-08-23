# Final branch review package (no git — file snapshots)
Spec: docs/superpowers/specs/2026-07-24-team-floor-live-code-stage-design.md
Plan: docs/superpowers/plans/2026-07-24-team-floor-live-code-stage.md

## FILE: apps/api/app/orchestration/agent_runner.py

```
import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from pydantic import BaseModel, Field, ValidationError

from app.orchestration.prompts import compile_staff_system_prompt
from app.orchestration.tool_definitions import agent_tool_definitions
from app.schemas.approvals import CommandRequest
from app.schemas.events import EventType
from app.schemas.mission_plan import MissionPlanAssignment
from app.schemas.models import (
    ChatCompletionRequest,
    ChatCompletionResult,
    ChatMessage,
    ToolCall,
)
from app.schemas.staff import StaffProfileDocument
from app.services.approvals import ApprovalRegistry
from app.tools.commands import ApprovedCommandRunner
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace

Emit = Callable[..., Awaitable[object]]
PauseGate = Callable[[], Awaitable[None]]


class CompletionProvider(Protocol):
    async def complete(self, request: ChatCompletionRequest) -> ChatCompletionResult: ...


class AgentOutcome(BaseModel):
    staff_role: str
    summary: str
    artifacts: list[dict[str, str]] = []
    handoffs: list[dict[str, str]] = []


class ArtifactInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=4000)


class HandoffInput(BaseModel):
    to_role: str = Field(min_length=1)
    summary: str = Field(min_length=1, max_length=4000)


class AgentRunner:
    def __init__(
        self,
        *,
        provider: CompletionProvider,
        model: str,
        tools: RepositoryToolRegistry,
        approvals: ApprovalRegistry,
        workspace: ProjectWorkspace,
        emit: Emit,
        max_iterations: int = 12,
        repeated_call_limit: int = 2,
    ) -> None:
        self.provider = provider
        self.model = model
        self.tools = tools
        self.approvals = approvals
        self.workspace = workspace
        self.emit = emit
        self.max_iterations = max_iterations
        self.repeated_call_limit = repeated_call_limit

    async def run_assignment(
        self,
        mission_id: str,
        profile: StaffProfileDocument,
        assignment: MissionPlanAssignment,
        *,
        cancellation: asyncio.Event | None = None,
        pause_gate: PauseGate | None = None,
    ) -> AgentOutcome:
        messages = [
            ChatMessage(role="system", content=compile_staff_system_prompt(profile)),
            ChatMessage(
                role="user",
                content=(
                    f"Objective: {assignment.objective}\n"
                    f"Deliverables: {', '.join(assignment.deliverables)}\n"
                    "Use tools for observable work. When complete, return JSON with a concise "
                    "`summary`; do not include hidden reasoning."
                ),
            ),
        ]
        repeated: dict[str, int] = {}
        artifacts: list[dict[str, str]] = []
        handoffs: list[dict[str, str]] = []
        await self._emit(
            mission_id,
            "staff.action.started",
            {"summary": f"{profile.display_name} started assigned work"},
            profile.id,
        )
        for _iteration in range(self.max_iterations):
            if pause_gate is not None:
                await pause_gate()
            if cancellation is not None and cancellation.is_set():
                raise asyncio.CancelledError
            await self._emit(
                mission_id,
                "model.request.started",
                {"operation": "staff.iteration", "iteration": _iteration + 1},
                profile.id,
            )
            try:
                result = await self.provider.complete(
                    ChatCompletionRequest(
                        model=self.model,
                        messages=messages,
                        tools=[
                            tool
                            for tool in agent_tool_definitions()
                            if tool.name in self._allowed_tools(profile)
                        ],
                    )
                )
            except Exception as exc:
                await self._emit(
                    mission_id,
                    "model.request.failed",
                    {"operation": "staff.iteration", "error": type(exc).__name__},
                    profile.id,
                )
                raise
            await self._emit(
                mission_id,
                "model.request.completed",
                {"operation": "staff.iteration", "tool_calls": len(result.tool_calls)},
                profile.id,
            )
            if not result.tool_calls:
                summary = self._completion_summary(result.content)
                await self._emit(
                    mission_id,
                    "staff.action.completed",
                    {"summary": summary},
                    profile.id,
                )
                return AgentOutcome(
                    staff_role=profile.role_key,
                    summary=summary,
                    artifacts=artifacts,
                    handoffs=handoffs,
                )
            messages.append(
                ChatMessage(role="assistant", content=result.content, tool_calls=result.tool_calls)
            )
            for call in result.tool_calls:
                if pause_gate is not None:
                    await pause_gate()
                if cancellation is not None and cancellation.is_set():
                    raise asyncio.CancelledError
                key = f"{call.name}:{json.dumps(call.arguments, sort_keys=True)}"
                repeated[key] = repeated.get(key, 0) + 1
                if repeated[key] > self.repeated_call_limit:
                    raise RuntimeError("Repeated tool call limit exceeded")
                tool_result = await self._execute_tool(
                    mission_id,
                    profile,
                    call,
                    artifacts,
                    handoffs,
                )
                messages.append(
                    ChatMessage(
                        role="tool",
                        tool_call_id=call.id,
                        content=json.dumps(tool_result, ensure_ascii=True),
                    )
                )
        raise RuntimeError("Agent iteration limit exceeded")

    async def _execute_tool(
        self,
        mission_id: str,
        profile: StaffProfileDocument,
        call: ToolCall,
        artifacts: list[dict[str, str]],
        handoffs: list[dict[str, str]],
    ) -> dict[str, Any]:
        if call.name not in self._allowed_tools(profile):
            await self._emit(
                mission_id,
                "staff.action.updated",
                {"tool": call.name, "summary": "Tool denied by role permissions", "ok": False},
                profile.id,
            )
            return {"ok": False, "error": "permission_denied"}
        if call.name.startswith("repository."):
            result = self.tools.execute(call.name, call.arguments)
            await self._emit(
                mission_id,
                "staff.action.updated",
                {"tool": call.name, "summary": result.summary, "ok": result.ok},
                profile.id,
            )
            if result.ok:
                file_path = None
                if isinstance(result.data, dict):
                    file_path = result.data.get("path")
                if file_path is None and isinstance(call.arguments.get("path"), str):
                    file_path = call.arguments["path"]
                event_type = {
                    "repository.read": "staff.file.opened",
                    "repository.write": "staff.file.updated",
                    "repository.apply_patch": "staff.file.updated",
                }.get(call.name)
                if event_type and file_path:
                    if call.name == "repository.write":
                        created = bool(
                            isinstance(result.data, dict) and result.data.get("created")
                        )
                        event_type = "staff.file.created" if created else "staff.file.updated"
                    await self._emit(
                        mission_id,
                        event_type,
                        {"file_path": file_path, "title": result.summary},
                        profile.id,
                    )
            return result.model_dump()
        if call.name == "command.request":
            try:
                command = CommandRequest.model_validate(
                    {
                        **call.arguments,
                        "mission_id": mission_id,
                        "staff_id": profile.id,
                    }
                )
            except ValidationError as exc:
                return {"ok": False, "error": str(exc)}

            async def command_event(event_type: str, payload: dict[str, Any]) -> None:
                await self._emit(mission_id, event_type, payload, profile.id)

            runner = ApprovedCommandRunner(
                self.workspace,
                self.approvals,
                event_sink=command_event,
            )
            command_result = await runner.run(command)
            return {
                "ok": not command_result.rejected and command_result.exit_code == 0,
                **command_result.model_dump(),
            }
        if call.name == "artifact.create":
            try:
                artifact = ArtifactInput.model_validate(call.arguments).model_dump()
            except ValidationError as exc:
                return {"ok": False, "error": str(exc)}
            artifacts.append(artifact)
            await self._emit(mission_id, "artifact.created", artifact, profile.id)
            return {"ok": True, "artifact": artifact}
        if call.name == "handoff.prepare":
            try:
                handoff = HandoffInput.model_validate(call.arguments).model_dump()
            except ValidationError as exc:
                return {"ok": False, "error": str(exc)}
            handoffs.append(handoff)
            await self._emit(mission_id, "handoff.preparing", handoff, profile.id)
            return {"ok": True, "handoff": handoff}
        await self._emit(
            mission_id,
            "staff.action.updated",
            {"tool": call.name, "summary": "Unknown tool rejected", "ok": False},
            profile.id,
        )
        return {"ok": False, "error": "unknown_tool"}

    def _allowed_tools(self, profile: StaffProfileDocument) -> set[str]:
        allowed: set[str] = set()
        if profile.permissions.get("filesystem_read") is True:
            allowed.update({"repository.list", "repository.search", "repository.read"})
        if profile.permissions.get("filesystem_write") is True:
            allowed.update({"repository.write", "repository.apply_patch"})
        if profile.permissions.get("command_execution") is True:
            allowed.add("command.request")
        if "artifact.create" in profile.tools:
            allowed.add("artifact.create")
        allowed.add("handoff.prepare")
        return allowed

    async def _emit(
        self,
        mission_id: str,
        event_type: EventType | str,
        payload: dict[str, Any],
        staff_id: str,
    ) -> None:
        await self.emit(mission_id, event_type, payload, staff_id=staff_id)

    def _completion_summary(self, content: str | None) -> str:
        raw = (content or "Assignment completed without a summary.").strip()
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and isinstance(parsed.get("summary"), str):
                raw = parsed["summary"]
        except json.JSONDecodeError:
            pass
        lowered = raw.lower()
        if "chain-of-thought" in lowered or "reasoning:" in lowered:
            return "Assignment completed; unsafe internal-reasoning content was withheld."
        return raw[:2000]

```

## FILE: apps/api/app/tools/repository.py

```
from __future__ import annotations

import builtins
import difflib
import hashlib
import os
import tempfile
from pathlib import Path, PurePath

from app.tools.schemas import FileChangeResult, SearchMatch

_EXCLUDED_NAMES = {
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".tova",
    "credentials.json",
    "secrets.json",
}
_EXCLUDED_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}


class WorkspaceError(ValueError):
    pass


def _hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class ProjectWorkspace:
    def __init__(
        self,
        root: str | Path,
        *,
        read_limit_bytes: int = 1_000_000,
        write_limit_bytes: int = 1_000_000,
        diff_preview_bytes: int = 16_000,
        extra_exclusions: set[str] | None = None,
    ) -> None:
        self.root = Path(root).resolve(strict=True)
        if not self.root.is_dir():
            raise WorkspaceError("Project root must be a directory")
        self.read_limit_bytes = read_limit_bytes
        self.write_limit_bytes = write_limit_bytes
        self.diff_preview_bytes = diff_preview_bytes
        self._excluded = _EXCLUDED_NAMES | (extra_exclusions or set())

    def resolve(self, relative_path: str, *, must_exist: bool = False) -> Path:
        pure = PurePath(relative_path)
        if not relative_path or pure.is_absolute() or ".." in pure.parts:
            raise WorkspaceError("Path must be project-relative")
        lowered = [part.lower() for part in pure.parts]
        if any(
            part in self._excluded
            or part.startswith(".env")
            or part.endswith(tuple(_EXCLUDED_SUFFIXES))
            for part in lowered
        ):
            raise WorkspaceError("Sensitive or excluded path")
        candidate = self.root.joinpath(*pure.parts).resolve(strict=False)
        try:
            candidate.relative_to(self.root)
        except ValueError as exc:
            raise WorkspaceError("Path escapes project root") from exc
        if must_exist and not candidate.exists():
            raise WorkspaceError("Path does not exist")
        return candidate

    def list(self, relative_path: str = ".") -> list[str]:
        directory = self._directory(relative_path)
        results: list[str] = []
        for candidate in directory.rglob("*"):
            if not candidate.is_file():
                continue
            relative = candidate.relative_to(self.root).as_posix()
            try:
                self.resolve(relative, must_exist=True)
            except WorkspaceError:
                continue
            results.append(relative)
        return sorted(results)

    def list_entries(self, relative_path: str = ".") -> builtins.list[dict[str, str]]:
        directory = self._directory(relative_path)
        entries: builtins.list[dict[str, str]] = []
        for candidate in sorted(directory.iterdir(), key=lambda item: item.name.lower()):
            relative = candidate.relative_to(self.root).as_posix()
            if candidate.is_dir():
                if candidate.name.lower() in self._excluded:
                    continue
                entries.append({"name": candidate.name, "path": relative, "kind": "dir"})
                continue
            try:
                self.resolve(relative, must_exist=True)
            except WorkspaceError:
                continue
            if candidate.is_file():
                entries.append({"name": candidate.name, "path": relative, "kind": "file"})
        return entries

    def _directory(self, relative_path: str) -> Path:
        if relative_path in {".", ""}:
            directory = self.root
        else:
            directory = self.resolve(relative_path, must_exist=True)
        if not directory.is_dir():
            raise WorkspaceError("List target must be a directory")
        return directory

    def read(self, relative_path: str) -> str:
        path = self.resolve(relative_path, must_exist=True)
        if not path.is_file():
            raise WorkspaceError("Read target must be a file")
        if path.stat().st_size > self.read_limit_bytes:
            raise WorkspaceError("Read size limit exceeded")
        try:
            return path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise WorkspaceError("Only UTF-8 text files are supported") from exc

    def search(
        self,
        query: str,
        relative_path: str = ".",
        *,
        max_matches: int = 100,
    ) -> builtins.list[SearchMatch]:
        if not query:
            raise WorkspaceError("Search query cannot be empty")
        matches: list[SearchMatch] = []
        for file_path in self.list(relative_path):
            try:
                text = self.read(file_path)
            except WorkspaceError:
                continue
            for line_number, line in enumerate(text.splitlines(), 1):
                if query in line:
                    matches.append(SearchMatch(path=file_path, line=line_number, text=line[:500]))
                    if len(matches) >= max_matches:
                        return matches
        return matches

    def write(self, relative_path: str, content: str) -> FileChangeResult:
        encoded = content.encode()
        if len(encoded) > self.write_limit_bytes:
            raise WorkspaceError("Write size limit exceeded")
        path = self.resolve(relative_path)
        before = path.read_bytes() if path.exists() else None
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
        try:
            with os.fdopen(fd, "wb") as temporary:
                temporary.write(encoded)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_name, path)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)
        return FileChangeResult(
            path=relative_path,
            before_hash=_hash(before) if before is not None else None,
            after_hash=_hash(encoded),
            diff_preview=self._diff(before.decode() if before is not None else "", content),
            created=before is None,
        )

    def apply_patch(self, relative_path: str, old_text: str, new_text: str) -> FileChangeResult:
        content = self.read(relative_path)
        if not old_text or content.count(old_text) != 1:
            raise WorkspaceError("Patch context must match exactly once")
        return self.write(relative_path, content.replace(old_text, new_text, 1))

    def _diff(self, before: str, after: str) -> str:
        preview = "".join(
            difflib.unified_diff(
                before.splitlines(keepends=True),
                after.splitlines(keepends=True),
                fromfile="before",
                tofile="after",
            )
        )
        encoded = preview.encode()
        if len(encoded) <= self.diff_preview_bytes:
            return preview
        return encoded[: self.diff_preview_bytes].decode("utf-8", errors="ignore")

```

## FILE: apps/api/app/tools/schemas.py

```
from typing import Any

from pydantic import BaseModel, Field


class SearchMatch(BaseModel):
    path: str
    line: int = Field(gt=0)
    text: str


class FileChangeResult(BaseModel):
    path: str
    before_hash: str | None
    after_hash: str
    diff_preview: str
    created: bool = False


class ToolExecutionResult(BaseModel):
    ok: bool
    summary: str
    data: dict[str, Any] = {}
    error: str | None = None

```

## FILE: apps/api/tests/test_agent_runtime.py

```
from pathlib import Path
from typing import TypeVar

import pytest
from pydantic import BaseModel

from app.events.broadcaster import EventBroadcaster
from app.events.memory import InMemoryEventStore
from app.orchestration.agent_runner import AgentRunner
from app.orchestration.coordinator import Coordinator
from app.orchestration.runtime import MissionRuntime
from app.schemas.mission_plan import MissionPlan
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
        plan: MissionPlan,
        completions: list[ChatCompletionResult],
    ) -> None:
        self.plan = plan
        self.completions = completions

    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        output_type: type[T],
        model: str,
    ) -> T:
        del system_prompt, user_prompt, model
        return output_type.model_validate(self.plan.model_dump())

    async def complete(self, _request: object) -> ChatCompletionResult:
        return self.completions.pop(0)


def one_assignment_plan() -> MissionPlan:
    return MissionPlan.model_validate(
        {
            "mission_summary": "Update a project file",
            "assumptions": [],
            "risks": [],
            "required_roles": ["backend_developer"],
            "assignments": [{
                "staff_role": "backend_developer",
                "objective": "Create result",
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
    await runtime.run(mission)

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
    provider = FakeProvider(one_assignment_plan(), [repeated, repeated, repeated])
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
        repeated_call_limit=1,
    )
    assignment = one_assignment_plan().assignments[0]
    profile = next(profile for profile in profiles if profile.role_key == "backend_developer")
    with pytest.raises(RuntimeError, match="Repeated"):
        await runner.run_assignment("mission-1", profile, assignment)


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

```

## FILE: docs/EVENT_PROTOCOL.md

```
# TOVA Event Protocol

## Envelope

Every persisted and broadcast event uses this versioned shape:

```json
{
  "version": "1.0",
  "event_id": "evt_000042",
  "event_type": "staff.action.started",
  "timestamp": "2026-07-23T18:00:00Z",
  "project_id": "project_orion",
  "mission_id": "mission_orchestration",
  "staff_id": "staff_maya",
  "sequence": 42,
  "payload": {}
}
```

`sequence` is strictly increasing within a mission. Events are persisted before broadcast. Unknown additive payload fields are tolerated within a compatible protocol version; unknown event types are retained in history but do not mutate known projections.

## Event families

- Mission: `mission.created`, `mission.submitted`, `mission.analysis.started`, `mission.analysis.updated`, `mission.team.assembly.started`, `mission.team.member.selected`, `mission.team.assembly.completed`, `mission.started`, `mission.paused`, `mission.resumed`, `mission.blocked`, `mission.completed`, `mission.failed`.
- Staff: `staff.assigned`, `staff.status.changed`, `staff.action.started`, `staff.action.updated`, `staff.action.completed`, `staff.file.opened`, `staff.file.read`, `staff.file.created`, `staff.file.updated`, `staff.file.saved`, `staff.command.started`, `staff.command.output`, `staff.command.completed`, `staff.research.started`, `staff.research.result`, `staff.decision.recorded`, `staff.test.started`, `staff.test.result`.
- Handoff: `handoff.preparing`, `handoff.started`, `handoff.accepted`, `handoff.completed`.
- Approval: `approval.requested`, `approval.accepted`, `approval.rejected`.
- Artifact and activity: `artifact.created`, `artifact.updated`, `activity.created`.

## Common payload fields

Payloads may include:

- `title`, `summary`, `status`, `severity`
- `file_path`, `line_start`, `line_end`
- `tool_name`, `command`, `resource_url`
- `progress_percent`, `phase`
- `from_staff_id`, `to_staff_id`, `handoff_id`
- `artifact_id`, `artifact_type`, `artifact_count`
- `decision_summary`, `observations`, `next_action`

Payloads must not contain provider credentials, hidden reasoning, unrestricted command input, or unredacted secrets.

## Reconnect and replay

The client calls `GET /api/missions/{mission_id}/events?after_sequence=N` before opening:

```text
WS /api/ws/missions/{mission_id}?after_sequence=N
```

The server sends all missed committed events in order, then streams new events. Clients ignore duplicate events by `event_id`, reject regressive sequence values, and request a full replay if a gap remains.

## Projection rules

- Mission status and progress change only from mission events.
- Staff status changes from assignment and status events.
- `staff.file.opened` updates the active file and editor owner.
- Live repository tools emit `staff.file.opened|created|updated` with `file_path` and a human-readable `title` (no file body).
- Activity rows are produced from operational events with a human-readable title.
- `artifact.created` appends a typed artifact.
- `handoff.started` creates the active overlay; accepted/completed events advance it.
- Replay from an empty projection must produce the same visible state as live reduction.

## WebSocket control messages

Client-to-server control messages are schema-validated:

```json
{"type":"mission.pause","mission_id":"mission_orchestration"}
```

Supported controls are pause, resume, cancel, playback-speed change for the simulated runtime, and heartbeat. Invalid messages receive a typed error and never mutate mission state.

```

## FILE: apps/web/src/features/mission/mission-event-reducer.ts

```
import type {
  ActiveHandoff,
  ActivityItem,
  Artifact,
  MissionStatus,
  StaffStatus,
} from "@/types/domain"
import type { EventEnvelope } from "@/types/events"

export interface MissionProjection {
  status: MissionStatus
  phase: MissionStatus
  progress: number
  currentStaffId: string | null
  activeFile: string
  fileRevision: number
  editorOwnerId: string | null
  selectedStaffIds: string[]
  staffStatuses: Record<string, StaffStatus>
  activity: ActivityItem[]
  artifacts: Artifact[]
  activeHandoff: ActiveHandoff | null
  lastSequence: number
  processedEventIds: string[]
}

export function createInitialMissionProjection(): MissionProjection {
  return {
    status: "draft",
    phase: "draft",
    progress: 0,
    currentStaffId: null,
    activeFile: "",
    fileRevision: 0,
    editorOwnerId: null,
    selectedStaffIds: [],
    staffStatuses: {},
    activity: [],
    artifacts: [],
    activeHandoff: null,
    lastSequence: 0,
    processedEventIds: [],
  }
}

function isMissionStatus(value: string | undefined): value is MissionStatus {
  return [
    "draft", "submitted", "analyzing", "assembling_team", "team_ready",
    "running", "paused", "awaiting_approval", "blocked", "testing",
    "reviewing", "completed", "failed", "cancelled",
  ].includes(value ?? "")
}

function isStaffStatus(value: string | undefined): value is StaffStatus {
  return [
    "available", "assigned", "queued", "analyzing", "researching", "working",
    "coding", "reviewing", "testing", "blocked", "handing_off",
    "awaiting_approval", "completed", "offline", "error",
  ].includes(value ?? "")
}

const missionEventState: Partial<Record<EventEnvelope["event_type"], {
  status: MissionStatus
  progress: number
}>> = {
  "mission.created": { status: "draft", progress: 2 },
  "mission.submitted": { status: "submitted", progress: 5 },
  "mission.analysis.started": { status: "analyzing", progress: 10 },
  "mission.analysis.updated": { status: "analyzing", progress: 20 },
  "mission.team.assembly.started": { status: "assembling_team", progress: 25 },
  "mission.team.assembly.completed": { status: "team_ready", progress: 35 },
  "mission.started": { status: "running", progress: 40 },
  "mission.paused": { status: "paused", progress: 40 },
  "mission.resumed": { status: "running", progress: 40 },
  "mission.blocked": { status: "blocked", progress: 40 },
  "mission.completed": { status: "completed", progress: 100 },
  "mission.failed": { status: "failed", progress: 100 },
}

export function missionEventReducer(
  state: MissionProjection,
  event: EventEnvelope,
): MissionProjection {
  if (
    event.sequence <= state.lastSequence ||
    state.processedEventIds.includes(event.event_id)
  ) {
    return state
  }

  const payload = event.payload
  let next: MissionProjection = {
    ...state,
    lastSequence: event.sequence,
    processedEventIds: [...state.processedEventIds, event.event_id],
    activity: [
      ...state.activity,
      {
        id: event.event_id,
        timestamp: event.timestamp,
        staffId: event.staff_id,
        title: payload.title ?? payload.summary ?? event.event_type,
        status: payload.status ?? "completed",
        eventType: event.event_type,
        ...(payload.file_path ? { filePath: payload.file_path } : {}),
      },
    ],
  }

  if (event.event_type.startsWith("mission.")) {
    const inferred = missionEventState[event.event_type]
    const status = isMissionStatus(payload.status)
      ? payload.status
      : inferred?.status ?? next.status
    const phase = isMissionStatus(payload.phase) ? payload.phase : status
    next = {
      ...next,
      status,
      phase,
      progress: payload.progress_percent ?? inferred?.progress ?? next.progress,
      currentStaffId: event.staff_id ?? next.currentStaffId,
    }
  }

  if (event.event_type === "mission.team.member.selected" && event.staff_id) {
    next = {
      ...next,
      selectedStaffIds: next.selectedStaffIds.includes(event.staff_id)
        ? next.selectedStaffIds
        : [...next.selectedStaffIds, event.staff_id],
      staffStatuses: {
        ...next.staffStatuses,
        [event.staff_id]: "queued",
      },
    }
  }

  if (
    ["staff.status.changed", "staff.assigned", "staff.action.started",
      "staff.action.completed", "staff.test.started"].includes(event.event_type)
    && event.staff_id
  ) {
    const inferredStatus: StaffStatus = event.event_type === "staff.assigned"
      ? "queued"
      : event.event_type === "staff.action.completed"
        ? "completed"
        : event.event_type === "staff.test.started"
          ? "testing"
          : "working"
    next = {
      ...next,
      currentStaffId: event.staff_id,
      selectedStaffIds: next.selectedStaffIds.includes(event.staff_id)
        ? next.selectedStaffIds
        : [...next.selectedStaffIds, event.staff_id],
      staffStatuses: {
        ...next.staffStatuses,
        [event.staff_id]: isStaffStatus(payload.status)
          ? payload.status
          : inferredStatus,
      },
    }
  }

  if (
    ["staff.file.opened", "staff.file.created", "staff.file.updated"].includes(
      event.event_type,
    ) &&
    payload.file_path
  ) {
    next = {
      ...next,
      activeFile: payload.file_path,
      editorOwnerId: event.staff_id,
      currentStaffId: event.staff_id ?? next.currentStaffId,
      fileRevision: next.fileRevision + 1,
    }
  }

  if (event.event_type === "artifact.created") {
    next = {
      ...next,
      artifacts: [
        ...next.artifacts,
        {
          id: payload.artifact_id ?? event.event_id,
          staffId: event.staff_id,
          type: payload.artifact_type ?? "final_report",
          name: payload.title ?? "Mission artifact",
          summary: payload.summary ?? "",
        },
      ],
    }
  }

  if (
    event.event_type === "handoff.started" &&
    payload.from_staff_id &&
    payload.to_staff_id
  ) {
    next = {
      ...next,
      activeHandoff: {
        id: payload.handoff_id ?? event.event_id,
        fromStaffId: payload.from_staff_id,
        toStaffId: payload.to_staff_id,
        title: payload.title ?? "Work ready",
        summary: payload.summary ?? "",
        artifactCount: payload.artifact_count ?? 0,
        status: "animating",
      },
    }
  }

  if (event.event_type === "handoff.accepted" && next.activeHandoff) {
    next = {
      ...next,
      currentStaffId: next.activeHandoff.toStaffId,
      activeHandoff: { ...next.activeHandoff, status: "accepted" },
    }
  }

  if (event.event_type === "handoff.completed") {
    next = { ...next, activeHandoff: null }
  }

  if (event.event_type === "mission.completed") {
    next = {
      ...next,
      currentStaffId: event.staff_id,
      staffStatuses: Object.fromEntries(
        next.selectedStaffIds.map((staffId) => [staffId, "completed"]),
      ),
    }
  }

  return next
}

```

## FILE: apps/web/src/features/mission/typewriter.ts

```
export type TypewriterHandle = {
  cancel: () => void
  done: Promise<void>
}

/** Reveal `target` into `onUpdate` in chunks. Cancelling resolves `done` without error. */
export function startTypewriter(options: {
  target: string
  previous?: string
  charsPerTick?: number
  tickMs?: number
  onUpdate: (visible: string) => void
}): TypewriterHandle {
  const {
    target,
    previous,
    charsPerTick = 5,
    tickMs = 24,
    onUpdate,
  } = options

  let cancelled = false
  let timerId: ReturnType<typeof setInterval> | undefined
  let resolveDone!: () => void
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const appendMode =
    previous !== undefined &&
    target.startsWith(previous) &&
    previous.length < target.length
  const visibleStart = appendMode ? previous : ""
  const remaining = appendMode ? target.slice(previous.length) : target

  let index = 0

  const finish = () => {
    if (timerId !== undefined) {
      clearInterval(timerId)
      timerId = undefined
    }
    resolveDone()
  }

  const tick = () => {
    if (cancelled) {
      finish()
      return
    }

    index = Math.min(index + charsPerTick, remaining.length)
    onUpdate(visibleStart + remaining.slice(0, index))

    if (index >= remaining.length) {
      finish()
    }
  }

  onUpdate(visibleStart)

  if (remaining.length === 0) {
    finish()
  } else {
    timerId = setInterval(tick, tickMs)
  }

  const cancel = () => {
    cancelled = true
    finish()
  }

  return { cancel, done }
}

```

## FILE: apps/web/src/components/team-floor/TeamFloor.tsx

```
import { ArrowRight, CheckCircle2, FileStack, GitBranch } from "lucide-react"
import { motion } from "framer-motion"

import { staffProfiles } from "@/features/staff/staff-fixtures"
import { formatStatus } from "@/lib/utils"
import type { ActivityItem, Artifact, StaffStatus } from "@/types/domain"

import { PixelAvatar } from "../staff/PixelAvatar"
import { StatusBadge } from "../staff/StatusBadge"
import { TeamFloorLiveEditor } from "./TeamFloorLiveEditor"

interface TeamFloorProps {
  currentStaffId: string | null
  statuses: Record<string, StaffStatus>
  selectedStaffIds: string[]
  artifacts: Artifact[]
  activity: ActivityItem[]
  onSelectStaff: (staffId: string) => void
  projectId: string | null
  activeFile: string | null
  fileRevision: number
  editorOwnerId: string | null
}

export function TeamFloor({
  currentStaffId,
  statuses,
  selectedStaffIds,
  artifacts,
  activity,
  onSelectStaff,
  projectId,
  activeFile,
  fileRevision,
  editorOwnerId,
}: TeamFloorProps) {
  const team = staffProfiles.filter((staff) => selectedStaffIds.includes(staff.id))
  const highlightStaffId = activeFile && editorOwnerId ? editorOwnerId : currentStaffId
  const active = team.find((staff) => staff.id === currentStaffId) ?? team[0] ?? null
  const highlightIndex = highlightStaffId
    ? team.findIndex((staff) => staff.id === highlightStaffId)
    : -1
  const missionComplete =
    team.length > 0 && team.every((staff) => statuses[staff.id] === "completed")
  const completedCount = team.filter((staff) => statuses[staff.id] === "completed").length
  const upcomingCount = missionComplete
    ? 0
    : Math.max(team.length - completedCount - (active ? 1 : 0), 0)
  const latestAction = active
    ? [...activity].reverse().find((item) => item.staffId === active.id)?.title
      ?? "Waiting for the next observable action."
    : null
  const outputs = [
    ...artifacts.filter((artifact) => artifact.staffId === active?.id).map((artifact) => artifact.name),
    ...artifacts.slice(-2).map((artifact) => artifact.name),
  ].filter((value, index, list) => list.indexOf(value) === index)

  return (
    <section className="team-floor" aria-label="Team Floor">
      <header className="team-floor__header">
        <span>
          <strong>Team Floor</strong>
          <small>Visible mission execution workspace</small>
        </span>
        <span className="team-floor__phase"><GitBranch /> Active workflow</span>
      </header>
      <div className="team-floor__workflow" aria-label="Mission workflow">
        {team.map((staff, index) => (
          <div key={staff.id} className="team-floor__node-wrap">
            <button
              type="button"
              className={index === highlightIndex ? "team-floor__node is-active" : "team-floor__node"}
              onClick={() => onSelectStaff(staff.id)}
            >
              <PixelAvatar avatar={staff.avatar} name={staff.displayName} size="sm" />
              <span>{staff.displayName}</span>
              {(missionComplete || statuses[staff.id] === "completed") && (
                <CheckCircle2 aria-label="Completed" />
              )}
            </button>
            {index < team.length - 1 && <ArrowRight aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="team-floor__body">
        <div className="team-floor__workforce">
          {active ? (
            <motion.div
              key={active.id}
              className="active-staff-stage"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="active-staff-stage__identity">
                <PixelAvatar avatar={active.avatar} name={active.displayName} size="lg" />
                <span>
                  <small>ACTIVE EMPLOYEE</small>
                  <h2>{active.displayName}</h2>
                  <p>{active.role}</p>
                  <StatusBadge status={statuses[active.id] ?? "working"} />
                </span>
              </div>
              <div className="active-staff-stage__action">
                <small>CURRENT ACTION</small>
                <strong>{latestAction}</strong>
                <p>{active.description}</p>
              </div>
              <div className="active-staff-stage__output">
                <small>CURRENT WORK OUTPUT</small>
                {outputs.length > 0 ? outputs.map((item) => (
                  <span key={item}><FileStack />{item}</span>
                )) : (
                  <span>No artifacts yet</span>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="team-floor__empty">
              <strong>No mission is running</strong>
              <p>Start a mission to assemble the team and display its workflow.</p>
            </div>
          )}
        </div>
        <TeamFloorLiveEditor
          projectId={projectId}
          activeFile={activeFile}
          fileRevision={fileRevision}
          editorOwnerId={editorOwnerId}
        />
      </div>
      <footer className="team-floor__timeline">
        <span>Completed <strong>{completedCount}</strong></span>
        <span>Current <strong>{active?.displayName ?? "None"}</strong></span>
        <span>Upcoming <strong>{upcomingCount}</strong></span>
        <span>State <strong>{formatStatus(statuses[active?.id ?? ""] ?? "available")}</strong></span>
      </footer>
    </section>
  )
}

```

## FILE: apps/web/src/components/team-floor/TeamFloorLiveEditor.tsx

```
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"

import { startTypewriter } from "@/features/mission/typewriter"
import { languageForPath, readProjectFile } from "@/features/projects/project-api"
import { staffProfiles } from "@/features/staff/staff-fixtures"

import { PixelAvatar } from "../staff/PixelAvatar"

const MonacoEditor = lazy(() => import("@monaco-editor/react"))

interface TeamFloorLiveEditorProps {
  projectId: string | null
  activeFile: string | null
  fileRevision: number
  editorOwnerId: string | null
}

export function TeamFloorLiveEditor({
  projectId,
  activeFile,
  fileRevision,
  editorOwnerId,
}: TeamFloorLiveEditorProps) {
  const [visible, setVisible] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const visibleRef = useRef("")
  const previousFileRef = useRef<string | null>(activeFile)
  const owner = staffProfiles.find((staff) => staff.id === editorOwnerId)
  const language = activeFile ? languageForPath(activeFile) : "plaintext"

  const fileQuery = useQuery({
    queryKey: ["project-file", projectId, activeFile, fileRevision],
    queryFn: () => readProjectFile(projectId!, activeFile!),
    enabled: Boolean(projectId && activeFile),
  })

  useEffect(() => {
    if (previousFileRef.current === activeFile) return
    previousFileRef.current = activeFile
    visibleRef.current = ""
    queueMicrotask(() => {
      setVisible("")
      setIsTyping(false)
    })
  }, [activeFile])

  useEffect(() => {
    if (!fileQuery.isError) return
    queueMicrotask(() => {
      setIsTyping(false)
    })
  }, [fileQuery.isError])

  useEffect(() => {
    if (!activeFile || !fileQuery.data) return undefined

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setIsTyping(true)
    })

    const handle = startTypewriter({
      previous: visibleRef.current,
      target: fileQuery.data.content,
      onUpdate: (value) => {
        if (cancelled) return
        visibleRef.current = value
        setVisible(value)
      },
    })

    void handle.done.then(() => {
      if (!cancelled) setIsTyping(false)
    })

    return () => {
      cancelled = true
      handle.cancel()
      queueMicrotask(() => {
        setIsTyping(false)
      })
    }
  }, [activeFile, fileRevision, fileQuery.data])

  if (!projectId) {
    return (
      <section className="team-floor__stage team-floor__stage--empty" aria-label="Live code stage">
        <p>Open a project to show live code.</p>
      </section>
    )
  }

  if (!activeFile) {
    return (
      <section className="team-floor__stage team-floor__stage--empty" aria-label="Live code stage">
        <p>Waiting for the first file write</p>
      </section>
    )
  }

  return (
    <section className="team-floor__stage" aria-label="Live code stage">
      <aside className="team-floor__stage-status">
        {owner ? (
          <>
            <PixelAvatar avatar={owner.avatar} name={owner.displayName} size="lg" />
            <span>
              <small>LIVE WRITER</small>
              <strong>{owner.displayName}</strong>
              <p>{owner.role}</p>
            </span>
          </>
        ) : (
          <span>
            <small>LIVE WRITER</small>
            <strong>Unassigned</strong>
            <p>Waiting for a staff file event.</p>
          </span>
        )}
      </aside>
      <div className="team-floor__stage-code">
        <motion.header
          key={activeFile}
          className="team-floor__stage-header"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <span>
            <small>ACTIVE FILE</small>
            <strong>{activeFile}</strong>
          </span>
          {owner && isTyping ? (
            <span className="team-floor__stage-writing">
              <i aria-hidden="true" />
              {owner.displayName} is writing...
            </span>
          ) : (
            <span className="team-floor__stage-writing">Watching file writes</span>
          )}
        </motion.header>
        <div className="team-floor__stage-editor">
          {fileQuery.isLoading ? (
            <div className="editor-loading" role="status">Loading file...</div>
          ) : fileQuery.error ? (
            <p className="team-floor__stage-message" role="alert">
              {fileQuery.error.message}
            </p>
          ) : (
            <Suspense fallback={<div className="editor-loading" role="status">Loading editor...</div>}>
              <MonacoEditor
                path={activeFile}
                language={language}
                value={visible}
                theme="vs"
                options={{
                  readOnly: true,
                  domReadOnly: true,
                  minimap: { enabled: false },
                  fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                  fontSize: 12.5,
                  lineHeight: 20,
                  padding: { top: 14 },
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "gutter",
                  overviewRulerBorder: false,
                  foldingHighlight: false,
                  guides: { indentation: false },
                  wordWrap: "on",
                  automaticLayout: true,
                }}
              />
            </Suspense>
          )}
        </div>
      </div>
    </section>
  )
}

```

## FILE: apps/web/src/app/App.tsx

```
import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { ActivityFeed } from "@/components/activity/ActivityFeed"
import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
import { CodeWorkspace } from "@/components/editor/CodeWorkspace"
import { HandoffOverlay } from "@/components/handoff/HandoffOverlay"
import { MissionComposer } from "@/components/mission/MissionComposer"
import { MissionControlBar } from "@/components/mission/MissionControlBar"
import { MissionStageStrip } from "@/components/mission/MissionStageStrip"
import { ProjectExplorer } from "@/components/repository/ProjectExplorer"
import { AppShell } from "@/components/shell/AppShell"
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar"
import { EngineeringTeamPanel } from "@/components/staff/EngineeringTeamPanel"
import { TeamFloor } from "@/components/team-floor/TeamFloor"
import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
import { useLiveRuntime } from "@/features/mission/use-live-runtime"
import { getRuntimeStatus } from "@/features/models/model-api"
import { getActiveProject } from "@/features/projects/project-api"
import { staffProfiles, workLogs } from "@/features/staff/staff-fixtures"
import { useUiStore } from "@/stores/ui-store"

export function App() {
  const client = useQueryClient()
  const activePanel = useUiStore((state) => state.activePanel)
  const setActivePanel = useUiStore((state) => state.setActivePanel)
  const selectedStaffId = useUiStore((state) => state.selectedStaffId)
  const selectStaff = useUiStore((state) => state.selectStaff)
  const workLogOpen = useUiStore((state) => state.workLogOpen)
  const setWorkLogOpen = useUiStore((state) => state.setWorkLogOpen)
  const activeFile = useUiStore((state) => state.activeFile)
  const openFiles = useUiStore((state) => state.openFiles)
  const openFile = useUiStore((state) => state.openFile)
  const closeFile = useUiStore((state) => state.closeFile)
  const clearFiles = useUiStore((state) => state.clearFiles)
  const speed = useUiStore((state) => state.playbackSpeed)
  const setSpeed = useUiStore((state) => state.setPlaybackSpeed)
  const liveRuntime = useLiveRuntime()
  const runtimeStatus = useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    retry: 1,
  })
  const project = useQuery({
    queryKey: ["active-project"],
    queryFn: getActiveProject,
    retry: 1,
  })

  useEffect(() => {
    const path = liveRuntime.projection.activeFile
    if (!path) return
    openFile(path)
    void client.invalidateQueries({ queryKey: ["project-entries", project.data?.id] })
    void client.invalidateQueries({
      queryKey: ["project-file", project.data?.id, path],
    })
  }, [
    client,
    liveRuntime.projection.activeFile,
    liveRuntime.projection.fileRevision,
    openFile,
    project.data?.id,
  ])

  const selectedStaff =
    staffProfiles.find((staff) => staff.id === selectedStaffId) ?? staffProfiles[0]

  const sidebar = activePanel === "explorer" ? (
    <ProjectExplorer
      project={project.data ?? null}
      activeFile={activeFile}
      onOpenFile={openFile}
      onProjectOpened={(next) => {
        clearFiles()
        void client.setQueryData(["active-project"], next)
      }}
    />
  ) : (
    <WorkspaceSidebar panel={activePanel} />
  )

  const workspace = (
    <div className="mission-workspace">
      {!liveRuntime.hasStarted ? (
        <MissionComposer
          projectName={project.data?.name}
          liveRuntime={{
            connected: runtimeStatus.data?.runtime === "live"
              && (runtimeStatus.data?.connected ?? false),
            profileId: runtimeStatus.data?.profile_id ?? "",
            model: runtimeStatus.data?.model ?? "",
          }}
          onStart={(request) => {
            if (!project.data) return
            void liveRuntime.start({
              request: request.request,
              projectId: project.data.id,
              modelProfileId: request.modelProfile,
              model: request.model,
            })
          }}
        />
      ) : (
        <MissionControlBar
          title={liveRuntime.mission?.objective ?? "Live mission"}
          playing={liveRuntime.playing}
          paused={liveRuntime.paused}
          completed={liveRuntime.projection.status === "completed"}
          speed={speed}
          onPause={liveRuntime.pause}
          onResume={liveRuntime.resume}
          onRestart={liveRuntime.cancel}
          onSpeedChange={setSpeed}
        />
      )}
      {liveRuntime.error && (
        <p className="mission-runtime-error" role="alert">{liveRuntime.error}</p>
      )}
      <MissionStageStrip
        phase={liveRuntime.projection.phase}
        progress={liveRuntime.projection.progress}
        teamCount={liveRuntime.projection.selectedStaffIds.length}
        coordinatorName="Alex"
      />
      {activePanel === "team-floor" ? (
        <TeamFloor
          currentStaffId={liveRuntime.projection.currentStaffId}
          statuses={liveRuntime.projection.staffStatuses}
          selectedStaffIds={liveRuntime.projection.selectedStaffIds}
          artifacts={liveRuntime.projection.artifacts}
          activity={liveRuntime.projection.activity}
          onSelectStaff={selectStaff}
          projectId={project.data?.id ?? null}
          activeFile={liveRuntime.projection.activeFile || null}
          fileRevision={liveRuntime.projection.fileRevision}
          editorOwnerId={liveRuntime.projection.editorOwnerId}
        />
      ) : (
        <CodeWorkspace
          projectId={project.data?.id ?? null}
          activeFile={activeFile}
          openFiles={openFiles}
          editorOwnerId={liveRuntime.projection.editorOwnerId}
          onSelectFile={openFile}
          onCloseFile={closeFile}
        />
      )}
      <ActivityFeed
        events={liveRuntime.projection.activity.length > 0
          ? liveRuntime.projection.activity
          : [
              {
                id: "welcome",
                timestamp: new Date().toISOString(),
                staffId: "staff_alex",
                title: project.data
                  ? "Alex is ready to receive a software mission"
                  : "Open a project to begin",
                status: "available",
                eventType: "activity.created",
              },
            ]}
      />
    </div>
  )

  return (
    <AppShell
      activePanel={activePanel}
      onPanelChange={setActivePanel}
      sidebar={sidebar}
      workspace={workspace}
      teamPanel={(
        <EngineeringTeamPanel
          staff={staffProfiles}
          selectedStaffIds={
            liveRuntime.projection.selectedStaffIds.length > 0
              ? liveRuntime.projection.selectedStaffIds
              : staffProfiles.map((staff) => staff.id)
          }
          statuses={liveRuntime.projection.staffStatuses}
          selectedStaffId={selectedStaffId}
          onSelectStaff={selectStaff}
        />
      )}
      overlays={(
        <>
          <WorkLogDrawer
            open={workLogOpen}
            staff={selectedStaff}
            log={workLogs[selectedStaff.id]}
            onOpenChange={setWorkLogOpen}
          />
          <HandoffOverlay
            handoff={liveRuntime.projection.activeHandoff}
            staff={staffProfiles}
            onSkip={() => undefined}
          />
          <CommandApprovalDialog missionId={liveRuntime.mission?.id} />
        </>
      )}
    />
  )
}

```

## FILE: apps/web/tests/mission-event-reducer.test.ts

```
import { describe, expect, it } from "vitest"

import {
  createInitialMissionProjection,
  missionEventReducer,
} from "@/features/mission/mission-event-reducer"
import type { EventEnvelope } from "@/types/events"

const event = (
  sequence: number,
  eventType: EventEnvelope["event_type"],
  payload: EventEnvelope["payload"],
  staffId: string | null = null,
): EventEnvelope => ({
  version: "1.0",
  event_id: `evt_${sequence}`,
  event_type: eventType,
  timestamp: `2026-07-23T18:00:${sequence.toString().padStart(2, "0")}Z`,
  project_id: "project_orion",
  mission_id: "mission_orchestration",
  staff_id: staffId,
  sequence,
  payload,
})

describe("missionEventReducer", () => {
  it("rebuilds mission, staff, file, activity, artifact, and handoff state", () => {
    const events: EventEnvelope[] = [
      event(1, "mission.analysis.started", {
        title: "Analyzing mission",
        status: "analyzing",
        progress_percent: 8,
      }, "staff_alex"),
      event(2, "staff.status.changed", {
        status: "researching",
        title: "Maya started repository research",
      }, "staff_maya"),
      event(3, "staff.file.opened", {
        title: "Maya opened the orchestration service",
        file_path: "services/orchestrator.py",
      }, "staff_maya"),
      event(4, "artifact.created", {
        artifact_id: "artifact_research",
        artifact_type: "research_note",
        title: "Repository research brief",
        summary: "Existing mission state patterns identified.",
      }, "staff_maya"),
      event(5, "handoff.started", {
        handoff_id: "handoff_maya_ethan",
        from_staff_id: "staff_maya",
        to_staff_id: "staff_ethan",
        title: "Research complete",
        summary: "Implementation evidence is ready.",
        artifact_count: 1,
      }, "staff_maya"),
    ]

    const projection = events.reduce(
      missionEventReducer,
      createInitialMissionProjection(),
    )

    expect(projection.status).toBe("analyzing")
    expect(projection.currentStaffId).toBe("staff_maya")
    expect(projection.staffStatuses.staff_maya).toBe("researching")
    expect(projection.activeFile).toBe("services/orchestrator.py")
    expect(projection.activity).toHaveLength(5)
    expect(projection.artifacts[0]?.name).toBe("Repository research brief")
    expect(projection.activeHandoff?.toStaffId).toBe("staff_ethan")
    expect(projection.lastSequence).toBe(5)
  })

  it("bumps fileRevision on successive file updates to the same path", () => {
    const opened = event(1, "staff.file.opened", {
      title: "Opened a.ts",
      file_path: "a.ts",
    }, "staff_maya")
    const updated = event(2, "staff.file.updated", {
      title: "Wrote a.ts",
      file_path: "a.ts",
    }, "staff_maya")
    const projection = [opened, updated].reduce(
      missionEventReducer,
      createInitialMissionProjection(),
    )
    expect(projection.activeFile).toBe("a.ts")
    expect(projection.fileRevision).toBe(2)
    expect(projection.editorOwnerId).toBe("staff_maya")
  })

  it("uses summary as activity title when title is absent", () => {
    const projection = missionEventReducer(
      createInitialMissionProjection(),
      event(1, "staff.action.updated", { summary: "Wrote a.ts", ok: true }, "staff_maya"),
    )
    expect(projection.activity[0]?.title).toBe("Wrote a.ts")
  })

  it("ignores duplicate and out-of-order events", () => {
    const initial = createInitialMissionProjection()
    const later = event(4, "mission.started", {
      title: "Mission started",
      status: "running",
      progress_percent: 20,
    })
    const earlier = event(3, "mission.failed", {
      title: "Stale failure",
      status: "failed",
    })

    const projection = [later, earlier, later].reduce(missionEventReducer, initial)

    expect(projection.status).toBe("running")
    expect(projection.activity).toHaveLength(1)
    expect(projection.lastSequence).toBe(4)
  })
})

```

## FILE: apps/web/tests/typewriter.test.ts

```
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { startTypewriter } from "@/features/mission/typewriter"

describe("startTypewriter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("reveals content progressively", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      target: "abcdef",
      charsPerTick: 2,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(100)
    await handle.done
    expect(frames.at(-1)).toBe("abcdef")
    expect(frames.length).toBeGreaterThan(1)
  })

  it("appends when previous is a prefix", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      previous: "ab",
      target: "abcd",
      charsPerTick: 2,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(50)
    await handle.done
    expect(frames[0]).toBe("ab")
    expect(frames.at(-1)).toBe("abcd")
  })

  it("full rewrites when previous equals target", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      previous: "hello",
      target: "hello",
      charsPerTick: 2,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(100)
    await handle.done
    expect(frames[0]).toBe("")
    expect(frames.at(-1)).toBe("hello")
    expect(frames.length).toBeGreaterThan(1)
  })

  it("cancel stops further updates", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      target: "abcdefghij",
      charsPerTick: 1,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(30)
    handle.cancel()
    const count = frames.length
    await vi.advanceTimersByTimeAsync(100)
    expect(frames.length).toBe(count)
    await handle.done
  })
})

```

## FILE: apps/web/tests/team-floor-live-editor.test.tsx

```
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  editorProps: [] as Array<{
    path?: string
    language?: string
    value?: string
    options?: {
      readOnly?: boolean
      domReadOnly?: boolean
      minimap?: { enabled?: boolean }
    }
  }>,
  readProjectFile: vi.fn(),
  typewriterCalls: [] as Array<{ previous?: string, target: string }>,
  typewriterHandles: [] as Array<{ cancel: ReturnType<typeof vi.fn>, done: Promise<void> }>,
}))

vi.mock("@monaco-editor/react", () => ({
  default: (props: {
    path?: string
    language?: string
    value?: string
    options?: {
      readOnly?: boolean
      domReadOnly?: boolean
      minimap?: { enabled?: boolean }
    }
  }) => {
    mocks.editorProps.push(props)
    return (
      <div
        data-testid="monaco-editor"
        data-dom-readonly={String(props.options?.domReadOnly)}
        data-language={props.language}
        data-minimap={String(props.options?.minimap?.enabled)}
        data-path={props.path}
        data-readonly={String(props.options?.readOnly)}
      >
        {props.value}
      </div>
    )
  },
}))

vi.mock("@/features/projects/project-api", () => ({
  languageForPath: (path: string) => {
    if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript"
    if (path.endsWith(".css")) return "css"
    return "plaintext"
  },
  readProjectFile: mocks.readProjectFile,
}))

vi.mock("@/features/mission/typewriter", () => ({
  startTypewriter: (options: {
    previous?: string
    target: string
    onUpdate: (visible: string) => void
  }) => {
    const handle = { cancel: vi.fn(), done: new Promise<void>(() => undefined) }
    mocks.typewriterCalls.push({ previous: options.previous, target: options.target })
    mocks.typewriterHandles.push(handle)
    options.onUpdate(options.target)
    return handle
  },
}))

import { TeamFloorLiveEditor } from "@/components/team-floor/TeamFloorLiveEditor"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      {node}
    </QueryClientProvider>,
  )
}

describe("TeamFloorLiveEditor", () => {
  afterEach(() => {
    mocks.editorProps.length = 0
    mocks.typewriterCalls.length = 0
    mocks.typewriterHandles.length = 0
    mocks.readProjectFile.mockReset()
  })

  it("shows idle copy when no active file is available", () => {
    renderWithClient(
      <TeamFloorLiveEditor
        projectId="project_1"
        activeFile={null}
        fileRevision={0}
        editorOwnerId={null}
      />,
    )

    expect(screen.getByLabelText("Live code stage")).toBeInTheDocument()
    expect(screen.getByText("Waiting for the first file write")).toBeInTheDocument()
    expect(mocks.readProjectFile).not.toHaveBeenCalled()
  })

  it("renders read-only Monaco with the active writer and fetched file content", async () => {
    mocks.readProjectFile.mockResolvedValueOnce({
      path: "src/App.tsx",
      content: "const value = 1",
    })

    renderWithClient(
      <TeamFloorLiveEditor
        projectId="project_1"
        activeFile="src/App.tsx"
        fileRevision={1}
        editorOwnerId="staff_lina"
      />,
    )

    const editor = await screen.findByTestId("monaco-editor")
    expect(screen.getByText("Lina is writing...")).toBeInTheDocument()
    expect(editor).toHaveAttribute("data-path", "src/App.tsx")
    expect(editor).toHaveAttribute("data-language", "typescript")
    expect(editor).toHaveAttribute("data-readonly", "true")
    expect(editor).toHaveAttribute("data-dom-readonly", "true")
    expect(editor).toHaveAttribute("data-minimap", "false")
    expect(editor).toHaveTextContent("const value = 1")
  })

  it("refetches on fileRevision and resets previous content on active file change", async () => {
    mocks.readProjectFile
      .mockResolvedValueOnce({ path: "src/App.tsx", content: "const value = 1" })
      .mockResolvedValueOnce({ path: "src/App.tsx", content: "const value = 2" })
      .mockResolvedValueOnce({ path: "src/styles.css", content: ".stage { color: red; }" })

    const view = renderWithClient(
      <TeamFloorLiveEditor
        projectId="project_1"
        activeFile="src/App.tsx"
        fileRevision={1}
        editorOwnerId="staff_lina"
      />,
    )

    await screen.findByText("const value = 1")

    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TeamFloorLiveEditor
          projectId="project_1"
          activeFile="src/App.tsx"
          fileRevision={2}
          editorOwnerId="staff_lina"
        />
      </QueryClientProvider>,
    )

    await screen.findByText("const value = 2")

    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TeamFloorLiveEditor
          projectId="project_1"
          activeFile="src/styles.css"
          fileRevision={3}
          editorOwnerId="staff_lina"
        />
      </QueryClientProvider>,
    )

    await screen.findByText(".stage { color: red; }")

    expect(mocks.readProjectFile).toHaveBeenNthCalledWith(1, "project_1", "src/App.tsx")
    expect(mocks.readProjectFile).toHaveBeenNthCalledWith(2, "project_1", "src/App.tsx")
    expect(mocks.readProjectFile).toHaveBeenNthCalledWith(3, "project_1", "src/styles.css")
    await waitFor(() => expect(mocks.typewriterHandles[0]?.cancel).toHaveBeenCalled())
    expect(mocks.typewriterCalls[1]).toMatchObject({
      previous: "const value = 1",
      target: "const value = 2",
    })
    expect(mocks.typewriterCalls[2]).toMatchObject({
      previous: "",
      target: ".stage { color: red; }",
    })
  })

  it("clears writing status when a newer revision fetch fails", async () => {
    mocks.readProjectFile
      .mockResolvedValueOnce({ path: "src/App.tsx", content: "const value = 1" })
      .mockRejectedValueOnce(new Error("Failed to read file"))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const view = render(
      <QueryClientProvider client={client}>
        <TeamFloorLiveEditor
          projectId="project_1"
          activeFile="src/App.tsx"
          fileRevision={1}
          editorOwnerId="staff_lina"
        />
      </QueryClientProvider>,
    )

    await screen.findByText("const value = 1")
    expect(screen.getByText("Lina is writing...")).toBeInTheDocument()

    view.rerender(
      <QueryClientProvider client={client}>
        <TeamFloorLiveEditor
          projectId="project_1"
          activeFile="src/App.tsx"
          fileRevision={2}
          editorOwnerId="staff_lina"
        />
      </QueryClientProvider>,
    )

    await screen.findByRole("alert")
    await waitFor(() => {
      expect(screen.queryByText("Lina is writing...")).not.toBeInTheDocument()
    })
    expect(screen.getByText("Watching file writes")).toBeInTheDocument()
    expect(mocks.typewriterHandles[0]?.cancel).toHaveBeenCalled()
  })
})

```

## FILE: apps/web/tests/e2e/mission-flow.spec.ts

```
import { expect, test } from "@playwright/test"
import { join } from "node:path"

test("opens a real local project and shows empty workspace controls", async ({ page }) => {
  const projectName = `tova-e2e-${Date.now()}`
  const projectRoot = join(process.env.TEMP ?? "C:\\Temp", projectName)

  await page.goto("/")
  await expect(page.getByRole("complementary", { name: "Project explorer" })).toBeVisible()

  await page.getByRole("button", { name: "Project menu" }).click()
  await page.getByRole("menuitem", { name: "New projectâ€¦" }).click()
  await page.getByLabel("Folder path").fill(projectRoot)
  await page.getByRole("button", { name: "Create and open" }).click()

  await expect(page.getByRole("dialog", { name: "New project" })).toBeHidden({ timeout: 15_000 })
  await expect(page.getByRole("complementary", { name: "Project explorer" }).getByText(projectName).first()).toBeVisible()
  await expect(page.getByText("Empty folder â€” start a mission to fill it.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Start mission" })).toBeDisabled()

  await page.getByRole("button", { name: "Team Floor" }).click()
  await expect(page.getByRole("region", { name: "Team Floor" })).toBeVisible()
  await expect(page.getByText("No mission is running")).toBeVisible()
  await expect(page.getByRole("region", { name: "Live code stage" })).toBeVisible()
  await expect(page.getByText("Waiting for the first file write")).toBeVisible()
})

```

