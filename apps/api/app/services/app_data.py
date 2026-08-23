import os
import sys
from collections.abc import Mapping
from pathlib import Path


def resolve_data_dir(env: Mapping[str, str] | None = None) -> Path:
    source = env if env is not None else os.environ
    override = source.get("TOVA_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    if sys.platform == "win32":
        base = source.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return (Path(base) / "TOVA").resolve()
    if sys.platform == "darwin":
        return (Path.home() / "Library" / "Application Support" / "TOVA").resolve()
    xdg = source.get("XDG_DATA_HOME", "").strip()
    root = Path(xdg).expanduser() if xdg else Path.home() / ".local" / "share"
    return (root / "tova").resolve()
