# Recent Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show up to 5 recently opened projects (expandable to 20) under Open/New in both empty states, persisted in a machine-local TOVA data file and recorded automatically on every successful project open.

**Architecture:** A `RecentProjectsStore` reads/writes `{data_dir}/recent-projects.json`. `ProjectRegistry.open` records successes and removes entries when open fails for a missing/invalid directory. `GET /api/projects/recent` exposes the list. A shared `RecentProjectsList` renders under both empty states; `App` mounts `ProjectExplorer` even with no active project.

**Tech Stack:** FastAPI, Pydantic, pytest/httpx, React, TanStack Query, Vitest/Testing Library, CSS in `globals.css`.

**Spec:** `docs/superpowers/specs/2026-07-30-recent-projects-design.md`

## Global Constraints

- Cap stored history at **20**; UI default shows **5**; **View more** expands inline; **Show less** collapses
- Persist under TOVA app data dir; override with `TOVA_DATA_DIR`
- Record inside `ProjectRegistry.open` (not a separate touch endpoint)
- Self-heal: failed open for missing/invalid directory removes that path from recents if present
- Mount explorer empty state when no project is open
- Hide recent section entirely when history is empty
- Behavior tests before implementation (red-green)
- Do not commit unless the user explicitly asks

## File structure

| File | Responsibility |
|---|---|
| `apps/api/app/services/app_data.py` | Resolve machine-local TOVA data directory |
| `apps/api/app/services/recent_projects.py` | Load/save/upsert/remove/list recent projects |
| `apps/api/app/services/projects.py` | Wire record + self-heal into `open` |
| `apps/api/app/schemas/projects.py` | `RecentProjectRecord` |
| `apps/api/app/core/config.py` | Optional `data_dir` setting (`TOVA_DATA_DIR`) |
| `apps/api/app/api/projects.py` | `GET /api/projects/recent` (before `{project_id}`) |
| `apps/api/tests/test_recent_projects.py` | Backend behavior tests |
| `apps/web/src/features/projects/project-api.ts` | `RecentProjectRecord`, `listRecentProjects` |
| `apps/web/src/components/repository/RecentProjectsList.tsx` | Shared recent list UI |
| `apps/web/tests/recent-projects-list.test.tsx` | List UI tests |
| `apps/web/src/components/repository/ProjectExplorer.tsx` | Embed list in empty state |
| `apps/web/src/components/editor/CodeWorkspace.tsx` | Embed list in empty state |
| `apps/web/src/app/App.tsx` | Mount explorer when `project` is null |
| `apps/web/src/components/repository/ProjectPathDialog.tsx` | Invalidate `["recent-projects"]` on success |
| `apps/web/src/styles/globals.css` | Compact recent-list styles |
| `apps/web/tests/project-explorer.test.tsx` | Empty-state recent coverage |
| `apps/web/tests/code-workspace.test.tsx` | Empty-state recent coverage (extend) |

---

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

### Task 2: Wire ProjectRegistry + GET /api/projects/recent

**Files:**
- Modify: `apps/api/app/core/config.py`
- Modify: `apps/api/app/services/projects.py`
- Modify: `apps/api/app/api/projects.py`
- Modify: `apps/api/tests/test_recent_projects.py`

**Interfaces:**
- Consumes: `RecentProjectsStore`, `resolve_data_dir`, `RecentProjectRecord`
- Produces:
  - `ProjectRegistry(..., recent_path: Path | None = None)` — when `None`, skip recent persistence (existing tests stay clean)
  - `registry.recent() -> list[RecentProjectRecord]`
  - `GET /api/projects/recent` → `list[RecentProjectRecord]`
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

### Task 3: Frontend API helper + RecentProjectsList

**Files:**
- Modify: `apps/web/src/features/projects/project-api.ts`
- Create: `apps/web/src/components/repository/RecentProjectsList.tsx`
- Create: `apps/web/tests/recent-projects-list.test.tsx`

**Interfaces:**
- Consumes: `apiRequest`, `openProject`, `ProjectRecord`
- Produces:
  - `RecentProjectRecord { id, name, root, lastOpenedAt: string }`
  - `listRecentProjects(): Promise<RecentProjectRecord[]>`
  - `RecentProjectsList({ onOpened: (project: ProjectRecord) => void })`

- [ ] **Step 1: Write failing component tests**

`apps/web/tests/recent-projects-list.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const listRecentProjects = vi.fn()
const openProject = vi.fn()

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

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement API helper + component**

In `project-api.ts`:

```ts
export interface RecentProjectRecord {
  id: string
  name: string
  root: string
  lastOpenedAt: string
}

export function listRecentProjects() {
  return apiRequest<RecentProjectRecord[]>("/api/projects/recent")
}
```

`RecentProjectsList.tsx`:
- `useQuery({ queryKey: ["recent-projects"], queryFn: listRecentProjects })`
- `useMutation` calling `openProject(root)` (create false)
- On success: invalidate `["recent-projects"]` and `["active-project"]`, call `onOpened`
- On error: set alert text to `That folder is no longer available` when message mentions existing directory / not found; otherwise show `error.message`; invalidate `["recent-projects"]`
- Local `expanded` state; slice to 5 unless expanded
- Markup: section `.recent-projects` with quiet label `Recent`, list of buttons showing name + truncated path, View more / Show less
- Return `null` when not loading and `(data?.length ?? 0) === 0`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx`

Expected: PASS

---

### Task 4: Integrate empty states + mount explorer without project

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/components/repository/ProjectExplorer.tsx`
- Modify: `apps/web/src/components/editor/CodeWorkspace.tsx`
- Modify: `apps/web/src/components/repository/ProjectPathDialog.tsx`
- Modify: `apps/web/tests/project-explorer.test.tsx`
- Modify: `apps/web/tests/code-workspace.test.tsx` (or add empty-state cases)

**Interfaces:**
- Consumes: `RecentProjectsList`, `listRecentProjects` (via mocks in tests)
- Produces: both empty states render recent list; explorer sidebar visible with no project

- [ ] **Step 1: Write / extend failing integration tests**

In `project-explorer.test.tsx`, mock `listRecentProjects` to return one item; render `<ProjectExplorer project={null} ... />`; assert `Open project`, `New project`, and recent name are present.

In `code-workspace.test.tsx` (or new cases), render `CodeWorkspace` with `projectId={null}`; mock recent list; assert recent name appears under empty actions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tova/web exec vitest run tests/project-explorer.test.tsx tests/code-workspace.test.tsx`

Expected: FAIL (explorer empty state may not assert recents yet; App not required for unit tests)

- [ ] **Step 3: Wire components**

1. `App.tsx` — change explorer branch from `project.data ? <ProjectExplorer .../> : null` to always render:

```tsx
<ProjectExplorer
  project={project.data ?? null}
  activeFile={activeFile}
  onOpenFile={openFile}
  onProjectOpened={onProjectOpened}
/>
```

2. `ProjectExplorer` empty state — after `.project-explorer__empty-actions`, render:

```tsx
<RecentProjectsList onOpened={onProjectOpened} />
```

3. `CodeWorkspace` empty state — after `.code-workspace__empty-actions`, render:

```tsx
<RecentProjectsList
  onOpened={(project) => {
    onProjectOpened?.(project)
  }}
/>
```

4. `ProjectPathDialog` `onSuccess` — also:

```ts
await client.invalidateQueries({ queryKey: ["recent-projects"] })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tova/web exec vitest run tests/project-explorer.test.tsx tests/code-workspace.test.tsx tests/recent-projects-list.test.tsx`

Expected: PASS

---

### Task 5: Styling + verification

**Files:**
- Modify: `apps/web/src/styles/globals.css`

- [ ] **Step 1: Add compact styles**

Add after empty-action rules:

```css
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
}

.recent-projects__item {
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

.recent-projects__item:hover {
  background: color-mix(in oklab, var(--panel) 70%, #e8e8e4);
  border-color: var(--line);
}

.recent-projects__item strong {
  font-size: 12px;
  font-weight: 600;
  color: #2f302d;
}

.recent-projects__item small {
  overflow: hidden;
  color: var(--soft-text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-projects__more {
  justify-self: start;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--muted-text);
  font-size: 11px;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.recent-projects__error {
  margin: 0;
  color: var(--red);
  font-size: 11px;
}
```

Tune explorer empty state so the recent block sits cleanly under the buttons (`justify-items: center` on empty-state wrappers if needed; list itself left-aligned within fixed width).

- [ ] **Step 2: Run focused verification**

```bash
uv run --directory apps/api pytest tests/test_recent_projects.py tests/test_projects_api.py -v
pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx tests/project-explorer.test.tsx tests/code-workspace.test.tsx
```

Expected: all PASS

- [ ] **Step 3: Manual smoke (with running environments)**

1. Open web at `http://127.0.0.1:5173`
2. Open a project via dialog; close/restart API if needed and confirm recent appears (or open second project then clear active by restarting API without re-open — active is in-memory, recents persist)
3. Confirm ≤5 rows, View more with >5, one-click open works in both explorer and code workspace empty states

- [ ] **Step 4: Full verify if time permits**

```bash
pnpm verify
uv run python scripts/verify.py
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Backend file under app data dir + `TOVA_DATA_DIR` | Task 1–2 |
| Cap 20 / record on open | Task 1–2 |
| `GET /api/projects/recent` | Task 2 |
| Self-heal on failed missing open | Task 2 |
| Shared list, 5 + View more / Show less | Task 3 |
| Both empty states | Task 4 |
| Mount explorer with no project | Task 4 |
| Invalidate after dialog open | Task 4 |
| Clean compact styling | Task 5 |
| Hide when empty | Task 3 |
| Error copy | Task 3 |

## Placeholder scan

No TBD/TODO placeholders. Commit steps omitted per user preference (commit only when asked).
