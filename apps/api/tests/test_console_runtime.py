from types import SimpleNamespace

from app.core.console_runtime import (
    CTRL_CLOSE_EVENT,
    build_uvicorn_config,
    handle_console_control,
    request_server_exit,
)


def test_banner_tells_the_user_to_keep_the_console_open(capsys) -> None:
    from app.core.console_display import print_startup_banner

    print_startup_banner(8000)
    output = capsys.readouterr().out
    assert "TOVA" in output
    assert "http://127.0.0.1:8000/" in output
    assert "close this window" in output.lower()
    assert "Loading" in output


def test_closing_the_console_forces_the_server_to_exit() -> None:
    server = SimpleNamespace(should_exit=False, force_exit=False)
    handled = handle_console_control(CTRL_CLOSE_EVENT, server)
    assert handled is True
    assert server.should_exit is True
    assert server.force_exit is True


def test_request_server_exit_is_idempotent() -> None:
    server = SimpleNamespace(should_exit=True, force_exit=True)
    request_server_exit(server)
    assert server.should_exit is True
    assert server.force_exit is True


def test_watch_runtime_status_prints_waiting_then_connected(monkeypatch, capsys) -> None:
    payloads = [
        {"state": "unavailable", "selected_model": None},
        {"state": "connected", "selected_model": "qwen/qwen3.6-35b-a3b"},
    ]
    ticks = {"n": 0}

    def fake_read(_port: int) -> dict[str, object] | None:
        return payloads[min(ticks["n"], len(payloads) - 1)]

    def fake_sleep(_seconds: float) -> None:
        ticks["n"] += 1

    monkeypatch.setattr("app.core.console_runtime.read_runtime_status", fake_read)
    from app.core.console_runtime import watch_runtime_status

    watch_runtime_status(8000, lambda: ticks["n"] >= 2, sleep=fake_sleep, interval=0)

    output = capsys.readouterr().out
    assert "Waiting for LM Studio, Model not found" in output
    assert "Connected to: qwen/qwen3.6-35b-a3b" in output
    config = build_uvicorn_config(8019)
    assert config.host == "127.0.0.1"
    assert config.port == 8019
    assert config.timeout_graceful_shutdown == 0
    assert config.timeout_keep_alive == 1
