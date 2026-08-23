from __future__ import annotations

import asyncio
import functools
import json
import subprocess
import threading
import time
from collections.abc import Awaitable, Callable
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict

from app.core.paths import browser_audit_script
from app.schemas.approvals import (
    ApprovalStatus,
    BrowserAuditRequest,
    BrowserAuditResult,
    BrowserAuditVerdict,
)
from app.services.approvals import ApprovalRegistry
from app.tools.repository import ProjectWorkspace
from app.tools.static_page_audit import evaluate_static_page_audit

__all__ = [
    "ApprovedBrowserAuditRunner",
    "BrowserAuditExecution",
    "evaluate_static_page_audit",
]

EventSink = Callable[[str, dict[str, Any]], Awaitable[None]]
BrowserAuditExecutor = Callable[
    [BrowserAuditRequest, Path],
    Awaitable["BrowserAuditExecution"],
]
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


async def _no_events(_event_type: str, _payload: dict[str, Any]) -> None:
    return None


class BrowserAuditExecution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool
    data: dict[str, Any] = {}
    error: str | None = None


class _QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args: object) -> None:
        return None


class _ManagedStaticServer:
    def __init__(self, root: Path) -> None:
        handler = functools.partial(_QuietStaticHandler, directory=str(root))
        self._server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self._thread = threading.Thread(
            target=self._server.serve_forever,
            daemon=True,
        )
        self.url = f"http://127.0.0.1:{self._server.server_port}/"

    def start(self) -> None:
        self._thread.start()

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=2)


class ApprovedBrowserAuditRunner:
    def __init__(
        self,
        workspace: ProjectWorkspace,
        approvals: ApprovalRegistry,
        *,
        executor: BrowserAuditExecutor | None = None,
        event_sink: EventSink = _no_events,
        timeout_seconds: float = 45,
    ) -> None:
        self.workspace = workspace
        self.approvals = approvals
        self.executor = executor or self._execute_playwright
        self.event_sink = event_sink
        self.timeout_seconds = timeout_seconds

    async def run(self, request: BrowserAuditRequest) -> BrowserAuditResult:
        if not self._is_allowed_local_url(request.url):
            return BrowserAuditResult(
                url=request.url,
                error="Browser audits are limited to local http URLs",
            )

        static_server = self._managed_static_server_for(request)
        if static_server is not None:
            static_server.start()
            request = request.model_copy(update={"url": static_server.url})

        try:
            approval = await self.approvals.request(request)
            await self.event_sink(
                "approval.requested",
                {
                    "approval_id": approval.id,
                    "kind": "browser_audit",
                    "staff_id": request.staff_id,
                    "staff_display_name": request.staff_display_name,
                    "url": request.url,
                    "purpose": request.purpose,
                    "acceptance_criteria": request.acceptance_criteria,
                },
            )
            decision = await self.approvals.wait_for_decision(approval.id)
            if decision == ApprovalStatus.REJECTED:
                await self.event_sink("approval.rejected", {"approval_id": approval.id})
                return BrowserAuditResult(
                    approval_id=approval.id,
                    rejected=True,
                    url=request.url,
                )

            await self.event_sink("approval.accepted", {"approval_id": approval.id})
            self.approvals.set_status(approval.id, ApprovalStatus.EXECUTING)
            await self.event_sink(
                "staff.test.started",
                {
                    "tool": "qa.browser.audit",
                    "url": request.url,
                    "purpose": request.purpose,
                    "status": "testing",
                },
            )

            started = time.perf_counter()
            output_dir = self._artifact_dir(approval.id)
            try:
                execution = await asyncio.wait_for(
                    self.executor(request, output_dir),
                    timeout=self.timeout_seconds,
                )
            except TimeoutError:
                self.approvals.set_status(approval.id, ApprovalStatus.FAILED)
                result = BrowserAuditResult(
                    approval_id=approval.id,
                    url=request.url,
                    verdict="blocked",
                    error="Browser audit timed out",
                )
                await self._emit_result(result, started)
                return result

            result = self._result_from_execution(approval.id, request.url, execution)
            self.approvals.set_status(
                approval.id,
                ApprovalStatus.EXECUTED if result.error is None else ApprovalStatus.FAILED,
            )
            await self._emit_result(result, started)
            return result
        finally:
            if static_server is not None:
                await asyncio.to_thread(static_server.close)

    def _artifact_dir(self, approval_id: str) -> Path:
        path = self.workspace.root / ".tova" / "browser-audits" / approval_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _managed_static_server_for(
        self,
        request: BrowserAuditRequest,
    ) -> _ManagedStaticServer | None:
        parsed = urlparse(request.url)
        if (
            parsed.hostname not in _LOCAL_HOSTS
            or not (self.workspace.root / "index.html").exists()
        ):
            return None
        return _ManagedStaticServer(self.workspace.root)

    def _result_from_execution(
        self,
        approval_id: str,
        url: str,
        execution: BrowserAuditExecution,
    ) -> BrowserAuditResult:
        if not execution.ok:
            return BrowserAuditResult(
                approval_id=approval_id,
                url=url,
                verdict="blocked",
                error=execution.error or "Browser audit failed",
            )
        data = execution.data
        return BrowserAuditResult(
            approval_id=approval_id,
            url=str(data.get("url") or url),
            title=str(data.get("title") or ""),
            verdict=self._verdict(data.get("verdict")),
            summary=str(data.get("summary") or ""),
            screenshot_path=str(data.get("screenshot_path") or ""),
            visible_text=str(data.get("visible_text") or ""),
            console_errors=self._strings(data.get("console_errors")),
            failed_requests=self._strings(data.get("failed_requests")),
            layout_findings=self._strings(data.get("layout_findings")),
        )

    async def _emit_result(
        self,
        result: BrowserAuditResult,
        started: float,
    ) -> None:
        await self.event_sink(
            "staff.test.result",
            {
                "tool": "qa.browser.audit",
                "url": result.url,
                "verdict": result.verdict,
                "summary": result.summary or result.error or "Browser audit completed",
                "screenshot_path": result.screenshot_path,
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "status": "completed" if result.error is None else "blocked",
            },
        )

    @staticmethod
    def _is_allowed_local_url(url: str) -> bool:
        parsed = urlparse(url)
        return parsed.scheme == "http" and (parsed.hostname or "") in _LOCAL_HOSTS

    async def _execute_static_page(
        self,
        request: BrowserAuditRequest,
    ) -> BrowserAuditExecution:
        import httpx

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(request.url)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            return BrowserAuditExecution(
                ok=False,
                error=f"Could not fetch local page for static audit: {exc}",
            )
        evaluated = evaluate_static_page_audit(response.text, request.acceptance_criteria)
        return BrowserAuditExecution(
            ok=True,
            data={
                "url": str(response.url),
                "title": "",
                "verdict": evaluated["verdict"],
                "summary": evaluated["summary"],
                "screenshot_path": "",
                "visible_text": evaluated["visible_text"],
                "console_errors": [],
                "failed_requests": [],
                "layout_findings": evaluated.get("layout_findings") or [],
            },
        )

    @staticmethod
    def _strings(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item)[:500] for item in value if item is not None]

    @staticmethod
    def _verdict(value: object) -> BrowserAuditVerdict:
        if value == "pass":
            return "pass"
        if value == "fail":
            return "fail"
        if value == "needs_improvement":
            return "needs_improvement"
        if value == "blocked":
            return "blocked"
        return "blocked"

    async def _execute_playwright(
        self,
        request: BrowserAuditRequest,
        output_dir: Path,
    ) -> BrowserAuditExecution:
        script = browser_audit_script()
        if not await asyncio.to_thread(script.exists):
            return await self._execute_static_page(request)

        args = [
            "node",
            str(script),
            "--url",
            request.url,
            "--output-dir",
            str(output_dir),
            "--criteria-json",
            json.dumps(request.acceptance_criteria),
            "--selectors-json",
            json.dumps(request.selectors_to_check),
            "--viewport-json",
            json.dumps(request.viewport or {}),
        ]

        try:
            process = await asyncio.to_thread(
                subprocess.run,
                args,
                cwd=str(script.parent),
                input=None,
                capture_output=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except FileNotFoundError:
            return await self._execute_static_page(request)
        except subprocess.TimeoutExpired:
            return BrowserAuditExecution(ok=False, error="Browser audit timed out")

        if process.returncode != 0:
            stderr = (process.stderr or process.stdout).decode(
                "utf-8",
                errors="replace",
            )
            if "ERR_MODULE_NOT_FOUND" in stderr or "Cannot find package" in stderr:
                return await self._execute_static_page(request)
            return BrowserAuditExecution(ok=False, error=stderr[:1000])
        try:
            payload = json.loads(process.stdout.decode("utf-8"))
        except json.JSONDecodeError as exc:
            return BrowserAuditExecution(ok=False, error=f"Invalid browser audit JSON: {exc}")
        if not isinstance(payload, dict):
            return BrowserAuditExecution(ok=False, error="Browser audit JSON must be an object")
        screenshot_path = payload.get("screenshot_path")
        if isinstance(screenshot_path, str) and screenshot_path:
            shot = Path(screenshot_path)
            if shot.is_absolute():
                try:
                    payload["screenshot_path"] = shot.relative_to(self.workspace.root).as_posix()
                except ValueError:
                    payload["screenshot_path"] = shot.name
            else:
                payload["screenshot_path"] = (
                    output_dir.relative_to(self.workspace.root) / shot
                ).as_posix()
        return BrowserAuditExecution(ok=True, data=payload)
