# Task 1 Review Package
No git — working tree snapshots of changed files.

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

## FILE: apps/api/app/tools/registry.py
```
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, ValidationError

from app.tools.repository import ProjectWorkspace, WorkspaceError
from app.tools.schemas import ToolExecutionResult


class PathInput(BaseModel):
    path: str


class SearchInput(BaseModel):
    query: str
    path: str = "."


class WriteInput(BaseModel):
    path: str
    content: str


class PatchInput(BaseModel):
    path: str
    old_text: str
    new_text: str


Handler = Callable[[dict[str, Any]], ToolExecutionResult]


class RepositoryToolRegistry:
    def __init__(self, workspace: ProjectWorkspace) -> None:
        self.workspace = workspace

    def execute(self, name: str, arguments: dict[str, Any]) -> ToolExecutionResult:
        handlers: dict[str, Handler] = {
            "repository.list": self._list,
            "repository.search": self._search,
            "repository.read": self._read,
            "repository.write": self._write,
            "repository.apply_patch": self._patch,
        }
        handler = handlers.get(name)
        if handler is None:
            return ToolExecutionResult(ok=False, summary="Unknown tool", error="unknown_tool")
        try:
            return handler(arguments)
        except (ValidationError, WorkspaceError) as exc:
            return ToolExecutionResult(ok=False, summary="Tool rejected", error=str(exc))

    def _list(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        path = PathInput.model_validate(arguments).path
        files = self.workspace.list(path)
        return ToolExecutionResult(
            ok=True,
            summary=f"Listed {len(files)} files",
            data={"files": files},
        )

    def _search(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        request = SearchInput.model_validate(arguments)
        matches = self.workspace.search(request.query, request.path)
        return ToolExecutionResult(
            ok=True,
            summary=f"Found {len(matches)} matches",
            data={"matches": [match.model_dump() for match in matches]},
        )

    def _read(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        path = PathInput.model_validate(arguments).path
        content = self.workspace.read(path)
        return ToolExecutionResult(
            ok=True,
            summary=f"Read {path}",
            data={"path": path, "content": content},
        )

    def _write(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        request = WriteInput.model_validate(arguments)
        change = self.workspace.write(request.path, request.content)
        return ToolExecutionResult(
            ok=True,
            summary=f"Wrote {request.path}",
            data=change.model_dump(exclude={"diff_preview"}),
        )

    def _patch(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        request = PatchInput.model_validate(arguments)
        change = self.workspace.apply_patch(request.path, request.old_text, request.new_text)
        return ToolExecutionResult(
            ok=True,
            summary=f"Patched {request.path}",
            data=change.model_dump(exclude={"diff_preview"}),
        )

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


