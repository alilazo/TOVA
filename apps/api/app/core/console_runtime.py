from __future__ import annotations

import os
import signal
import sys
import threading
import time
from collections.abc import Callable
from typing import TYPE_CHECKING, Protocol

import httpx

from app.core.console_display import (
    enable_windows_ansi,
    format_status_line,
    loading_frame,
    print_startup_banner,
)

if TYPE_CHECKING:
    from uvicorn import Config

CTRL_C_EVENT = 0
CTRL_BREAK_EVENT = 1
CTRL_CLOSE_EVENT = 2
CTRL_LOGOFF_EVENT = 5
CTRL_SHUTDOWN_EVENT = 6

_CONSOLE_EXIT_EVENTS = {
    CTRL_C_EVENT,
    CTRL_BREAK_EVENT,
    CTRL_CLOSE_EVENT,
    CTRL_LOGOFF_EVENT,
    CTRL_SHUTDOWN_EVENT,
}


class StoppableServer(Protocol):
    should_exit: bool
    force_exit: bool


def animate_loading(stop: threading.Event, interval: float = 0.12) -> None:
    index = 0
    while not stop.wait(interval):
        index += 1
        sys.stdout.write(f"\r{loading_frame(index)}   ")
        sys.stdout.flush()
    sys.stdout.write("\r" + " " * 28 + "\r")
    sys.stdout.flush()


def read_runtime_status(port: int) -> dict[str, object] | None:
    try:
        response = httpx.get(
            f"http://127.0.0.1:{int(port)}/api/runtime/status",
            timeout=2.0,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        return None
    payload = response.json()
    return payload if isinstance(payload, dict) else None


def watch_runtime_status(
    port: int,
    should_stop: Callable[[], bool],
    *,
    sleep: Callable[[float], None] = time.sleep,
    interval: float = 2.0,
) -> None:
    last = ""
    while not should_stop():
        payload = read_runtime_status(port) or {}
        line = format_status_line(
            state=str(payload.get("state") or "unavailable"),
            selected_model=(
                str(payload["selected_model"])
                if payload.get("selected_model")
                else None
            ),
        )
        if line != last:
            print(line, flush=True)
            last = line
        sleep(interval)


def request_server_exit(server: StoppableServer) -> None:
    server.should_exit = True
    server.force_exit = True


def handle_console_control(ctrl_type: int, server: StoppableServer) -> bool:
    if ctrl_type not in _CONSOLE_EXIT_EVENTS:
        return False
    request_server_exit(server)
    return True


def build_uvicorn_config(port: int) -> Config:
    import uvicorn

    from app.main import app

    return uvicorn.Config(
        app,
        host="127.0.0.1",
        port=int(port),
        log_level="info",
        timeout_keep_alive=1,
        timeout_graceful_shutdown=0,
        access_log=False,
    )


def install_process_shutdown_handlers(server: StoppableServer) -> None:
    def _signal_handler(_signum: int, _frame: object | None) -> None:
        request_server_exit(server)

    signal.signal(signal.SIGINT, _signal_handler)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _signal_handler)
    if sys.platform == "win32":
        _install_windows_console_handler(server)


def _install_windows_console_handler(server: StoppableServer) -> None:
    import ctypes

    handler_type = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_uint)

    def _handler(ctrl_type: int) -> int:
        return int(handle_console_control(ctrl_type, server))

    callback = handler_type(_handler)
    server._tova_console_handler = callback  # type: ignore[attr-defined]
    ctypes.windll.kernel32.SetConsoleCtrlHandler(callback, True)


def run_console_app() -> None:
    import uvicorn

    enable_windows_ansi()
    port = int(os.environ.get("TOVA_PORT", "8000"))
    print_startup_banner(port)
    config = build_uvicorn_config(port)
    server = uvicorn.Server(config)
    install_process_shutdown_handlers(server)
    stop_loading = threading.Event()
    loader = threading.Thread(target=animate_loading, args=(stop_loading,), daemon=True)
    loader.start()

    def _after_start() -> None:
        while not server.started and not server.should_exit:
            time.sleep(0.05)
        stop_loading.set()
        loader.join(timeout=1)
        watch_runtime_status(port, lambda: server.should_exit)

    threading.Thread(target=_after_start, daemon=True).start()
    server.run()
