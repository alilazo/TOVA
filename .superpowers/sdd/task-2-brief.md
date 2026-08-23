### Task 2: Wire ProjectRegistry + GET /api/projects/recent

**Files:**
- Modify: `apps/api/app/core/config.py`
- Modify: `apps/api/app/services/projects.py`
- Modify: `apps/api/app/api/projects.py`
- Modify: `apps/api/tests/test_recent_projects.py`

**Interfaces:**
- Consumes: `RecentProjectsStore`, `resolve_data_dir`, `RecentProjectRecord`
- Produces:
  - `ProjectRegistry(..., recent_path: Path | None = None)` â€” when `None`, skip recent persistence (existing tests stay clean)
  - `registry.recent() -> list[RecentProjectRecord]`
  - `GET /api/projects/recent` â†’ `list[RecentProjectRecord]`
  - Production registry constructed with `recent_path = resolve_data_dir() / "recent-projects.json"` (honoring `Settings.data_dir` when set)

- [ ] **Step 1: Write failing API / registry tests**

Append to `apps/api/tests/test_recent_projects.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.api.projects import get_project_registry
from app.main import app
from app.services.projects import ProjectRegistry


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
    root.rmdir()
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --directory apps/api pytest tests/test_recent_projects.py -v`

Expected: FAIL on missing endpoint / no recording

- [ ] **Step 3: Implement wiring**

1. Add to `Settings` in `apps/api/app/core/config.py`:

```python
data_dir: str | None = None
```

(`TOVA_DATA_DIR` via existing `env_prefix="TOVA_"`.)

2. Update `ProjectRegistry.__init__` to accept `recent_path: Path | None = None`, build `RecentProjectsStore` when set.

3. In `open`:
   - On success: `store.record(record)` inside try/except (log + continue on OSError)
   - On `WorkspaceError` / before re-raise when path is missing or not a directory: `store.remove_root(str(candidate))` (best-effort)

4. Add `recent(self) -> list[RecentProjectRecord]` delegating to the store (empty list if no store).

5. In `apps/api/app/api/projects.py`:
   - Construct registry with recent path from `settings.data_dir or resolve_data_dir()`
   - Add **before** `/{project_id}` routes:

```python
@router.get("/projects/recent", response_model=list[RecentProjectRecord])
async def list_recent_projects(registry: Registry) -> list[RecentProjectRecord]:
    return registry.recent()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --directory apps/api pytest tests/test_recent_projects.py tests/test_projects_api.py -v`

Expected: PASS

---
