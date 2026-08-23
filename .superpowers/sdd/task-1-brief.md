### Task 1: App data dir + RecentProjectsStore

**Files:**
- Create: `apps/api/app/services/app_data.py`
- Create: `apps/api/app/services/recent_projects.py`
- Create: `apps/api/tests/test_recent_projects.py`
- Modify: `apps/api/app/schemas/projects.py`

**Interfaces:**
- Consumes: none
- Produces:
  - `resolve_data_dir(env: Mapping[str, str] | None = None) -> Path`
  - `RecentProjectsStore(path: Path, *, max_entries: int = 20)`
  - `store.list() -> list[RecentProjectRecord]`
  - `store.record(project: ProjectRecord, *, opened_at: datetime | None = None) -> None`
  - `store.remove_root(root: str) -> bool`
  - `RecentProjectRecord(id: str, name: str, root: str, lastOpenedAt: datetime)`

- [ ] **Step 1: Write failing unit tests for store + data dir**

Add to `apps/api/tests/test_recent_projects.py`:

```python
from datetime import UTC, datetime
from pathlib import Path

from app.schemas.projects import ProjectRecord, RecentProjectRecord
from app.services.app_data import resolve_data_dir
from app.services.recent_projects import RecentProjectsStore


def test_resolve_data_dir_honors_tova_data_dir(tmp_path: Path) -> None:
    resolved = resolve_data_dir({"TOVA_DATA_DIR": str(tmp_path / "custom")})
    assert resolved == (tmp_path / "custom").resolve()


def test_record_upserts_moves_to_front_and_caps_at_20(tmp_path: Path) -> None:
    store = RecentProjectsStore(tmp_path / "recent-projects.json", max_entries=20)
    for index in range(21):
        store.record(
            ProjectRecord(id=f"project_{index}", name=f"p{index}", root=str(tmp_path / f"p{index}")),
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
```

Add schema to `apps/api/app/schemas/projects.py`:

```python
from datetime import datetime

class RecentProjectRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    root: str
    lastOpenedAt: datetime
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run --directory apps/api pytest tests/test_recent_projects.py -v`

Expected: FAIL (import / module missing)

- [ ] **Step 3: Implement app_data + store**

`apps/api/app/services/app_data.py`:

```python
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

`apps/api/app/services/recent_projects.py`: implement JSON load/save with `version: 1`, upsert by normalized root (`Path.resolve()` when path exists, else `expanduser` + `normcase` on Windows), newest-first list, cap `max_entries`, best-effort write (create parent dirs). Use timezone-aware UTC datetimes. Serialize `lastOpenedAt` as ISO-8601.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run --directory apps/api pytest tests/test_recent_projects.py -v`

Expected: PASS

---
