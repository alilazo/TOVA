# Final review package: Recent Projects (no git)

Spec: docs/superpowers/specs/2026-07-30-recent-projects-design.md
Plan: docs/superpowers/plans/2026-07-30-recent-projects.md

## Minor findings rollup from task reviews
- Task1: no disk round-trip test; version unused on load
- Task2: Settings.data_dir path untested; self-heal normalize edge
- Task3: silent list fetch error; post-error empty shell
- Task4: no dialog invalidate test; duplicate lists intentional
- Task5: manual smoke incomplete

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

## FILE: apps/api/tests/test_recent_projects.py

```
import shutil
from datetime import UTC, datetime
from pathlib import Path

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

## FILE: apps/web/src/features/projects/project-api.ts

```
import { apiRequest } from "@/lib/api"

export interface ProjectRecord {
  id: string
  name: string
  root: string
}

export interface ProjectEntry {
  name: string
  path: string
  kind: "file" | "dir"
}

export interface ProjectFile {
  path: string
  content: string
}

export interface RecentProjectRecord {
  id: string
  name: string
  root: string
  lastOpenedAt: string
}

export function openProject(path: string, create = false) {
  return apiRequest<ProjectRecord>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ path, create }),
  })
}

export function getActiveProject() {
  return apiRequest<ProjectRecord | null>("/api/projects/active")
}

export function listRecentProjects() {
  return apiRequest<RecentProjectRecord[]>("/api/projects/recent")
}

export function listProjectEntries(projectId: string, path = ".") {
  const query = new URLSearchParams({ path })
  return apiRequest<ProjectEntry[]>(`/api/projects/${projectId}/entries?${query}`)
}

export function readProjectFile(projectId: string, path: string) {
  const query = new URLSearchParams({ path })
  return apiRequest<ProjectFile>(`/api/projects/${projectId}/files?${query}`)
}

export function writeProjectFile(projectId: string, path: string, content: string) {
  return apiRequest<ProjectFile>(`/api/projects/${projectId}/files`, {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  })
}

export function languageForPath(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript"
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript"
  if (path.endsWith(".py")) return "python"
  if (path.endsWith(".json")) return "json"
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".html")) return "html"
  if (path.endsWith(".md")) return "markdown"
  return "plaintext"
}

```

## FILE: apps/web/src/components/repository/RecentProjectsList.tsx

```
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  listRecentProjects,
  openProject,
  type ProjectRecord,
} from "@/features/projects/project-api"

const DEFAULT_VISIBLE = 5

interface RecentProjectsListProps {
  onOpened: (project: ProjectRecord) => void
}

function truncatePath(path: string, maxLength = 48): string {
  if (path.length <= maxLength) return path
  const head = Math.max(12, Math.floor(maxLength * 0.35))
  const tail = maxLength - head - 1
  return `${path.slice(0, head)}â€¦${path.slice(-tail)}`
}

function openErrorMessage(error: Error): string {
  const message = error.message.toLowerCase()
  if (
    message.includes("existing directory")
    || message.includes("not found")
  ) {
    return "That folder is no longer available"
  }
  return error.message
}

export function RecentProjectsList({ onOpened }: RecentProjectsListProps) {
  const client = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [alertText, setAlertText] = useState<string | null>(null)

  const recents = useQuery({
    queryKey: ["recent-projects"],
    queryFn: listRecentProjects,
  })

  const openRecent = useMutation({
    mutationFn: (root: string) => openProject(root),
    onSuccess: async (project) => {
      setAlertText(null)
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
      await client.invalidateQueries({ queryKey: ["active-project"] })
      onOpened(project)
    },
    onError: async (error: Error) => {
      setAlertText(openErrorMessage(error))
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
    },
  })

  if (recents.isLoading) {
    return null
  }

  const items = recents.data ?? []
  if (items.length === 0 && !alertText) {
    return null
  }

  const visibleItems = expanded ? items : items.slice(0, DEFAULT_VISIBLE)
  const canExpand = items.length > DEFAULT_VISIBLE

  return (
    <section className="recent-projects">
      <p className="recent-projects__label">Recent</p>
      {alertText && <p role="alert">{alertText}</p>}
      <ul className="recent-projects__list">
        {visibleItems.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="recent-projects__row"
              disabled={openRecent.isPending}
              onClick={() => openRecent.mutate(item.root)}
            >
              <span className="recent-projects__name">{item.name}</span>
              <span className="recent-projects__path">{truncatePath(item.root)}</span>
            </button>
          </li>
        ))}
      </ul>
      {canExpand && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="recent-projects__toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "View more"}
        </Button>
      )}
    </section>
  )
}

```

## FILE: apps/web/src/components/repository/ProjectExplorer.tsx

```
import { useState, type Dispatch, type SetStateAction } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { listProjectEntries, type ProjectRecord } from "@/features/projects/project-api"
import { cn } from "@/lib/utils"

import { ProjectPathDialog } from "./ProjectPathDialog"
import { RecentProjectsList } from "./RecentProjectsList"

interface ProjectExplorerProps {
  project: ProjectRecord | null
  activeFile: string | null
  onOpenFile: (path: string) => void
  onProjectOpened: (project: ProjectRecord) => void
}

export async function copyProjectFilePath(path: string): Promise<void> {
  await navigator.clipboard.writeText(path)
}

export function ProjectExplorer({
  project,
  activeFile,
  onOpenFile,
  onProjectOpened,
}: ProjectExplorerProps) {
  const [dialogMode, setDialogMode] = useState<"open" | "create" | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ ".": true })
  const rootEntries = useQuery({
    queryKey: ["project-entries", project?.id, "."],
    queryFn: () => listProjectEntries(project!.id, "."),
    enabled: Boolean(project),
  })

  return (
    <aside className="project-explorer" aria-label="Project explorer">
      <header className="project-explorer__label">
        <span>PROJECT</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Project menu">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              disabled={!project}
              onSelect={() => {
                if (!project) return
                void copyProjectFilePath(project.root)
              }}
            >
              Copy File Path
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogMode("open")}>
              Open projectâ€¦
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogMode("create")}>
              New projectâ€¦
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {project ? (
        <>
          <ScrollArea className="project-explorer__scroll">
            <div className="file-tree">
              {(rootEntries.data ?? []).map((entry) => (
                entry.kind === "dir" ? (
                  <DirectoryNode
                    key={entry.path}
                    projectId={project.id}
                    path={entry.path}
                    name={entry.name}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    activeFile={activeFile}
                    onOpenFile={onOpenFile}
                  />
                ) : (
                  <FileButton
                    key={entry.path}
                    path={entry.path}
                    name={entry.name}
                    active={activeFile === entry.path}
                    onOpen={onOpenFile}
                  />
                )
              ))}
              {rootEntries.isSuccess && (rootEntries.data?.length ?? 0) === 0 && (
                <p className="project-explorer__empty">Empty folder â€” start a mission to fill it.</p>
              )}
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="project-explorer__empty-state">
          <strong>No project open</strong>
          <p>Open an existing folder or create a new one to begin.</p>
          <div className="project-explorer__empty-actions">
            <Button size="sm" variant="outline" onClick={() => setDialogMode("open")}>
              Open project
            </Button>
            <Button size="sm" onClick={() => setDialogMode("create")}>
              New project
            </Button>
          </div>
          <RecentProjectsList onOpened={onProjectOpened} />
        </div>
      )}
      <ProjectPathDialog
        open={dialogMode !== null}
        mode={dialogMode ?? "open"}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null)
        }}
        onOpened={onProjectOpened}
      />
    </aside>
  )
}

function DirectoryNode({
  projectId,
  path,
  name,
  expanded,
  setExpanded,
  activeFile,
  onOpenFile,
}: {
  projectId: string
  path: string
  name: string
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  activeFile: string | null
  onOpenFile: (path: string) => void
}) {
  const isOpen = expanded[path] === true
  const children = useQuery({
    queryKey: ["project-entries", projectId, path],
    queryFn: () => listProjectEntries(projectId, path),
    enabled: isOpen,
  })

  return (
    <section className="file-tree__group">
      <button
        type="button"
        className="file-tree__folder"
        onClick={() => setExpanded((current) => ({ ...current, [path]: !isOpen }))}
      >
        {isOpen ? <ChevronDown /> : <ChevronRight />}
        {isOpen ? <FolderOpen /> : <Folder />}
        <span>{name}</span>
      </button>
      {isOpen && (children.data ?? []).map((entry) => (
        entry.kind === "dir" ? (
          <DirectoryNode
            key={entry.path}
            projectId={projectId}
            path={entry.path}
            name={entry.name}
            expanded={expanded}
            setExpanded={setExpanded}
            activeFile={activeFile}
            onOpenFile={onOpenFile}
          />
        ) : (
          <FileButton
            key={entry.path}
            path={entry.path}
            name={entry.name}
            active={activeFile === entry.path}
            onOpen={onOpenFile}
          />
        )
      ))}
    </section>
  )
}

function FileButton({
  path,
  name,
  active,
  onOpen,
}: {
  path: string
  name: string
  active: boolean
  onOpen: (path: string) => void
}) {
  const Icon = name.endsWith(".md") ? FileText : FileCode2
  return (
    <button
      type="button"
      className={cn("file-tree__file", active && "is-active")}
      onClick={() => onOpen(path)}
    >
      <Icon aria-hidden="true" />
      <span>{name}</span>
    </button>
  )
}

```

## FILE: apps/web/src/components/repository/ProjectPathDialog.tsx

```
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { openProject, type ProjectRecord } from "@/features/projects/project-api"

interface ProjectPathDialogProps {
  open: boolean
  mode: "open" | "create"
  onOpenChange: (open: boolean) => void
  onOpened: (project: ProjectRecord) => void
}

export function ProjectPathDialog({
  open,
  mode,
  onOpenChange,
  onOpened,
}: ProjectPathDialogProps) {
  const client = useQueryClient()
  const [path, setPath] = useState("")
  const mutation = useMutation({
    mutationFn: () => openProject(path.trim(), mode === "create"),
    onSuccess: async (project) => {
      await client.invalidateQueries({ queryKey: ["active-project"] })
      await client.invalidateQueries({ queryKey: ["project-entries", project.id] })
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
      onOpened(project)
      onOpenChange(false)
      setPath("")
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New project" : "Open project"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Enter an absolute folder path. TOVA will create it if it does not exist."
              : "Enter the absolute path to an existing project folder on this machine."}
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="project-path">Folder path</label>
        <Input
          id="project-path"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="F:\\Projects\\my-app"
        />
        {mutation.error && <p role="alert">{mutation.error.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!path.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Workingâ€¦"
              : mode === "create"
                ? "Create and open"
                : "Open"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

```

## FILE: apps/web/src/components/editor/CodeWorkspace.tsx

```
import { lazy, Suspense, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Braces, Check, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ProjectPathDialog } from "@/components/repository/ProjectPathDialog"
import { RecentProjectsList } from "@/components/repository/RecentProjectsList"
import {
  languageForPath,
  readProjectFile,
  writeProjectFile,
  type ProjectRecord,
} from "@/features/projects/project-api"
import { cn } from "@/lib/utils"
import {
  isTerminalMissionStatus,
  type MissionStatus,
  type StaffProfile,
} from "@/types/domain"

import { PixelAvatar } from "../staff/PixelAvatar"

const MonacoEditor = lazy(() => import("@monaco-editor/react"))

interface CodeWorkspaceProps {
  staff: StaffProfile[]
  projectId: string | null
  activeFile: string | null
  openFiles: string[]
  editorOwnerId: string | null
  missionStatus?: MissionStatus | null
  onSelectFile: (path: string) => void
  onCloseFile: (path: string) => void
  onProjectOpened?: (project: ProjectRecord) => void
}

export function CodeWorkspace({
  staff,
  projectId,
  activeFile,
  openFiles,
  editorOwnerId,
  missionStatus = null,
  onSelectFile,
  onCloseFile,
  onProjectOpened,
}: CodeWorkspaceProps) {
  const client = useQueryClient()
  const [dialogMode, setDialogMode] = useState<"open" | "create" | null>(null)
  const [draftByPath, setDraftByPath] = useState<Record<string, string>>({})
  const [dirtyPaths, setDirtyPaths] = useState<Record<string, boolean>>({})
  const fileQuery = useQuery({
    queryKey: ["project-file", projectId, activeFile],
    queryFn: () => readProjectFile(projectId!, activeFile!),
    enabled: Boolean(projectId && activeFile),
  })
  const draft = activeFile
    ? (draftByPath[activeFile] ?? fileQuery.data?.content ?? "")
    : ""
  const dirty = activeFile ? Boolean(dirtyPaths[activeFile]) : false
  const save = useMutation({
    mutationFn: () => writeProjectFile(projectId!, activeFile!, draft),
    onSuccess: async () => {
      if (!activeFile) return
      setDirtyPaths((current) => ({ ...current, [activeFile]: false }))
      await client.invalidateQueries({ queryKey: ["project-file", projectId, activeFile] })
      await client.invalidateQueries({ queryKey: ["project-entries", projectId] })
    },
  })

  const liveEditing = Boolean(
    editorOwnerId && (!missionStatus || !isTerminalMissionStatus(missionStatus)),
  )
  const owner = liveEditing
    ? staff.find((profile) => profile.id === editorOwnerId)
    : undefined
  const language = activeFile ? languageForPath(activeFile) : "plaintext"

  if (!projectId) {
    return (
      <section className="code-workspace code-workspace--empty" aria-label="Code workspace">
        <div className="code-workspace__empty-state">
          <p>Open a project to browse and edit files.</p>
          <div className="code-workspace__empty-actions">
            <Button size="sm" variant="outline" onClick={() => setDialogMode("open")}>
              Open project
            </Button>
            <Button size="sm" onClick={() => setDialogMode("create")}>
              New project
            </Button>
          </div>
          <RecentProjectsList
            onOpened={(project) => {
              onProjectOpened?.(project)
            }}
          />
        </div>
        <ProjectPathDialog
          open={dialogMode !== null}
          mode={dialogMode ?? "open"}
          onOpenChange={(open) => {
            if (!open) setDialogMode(null)
          }}
          onOpened={(project) => {
            onProjectOpened?.(project)
          }}
        />
      </section>
    )
  }

  if (!activeFile || openFiles.length === 0) {
    return (
      <section className="code-workspace code-workspace--empty" aria-label="Code workspace">
        <p>Select a file from the explorer.</p>
      </section>
    )
  }

  return (
    <section className="code-workspace" aria-label="Code workspace">
      <div className="editor-tabs" role="tablist" aria-label="Open files">
        {openFiles.map((path) => {
          const name = path.split(/[\\/]/).at(-1) ?? path
          return (
            <div
              key={path}
              className={cn("editor-tab", path === activeFile && "is-active")}
              role="tab"
              aria-selected={path === activeFile}
            >
              <button type="button" onClick={() => onSelectFile(path)}>
                <Braces aria-hidden="true" />
                {name}
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Close ${name}`}
                onClick={() => onCloseFile(path)}
              >
                <X />
              </Button>
            </div>
          )
        })}
      </div>
      {owner && (
        <div className="agent-cursor-badge">
          <PixelAvatar avatar={owner.avatar} name={owner.displayName} size="sm" />
          <span><strong>{owner.displayName}</strong> is editing {activeFile}</span>
        </div>
      )}
      <div className="code-workspace__editor">
        {fileQuery.isLoading && draftByPath[activeFile] === undefined ? (
          <div className="editor-loading" role="status">Loading fileâ€¦</div>
        ) : fileQuery.error && draftByPath[activeFile] === undefined ? (
          <p role="alert">{fileQuery.error.message}</p>
        ) : (
          <Suspense fallback={<div className="editor-loading" role="status">Loading editorâ€¦</div>}>
            <MonacoEditor
              path={activeFile}
              language={language}
              value={draft}
              theme="vs"
              onChange={(value) => {
                const next = value ?? ""
                setDraftByPath((current) => ({ ...current, [activeFile]: next }))
                setDirtyPaths((current) => ({ ...current, [activeFile]: true }))
              }}
              options={{
                minimap: { enabled: false },
                fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                fontSize: 12.5,
                lineHeight: 20,
                padding: { top: 14 },
                scrollBeyondLastLine: false,
                renderLineHighlight: "gutter",
                overviewRulerBorder: false,
                foldingHighlight: false,
                guides: { indentation: false },
                wordWrap: "on",
                readOnly: false,
                automaticLayout: true,
              }}
            />
          </Suspense>
        )}
      </div>
      <footer className="editor-status">
        <span>
          {dirty ? (
            <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          ) : (
            <><Check aria-hidden="true" /> Saved</>
          )}
        </span>
        <span>UTF-8</span>
        <span>{language}</span>
      </footer>
    </section>
  )
}

```

## FILE: apps/web/src/app/App.tsx

```
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { ActivityFeed } from "@/components/activity/ActivityFeed"
import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
import { CodeWorkspace } from "@/components/editor/CodeWorkspace"
import { HandoffOverlay } from "@/components/handoff/HandoffOverlay"
import { MissionComposer } from "@/components/mission/MissionComposer"
import { MissionControlBar } from "@/components/mission/MissionControlBar"
import { ProjectExplorer } from "@/components/repository/ProjectExplorer"
import { AppShell } from "@/components/shell/AppShell"
import { WorkspacePanelSwitch } from "@/components/shell/WorkspacePanelSwitch"
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar"
import { EngineeringTeamPanel } from "@/components/staff/EngineeringTeamPanel"
import { TeamFloor } from "@/components/team-floor/TeamFloor"
import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
import { listMissionSessions } from "@/features/mission/mission-api"
import { useLiveRuntime } from "@/features/mission/use-live-runtime"
import { getRuntimeStatus } from "@/features/models/model-api"
import { getActiveProject, type ProjectRecord } from "@/features/projects/project-api"
import { getStaffProfiles } from "@/features/staff/staff-api"
import { useUiStore } from "@/stores/ui-store"
import { isTerminalMissionStatus } from "@/types/domain"

export function App() {
  const client = useQueryClient()
  const activePanel = useUiStore((state) => state.activePanel)
  const setActivePanel = useUiStore((state) => state.setActivePanel)
  const selectedStaffId = useUiStore((state) => state.selectedStaffId)
  const selectStaff = useUiStore((state) => state.selectStaff)
  const workLogOpen = useUiStore((state) => state.workLogOpen)
  const setWorkLogOpen = useUiStore((state) => state.setWorkLogOpen)
  const activeFile = useUiStore((state) => state.activeFile)
  const openFiles = useUiStore((state) => state.openFiles)
  const openFile = useUiStore((state) => state.openFile)
  const closeFile = useUiStore((state) => state.closeFile)
  const clearFiles = useUiStore((state) => state.clearFiles)
  const liveRuntime = useLiveRuntime()
  const runtimeStatus = useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    retry: 1,
  })
  const project = useQuery({
    queryKey: ["active-project"],
    queryFn: getActiveProject,
    retry: 1,
  })
  const staff = useQuery({
    queryKey: ["staff"],
    queryFn: getStaffProfiles,
    staleTime: 60_000,
  })
  const missionSessions = useQuery({
    queryKey: ["mission-sessions", project.data?.id],
    queryFn: () => listMissionSessions(project.data!.id),
    enabled: Boolean(project.data),
  })
  const roster = staff.data ?? []
  const [dismissedHandoffId, setDismissedHandoffId] = useState<string | null>(null)
  const visibleHandoff =
    liveRuntime.projection.activeHandoff?.id === dismissedHandoffId
      ? null
      : liveRuntime.projection.activeHandoff

  useEffect(() => {
    const path = liveRuntime.projection.activeFile
    if (!path) return
    openFile(path)
    void client.invalidateQueries({ queryKey: ["project-entries", project.data?.id] })
    void client.invalidateQueries({
      queryKey: ["project-file", project.data?.id, path],
    })
  }, [
    client,
    liveRuntime.projection.activeFile,
    liveRuntime.projection.fileRevision,
    openFile,
    project.data?.id,
  ])

  useEffect(() => {
    const deleted = liveRuntime.projection.lastDeletedFile
    if (!deleted) return
    closeFile(deleted)
    void client.invalidateQueries({ queryKey: ["project-entries", project.data?.id] })
    void client.removeQueries({ queryKey: ["project-file", project.data?.id, deleted] })
  }, [
    client,
    closeFile,
    liveRuntime.projection.lastDeletedFile,
    liveRuntime.projection.fileRevision,
    project.data?.id,
  ])

  const selectedStaff =
    roster.find((profile) => profile.id === selectedStaffId) ?? roster[0] ?? null

  const onProjectOpened = (next: ProjectRecord) => {
    clearFiles()
    void client.setQueryData(["active-project"], next)
    void client.invalidateQueries({ queryKey: ["mission-sessions", next.id] })
  }

  const sidebar = activePanel === "explorer"
    ? (
      <ProjectExplorer
        project={project.data ?? null}
        activeFile={activeFile}
        onOpenFile={openFile}
        onProjectOpened={onProjectOpened}
      />
    )
    : (
      <WorkspaceSidebar
        panel={activePanel}
        staff={roster}
        staffLoading={staff.isPending}
        staffError={staff.error}
        runtimeStatus={runtimeStatus.data}
        mission={liveRuntime.mission}
        missionSessions={missionSessions.data ?? []}
        selectedMissionSessionId={liveRuntime.session?.id ?? null}
        onSelectMissionSession={(sessionId) => {
          const selected = missionSessions.data?.find((item) => item.id === sessionId)
          if (!selected) return
          setActivePanel("team-floor")
          void liveRuntime.selectSession(selected)
        }}
      />
    )

  const hasProject = Boolean(project.data)
  const missionControlStatus = isTerminalMissionStatus(liveRuntime.mission?.status)
    ? liveRuntime.mission.status
    : liveRuntime.projection.status

  const workspaceClass = [
    "mission-workspace",
    !hasProject ? "mission-workspace--no-project" : "",
  ].filter(Boolean).join(" ")

  const workspace = (
    <div className={workspaceClass}>
      {liveRuntime.error && (
        <p className="mission-runtime-error" role="alert">{liveRuntime.error}</p>
      )}
      <WorkspacePanelSwitch
        panelKey={activePanel === "team-floor" ? "team-floor" : "workspace"}
      >
        {activePanel === "team-floor" ? (
          <TeamFloor
            staff={roster}
            currentStaffId={liveRuntime.projection.currentStaffId}
            statuses={liveRuntime.projection.staffStatuses}
            selectedStaffIds={liveRuntime.projection.selectedStaffIds}
            artifacts={liveRuntime.projection.artifacts}
            activity={liveRuntime.projection.activity}
            onSelectStaff={selectStaff}
            projectId={project.data?.id ?? null}
            activeFile={liveRuntime.projection.activeFile || null}
            fileRevision={liveRuntime.projection.fileRevision}
            editorOwnerId={liveRuntime.projection.editorOwnerId}
            hasStarted={liveRuntime.hasStarted}
            missionStatus={liveRuntime.projection.status}
            objective={liveRuntime.projection.objective}
            assemblyRoles={liveRuntime.projection.assemblyRoles}
            planReview={liveRuntime.projection.planReview}
            missionId={liveRuntime.mission?.id ?? null}
            startedAt={liveRuntime.projection.startedAt}
            endedAt={liveRuntime.projection.endedAt}
            onOpenWorkOutput={(path) => {
              openFile(path)
              setActivePanel("explorer")
            }}
          />
        ) : (
          <CodeWorkspace
            staff={roster}
            projectId={project.data?.id ?? null}
            activeFile={activeFile}
            openFiles={openFiles}
            editorOwnerId={liveRuntime.projection.editorOwnerId}
            missionStatus={liveRuntime.projection.status}
            onSelectFile={openFile}
            onCloseFile={closeFile}
            onProjectOpened={onProjectOpened}
          />
        )}
      </WorkspacePanelSwitch>
      {hasProject && (
        <ActivityFeed
          staff={roster}
          hasStarted={liveRuntime.hasStarted}
          missionStatus={liveRuntime.projection.status}
          events={liveRuntime.projection.activity}
        />
      )}
    </div>
  )

  return (
    <AppShell
      activePanel={activePanel}
      onPanelChange={setActivePanel}
      sidebar={sidebar}
      workspace={workspace}
      teamPanel={(
        <EngineeringTeamPanel
          staff={roster}
          onSelectStaff={selectStaff}
          isLoading={staff.isPending}
          error={staff.error}
          missionControls={liveRuntime.hasStarted ? (
            <>
              <MissionControlBar
                title={liveRuntime.mission?.objective ?? "Live mission"}
                playing={liveRuntime.playing}
                paused={liveRuntime.paused}
                status={missionControlStatus}
                onPause={liveRuntime.pause}
                onResume={liveRuntime.resume}
                onCancel={liveRuntime.cancel}
                onDismiss={liveRuntime.dismiss}
              />
              {isTerminalMissionStatus(missionControlStatus) && (
                <MissionComposer
                  mode="followup"
                  projectName={project.data?.name}
                  liveRuntime={{
                    state: runtimeStatus.data?.state ?? "unavailable",
                    profileId: runtimeStatus.data?.selectedProfileId ?? "",
                    model: runtimeStatus.data?.selectedModel ?? "",
                  }}
                  onStart={(request) => {
                    if (!project.data) return
                    setActivePanel("team-floor")
                    void liveRuntime.sendFollowUp({
                      request: request.request,
                      projectId: project.data.id,
                      modelProfileId: request.modelProfile,
                      model: request.model,
                    }).then(() => {
                      void client.invalidateQueries({
                        queryKey: ["mission-sessions", project.data?.id],
                      })
                    })
                  }}
                />
              )}
            </>
          ) : (
            <MissionComposer
              mode={liveRuntime.session ? "followup" : "new"}
              projectName={project.data?.name}
              liveRuntime={{
                state: runtimeStatus.data?.state ?? "unavailable",
                profileId: runtimeStatus.data?.selectedProfileId ?? "",
                model: runtimeStatus.data?.selectedModel ?? "",
              }}
              onStart={(request) => {
                if (!project.data) return
                setActivePanel("team-floor")
                const action = liveRuntime.session
                  ? liveRuntime.sendFollowUp
                  : liveRuntime.start
                void action({
                  request: request.request,
                  projectId: project.data.id,
                  modelProfileId: request.modelProfile,
                  model: request.model,
                }).then(() => {
                  void client.invalidateQueries({
                    queryKey: ["mission-sessions", project.data?.id],
                  })
                })
              }}
            />
          )}
        />
      )}
      overlays={(
        <>
          {selectedStaff && (
            <WorkLogDrawer
              open={workLogOpen}
              staff={selectedStaff}
              log={liveRuntime.projection.workLogs[selectedStaff.id]}
              onOpenChange={setWorkLogOpen}
            />
          )}
          <HandoffOverlay
            handoff={visibleHandoff}
            staff={roster}
            onDismiss={() => setDismissedHandoffId(visibleHandoff?.id ?? null)}
          />
          <CommandApprovalDialog missionId={liveRuntime.mission?.id} />
        </>
      )}
    />
  )
}

```

## FILE: apps/web/tests/recent-projects-list.test.tsx

```
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ProjectRecord, RecentProjectRecord } from "@/features/projects/project-api"

const listRecentProjects = vi.fn<(...args: unknown[]) => Promise<RecentProjectRecord[]>>()
const openProject = vi.fn<(...args: unknown[]) => Promise<ProjectRecord>>()

vi.mock("@/features/projects/project-api", () => ({
  listRecentProjects: (...args: unknown[]) => listRecentProjects(...args),
  openProject: (...args: unknown[]) => openProject(...args),
}))

import { RecentProjectsList } from "@/components/repository/RecentProjectsList"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function makeRecent(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `project_${index}`,
    name: `App ${index}`,
    root: `F:\\Projects\\app-${index}`,
    lastOpenedAt: new Date(Date.UTC(2026, 6, 30, 12, index)).toISOString(),
  }))
}

describe("RecentProjectsList", () => {
  beforeEach(() => {
    listRecentProjects.mockReset()
    openProject.mockReset()
  })

  it("renders nothing when history is empty", async () => {
    listRecentProjects.mockResolvedValue([])
    const { container } = renderWithClient(
      <RecentProjectsList onOpened={() => undefined} />,
    )
    expect(await screen.findByText("Recent").catch(() => null)).toBeNull()
    expect(container.querySelector(".recent-projects")).toBeNull()
  })

  it("shows five rows and expands with View more", async () => {
    const user = userEvent.setup()
    listRecentProjects.mockResolvedValue(makeRecent(7))
    renderWithClient(<RecentProjectsList onOpened={() => undefined} />)
    expect(await screen.findByText("App 0")).toBeInTheDocument()
    expect(screen.getByText("App 4")).toBeInTheDocument()
    expect(screen.queryByText("App 5")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "View more" }))
    expect(screen.getByText("App 5")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Show less" }))
    expect(screen.queryByText("App 5")).not.toBeInTheDocument()
  })

  it("opens a project when a row is clicked", async () => {
    const user = userEvent.setup()
    const onOpened = vi.fn()
    listRecentProjects.mockResolvedValue(makeRecent(1))
    openProject.mockResolvedValue({
      id: "project_0",
      name: "App 0",
      root: "F:\\Projects\\app-0",
    })
    renderWithClient(<RecentProjectsList onOpened={onOpened} />)
    await user.click(await screen.findByRole("button", { name: /App 0/ }))
    expect(openProject).toHaveBeenCalledWith("F:\\Projects\\app-0")
    expect(onOpened).toHaveBeenCalledWith({
      id: "project_0",
      name: "App 0",
      root: "F:\\Projects\\app-0",
    })
  })

  it("shows an error and refreshes when open fails", async () => {
    const user = userEvent.setup()
    listRecentProjects
      .mockResolvedValueOnce(makeRecent(1))
      .mockResolvedValueOnce([])
    openProject.mockRejectedValue(new Error("Project root must be an existing directory"))
    renderWithClient(<RecentProjectsList onOpened={() => undefined} />)
    await user.click(await screen.findByRole("button", { name: /App 0/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That folder is no longer available",
    )
    expect(listRecentProjects).toHaveBeenCalledTimes(2)
  })
})

```

## FILE: apps/web/tests/project-explorer.test.tsx

```
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { RecentProjectRecord } from "@/features/projects/project-api"

const listRecentProjects = vi.fn<(...args: unknown[]) => Promise<RecentProjectRecord[]>>()

vi.mock("@/features/projects/project-api", () => ({
  listProjectEntries: vi.fn().mockResolvedValue([]),
  listRecentProjects: (...args: unknown[]) => listRecentProjects(...args),
  openProject: vi.fn(),
}))

import {
  copyProjectFilePath,
  ProjectExplorer,
} from "@/components/repository/ProjectExplorer"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe("ProjectExplorer", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    listRecentProjects.mockReset()
  })

  it("does not repeat the active project name or path in the explorer", () => {
    renderWithClient(
      <ProjectExplorer
        project={{
          id: "project_1",
          name: "TOVA test",
          root: "F:\\Programming Projects\\TOVA test",
        }}
        activeFile={null}
        onOpenFile={() => undefined}
        onProjectOpened={() => undefined}
      />,
    )

    expect(screen.getByText("PROJECT")).toBeInTheDocument()
    expect(screen.queryByLabelText("Active project")).not.toBeInTheDocument()
    expect(screen.queryByText("TOVA test")).not.toBeInTheDocument()
    expect(
      screen.queryByText("F:\\Programming Projects\\TOVA test"),
    ).not.toBeInTheDocument()
  })

  it("shows Copy File Path in the Project menu when a project is open", async () => {
    const user = userEvent.setup()
    renderWithClient(
      <ProjectExplorer
        project={{
          id: "project_1",
          name: "TOVA test",
          root: "F:\\Programming Projects\\TOVA test",
        }}
        activeFile={null}
        onOpenFile={() => undefined}
        onProjectOpened={() => undefined}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Project menu" }))
    const item = await screen.findByRole("menuitem", { name: "Copy File Path" })
    expect(item).not.toHaveAttribute("data-disabled")
  })

  it("shows empty-state actions and recent projects when no project is open", async () => {
    listRecentProjects.mockResolvedValue([
      {
        id: "project_recent",
        name: "Recent App",
        root: "F:\\Projects\\recent-app",
        lastOpenedAt: "2026-07-30T12:00:00.000Z",
      },
    ])
    renderWithClient(
      <ProjectExplorer
        project={null}
        activeFile={null}
        onOpenFile={() => undefined}
        onProjectOpened={() => undefined}
      />,
    )

    expect(screen.getByRole("button", { name: "Open project" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument()
    expect(await screen.findByText("Recent App")).toBeInTheDocument()
  })

  it("copies a path through copyProjectFilePath", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    await copyProjectFilePath("F:\\Programming Projects\\TOVA test")
    expect(writeText).toHaveBeenCalledWith("F:\\Programming Projects\\TOVA test")
  })
})

```

## FILE: apps/web/tests/code-workspace.test.tsx

```
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@monaco-editor/react", () => ({
  default: () => <div data-testid="monaco-editor" />,
}))

import type { RecentProjectRecord } from "@/features/projects/project-api"

const listRecentProjects = vi.fn<(...args: unknown[]) => Promise<RecentProjectRecord[]>>()

vi.mock("@/features/projects/project-api", () => ({
  languageForPath: () => "typescript",
  listRecentProjects: (...args: unknown[]) => listRecentProjects(...args),
  readProjectFile: vi.fn().mockResolvedValue({
    path: "src/App.tsx",
    content: "export {}",
  }),
  writeProjectFile: vi.fn(),
}))

import { CodeWorkspace } from "@/components/editor/CodeWorkspace"

import { staffProfiles } from "./fixtures/staff"

describe("CodeWorkspace", () => {
  it("shows recent projects in the empty state when no project is open", async () => {
    listRecentProjects.mockResolvedValue([
      {
        id: "project_recent",
        name: "Recent App",
        root: "F:\\Projects\\recent-app",
        lastOpenedAt: "2026-07-30T12:00:00.000Z",
      },
    ])
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId={null}
          activeFile={null}
          openFiles={[]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByRole("button", { name: "Open project" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument()
    expect(await screen.findByText("Recent App")).toBeInTheDocument()
  })

  it("resolves the editor owner from the supplied roster", async () => {
    const owner = {
      ...staffProfiles[4],
      id: "staff_custom_editor",
      displayName: "Custom Editor",
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[owner]}
          projectId="project_1"
          activeFile="src/App.tsx"
          openFiles={["src/App.tsx"]}
          editorOwnerId={owner.id}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole("img", {
      name: "Custom Editor pixel portrait",
    })).toBeInTheDocument()
    expect(screen.getByText(/is editing/)).toBeInTheDocument()
  })

  it("hides the live editing badge when the mission is finished", async () => {
    const owner = staffProfiles[0]
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[owner]}
          projectId="project_1"
          activeFile="index.html"
          openFiles={["index.html", "script.js"]}
          editorOwnerId={owner.id}
          missionStatus="completed"
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    await screen.findByTestId("monaco-editor")
    expect(screen.queryByText(/is editing/)).not.toBeInTheDocument()
  })
})

```

## FILE: apps/web/src/styles/globals.css (recent-projects excerpt)

```
.project-explorer__empty,
.project-explorer__empty-state,
.code-workspace--empty {
  display: grid;
  place-content: center;
  gap: 8px;
  padding: 18px;
  color: var(--muted-text);
  text-align: center;
  min-height: 0;
  height: 100%;
}

.project-explorer__empty-state strong,
.code-workspace--empty p,
.code-workspace__empty-state p {
  color: #3f403c;
}

.project-explorer__empty-actions,
.code-workspace__empty-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.project-explorer__empty-state {
  display: grid;
  gap: 12px;
  justify-items: center;
}

.code-workspace__empty-state {
  display: grid;
  gap: 12px;
  justify-items: center;
}

.recent-projects {
  display: grid;
  gap: 6px;
  width: min(320px, 100%);
  margin-top: 4px;
  text-align: left;
}

.recent-projects__label {
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--soft-text);
}

.recent-projects__list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent-projects__row {
  display: grid;
  gap: 1px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
}

.recent-projects__row:hover:not(:disabled) {
  background: color-mix(in oklab, var(--panel) 70%, #e8e8e4);
  border-color: var(--line);
}

.recent-projects__name {
  font-size: 12px;
  font-weight: 600;
  color: #2f302d;
}

.recent-projects__path {
  overflow: hidden;
  color: var(--soft-text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-projects__toggle {
  justify-self: start;
  height: auto;
  min-height: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--muted-text);
  font-size: 11px;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.recent-projects__toggle:hover {
  background: transparent;
  color: var(--muted-text);
}

.recent-projects [role="alert"] {
  margin: 0;
  color: var(--red);
  font-size: 11px;
}

.project-explorer__empty {
  padding: 10px 12px;
```
