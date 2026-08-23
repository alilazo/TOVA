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


def is_ephemeral_project_root(root: str) -> bool:
    path = Path(root).expanduser()
    name = path.name.lower()
    if name.startswith("tova-e2e-"):
        return True
    parts = [part.lower() for part in path.parts]
    under_pytest = any(part.startswith("pytest-of-") for part in parts)
    return under_pytest and name.startswith("test_")


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _serialize_datetime(value: datetime) -> str:
    utc = _to_utc(value)
    return utc.isoformat().replace("+00:00", "Z")


def _root_exists(root: str) -> bool:
    try:
        path = Path(root).expanduser()
        return path.exists() and path.is_dir()
    except OSError:
        return False


class RecentProjectsStore:
    def __init__(self, path: Path, *, max_entries: int = 20) -> None:
        self._path = path
        self._max_entries = max_entries

    def list(self) -> RecentProjectList:
        projects = self._load()["projects"]
        kept = [
            item
            for item in projects
            if _root_exists(item.root) and not is_ephemeral_project_root(item.root)
        ]
        kept = sorted(kept, key=lambda item: item.lastOpenedAt, reverse=True)
        if len(kept) != len(projects):
            self._save(kept[: self._max_entries])
        return kept

    def record(self, project: ProjectRecord, *, opened_at: datetime | None = None) -> None:
        if is_ephemeral_project_root(project.root):
            return
        if not _root_exists(project.root):
            return
        opened = _to_utc(opened_at if opened_at is not None else datetime.now(UTC))
        normalized = _normalize_root(project.root)
        projects = [
            item
            for item in self._load()["projects"]
            if _normalize_root(item.root) != normalized
            and _root_exists(item.root)
            and not is_ephemeral_project_root(item.root)
        ]
        projects.insert(
            0,
            RecentProjectRecord(
                id=project.id,
                name=project.name,
                root=str(Path(project.root).expanduser().resolve()),
                lastOpenedAt=opened,
            ),
        )
        self._save(projects[: self._max_entries])

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
