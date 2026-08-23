# Review package: Task 2 (no git — working tree snapshot)

## Files

## FILE: apps/api/app/core/config.py

```
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="TOVA_",
        extra="ignore",
    )

    app_name: str = "TOVA API"
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./tova.db"
    allowed_project_roots: str = ""
    lm_studio_base_url: str = "http://127.0.0.1:1234/v1"
    lm_studio_model: str | None = None
    lm_studio_api_token: str | None = None
    lm_studio_allow_public_host: bool = False
    lm_studio_timeout_seconds: float = 300
    agent_max_iterations: int = 12
    command_output_limit_bytes: int = 1_000_000
    data_dir: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()

```

## FILE: apps/api/app/services/projects.py

```
from __future__ import annotations

import json
import logging
from pathlib import Path
from uuid import uuid4

from app.schemas.projects import ProjectRecord, RecentProjectRecord
from app.services.recent_projects import RecentProjectsStore
from app.tools.repository import ProjectWorkspace, WorkspaceError

logger = logging.getLogger(__name__)


class ProjectRegistry:
    def __init__(
        self,
        *,
        allowed_roots: list[str] | None = None,
        recent_path: Path | None = None,
    ) -> None:
        self._projects: dict[str, ProjectRecord] = {}
        self._active_id: str | None = None
        self._allowed_roots = [Path(root).resolve() for root in (allowed_roots or [])]
        self._recent_store = (
            RecentProjectsStore(recent_path) if recent_path is not None else None
        )

    def open(self, path: str, *, create: bool = False) -> ProjectRecord:
        candidate = Path(path).expanduser()
        if create:
            if candidate.exists() and candidate.is_file():
                raise WorkspaceError("Project path exists as a file")
            candidate.mkdir(parents=True, exist_ok=True)
        if not candidate.exists() or not candidate.is_dir():
            self._remove_stale_recent(str(candidate))
            raise WorkspaceError("Project root must be an existing directory")
        resolved = candidate.resolve()
        self._assert_allowed(resolved)
        workspace = ProjectWorkspace(resolved)
        for existing in self._projects.values():
            if Path(existing.root) == workspace.root:
                self._active_id = existing.id
                record = existing.model_copy(deep=True)
                self._record_recent(record)
                return record
        record = ProjectRecord(
            id=self._project_id_for(workspace.root),
            name=workspace.root.name,
            root=str(workspace.root),
        )
        self._projects[record.id] = record
        self._active_id = record.id
        result = record.model_copy(deep=True)
        self._record_recent(result)
        return result

    def get(self, project_id: str) -> ProjectRecord:
        record = self._projects.get(project_id)
        if record is None:
            raise KeyError(project_id)
        return record.model_copy(deep=True)

    def active(self) -> ProjectRecord | None:
        if self._active_id is None:
            return None
        return self.get(self._active_id)

    def list(self) -> list[ProjectRecord]:
        return [project.model_copy(deep=True) for project in self._projects.values()]

    def recent(self) -> list[RecentProjectRecord]:
        if self._recent_store is None:
            return []
        return self._recent_store.list()

    def workspace(self, project_id: str) -> ProjectWorkspace:
        return ProjectWorkspace(self.get(project_id).root)

    def _assert_allowed(self, resolved: Path) -> None:
        if not self._allowed_roots:
            return
        for root in self._allowed_roots:
            try:
                resolved.relative_to(root)
                return
            except ValueError:
                continue
        raise WorkspaceError("Project path is outside allowed project roots")

    def _record_recent(self, record: ProjectRecord) -> None:
        if self._recent_store is None:
            return
        try:
            self._recent_store.record(record)
        except OSError as exc:
            logger.warning("Failed to record recent project: %s", exc)

    def _remove_stale_recent(self, root: str) -> None:
        if self._recent_store is None:
            return
        try:
            self._recent_store.remove_root(root)
        except OSError as exc:
            logger.warning("Failed to remove stale recent project: %s", exc)

    def _project_id_for(self, root: Path) -> str:
        metadata_path = root / ".tova" / "project.json"
        if metadata_path.exists():
            try:
                data = json.loads(metadata_path.read_text(encoding="utf-8"))
                project_id = data.get("id") if isinstance(data, dict) else None
                if isinstance(project_id, str) and project_id.startswith("project_"):
                    return project_id
            except (OSError, json.JSONDecodeError):
                pass
        project_id = f"project_{uuid4().hex}"
        metadata_path.parent.mkdir(parents=True, exist_ok=True)
        metadata_path.write_text(
            json.dumps({"id": project_id}, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return project_id

```

## FILE: apps/api/app/api/projects.py

```
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import get_settings
from app.schemas.projects import (
    ProjectEntry,
    ProjectFile,
    ProjectFileWriteRequest,
    ProjectOpenRequest,
    ProjectRecord,
    RecentProjectRecord,
)
from app.services.app_data import resolve_data_dir
from app.services.projects import ProjectRegistry
from app.tools.repository import WorkspaceError

router = APIRouter(prefix="/api")


def _parse_allowed_roots(raw: str) -> list[str]:
    return [part.strip() for part in raw.split(";") if part.strip()]


def _resolve_recent_path() -> Path:
    settings = get_settings()
    data_dir = (
        Path(settings.data_dir).expanduser().resolve()
        if settings.data_dir
        else resolve_data_dir()
    )
    return data_dir / "recent-projects.json"


_settings = get_settings()
_registry = ProjectRegistry(
    allowed_roots=_parse_allowed_roots(_settings.allowed_project_roots),
    recent_path=_resolve_recent_path(),
)


def get_project_registry() -> ProjectRegistry:
    return _registry


Registry = Annotated[ProjectRegistry, Depends(get_project_registry)]


@router.post("/projects", response_model=ProjectRecord)
async def open_project(request: ProjectOpenRequest, registry: Registry) -> ProjectRecord:
    try:
        return registry.open(request.path, create=request.create)
    except WorkspaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/projects/active", response_model=ProjectRecord | None)
async def active_project(registry: Registry) -> ProjectRecord | None:
    return registry.active()


@router.get("/projects/recent", response_model=list[RecentProjectRecord])
async def list_recent_projects(registry: Registry) -> list[RecentProjectRecord]:
    return registry.recent()


@router.get("/projects/{project_id}", response_model=ProjectRecord)
async def get_project(project_id: str, registry: Registry) -> ProjectRecord:
    try:
        return registry.get(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@router.get("/projects/{project_id}/entries", response_model=list[ProjectEntry])
async def list_entries(
    project_id: str,
    registry: Registry,
    path: str = Query(default="."),
) -> list[ProjectEntry]:
    try:
        workspace = registry.workspace(project_id)
        return [ProjectEntry.model_validate(entry) for entry in workspace.list_entries(path)]
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except WorkspaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/projects/{project_id}/files", response_model=ProjectFile)
async def read_file(
    project_id: str,
    registry: Registry,
    path: str = Query(min_length=1),
) -> ProjectFile:
    try:
        workspace = registry.workspace(project_id)
        return ProjectFile(path=path, content=workspace.read(path))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except WorkspaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/projects/{project_id}/files", response_model=ProjectFile)
async def write_file(
    project_id: str,
    request: ProjectFileWriteRequest,
    registry: Registry,
) -> ProjectFile:
    try:
        workspace = registry.workspace(project_id)
        workspace.write(request.path, request.content)
        return ProjectFile(path=request.path, content=request.content)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except WorkspaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

```

## FILE: apps/api/tests/test_recent_projects.py

```
from datetime import UTC, datetime
from pathlib import Path
import shutil

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.projects import get_project_registry
from app.main import app
from app.schemas.projects import ProjectRecord
from app.services.app_data import resolve_data_dir
from app.services.projects import ProjectRegistry
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


@pytest.mark.asyncio
async def test_open_records_recent_and_lists_via_api(tmp_path: Path) -> None:
    first = tmp_path / "alpha"
    second = tmp_path / "beta"
    first.mkdir()
    second.mkdir()
    recent_path = tmp_path / "recent-projects.json"
    registry = ProjectRegistry(recent_path=recent_path)
    app.dependency_overrides[get_project_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            await client.post("/api/projects", json={"path": str(first)})
            await client.post("/api/projects", json={"path": str(second)})
            response = await client.get("/api/projects/recent")
            assert response.status_code == 200
            body = response.json()
            assert [item["name"] for item in body] == ["beta", "alpha"]
            assert body[0]["root"] == str(second.resolve())
            assert "lastOpenedAt" in body[0]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_failed_open_removes_stale_recent_entry(tmp_path: Path) -> None:
    root = tmp_path / "vanished"
    root.mkdir()
    recent_path = tmp_path / "recent-projects.json"
    registry = ProjectRegistry(recent_path=recent_path)
    registry.open(str(root))
    shutil.rmtree(root)
    app.dependency_overrides[get_project_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            missing = await client.post("/api/projects", json={"path": str(root)})
            assert missing.status_code == 422
            recent = await client.get("/api/projects/recent")
            assert recent.json() == []
    finally:
        app.dependency_overrides.clear()

```

## FILE: .superpowers/sdd/task-2-report.md

```
# Task 2 Report: Wire ProjectRegistry + GET /api/projects/recent

## Status

**DONE**

## Summary

Wired `RecentProjectsStore` into `ProjectRegistry.open`, exposed `GET /api/projects/recent` (registered before `/{project_id}`), added `Settings.data_dir` (`TOVA_DATA_DIR`), and verified with TDD API/registry tests.

## TDD Evidence

### RED â€” Step 2

Command:

```bash
uv run --directory apps/api pytest tests/test_recent_projects.py -v
```

Result: **FAIL** (exit code 1)

```
TypeError: ProjectRegistry.__init__() got an unexpected keyword argument 'recent_path'
```

Expected failure: no `recent_path` param, no endpoint, no recording.

### GREEN â€” Step 4

Command:

```bash
uv run --directory apps/api pytest tests/test_recent_projects.py tests/test_projects_api.py -v
```

Result: **PASS** (exit code 0)

```
11 passed in 0.86s
```

## Changes

### Modified: `apps/api/app/core/config.py`

- Added `data_dir: str | None = None` (env: `TOVA_DATA_DIR` via existing `env_prefix`).

### Modified: `apps/api/app/services/projects.py`

- Added `recent_path: Path | None = None` to `ProjectRegistry.__init__`; builds `RecentProjectsStore` when set.
- `open()`: records on success (new and re-opened projects); calls `_remove_stale_recent` before raising when path missing/not a directory.
- Added `recent() -> list[RecentProjectRecord]` (empty when no store).
- Added `_record_recent` / `_remove_stale_recent` helpers with best-effort OSError handling.
- Added `from __future__ import annotations` to avoid `list` method shadowing builtin in return annotations.

### Modified: `apps/api/app/api/projects.py`

- Production registry uses `recent_path = (settings.data_dir or resolve_data_dir()) / "recent-projects.json"`.
- Added `GET /api/projects/recent` before `GET /api/projects/{project_id}`.

### Modified: `apps/api/tests/test_recent_projects.py`

- Appended API/registry integration tests from brief.
- **Deviation:** `test_failed_open_removes_stale_recent_entry` uses `shutil.rmtree(root)` instead of `root.rmdir()` because `open()` creates `.tova/project.json`, leaving the directory non-empty on Windows.

## Self-Review

- **Brief compliance:** All wiring steps implemented; route ordering correct; `recent_path=None` preserves existing `ProjectRegistry()` test behavior.
- **Task 1 interfaces:** Consumed unchanged â€” no redesign of `RecentProjectsStore`, `resolve_data_dir`, or `RecentProjectRecord`.
- **Self-heal:** Stale entries removed on failed open when directory missing/invalid.
- **Scope:** Focused diff across four files; no unrelated changes.

## Concerns

1. **Test deviation:** Brief used `root.rmdir()` but fails after metadata creation; switched to `shutil.rmtree`.
2. **`RecentProjectsStore.record` swallows OSError internally** â€” registry's try/except on record is defensive per brief but unlikely to trigger.

## Files Touched

- `apps/api/app/core/config.py`
- `apps/api/app/services/projects.py`
- `apps/api/app/api/projects.py`
- `apps/api/tests/test_recent_projects.py`

## Commits

None (per brief; workspace has no `.git`).

```
