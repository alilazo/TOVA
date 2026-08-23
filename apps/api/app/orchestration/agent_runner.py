import asyncio
import json
import re
from collections.abc import Awaitable, Callable
from typing import Any, Protocol, cast
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError

from app.orchestration.capabilities import capabilities_for
from app.orchestration.prompts import compile_staff_system_prompt
from app.orchestration.tool_definitions import agent_tool_definitions
from app.schemas.approvals import BrowserAuditRequest, CommandRequest, FileDeleteRequest
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
from app.tools.browser_qa import ApprovedBrowserAuditRunner, BrowserAuditExecutor
from app.tools.commands import ApprovedCommandRunner
from app.tools.file_delete import ApprovedFileDeleteRunner
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace, WorkspaceError

Emit = Callable[..., Awaitable[object]]
PauseGate = Callable[[], Awaitable[None]]

_FILE_MUTATION_TOOLS = frozenset(
    {"repository.write", "repository.apply_patch", "repository.delete"}
)
_QA_EVIDENCE_TOOLS = frozenset(
    {"qa.browser.audit", "test.pytest", "test.vitest"}
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
_NON_USER_VISIBLE_PHRASE_TOKENS = frozenset(
    {
        "alex",
        "ava",
        "backend",
        "coordinator",
        "developer",
        "engineer",
        "front",
        "frontend",
        "front-end",
        "if",
        "lina",
        "project",
        "qa",
        "tester",
    }
)


class CompletionProvider(Protocol):
    async def complete(self, request: ChatCompletionRequest) -> ChatCompletionResult: ...


class AgentOutcome(BaseModel):
    staff_role: str
    summary: str
    artifacts: list[dict[str, Any]] = []
    handoffs: list[dict[str, Any]] = []


class ArtifactInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=4000)
    type: str | None = None


class HandoffInput(BaseModel):
    to_role: str = Field(min_length=1)
    summary: str = Field(min_length=1, max_length=4000)
    changed_paths: list[str] = Field(default_factory=list, max_length=100)
    test_instructions: list[str] = Field(default_factory=list, max_length=50)
    acceptance_criteria: list[str] = Field(default_factory=list, max_length=50)
    artifact_ids: list[str] = Field(default_factory=list, max_length=50)


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
        browser_audit_executor: BrowserAuditExecutor | None = None,
        staff_profiles: list[StaffProfileDocument] | None = None,
    ) -> None:
        self.provider = provider
        self.model = model
        self.tools = tools
        self.approvals = approvals
        self.workspace = workspace
        self.emit = emit
        self.max_iterations = max_iterations
        self.repeated_call_limit = repeated_call_limit
        self.browser_audit_executor = browser_audit_executor
        self.staff_profiles = staff_profiles or []

    async def run_assignment(
        self,
        mission_id: str,
        profile: StaffProfileDocument,
        assignment: MissionPlanAssignment,
        *,
        mission_objective: str = "",
        mission_context: str = "",
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
        context_line = (
            "Existing Team Chat and project context:\n"
            f"{mission_context.strip()}\n"
            if mission_context.strip()
            else ""
        )
        messages = [
            ChatMessage(role="system", content=compile_staff_system_prompt(profile)),
            ChatMessage(
                role="user",
                content=(
                    f"{mission_line}"
                    f"{context_line}"
                    f"Assignment objective: {assignment.objective}\n"
                    f"Deliverables: {deliverables}\n"
                    "Use repository tools for any file deliverables before summarizing. "
                    "If relevant files already exist, read and edit those files instead of "
                    "creating parallel replacement files or new framework folders. "
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
        handoffs: list[dict[str, Any]] = []
        file_mutations = 0
        qa_evidence = 0
        remediation_used = False
        wording_remediation_used = False
        consecutive_suppressed = 0
        write_capable = profile.permissions.get("filesystem_write") is True
        qa_capable = profile.role_key == "qa_tester"
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
                needs_qa = qa_capable and qa_evidence == 0
                if truncated or needs_write or needs_qa:
                    if remediation_used:
                        if truncated:
                            raise RuntimeError(
                                "Assignment truncated without recoverable tool use"
                            )
                        if needs_write:
                            raise RuntimeError(
                                "Write-capable assignment completed without repository "
                                "file mutations"
                            )
                        raise RuntimeError(
                            "QA assignment completed without test or audit evidence"
                        )
                    remediation_used = True
                    if truncated:
                        reason = "Your previous reply was truncated before tools ran."
                        instruction = (
                            f"{reason} Call repository.write or repository.apply_patch "
                            f"now for deliverables ({deliverables}). Keep the change "
                            "minimal and matched to the objective. Do not finish with "
                            "prose alone."
                        )
                    elif needs_write:
                        reason = (
                            "No repository.write or repository.apply_patch succeeded yet."
                        )
                        instruction = (
                            f"{reason} Call repository.write or repository.apply_patch "
                            f"now for deliverables ({deliverables}). Keep the change "
                            "minimal and matched to the objective. Do not finish with "
                            "prose alone."
                        )
                    else:
                        instruction = (
                            "No QA evidence yet. Run a test, complete a browser audit, "
                            "or create a qa_report artifact before summarizing. Reading "
                            "files is not enough. Do not finish with prose alone."
                        )
                    messages.append(
                        ChatMessage(role="assistant", content=result.content)
                    )
                    messages.append(
                        ChatMessage(role="user", content=instruction)
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
            terminal_summary: str | None = None
            suppressed_calls: list[str] = []
            for call in result.tool_calls:
                if pause_gate is not None:
                    await pause_gate()
                if cancellation is not None and cancellation.is_set():
                    raise asyncio.CancelledError
                key = f"{call.name}:{json.dumps(call.arguments, sort_keys=True)}"
                repeated[key] = repeated.get(key, 0) + 1
                if repeated[key] > self.repeated_call_limit:
                    tool_result = {
                        "ok": False,
                        "error": (
                            "Repeated tool call suppressed. Use the previous result, "
                            "choose a different tool/action, or finish with a JSON summary."
                        ),
                    }
                    suppressed_calls.append(call.name)
                    await self._emit(
                        mission_id,
                        "staff.action.updated",
                        {
                            "tool": call.name,
                            "summary": "Repeated tool call suppressed",
                            "ok": False,
                        },
                        profile.id,
                    )
                else:
                    tool_result = await self._execute_tool(
                        mission_id,
                        profile,
                        call,
                        artifacts,
                        handoffs,
                    )
                if isinstance(tool_result, dict) and tool_result.get("ok") is True:
                    if call.name in _FILE_MUTATION_TOOLS:
                        file_mutations += 1
                    artifact_payload = tool_result.get("artifact")
                    if call.name in _QA_EVIDENCE_TOOLS or (
                        qa_capable
                        and call.name == "artifact.create"
                        and isinstance(artifact_payload, dict)
                    ):
                        qa_evidence += 1
                if (
                    call.name == "artifact.create"
                    and isinstance(tool_result, dict)
                    and tool_result.get("ok") is True
                    and isinstance(tool_result.get("artifact"), dict)
                ):
                    artifact = cast(dict[str, Any], tool_result["artifact"])
                    artifact_summary = artifact.get("summary") or artifact.get("title")
                    if isinstance(artifact_summary, str) and artifact_summary.strip():
                        terminal_summary = artifact_summary.strip()
                messages.append(
                    ChatMessage(
                        role="tool",
                        tool_call_id=call.id,
                        content=json.dumps(tool_result, ensure_ascii=True),
                    )
                )
            if suppressed_calls:
                blocked = ", ".join(sorted(set(suppressed_calls)))
                consecutive_suppressed += 1
                if consecutive_suppressed >= 3:
                    raise RuntimeError("Agent stuck in a repeated tool loop")
                messages.append(
                    ChatMessage(
                        role="user",
                        content=(
                            f"TOVA suppressed repeated identical tool calls: {blocked}. "
                            f"Do not call {blocked} again with the same arguments. "
                            "Use the previous successful tool results already in this "
                            "conversation. If enough evidence exists, return a JSON object "
                            "with a concise `summary` string now. If not, choose a different "
                            "allowed tool or different arguments."
                        ),
                    )
                )
            else:
                consecutive_suppressed = 0
            if (
                terminal_summary
                and all(call.name == "artifact.create" for call in result.tool_calls)
                and not (qa_capable and qa_evidence == 0)
            ):
                await self._emit(
                    mission_id,
                    "staff.action.completed",
                    {"summary": terminal_summary},
                    profile.id,
                )
                return AgentOutcome(
                    staff_role=profile.role_key,
                    summary=terminal_summary,
                    artifacts=artifacts,
                    handoffs=handoffs,
                )
        if any(count > self.repeated_call_limit for count in repeated.values()):
            raise RuntimeError("Agent iteration limit exceeded after repeated tool calls")
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
        try:
            return await self._dispatch_tool(
                mission_id,
                profile,
                call,
                artifacts,
                handoffs,
            )
        except WorkspaceError as exc:
            await self._emit(
                mission_id,
                "staff.action.updated",
                {
                    "tool": call.name,
                    "summary": "Tool rejected",
                    "ok": False,
                },
                profile.id,
            )
            return {"ok": False, "error": str(exc)}

    async def _dispatch_tool(
        self,
        mission_id: str,
        profile: StaffProfileDocument,
        call: ToolCall,
        artifacts: list[dict[str, str]],
        handoffs: list[dict[str, str]],
    ) -> dict[str, Any]:
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
        if call.name in {"command.request", "test.pytest", "test.vitest"}:
            executable = call.arguments.get("executable", "")
            args = call.arguments.get("args", [])
            if call.name == "test.pytest":
                executable = "pytest"
            elif call.name == "test.vitest":
                executable = "pnpm"
                args = ["exec", "vitest", *args]
            try:
                command = CommandRequest.model_validate(
                    {
                        **call.arguments,
                        "mission_id": mission_id,
                        "staff_id": profile.id,
                        "executable": executable,
                        "args": args,
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
            ok = not command_result.rejected and command_result.exit_code == 0
            if not command_result.approval_id:
                await self._emit(
                    mission_id,
                    "staff.action.updated",
                    {
                        "tool": call.name,
                        "summary": command_result.output or "Command path rejected",
                        "ok": False,
                    },
                    profile.id,
                )
            return {
                "ok": ok,
                **command_result.model_dump(),
            }
        if call.name == "qa.browser.audit":
            try:
                audit_request = BrowserAuditRequest.model_validate(
                    {
                        **call.arguments,
                        "mission_id": mission_id,
                        "staff_id": profile.id,
                        "staff_display_name": profile.display_name,
                    }
                )
            except ValidationError as exc:
                return {"ok": False, "error": str(exc)}

            async def audit_event(event_type: str, payload: dict[str, Any]) -> None:
                await self._emit(mission_id, event_type, payload, profile.id)

            audit_runner = ApprovedBrowserAuditRunner(
                self.workspace,
                self.approvals,
                executor=self.browser_audit_executor,
                event_sink=audit_event,
            )
            audit_result = await audit_runner.run(audit_request)
            ok = not audit_result.rejected and audit_result.error is None
            if ok:
                title = f"QA browser audit: {audit_result.verdict}"
                summary = audit_result.summary or title
                artifact = {
                    "type": "qa_report",
                    "name": title,
                    "summary": summary,
                    "verdict": audit_result.verdict,
                    "url": audit_result.url,
                    "screenshot_path": audit_result.screenshot_path,
                }
                artifacts.append(artifact)
                await self._emit(
                    mission_id,
                    "artifact.created",
                    {
                        "artifact_id": f"qa_{audit_result.approval_id}",
                        "artifact_type": "qa_report",
                        "title": title,
                        "summary": summary,
                        "verdict": audit_result.verdict,
                        "url": audit_result.url,
                        "screenshot_path": audit_result.screenshot_path,
                    },
                    profile.id,
                )
            return {
                "ok": ok,
                **audit_result.model_dump(),
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
            try:
                for path in handoff["changed_paths"]:
                    self.workspace.resolve(path)
            except WorkspaceError as exc:
                return {"ok": False, "error": str(exc)}
            target = next(
                (
                    candidate
                    for candidate in self.staff_profiles
                    if candidate.role_key == handoff["to_role"]
                ),
                None,
            )
            if self.staff_profiles and target is None:
                return {"ok": False, "error": "Unknown handoff recipient role"}
            handoff_id = f"handoff_{uuid4().hex}"
            handoff["handoff_id"] = handoff_id
            handoff["from_staff_id"] = profile.id
            handoff["to_staff_id"] = target.id if target else ""
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
        return capabilities_for(profile)

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
        phrases: list[tuple[str, bool]] = []
        for match in re.finditer(r'"([^"]+)"|\'([^\']+)\'', objective):
            phrase = (match.group(1) or match.group(2) or "").strip()
            if phrase:
                phrases.append((phrase, True))
        for match in re.finditer(
            r"\b(?:[A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*)+)\b",
            objective,
        ):
            phrases.append((match.group(0), False))
        seen: set[str] = set()
        ordered: list[str] = []
        for phrase, quoted in phrases:
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
            normalized = {
                token.lower().strip(".,:;!?()[]{}")
                for token in tokens
            }
            if not quoted and normalized & _NON_USER_VISIBLE_PHRASE_TOKENS:
                continue
            seen.add(phrase)
            ordered.append(phrase)
        return ordered

