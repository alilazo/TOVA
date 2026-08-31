from pathlib import Path, PurePosixPath
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import get_settings
from app.schemas.projects import (
    ProjectEntry,
    ProjectEntryCreateRequest,
    ProjectEntryDeleteRequest,
    ProjectEntryMoveRequest,
    ProjectFile,
    ProjectFileWriteRequest,
    ProjectOpenRequest,
    ProjectRecord,
    RecentProjectRecord,
    SampleProjectRecord,
)
from app.services.app_data import resolve_data_dir
from app.services.projects import ProjectRegistry
from app.services.sample_project import (
    SampleProjectPaths,
    default_sample_template_dir,
    open_sample_project,
)
from app.tools.repository import WorkspaceEntryResult, WorkspaceError

router = APIRouter(prefix="/api")


def _parse_allowed_roots(raw: str) -> list[str]:
    return [part.strip() for part in raw.split(";") if part.strip()]


def _resolve_data_dir() -> Path:
    settings = get_settings()
    if settings.data_dir:
        return Path(settings.data_dir).expanduser().resolve()
    return resolve_data_dir()


def _resolve_recent_path() -> Path:
    return _resolve_data_dir() / "recent-projects.json"


_settings = get_settings()
_registry = ProjectRegistry(
    allowed_roots=_parse_allowed_roots(_settings.allowed_project_roots),
    recent_path=_resolve_recent_path(),
)


def get_project_registry() -> ProjectRegistry:
    return _registry


def get_sample_project_paths() -> SampleProjectPaths:
    settings = get_settings()
    template_dir = (
        Path(settings.sample_project_dir).expanduser().resolve()
        if settings.sample_project_dir
        else default_sample_template_dir()
    )
    return SampleProjectPaths(
        template_dir=template_dir,
        destination=_resolve_data_dir() / "sample-projects" / "first-mission",
    )


Registry = Annotated[ProjectRegistry, Depends(get_project_registry)]
SamplePaths = Annotated[SampleProjectPaths, Depends(get_sample_project_paths)]


def _project_entry(result: WorkspaceEntryResult) -> ProjectEntry:
    return ProjectEntry(
        name=PurePosixPath(result["path"]).name,
        path=result["path"],
        kind=result["kind"],
    )


@router.post("/projects", response_model=ProjectRecord)
async def open_project(request: ProjectOpenRequest, registry: Registry) -> ProjectRecord:
    try:
        return registry.open(request.path, create=request.create)
    except WorkspaceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/projects/sample", response_model=SampleProjectRecord)
async def open_bundled_sample_project(
    registry: Registry,
    paths: SamplePaths,
) -> SampleProjectRecord:
    try:
        return open_sample_project(registry, paths)
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


@router.post("/projects/{project_id}/entries", response_model=ProjectEntry)
async def create_entry(
    project_id: str,
    request: ProjectEntryCreateRequest,
    registry: Registry,
) -> ProjectEntry:
    try:
        workspace = registry.workspace(project_id)
        result = (
            workspace.create_file(request.path)
            if request.kind == "file"
            else workspace.create_directory(request.path)
        )
        return _project_entry(result)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except (WorkspaceError, OSError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/projects/{project_id}/entries", response_model=ProjectEntry)
async def move_entry(
    project_id: str,
    request: ProjectEntryMoveRequest,
    registry: Registry,
) -> ProjectEntry:
    try:
        workspace = registry.workspace(project_id)
        return _project_entry(
            workspace.move(request.source_path, request.destination_path)
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except (WorkspaceError, OSError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/projects/{project_id}/entries", response_model=ProjectEntry)
async def delete_entry(
    project_id: str,
    request: ProjectEntryDeleteRequest,
    registry: Registry,
) -> ProjectEntry:
    try:
        workspace = registry.workspace(project_id)
        return _project_entry(
            workspace.delete_entry(request.path, recursive=request.recursive)
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except (WorkspaceError, OSError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/projects/{project_id}/references", response_model=list[ProjectEntry])
async def list_references(
    project_id: str,
    registry: Registry,
    query: str = Query(default=""),
) -> list[ProjectEntry]:
    try:
        workspace = registry.workspace(project_id)
        return [
            ProjectEntry.model_validate(entry)
            for entry in workspace.reference_entries(query)
        ]
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
