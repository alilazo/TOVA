# Review package: Task 1 (no git — working tree snapshot)

## Files

## FILE: apps/api/app/services/app_data.py

```
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

```

## FILE: apps/api/app/services/recent_projects.py

```
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from pydantic import ValidationError

from app.schemas.projects import ProjectRecord, RecentProjectRecord

logger = logging.getLogger(__name__)

RecentProjectList = list[RecentProjectRecord]


def _normalize_root(root: str) -> str:
    candidate = Path(root).expanduser()
    if candidate.exists():
        return str(candidate.resolve())
    if sys.platform == "win32":
        return os.path.normcase(str(candidate))
    return str(candidate)


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _serialize_datetime(value: datetime) -> str:
    utc = _to_utc(value)
    return utc.isoformat().replace("+00:00", "Z")


class RecentProjectsStore:
    def __init__(self, path: Path, *, max_entries: int = 20) -> None:
        self._path = path
        self._max_entries = max_entries

    def list(self) -> RecentProjectList:
        projects = self._load()["projects"]
        return sorted(projects, key=lambda item: item.lastOpenedAt, reverse=True)

    def record(self, project: ProjectRecord, *, opened_at: datetime | None = None) -> None:
        opened = _to_utc(opened_at if opened_at is not None else datetime.now(UTC))
        normalized = _normalize_root(project.root)
        projects = self._load()["projects"]
        remaining = [item for item in projects if _normalize_root(item.root) != normalized]
        remaining.insert(
            0,
            RecentProjectRecord(
                id=project.id,
                name=project.name,
                root=project.root,
                lastOpenedAt=opened,
            ),
        )
        self._save(remaining[: self._max_entries])

    def remove_root(self, root: str) -> bool:
        normalized = _normalize_root(root)
        projects = self._load()["projects"]
        remaining = [item for item in projects if _normalize_root(item.root) != normalized]
        if len(remaining) == len(projects):
            return False
        self._save(remaining)
        return True

    def _load(self) -> dict[str, RecentProjectList]:
        if not self._path.exists():
            return {"projects": []}
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"projects": []}
        if not isinstance(raw, dict):
            return {"projects": []}
        projects_raw = raw.get("projects", [])
        if not isinstance(projects_raw, list):
            return {"projects": []}
        projects: RecentProjectList = []
        for item in projects_raw:
            if not isinstance(item, dict):
                continue
            try:
                projects.append(RecentProjectRecord.model_validate(item))
            except ValidationError:
                continue
        return {"projects": projects}

    def _save(self, projects: RecentProjectList) -> None:
        payload = {
            "version": 1,
            "projects": [
                {
                    "id": item.id,
                    "name": item.name,
                    "root": item.root,
                    "lastOpenedAt": _serialize_datetime(item.lastOpenedAt),
                }
                for item in projects
            ],
        }
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps(payload, indent=2, sort_keys=True),
                encoding="utf-8",
            )
        except OSError as exc:
            logger.warning("Failed to persist recent projects: %s", exc)

```

## FILE: apps/api/app/schemas/projects.py

```
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ProjectRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    root: str


class RecentProjectRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    root: str
    lastOpenedAt: datetime


class ProjectOpenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1)
    create: bool = False


class ProjectEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    path: str
    kind: Literal["file", "dir"]


class ProjectFile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str
    content: str


class ProjectFileWriteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str = Field(min_length=1)
    content: str

```

## FILE: apps/api/tests/test_recent_projects.py

```
from datetime import UTC, datetime
from pathlib import Path

from app.schemas.projects import ProjectRecord
from app.services.app_data import resolve_data_dir
from app.services.recent_projects import RecentProjectsStore


def test_resolve_data_dir_honors_tova_data_dir(tmp_path: Path) -> None:
    resolved = resolve_data_dir({"TOVA_DATA_DIR": str(tmp_path / "custom")})
    assert resolved == (tmp_path / "custom").resolve()


def test_record_upserts_moves_to_front_and_caps_at_20(tmp_path: Path) -> None:
    store = RecentProjectsStore(tmp_path / "recent-projects.json", max_entries=20)
    for index in range(21):
        store.record(
            ProjectRecord(
                id=f"project_{index}",
                name=f"p{index}",
                root=str(tmp_path / f"p{index}"),
            ),
            opened_at=datetime(2026, 7, 30, 0, 0, index, tzinfo=UTC),
        )
    items = store.list()
    assert len(items) == 20
    assert items[0].name == "p20"
    assert items[-1].name == "p1"

    store.record(
        ProjectRecord(id="project_5", name="p5", root=str(tmp_path / "p5")),
        opened_at=datetime(2026, 7, 30, 1, 0, 0, tzinfo=UTC),
    )
    items = store.list()
    assert items[0].id == "project_5"
    assert sum(1 for item in items if item.id == "project_5") == 1


def test_remove_root_deletes_matching_entry(tmp_path: Path) -> None:
    root = tmp_path / "gone"
    root.mkdir()
    store = RecentProjectsStore(tmp_path / "recent-projects.json")
    store.record(ProjectRecord(id="project_a", name="gone", root=str(root)))
    assert store.remove_root(str(root)) is True
    assert store.list() == []

```

## FILE: .superpowers/sdd/task-1-report.md

```
# Task 1 Report: App data dir + RecentProjectsStore

## Status

**DONE**

## Summary

Implemented machine-local TOVA app data directory resolution and a JSON-backed `RecentProjectsStore` with upsert, cap-at-20, remove-by-root, and `RecentProjectRecord` schema. Persistence primitives only â€” no API routes or registry wiring (deferred to Task 2).

## Brief Source Note

The file at `.superpowers/sdd/task-1-brief.md` contained a stale TeamFloor task (clickable file chips). Implementation followed **Task 1** from `docs/superpowers/plans/2026-07-30-recent-projects.md`, which matches the user assignment.

## TDD Evidence

### RED â€” Step 2

Command:

```bash
uv run --directory "F:/Programming Projects/TOVA/apps/api" pytest tests/test_recent_projects.py -v
```

Result: **FAIL** (exit code 2)

```
ModuleNotFoundError: No module named 'app.services.app_data'
```

Expected failure: modules not yet created.

### GREEN â€” Step 4

Command:

```bash
uv run --directory "F:/Programming Projects/TOVA/apps/api" pytest tests/test_recent_projects.py -v
```

Result: **PASS** (exit code 0)

```
tests/test_recent_projects.py::test_resolve_data_dir_honors_tova_data_dir PASSED
tests/test_recent_projects.py::test_record_upserts_moves_to_front_and_caps_at_20 PASSED
tests/test_recent_projects.py::test_remove_root_deletes_matching_entry PASSED
3 passed in 0.37s
```

### Full workspace verify

Command:

```bash
uv run python scripts/verify.py
```

Result: **PASS** (exit code 0) â€” frontend lint/typecheck/test/build, backend ruff, mypy, and all 100 pytest tests including 3 new recent-projects tests.

## Changes

### Created: `apps/api/app/services/app_data.py`

- `resolve_data_dir(env)` â€” honors `TOVA_DATA_DIR` override; platform defaults for Windows (`%LOCALAPPDATA%/TOVA`), macOS, and Linux.

### Created: `apps/api/app/services/recent_projects.py`

- `RecentProjectsStore(path, *, max_entries=20)` with:
  - `list()` â€” newest-first by `lastOpenedAt`
  - `record(project, *, opened_at=None)` â€” upsert by normalized root, move to front, cap entries
  - `remove_root(root)` â€” delete matching entry, return whether removed
- JSON format: `{ "version": 1, "projects": [...] }` with ISO-8601 UTC `lastOpenedAt`
- Root normalization: `Path.resolve()` when exists; else `expanduser` + `normcase` on Windows
- Best-effort write with parent dir creation; logs warning on I/O failure

### Modified: `apps/api/app/schemas/projects.py`

- Added `RecentProjectRecord(id, name, root, lastOpenedAt: datetime)`

### Created: `apps/api/tests/test_recent_projects.py`

- `test_resolve_data_dir_honors_tova_data_dir`
- `test_record_upserts_moves_to_front_and_caps_at_20`
- `test_remove_root_deletes_matching_entry`

## Self-Review

| Check | Result |
|-------|--------|
| Scope limited to Task 1 | Yes â€” no ProjectRegistry, API, or frontend |
| TDD order (RED then GREEN) | Yes |
| `TOVA_DATA_DIR` override | Yes |
| Cap at 20 entries | Yes |
| Upsert moves to front | Yes |
| `remove_root` self-heal primitive | Yes |
| Timezone-aware UTC datetimes | Yes |
| Files under ~300 lines | Yes (app_data 20, recent_projects 115, tests 45) |
| Full verify passes | Yes |
| Commits | None (per instructions) |

## Concerns

- Stale `.superpowers/sdd/task-1-brief.md` should be updated to match the Recent Projects plan to avoid future agent confusion.
- `RecentProjectsStore.list` method name shadows builtin `list` for mypy; resolved via module-level `RecentProjectList` type alias â€” no runtime impact.

## Files Touched

- `apps/api/app/services/app_data.py` (new)
- `apps/api/app/services/recent_projects.py` (new)
- `apps/api/app/schemas/projects.py` (modified)
- `apps/api/tests/test_recent_projects.py` (new)

```
