"""Run the TOVA web and API development processes."""

from __future__ import annotations

import os
import subprocess
import sys


def main() -> int:
    pnpm = "pnpm.cmd" if os.name == "nt" else "pnpm"
    command = [pnpm, "--parallel", "--filter", "@tova/web", "--filter", "@tova/api", "dev"]
    try:
        return subprocess.call(command)
    except KeyboardInterrupt:
        return 130
    except FileNotFoundError:
        print("pnpm is required. Install pnpm 11.17 or newer.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
