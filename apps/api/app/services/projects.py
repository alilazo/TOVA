from __future__ import annotations

import json
import logging
from pathlib import Path
from uuid import uuid4

from app.schemas.projects import ProjectRecord
from app.services.recent_projects import RecentProjectList, RecentProjectsStore
from app.tools.repository import ProjectWorkspace, WorkspaceError

logger = logging.getLogger(__name__)

ProjectList = list[ProjectRecord]


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

    def list(self) -> ProjectList:
        return [project.model_copy(deep=True) for project in self._projects.values()]

    def recent(self) -> RecentProjectList:
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
