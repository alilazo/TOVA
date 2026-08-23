from __future__ import annotations

import os
import sys
import webbrowser
from collections.abc import Callable, Mapping


def maybe_open_ui(
    port: str | int,
    *,
    opener: Callable[[str], object] | None = None,
    env: Mapping[str, str] | None = None,
    frozen: bool | None = None,
) -> bool:
    source = env if env is not None else os.environ
    packaged = getattr(sys, "frozen", False) if frozen is None else frozen
    flag = source.get("TOVA_OPEN_BROWSER", "").strip().lower()
    if flag in {"0", "false", "no", "off"}:
        return False
    enabled = flag in {"1", "true", "yes", "on"} or packaged
    if not enabled:
        return False
    url = f"http://127.0.0.1:{int(port)}/"
    open_url = opener or webbrowser.open
    open_url(url)
    return True
