from __future__ import annotations

import sys
import time
from typing import Any


def lm_debug(phase: str, **fields: Any) -> None:
    """Emit a single-line LM Studio debug record to the API console."""
    parts = [f"[TOVA][lm-studio] phase={phase}"]
    for key, value in fields.items():
        parts.append(f"{key}={value!r}")
    line = " ".join(parts)
    # Prefer stderr so uvicorn/reload workers surface the line immediately.
    print(line, file=sys.stderr, flush=True)


def elapsed_ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)
