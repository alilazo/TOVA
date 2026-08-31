import asyncio
import subprocess
from pathlib import Path

import pytest

from app.schemas.approvals import ApprovalStatus, BrowserAuditRequest
from app.services.approvals import ApprovalRegistry
from app.tools.browser_qa import ApprovedBrowserAuditRunner, BrowserAuditExecution
from app.tools.repository import ProjectWorkspace


def _request(url: str = "http://127.0.0.1:5173") -> BrowserAuditRequest:
    return BrowserAuditRequest(
        mission_id="mission-browser",
        staff_id="staff_ava",
        staff_display_name="Ava",
        url=url,
        purpose="Inspect generated UI",
        acceptance_criteria=["The page renders without overlapping buttons"],
    )


@pytest.mark.asyncio
async def test_browser_audit_waits_for_approval_then_runs(tmp_path: Path) -> None:
    registry = ApprovalRegistry()
    events: list[tuple[str, dict]] = []
    executions: list[BrowserAuditRequest] = []

    async def sink(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    async def execute(request: BrowserAuditRequest, output_dir: Path) -> BrowserAuditExecution:
        executions.append(request)
        screenshot = output_dir / "screenshot.png"
        screenshot.write_bytes(b"png")
        return BrowserAuditExecution(
            ok=True,
            data={
                "url": request.url,
                "title": "Hello",
                "verdict": "pass",
                "summary": "Page passed visual audit",
                "screenshot_path": ".tova/browser-audits/approval/screenshot.png",
                "visible_text": "Hello TOVA",
                "console_errors": [],
                "failed_requests": [],
                "layout_findings": [],
            },
        )

    runner = ApprovedBrowserAuditRunner(
        ProjectWorkspace(tmp_path),
        registry,
        executor=execute,
        event_sink=sink,
    )
    task = asyncio.create_task(runner.run(_request()))
    await asyncio.sleep(0)

    pending = registry.list_pending()
    assert len(pending) == 1
    assert pending[0].request.kind == "browser_audit"
    assert executions == []
    assert events[0][0] == "approval.requested"
    assert events[0][1]["url"] == "http://127.0.0.1:5173"

    await registry.accept(pending[0].id)
    result = await task

    assert result.rejected is False
    assert result.verdict == "pass"
    assert result.screenshot_path.endswith("screenshot.png")
    assert executions and executions[0].url == "http://127.0.0.1:5173"
    assert registry.get(pending[0].id).status == ApprovalStatus.EXECUTED
    assert ("approval.accepted", {"approval_id": pending[0].id}) in events
    assert any(event_type == "staff.test.started" for event_type, _payload in events)
    assert any(event_type == "staff.test.result" for event_type, _payload in events)


@pytest.mark.asyncio
async def test_browser_audit_rejection_does_not_run(tmp_path: Path) -> None:
    registry = ApprovalRegistry()
    executions = 0

    async def execute(
        _request: BrowserAuditRequest,
        _output_dir: Path,
    ) -> BrowserAuditExecution:
        nonlocal executions
        executions += 1
        return BrowserAuditExecution(ok=True, data={})

    runner = ApprovedBrowserAuditRunner(
        ProjectWorkspace(tmp_path),
        registry,
        executor=execute,
    )
    task = asyncio.create_task(runner.run(_request()))
    await asyncio.sleep(0)

    await registry.reject(registry.list_pending()[0].id)
    result = await task

    assert result.rejected is True
    assert executions == 0


@pytest.mark.asyncio
async def test_browser_audit_rejects_external_urls_before_approval(tmp_path: Path) -> None:
    registry = ApprovalRegistry()
    runner = ApprovedBrowserAuditRunner(ProjectWorkspace(tmp_path), registry)

    result = await runner.run(_request("https://example.com"))

    assert result.error == "Browser audits are limited to local http URLs"
    assert registry.list_pending() == []


@pytest.mark.asyncio
async def test_browser_audit_uses_managed_static_url_for_api_port(
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<button>Click Me</button>", encoding="utf-8")
    registry = ApprovalRegistry()
    executions: list[str] = []

    async def execute(request: BrowserAuditRequest, output_dir: Path) -> BrowserAuditExecution:
        executions.append(request.url)
        (output_dir / "screenshot.png").write_bytes(b"png")
        return BrowserAuditExecution(
            ok=True,
            data={
                "url": request.url,
                "title": "Sample",
                "verdict": "pass",
                "summary": "Page passed visual audit",
                "screenshot_path": "screenshot.png",
            },
        )

    runner = ApprovedBrowserAuditRunner(
        ProjectWorkspace(tmp_path),
        registry,
        executor=execute,
    )
    task = asyncio.create_task(runner.run(_request("http://127.0.0.1:8000")))
    await asyncio.sleep(0)

    pending = registry.list_pending()
    assert len(pending) == 1
    approved_url = pending[0].request.url
    assert approved_url.startswith("http://127.0.0.1:")
    assert approved_url != "http://127.0.0.1:8000"

    await registry.accept(pending[0].id)
    result = await task

    assert result.verdict == "pass"
    assert executions == [approved_url]


@pytest.mark.asyncio
async def test_browser_audit_uses_managed_static_url_for_alternate_api_port(
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<button>Click Me</button>", encoding="utf-8")
    registry = ApprovalRegistry()
    executions: list[str] = []

    async def execute(request: BrowserAuditRequest, output_dir: Path) -> BrowserAuditExecution:
        executions.append(request.url)
        (output_dir / "screenshot.png").write_bytes(b"png")
        return BrowserAuditExecution(
            ok=True,
            data={
                "url": request.url,
                "title": "Sample",
                "verdict": "pass",
                "summary": "Page passed visual audit",
                "screenshot_path": "screenshot.png",
            },
        )

    runner = ApprovedBrowserAuditRunner(
        ProjectWorkspace(tmp_path),
        registry,
        executor=execute,
    )
    task = asyncio.create_task(runner.run(_request("http://127.0.0.1:8010")))
    await asyncio.sleep(0)

    pending = registry.list_pending()
    assert len(pending) == 1
    approved_url = pending[0].request.url
    assert approved_url.startswith("http://127.0.0.1:")
    assert approved_url != "http://127.0.0.1:8010"

    await registry.accept(pending[0].id)
    result = await task

    assert result.verdict == "pass"
    assert executions == [approved_url]


@pytest.mark.asyncio
async def test_browser_audit_uses_managed_static_url_for_any_local_port_with_index(
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<button>Click Me</button>", encoding="utf-8")
    registry = ApprovalRegistry()
    executions: list[str] = []

    async def execute(request: BrowserAuditRequest, output_dir: Path) -> BrowserAuditExecution:
        executions.append(request.url)
        (output_dir / "screenshot.png").write_bytes(b"png")
        return BrowserAuditExecution(
            ok=True,
            data={
                "url": request.url,
                "title": "Sample",
                "verdict": "pass",
                "summary": "Page passed visual audit",
                "screenshot_path": "screenshot.png",
            },
        )

    runner = ApprovedBrowserAuditRunner(
        ProjectWorkspace(tmp_path),
        registry,
        executor=execute,
    )
    task = asyncio.create_task(runner.run(_request("http://127.0.0.1:8080")))
    await asyncio.sleep(0)

    pending = registry.list_pending()
    assert len(pending) == 1
    approved_url = pending[0].request.url
    assert approved_url.startswith("http://127.0.0.1:")
    assert approved_url != "http://127.0.0.1:8080"

    await registry.accept(pending[0].id)
    result = await task

    assert result.verdict == "pass"
    assert executions == [approved_url]


@pytest.mark.asyncio
async def test_browser_audit_default_executor_uses_threaded_subprocess(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registry = ApprovalRegistry()
    calls: list[list[str]] = []

    async def broken_async_subprocess(*_args: object, **_kwargs: object) -> object:
        raise NotImplementedError

    def fake_run(
        args: list[str],
        *,
        cwd: str,
        input: bytes | None,
        capture_output: bool,
        timeout: float,
        check: bool,
    ) -> subprocess.CompletedProcess[bytes]:
        del cwd, input, capture_output, timeout, check
        calls.append(args)
        return subprocess.CompletedProcess(
            args=args,
            returncode=0,
            stdout=(
                b'{"url":"http://127.0.0.1:5173","title":"OK",'
                b'"verdict":"pass","summary":"Page passed",'
                b'"screenshot_path":"screenshot.png"}'
            ),
            stderr=b"",
        )

    monkeypatch.setattr(asyncio, "create_subprocess_exec", broken_async_subprocess)
    monkeypatch.setattr(subprocess, "run", fake_run)
    runner = ApprovedBrowserAuditRunner(ProjectWorkspace(tmp_path), registry)
    task = asyncio.create_task(runner.run(_request()))
    await asyncio.sleep(0)

    await registry.accept(registry.list_pending()[0].id)
    result = await task

    assert result.verdict == "pass"
    assert calls and calls[0][0] == "node"


@pytest.mark.asyncio
async def test_browser_audit_reuses_preview_url_and_skips_second_approval(
    tmp_path: Path,
) -> None:
    (tmp_path / "index.html").write_text("<button>Hello</button>", encoding="utf-8")
    registry = ApprovalRegistry()
    executions: list[str] = []

    async def execute(request: BrowserAuditRequest, output_dir: Path) -> BrowserAuditExecution:
        executions.append(request.url)
        (output_dir / "screenshot.png").write_bytes(b"png")
        return BrowserAuditExecution(
            ok=True,
            data={
                "url": request.url,
                "title": "Sample",
                "verdict": "pass",
                "summary": "Page passed visual audit",
                "screenshot_path": "screenshot.png",
            },
        )

    runner = ApprovedBrowserAuditRunner(
        ProjectWorkspace(tmp_path),
        registry,
        executor=execute,
    )
    first = asyncio.create_task(runner.run(_request("http://127.0.0.1:8000")))
    await asyncio.sleep(0)
    pending = registry.list_pending()
    assert len(pending) == 1
    preview_url = pending[0].request.url
    await registry.accept(pending[0].id)
    first_result = await first

    second = await runner.run(_request("http://127.0.0.1:8000"))

    assert first_result.verdict == "pass"
    assert second.verdict == "pass"
    assert executions == [preview_url, preview_url]
    assert len(registry.list_pending()) == 0
    accepted = [
        record
        for record in registry.list_for_mission("mission-browser")
        if record.request.kind == "browser_audit"
    ]
    assert len(accepted) == 1

