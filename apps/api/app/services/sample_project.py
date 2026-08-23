from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from pathlib import Path

from app.core.paths import sample_template_dir
from app.schemas.projects import SampleProjectRecord
from app.services.projects import ProjectRegistry
from app.tools.repository import WorkspaceError

STARTER_FILENAME = "starter.json"


@dataclass(frozen=True)
class SampleProjectPaths:
    template_dir: Path
    destination: Path


def default_sample_template_dir() -> Path:
    return sample_template_dir()


def read_starter_objective(template_dir: Path) -> str:
    starter_path = template_dir / STARTER_FILENAME
    try:
        payload = json.loads(starter_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise WorkspaceError("Sample project template is missing starter.json") from exc
    except json.JSONDecodeError as exc:
        raise WorkspaceError("Sample project starter.json is invalid") from exc
    objective = payload.get("objective") if isinstance(payload, dict) else None
    if not isinstance(objective, str) or not objective.strip():
        raise WorkspaceError("Sample project starter.json is missing an objective")
    return objective.strip()


def open_sample_project(
    registry: ProjectRegistry,
    paths: SampleProjectPaths,
) -> SampleProjectRecord:
    template = paths.template_dir.expanduser().resolve()
    destination = paths.destination.expanduser()
    if not template.is_dir():
        raise WorkspaceError("Sample project template is not an existing directory")
    objective = read_starter_objective(template)
    if not destination.exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(template, destination)
    record = registry.open(str(destination))
    return SampleProjectRecord(
        id=record.id,
        name=record.name,
        root=record.root,
        starter_objective=objective,
    )
