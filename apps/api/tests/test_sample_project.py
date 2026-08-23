import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.projects import get_project_registry, get_sample_project_paths
from app.main import app
from app.services.projects import ProjectRegistry
from app.services.sample_project import SampleProjectPaths


def _write_template(template: Path, objective: str = "Make the Count button increment.") -> None:
    template.mkdir(parents=True)
    (template / "index.html").write_text(
        "<h1>Welcome</h1>\n<button>Count</button>\n",
        encoding="utf-8",
    )
    (template / "starter.json").write_text(
        json.dumps({"objective": objective}),
        encoding="utf-8",
    )


@pytest.mark.asyncio
async def test_open_sample_project_copies_template_and_returns_starter_objective(
    tmp_path: Path,
) -> None:
    template = tmp_path / "template"
    _write_template(template)
    destination = tmp_path / "data" / "sample-projects" / "first-mission"
    registry = ProjectRegistry(recent_path=tmp_path / "recent-projects.json")
    app.dependency_overrides[get_project_registry] = lambda: registry
    app.dependency_overrides[get_sample_project_paths] = lambda: SampleProjectPaths(
        template_dir=template,
        destination=destination,
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/projects/sample")
        assert response.status_code == 200
        body = response.json()
        assert body["name"] == "first-mission"
        assert Path(body["root"]) == destination.resolve()
        assert body["starter_objective"] == "Make the Count button increment."
        assert (destination / "index.html").is_file()
        assert destination.resolve() != template.resolve()
        active = registry.active()
        assert active is not None
        assert active.id == body["id"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_open_sample_project_reuses_existing_copy(tmp_path: Path) -> None:
    template = tmp_path / "template"
    _write_template(template)
    destination = tmp_path / "data" / "sample-projects" / "first-mission"
    destination.mkdir(parents=True)
    (destination / "index.html").write_text("<h1>Edited</h1>\n", encoding="utf-8")
    (destination / "starter.json").write_text(
        json.dumps({"objective": "Make the Count button increment."}),
        encoding="utf-8",
    )
    registry = ProjectRegistry()
    app.dependency_overrides[get_project_registry] = lambda: registry
    app.dependency_overrides[get_sample_project_paths] = lambda: SampleProjectPaths(
        template_dir=template,
        destination=destination,
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/projects/sample")
        assert response.status_code == 200
        assert (destination / "index.html").read_text(encoding="utf-8") == "<h1>Edited</h1>\n"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_open_sample_project_rejects_destination_outside_allowlist(tmp_path: Path) -> None:
    template = tmp_path / "template"
    _write_template(template)
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    destination = tmp_path / "outside" / "first-mission"
    registry = ProjectRegistry(allowed_roots=[str(allowed)])
    app.dependency_overrides[get_project_registry] = lambda: registry
    app.dependency_overrides[get_sample_project_paths] = lambda: SampleProjectPaths(
        template_dir=template,
        destination=destination,
    )
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post("/api/projects/sample")
        assert response.status_code == 422
        assert "allowed project roots" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()
