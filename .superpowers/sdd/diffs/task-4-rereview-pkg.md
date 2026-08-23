# Task 4 re-review package (post fix)
### apps/api/app/orchestration/agent_runner.py

`python
import asyncio
import json
import re
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

from pydantic import BaseModel, Field, ValidationError

from app.orchestration.prompts import compile_staff_system_prompt
from app.orchestration.tool_definitions import agent_tool_definitions
from app.schemas.approvals import CommandRequest, FileDeleteRequest
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
from app.tools.file_delete import ApprovedFileDeleteRunner
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace

Emit = Callable[..., Awaitable[object]]
PauseGate = Callable[[], Awaitable[None]]

_FILE_MUTATION_TOOLS = frozenset(
    {"repository.write", "repository.apply_patch", "repository.delete"}
)
_COMMON_OBJECTIVE_WORDS = frozenset(
    {
        "a",
        "an",
        "the",
        "and",
        "or",
        "to",
        "of",
        "in",
        "on",
        "for",
        "with",
        "that",
        "this",
        "page",
        "file",
        "files",
        "create",
        "created",
        "show",
        "shows",
        "text",
        "simple",
        "tiny",
        "small",
        "using",
        "use",
        "from",
        "into",
        "about",
        "centered",
        "center",
        "middle",
        "website",
        "html",
        "css",
    }
)


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
        mission_objective: str = "",
        cancellation: asyncio.Event | None = None,
        pause_gate: PauseGate | None = None,
    ) -> AgentOutcome:
        deliverables = ", ".join(assignment.deliverables)
        wording_source = "\n".join(
            part for part in (mission_objective.strip(), assignment.objective) if part
        )
        mission_line = (
            f"Mission objective: {mission_objective.strip()}\n"
            if mission_objective.strip()
            else ""
        )
        messages = [
            ChatMessage(role="system", content=compile_staff_system_prompt(profile)),
            ChatMessage(
                role="user",
                content=(
                    f"{mission_line}"
                    f"Assignment objective: {assignment.objective}\n"
                    f"Deliverables: {deliverables}\n"
                    "Use repository tools for any file deliverables before summarizing. "
                    "Match the objective scope with the smallest change; do not invent "
                    "extra features, pages, or polish. Preserve exact user-visible wording "
                    "from the mission/assignment objectives (do not shorten branded or "
                    "requested text). "
                    "When tools have produced the deliverables, return a JSON object with "
                    "a concise `summary` string only—no markdown fences. Do not include "
                    "hidden reasoning."
                ),
            ),
        ]
        repeated: dict[str, int] = {}
        artifacts: list[dict[str, str]] = []
        handoffs: list[dict[str, str]] = []
        file_mutations = 0
        remediation_used = False
        wording_remediation_used = False
        write_capable = profile.permissions.get("filesystem_write") is True
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
                truncated = result.finish_reason == "length"
                needs_write = write_capable and file_mutations == 0
                if truncated or needs_write:
                    if remediation_used:
                        if truncated:
                            raise RuntimeError(
                                "Assignment truncated without recoverable tool use"
                            )
                        raise RuntimeError(
                            "Write-capable assignment completed without repository "
                            "file mutations"
                        )
                    remediation_used = True
                    reason = (
                        "Your previous reply was truncated before tools ran."
                        if truncated
                        else "No repository.write or repository.apply_patch succeeded yet."
                    )
                    messages.append(
                        ChatMessage(role="assistant", content=result.content)
                    )
                    messages.append(
                        ChatMessage(
                            role="user",
                            content=(
                                f"{reason} Call repository.write or repository.apply_patch "
                                f"now for deliverables ({deliverables}). Keep the change "
                                "minimal and matched to the objective. Do not finish with "
                                "prose alone."
                            ),
                        )
                    )
                    continue
                missing_phrases = self._missing_objective_phrases(
                    wording_source,
                    assignment.deliverables,
                )
                if (
                    file_mutations > 0
                    and missing_phrases
                    and not wording_remediation_used
                ):
                    wording_remediation_used = True
                    missing = ", ".join(f'"{phrase}"' for phrase in missing_phrases)
                    messages.append(
                        ChatMessage(role="assistant", content=result.content)
                    )
                    messages.append(
                        ChatMessage(
                            role="user",
                            content=(
                                "The written deliverables are missing exact objective "
                                f"wording: {missing}. Make a minimal repository.write or "
                                "repository.apply_patch that restores those exact phrases "
                                "in the user-visible content, then finish with JSON "
                                "`summary` only (no markdown fences)."
                            ),
                        )
                    )
                    continue
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
                if (
                    call.name in _FILE_MUTATION_TOOLS
                    and isinstance(tool_result, dict)
                    and tool_result.get("ok") is True
                ):
                    file_mutations += 1
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
        if call.name == "repository.delete":
            try:
                delete_request = FileDeleteRequest.model_validate(
                    {
                        **call.arguments,
                        "mission_id": mission_id,
                        "staff_id": profile.id,
                        "staff_display_name": profile.display_name,
                    }
                )
            except ValidationError as exc:
                return {"ok": False, "error": str(exc)}

            async def delete_event(event_type: str, payload: dict[str, Any]) -> None:
                await self._emit(mission_id, event_type, payload, profile.id)

            delete_runner = ApprovedFileDeleteRunner(
                self.workspace,
                self.approvals,
                event_sink=delete_event,
            )
            delete_result = await delete_runner.run(delete_request)
            ok = (
                not delete_result.rejected
                and delete_result.error is None
                and bool(delete_result.path)
            )
            await self._emit(
                mission_id,
                "staff.action.updated",
                {
                    "tool": call.name,
                    "summary": (
                        f"Deleted {delete_result.path}"
                        if ok
                        else (
                            "Delete rejected"
                            if delete_result.rejected
                            else (delete_result.error or "Delete failed")
                        )
                    ),
                    "ok": ok,
                },
                profile.id,
            )
            if ok:
                await self._emit(
                    mission_id,
                    "staff.file.deleted",
                    {
                        "file_path": delete_result.path,
                        "title": f"Deleted {delete_result.path}",
                    },
                    profile.id,
                )
            return {
                "ok": ok,
                **delete_result.model_dump(),
            }
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
        if profile.permissions.get("filesystem_delete") is True:
            allowed.add("repository.delete")
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
        if raw.startswith("```"):
            lines = raw.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw = "\n".join(lines).strip()
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and isinstance(parsed.get("summary"), str):
                raw = parsed["summary"].strip()
        except json.JSONDecodeError:
            pass
        lowered = raw.lower()
        if "chain-of-thought" in lowered or "reasoning:" in lowered:
            return "Assignment completed; unsafe internal-reasoning content was withheld."
        return raw[:2000]

    def _missing_objective_phrases(
        self,
        objective: str,
        deliverables: list[str],
    ) -> list[str]:
        phrases = self._distinctive_phrases(objective)
        if not phrases or not deliverables:
            return []
        combined = []
        for path in deliverables:
            try:
                combined.append(self.workspace.read(path))
            except Exception:
                continue
        content = "\n".join(combined)
        if not content:
            return phrases
        return [phrase for phrase in phrases if phrase not in content]

    def _distinctive_phrases(self, objective: str) -> list[str]:
        phrases: list[str] = []
        for match in re.finditer(r'"([^"]+)"|\'([^\']+)\'', objective):
            phrase = (match.group(1) or match.group(2) or "").strip()
            if phrase:
                phrases.append(phrase)
        for match in re.finditer(
            r"\b(?:[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*)+)\b",
            objective,
        ):
            phrases.append(match.group(0))
        seen: set[str] = set()
        ordered: list[str] = []
        for phrase in phrases:
            if phrase in seen:
                continue
            tokens = [token for token in re.split(r"\s+", phrase) if token]
            if not tokens:
                continue
            if (
                len(tokens) == 1
                and tokens[0].lower() in _COMMON_OBJECTIVE_WORDS
            ):
                continue
            seen.add(phrase)
            ordered.append(phrase)
        return ordered

`
### apps/api/tests/test_repository_delete_agent.py

`python
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

`
