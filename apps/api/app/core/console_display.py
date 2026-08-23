from __future__ import annotations

import sys

TOVA_ASCII_ART = r"""
########    ######    ##    ##    ######
########   ##    ##   ##    ##   ##    ##
   ##      ##    ##   ##    ##   ########
   ##      ##    ##    ##  ##    ##    ##
   ##      ##    ##     ####     ##    ##
   ##       ######       ##      ##    ##
                                 TOVA
""".strip("\n")

_GREEN = "\033[32m"
_RESET = "\033[0m"
_LOADING_FRAMES = (
    "Loading TOVA |",
    "Loading TOVA /",
    "Loading TOVA -",
    "Loading TOVA \\",
)
WAITING_STATUS = "Waiting for LM Studio, Model not found"


def tova_ascii_art() -> str:
    return TOVA_ASCII_ART


def loading_frame(index: int) -> str:
    return _LOADING_FRAMES[index % len(_LOADING_FRAMES)]


def format_status_line(*, state: str, selected_model: str | None) -> str:
    if state == "connected" and selected_model:
        return f"{_GREEN}Connected to: {selected_model}{_RESET}"
    return WAITING_STATUS


def enable_windows_ansi() -> None:
    if sys.platform != "win32":
        return
    import ctypes

    handle = ctypes.windll.kernel32.GetStdHandle(-11)
    mode = ctypes.c_uint()
    if not ctypes.windll.kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
        return
    ctypes.windll.kernel32.SetConsoleMode(handle, mode.value | 0x0004)


def print_startup_banner(port: int) -> None:
    url = f"http://127.0.0.1:{int(port)}/"
    print(tova_ascii_art())
    print()
    print(f"UI: {url}")
    print("Keep this window open while you use TOVA.")
    print("Close this window to stop TOVA and release the local port.")
    print()
    print(loading_frame(0), end="", flush=True)
