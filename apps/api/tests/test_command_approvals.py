import asyncio
import subprocess
import sys
from pathlib import Path

import pytest

from app.schemas.approvals import ApprovalStatus, CommandRequest
from app.services.approvals import ApprovalRegistry
from app.tools.commands import ApprovedCommandRunner
from app.tools.repository import ProjectWorkspace


@pytest.mark.asyncio
async def test_command_waits_for_approval_then_runs_once(tmp_path: Path) -> None:
    registry = ApprovalRegistry()
    runner = ApprovedCommandRunner(ProjectWorkspace(tmp_path), registry)
    marker = tmp_path / "ran.txt"
    script = tmp_path / "write_marker.py"
    script.write_text("from pathlib import Path\nPath('ran.txt').write_text('yes')\n")
    request = CommandRequest(
        mission_id="mission-1",
        staff_id="staff_noah",
        executable=sys.executable,
        args=[script.name],
        cwd=".",
        purpose="prove approval",
    )

    task = asyncio.create_task(runner.run(request))
    await asyncio.sleep(0)
    pending = registry.list_pending()

    assert len(pending) == 1
    assert not marker.exists()
    await registry.accept(pending[0].id)
    result = await task

    assert result.exit_code == 0
    assert marker.read_text() == "yes"
    assert registry.get(pending[0].id).status == ApprovalStatus.EXECUTED


@pytest.mark.asyncio
async def test_command_runner_uses_threaded_subprocess_on_windows_loop(
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
        cwd: Path,
        env: dict[str, str],
        input: bytes | None,
        capture_output: bool,
        timeout: float,
        check: bool,
    ) -> subprocess.CompletedProcess[bytes]:
        del cwd, env, input, capture_output, timeout, check
        calls.append(args)
        return subprocess.CompletedProcess(
            args=args,
            returncode=0,
            stdout=b"served\n",
            stderr=b"",
        )

    monkeypatch.setattr(asyncio, "create_subprocess_exec", broken_async_subprocess)
    monkeypatch.setattr(subprocess, "run", fake_run)
    script = tmp_path / "serve.py"
    script.write_text("print('served')\n")
    runner = ApprovedCommandRunner(ProjectWorkspace(tmp_path), registry)
    task = asyncio.create_task(
        runner.run(
            CommandRequest(
                mission_id="m",
                staff_id="s",
                executable=sys.executable,
                args=[script.name],
                cwd=".",
                purpose="run on windows loop",
            )
        )
    )
    await asyncio.sleep(0)

    await registry.accept(registry.list_pending()[0].id)
    result = await task

    assert result.exit_code == 0
    assert result.output == "served\n"
    assert calls == [[sys.executable, script.name]]


@pytest.mark.asyncio
async def test_rejection_timeout_output_cap_and_cwd_validation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registry = ApprovalRegistry()
    runner = ApprovedCommandRunner(
        ProjectWorkspace(tmp_path),
        registry,
        output_limit_bytes=10,
    )
    reject_script = tmp_path / "reject.py"
    reject_script.write_text("print('must not run')\n")
    rejected = asyncio.create_task(
        runner.run(
            CommandRequest(
                mission_id="m",
                staff_id="s",
                executable=sys.executable,
                args=[reject_script.name],
                cwd=".",
                purpose="reject",
            )
        )
    )
    await asyncio.sleep(0)
    await registry.reject(registry.list_pending()[0].id)
    assert (await rejected).rejected is True

    output_script = tmp_path / "output.py"
    output_script.write_text("print('x' * 100)\n")
    limited = asyncio.create_task(
        runner.run(
            CommandRequest(
                mission_id="m",
                staff_id="s",
                executable=sys.executable,
                args=[output_script.name],
                cwd=".",
                purpose="cap output",
            )
        )
    )
    await asyncio.sleep(0)
    await registry.accept(registry.list_pending()[0].id)
    assert len((await limited).output.encode()) <= 10

    timeout_script = tmp_path / "timeout.py"
    timeout_script.write_text("import time\ntime.sleep(1)\n")
    timed = asyncio.create_task(
        runner.run(
            CommandRequest(
                mission_id="m",
                staff_id="s",
                executable=sys.executable,
                args=[timeout_script.name],
                cwd=".",
                purpose="timeout",
                timeout_seconds=0.01,
            )
        )
    )
    await asyncio.sleep(0)
    await registry.accept(registry.list_pending()[0].id)
    assert (await timed).timed_out is True

    monkeypatch.setenv("TOVA_TEST_SECRET", "do-not-pass")
    env_script = tmp_path / "env.py"
    env_script.write_text("import os\nprint(os.getenv('TOVA_TEST_SECRET'))\n")
    environment = asyncio.create_task(
        runner.run(
            CommandRequest(
                mission_id="m",
                staff_id="s",
                executable=sys.executable,
                args=[env_script.name],
                cwd=".",
                purpose="filter environment",
            )
        )
    )
    await asyncio.sleep(0)
    await registry.accept(registry.list_pending()[0].id)
    assert (await environment).output.strip() == "None"

    escaped = await runner.run(
        CommandRequest(
            mission_id="m",
            staff_id="s",
            executable=sys.executable,
            args=[],
            cwd="../escape",
            purpose="escape",
        )
    )
    assert escaped.exit_code is None
    assert escaped.output.startswith("Path must")
    assert registry.list_pending() == []


@pytest.mark.asyncio
async def test_command_runner_returns_error_for_windows_drive_relative_cwd(
    tmp_path: Path,
) -> None:
    registry = ApprovalRegistry()
    runner = ApprovedCommandRunner(ProjectWorkspace(tmp_path), registry)

    result = await runner.run(
        CommandRequest(
            mission_id="m",
            staff_id="s",
            executable=sys.executable,
            args=[],
            cwd="C:temp",
            purpose="bad windows cwd",
        )
    )

    assert result.rejected is False
    assert result.exit_code is None
    assert "project-relative" in result.output
    assert registry.list_pending() == []
