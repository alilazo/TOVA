import asyncio
import os
import subprocess
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.schemas.approvals import (
    ApprovalStatus,
    CommandRequest,
    CommandResult,
)
from app.services.approvals import ApprovalRegistry
from app.tools.repository import ProjectWorkspace, WorkspaceError

EventSink = Callable[[str, dict[str, Any]], Awaitable[None]]
_SAFE_ENV_KEYS = {
    "PATH",
    "PATHEXT",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "TEMP",
    "TMP",
    "HOME",
    "USERPROFILE",
    "LANG",
}
_ALLOWED_EXECUTABLES = {
    "node",
    "npm",
    "pnpm",
    "pytest",
    "python",
    "python3",
    "uv",
}
_REJECTED_INLINE_FLAGS = {"-c", "-e", "--eval", "--execute", "-command", "/c", "/k"}


async def _no_events(_event_type: str, _payload: dict[str, Any]) -> None:
    return None


class ApprovedCommandRunner:
    def __init__(
        self,
        workspace: ProjectWorkspace,
        approvals: ApprovalRegistry,
        *,
        output_limit_bytes: int = 1_000_000,
        event_sink: EventSink = _no_events,
    ) -> None:
        self.workspace = workspace
        self.approvals = approvals
        self.output_limit_bytes = output_limit_bytes
        self.event_sink = event_sink

    async def run(self, request: CommandRequest) -> CommandResult:
        policy_error = self._validate_command_policy(request)
        if policy_error:
            return CommandResult(approval_id="", output=policy_error)
        try:
            if request.cwd in {".", "./", ""}:
                cwd = self.workspace.root
            else:
                cwd = self.workspace.resolve(request.cwd, must_exist=True)
            if not cwd.is_dir():
                raise WorkspaceError("Command cwd must be a directory")
        except WorkspaceError as exc:
            return CommandResult(
                approval_id="",
                output=str(exc)[: self.output_limit_bytes],
            )
        approval = await self.approvals.request(request)
        await self.event_sink(
            "approval.requested",
            {
                "approval_id": approval.id,
                "staff_id": request.staff_id,
                "executable": request.executable,
                "args": request.args,
                "cwd": request.cwd,
                "purpose": request.purpose,
                "timeout_seconds": request.timeout_seconds,
                "expected_outputs": request.expected_outputs,
            },
        )
        decision = await self.approvals.wait_for_decision(approval.id)
        if decision == ApprovalStatus.REJECTED:
            await self.event_sink("approval.rejected", {"approval_id": approval.id})
            return CommandResult(approval_id=approval.id, rejected=True)
        await self.event_sink("approval.accepted", {"approval_id": approval.id})
        self.approvals.set_status(approval.id, ApprovalStatus.EXECUTING)
        started = time.perf_counter()
        try:
            process = await asyncio.to_thread(
                subprocess.run,
                [request.executable, *request.args],
                cwd=cwd,
                env=self._sanitized_environment(),
                input=None,
                capture_output=True,
                timeout=request.timeout_seconds,
                check=False,
            )
            output, truncated = await self._capture_completed_output(
                process.stdout + process.stderr,
                approval.id,
            )
        except asyncio.CancelledError:
            self.approvals.set_status(approval.id, ApprovalStatus.FAILED)
            raise
        except subprocess.TimeoutExpired as exc:
            output, truncated = await self._capture_completed_output(
                self._timeout_output(exc),
                approval.id,
            )
            self.approvals.set_status(approval.id, ApprovalStatus.FAILED)
            return self._result(
                approval.id,
                output,
                started,
                exit_code=None,
                timed_out=True,
                output_truncated=truncated,
            )
        except OSError as exc:
            self.approvals.set_status(approval.id, ApprovalStatus.FAILED)
            return CommandResult(
                approval_id=approval.id,
                output=str(exc)[: self.output_limit_bytes],
                duration_ms=round((time.perf_counter() - started) * 1000),
            )
        status = ApprovalStatus.EXECUTED if process.returncode == 0 else ApprovalStatus.FAILED
        self.approvals.set_status(approval.id, status)
        result = self._result(
            approval.id,
            output,
            started,
            exit_code=process.returncode,
            output_truncated=truncated,
        )
        await self.event_sink(
            "staff.command.completed",
            {
                "approval_id": approval.id,
                "exit_code": result.exit_code,
                "duration_ms": result.duration_ms,
                "output_truncated": result.output_truncated,
            },
        )
        return result

    def _result(
        self,
        approval_id: str,
        output: bytes,
        started: float,
        *,
        exit_code: int | None,
        timed_out: bool = False,
        output_truncated: bool = False,
    ) -> CommandResult:
        return CommandResult(
            approval_id=approval_id,
            exit_code=exit_code,
            output=output.decode("utf-8", errors="replace"),
            duration_ms=round((time.perf_counter() - started) * 1000),
            timed_out=timed_out,
            output_truncated=output_truncated,
        )

    async def _capture_output(
        self,
        stream: asyncio.StreamReader,
        approval_id: str,
    ) -> tuple[bytes, bool]:
        output = bytearray()
        total = 0
        truncated = False
        while chunk := await stream.read(65_536):
            total += len(chunk)
            remaining = self.output_limit_bytes - len(output)
            if remaining > 0:
                output.extend(chunk[:remaining])
            truncated = truncated or len(chunk) > remaining
            await self.event_sink(
                "staff.command.output",
                {
                    "approval_id": approval_id,
                    "bytes_received": total,
                    "content_redacted": True,
                },
            )
        return bytes(output), truncated

    async def _capture_completed_output(
        self,
        data: bytes,
        approval_id: str,
    ) -> tuple[bytes, bool]:
        output = data[: self.output_limit_bytes]
        truncated = len(data) > self.output_limit_bytes
        if data:
            await self.event_sink(
                "staff.command.output",
                {
                    "approval_id": approval_id,
                    "bytes_received": len(data),
                    "content_redacted": True,
                },
            )
        return output, truncated

    @staticmethod
    def _timeout_output(exc: subprocess.TimeoutExpired) -> bytes:
        stdout = exc.stdout or b""
        stderr = exc.stderr or b""
        if isinstance(stdout, str):
            stdout = stdout.encode()
        if isinstance(stderr, str):
            stderr = stderr.encode()
        return stdout + stderr

    def _sanitized_environment(self) -> dict[str, str]:
        return {key: value for key, value in os.environ.items() if key.upper() in _SAFE_ENV_KEYS}

    @staticmethod
    def _validate_command_policy(request: CommandRequest) -> str | None:
        executable = os.path.basename(request.executable).lower()
        if executable.endswith((".exe", ".cmd", ".bat")):
            executable = os.path.splitext(executable)[0]
        if executable not in _ALLOWED_EXECUTABLES:
            return "Command executable is not allowed"
        if any(argument.lower() in _REJECTED_INLINE_FLAGS for argument in request.args):
            return "Inline command evaluation is not allowed"
        if request.timeout_seconds > 120:
            return "Command timeout exceeds the bounded limit"
        return None
