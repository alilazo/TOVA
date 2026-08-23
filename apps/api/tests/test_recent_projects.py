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
        root = tmp_path / f"p{index}"
        root.mkdir()
        store.record(
            ProjectRecord(
                id=f"project_{index}",
                name=f"p{index}",
                root=str(root),
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


def test_list_prunes_missing_and_pytest_ephemeral_roots(tmp_path: Path) -> None:
    from app.schemas.projects import RecentProjectRecord

    keep = tmp_path / "real-app"
    keep.mkdir()
    store = RecentProjectsStore(tmp_path / "recent-projects.json")
    store.record(ProjectRecord(id="project_keep", name="real-app", root=str(keep)))

    ephemeral = tmp_path / "pytest-of-ci" / "pytest-1" / "test_mission_routes_create_con0"
    ephemeral.mkdir(parents=True)
    store._save(  # noqa: SLF001 - seed polluted file intentionally
        [
            *store._load()["projects"],  # noqa: SLF001
            RecentProjectRecord(
                id="project_ephemeral",
                name="test_mission_routes_create_con0",
                root=str(ephemeral),
                lastOpenedAt=datetime(2026, 7, 30, 2, 0, 0, tzinfo=UTC),
            ),
            RecentProjectRecord(
                id="project_missing",
                name="gone",
                root=str(tmp_path / "missing-app"),
                lastOpenedAt=datetime(2026, 7, 30, 3, 0, 0, tzinfo=UTC),
            ),
        ]
    )

    items = store.list()
    assert [item.name for item in items] == ["real-app"]


def test_record_skips_ephemeral_pytest_roots(tmp_path: Path) -> None:
    ephemeral = tmp_path / "pytest-of-ci" / "pytest-9" / "test_websocket_replays_after_s0"
    ephemeral.mkdir(parents=True)
    store = RecentProjectsStore(tmp_path / "recent-projects.json")
    store.record(
        ProjectRecord(
            id="project_ephemeral",
            name=ephemeral.name,
            root=str(ephemeral),
        )
    )
    assert store.list() == []


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
