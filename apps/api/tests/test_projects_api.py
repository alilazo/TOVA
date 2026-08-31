from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.projects import get_project_registry
from app.main import app
from app.services.projects import ProjectRegistry
from app.tools.repository import ProjectWorkspace


@pytest.mark.asyncio
async def test_creates_opens_lists_reads_and_writes_project_files(tmp_path: Path) -> None:
    registry = ProjectRegistry()
    app.dependency_overrides[get_project_registry] = lambda: registry
    created_root = tmp_path / "blank-app"
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await client.post(
                "/api/projects",
                json={"path": str(created_root), "create": True},
            )
            assert created.status_code == 200
            project = created.json()
            assert project["name"] == "blank-app"
            assert Path(project["root"]) == created_root.resolve()
            assert created_root.is_dir()

            active = await client.get("/api/projects/active")
            assert active.json()["id"] == project["id"]

            entries = await client.get(
                f"/api/projects/{project['id']}/entries",
                params={"path": "."},
            )
            assert entries.status_code == 200
            assert entries.json() == []

            written = await client.put(
                f"/api/projects/{project['id']}/files",
                json={"path": "README.md", "content": "# Hello\n"},
            )
            assert written.status_code == 200
            assert written.json()["path"] == "README.md"

            listed = await client.get(
                f"/api/projects/{project['id']}/entries",
                params={"path": "."},
            )
            assert {"name": "README.md", "path": "README.md", "kind": "file"} in listed.json()

            read = await client.get(
                f"/api/projects/{project['id']}/files",
                params={"path": "README.md"},
            )
            assert read.json()["content"] == "# Hello\n"

            (created_root / "src").mkdir()
            (created_root / "src" / "index.html").write_text("<main />", encoding="utf-8")
            references = await client.get(
                f"/api/projects/{project['id']}/references",
                params={"query": "ind"},
            )
            assert references.status_code == 200
            assert references.json() == [
                {"name": "index.html", "path": "src/index.html", "kind": "file"},
            ]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_creates_moves_and_deletes_project_entries(tmp_path: Path) -> None:
    registry = ProjectRegistry()
    project = registry.open(str(tmp_path))
    app.dependency_overrides[get_project_registry] = lambda: registry
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            created_directory = await client.post(
                f"/api/projects/{project.id}/entries",
                json={"path": "src", "kind": "dir"},
            )
            assert created_directory.status_code == 200
            assert created_directory.json() == {
                "name": "src",
                "path": "src",
                "kind": "dir",
            }

            created_file = await client.post(
                f"/api/projects/{project.id}/entries",
                json={"path": "src/main.ts", "kind": "file"},
            )
            assert created_file.status_code == 200
            assert created_file.json() == {
                "name": "main.ts",
                "path": "src/main.ts",
                "kind": "file",
            }

            moved = await client.patch(
                f"/api/projects/{project.id}/entries",
                json={
                    "source_path": "src/main.ts",
                    "destination_path": "src/app.ts",
                },
            )
            assert moved.status_code == 200
            assert moved.json() == {
                "name": "app.ts",
                "path": "src/app.ts",
                "kind": "file",
            }

            deleted = await client.request(
                "DELETE",
                f"/api/projects/{project.id}/entries",
                json={"path": "src", "recursive": True},
            )
            assert deleted.status_code == 200
            assert deleted.json() == {
                "name": "src",
                "path": "src",
                "kind": "dir",
            }
            assert not (tmp_path / "src").exists()
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "payload"),
    [
        ("POST", {"path": "new.txt", "kind": "file"}),
        (
            "PATCH",
            {"source_path": "old.txt", "destination_path": "new.txt"},
        ),
        ("DELETE", {"path": "old.txt", "recursive": False}),
    ],
)
async def test_entry_mutations_return_404_for_unknown_project(
    method: str,
    payload: dict[str, object],
) -> None:
    registry = ProjectRegistry()
    app.dependency_overrides[get_project_registry] = lambda: registry
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.request(
                method,
                "/api/projects/unknown/entries",
                json=payload,
            )
            assert response.status_code == 404
            assert response.json() == {"detail": "Project not found"}
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_entry_mutations_return_actionable_422_details(tmp_path: Path) -> None:
    (tmp_path / "existing.txt").write_text("existing", encoding="utf-8")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.ts").write_text("export {}", encoding="utf-8")
    registry = ProjectRegistry()
    project = registry.open(str(tmp_path))
    app.dependency_overrides[get_project_registry] = lambda: registry
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            root = await client.request(
                "DELETE",
                f"/api/projects/{project.id}/entries",
                json={"path": ".", "recursive": True},
            )
            assert root.status_code == 422
            assert root.json() == {"detail": "Project root cannot be changed"}

            collision = await client.post(
                f"/api/projects/{project.id}/entries",
                json={"path": "existing.txt", "kind": "file"},
            )
            assert collision.status_code == 422
            assert collision.json() == {"detail": "Destination already exists"}

            recursive_confirmation = await client.request(
                "DELETE",
                f"/api/projects/{project.id}/entries",
                json={"path": "src", "recursive": False},
            )
            assert recursive_confirmation.status_code == 422
            assert recursive_confirmation.json() == {
                "detail": "Non-empty directory requires recursive confirmation",
            }

            descendant_move = await client.patch(
                f"/api/projects/{project.id}/entries",
                json={
                    "source_path": "src",
                    "destination_path": "src/nested",
                },
            )
            assert descendant_move.status_code == 422
            assert descendant_move.json() == {
                "detail": "Directory cannot be moved into itself",
            }
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "payload"),
    [
        ("POST", {"path": "new.txt", "kind": "file", "extra": True}),
        (
            "PATCH",
            {
                "source_path": "old.txt",
                "destination_path": "new.txt",
                "extra": True,
            },
        ),
        ("DELETE", {"path": "old.txt", "recursive": False, "extra": True}),
    ],
)
async def test_entry_mutation_requests_reject_extra_keys(
    tmp_path: Path,
    method: str,
    payload: dict[str, object],
) -> None:
    registry = ProjectRegistry()
    project = registry.open(str(tmp_path))
    app.dependency_overrides[get_project_registry] = lambda: registry
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.request(
                method,
                f"/api/projects/{project.id}/entries",
                json=payload,
            )
            assert response.status_code == 422
            assert response.json()["detail"][0]["type"] == "extra_forbidden"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_open_requires_existing_directory(tmp_path: Path) -> None:
    registry = ProjectRegistry()
    app.dependency_overrides[get_project_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            missing = await client.post(
                "/api/projects",
                json={"path": str(tmp_path / "missing"), "create": False},
            )
            assert missing.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_rejects_create_when_path_is_a_file(tmp_path: Path) -> None:
    target = tmp_path / "not-a-dir.txt"
    target.write_text("x", encoding="utf-8")
    registry = ProjectRegistry()
    app.dependency_overrides[get_project_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/projects",
                json={"path": str(target), "create": True},
            )
            assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_enforces_allowed_project_roots(tmp_path: Path) -> None:
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    blocked = tmp_path / "blocked"
    blocked.mkdir()
    registry = ProjectRegistry(allowed_roots=[str(allowed)])
    app.dependency_overrides[get_project_registry] = lambda: registry
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            ok = await client.post("/api/projects", json={"path": str(allowed)})
            denied = await client.post("/api/projects", json={"path": str(blocked)})
            assert ok.status_code == 200
            assert denied.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_list_entries_returns_shallow_dirs_and_files(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "nested.py").write_text("x\n", encoding="utf-8")
    (tmp_path / "README.md").write_text("hi\n", encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path)

    entries = workspace.list_entries(".")
    kinds = {(entry["name"], entry["kind"]) for entry in entries}
    assert ("src", "dir") in kinds
    assert ("README.md", "file") in kinds
    assert all(entry["path"].count("/") == 0 for entry in entries)


def test_project_identity_persists_in_tova_metadata(tmp_path: Path) -> None:
    first = ProjectRegistry().open(str(tmp_path))
    second = ProjectRegistry().open(str(tmp_path))

    assert second.id == first.id
    assert (tmp_path / ".tova" / "project.json").is_file()

    entries = ProjectWorkspace(tmp_path).list_entries(".")
    assert all(entry["name"] != ".tova" for entry in entries)
