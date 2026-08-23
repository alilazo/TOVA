"""Run TOVA frontend and backend verification commands."""

from __future__ import annotations

import os
import subprocess
import sys

PNPM = "pnpm.cmd" if os.name == "nt" else "pnpm"
UV = "uv.exe" if os.name == "nt" else "uv"

COMMANDS = [
    [PNPM, "verify"],
    [UV, "run", "--directory", "apps/api", "ruff", "check", "."],
    [UV, "run", "--directory", "apps/api", "mypy", "app"],
    [UV, "run", "--directory", "apps/api", "pytest"],
]


def main() -> int:
    for command in COMMANDS:
        print(f"+ {' '.join(command)}", flush=True)
        result = subprocess.run(command, check=False)
        if result.returncode != 0:
            return result.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
