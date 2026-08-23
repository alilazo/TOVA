# Task 2 Report: Wire ProjectRegistry + GET /api/projects/recent

## Status

**DONE**

## Summary

Wired `RecentProjectsStore` into `ProjectRegistry.open`, exposed `GET /api/projects/recent` (registered before `/{project_id}`), added `Settings.data_dir` (`TOVA_DATA_DIR`), and verified with TDD API/registry tests.

## TDD Evidence

### RED — Step 2

Command:

```bash
uv run --directory apps/api pytest tests/test_recent_projects.py -v
```

Result: **FAIL** (exit code 1)

```
TypeError: ProjectRegistry.__init__() got an unexpected keyword argument 'recent_path'
```

Expected failure: no `recent_path` param, no endpoint, no recording.

### GREEN — Step 4

Command:

```bash
uv run --directory apps/api pytest tests/test_recent_projects.py tests/test_projects_api.py -v
```

Result: **PASS** (exit code 0)

```
11 passed in 0.86s
```

## Changes

### Modified: `apps/api/app/core/config.py`

- Added `data_dir: str | None = None` (env: `TOVA_DATA_DIR` via existing `env_prefix`).

### Modified: `apps/api/app/services/projects.py`

- Added `recent_path: Path | None = None` to `ProjectRegistry.__init__`; builds `RecentProjectsStore` when set.
- `open()`: records on success (new and re-opened projects); calls `_remove_stale_recent` before raising when path missing/not a directory.
- Added `recent() -> list[RecentProjectRecord]` (empty when no store).
- Added `_record_recent` / `_remove_stale_recent` helpers with best-effort OSError handling.
- Added `from __future__ import annotations` to avoid `list` method shadowing builtin in return annotations.

### Modified: `apps/api/app/api/projects.py`

- Production registry uses `recent_path = (settings.data_dir or resolve_data_dir()) / "recent-projects.json"`.
- Added `GET /api/projects/recent` before `GET /api/projects/{project_id}`.

### Modified: `apps/api/tests/test_recent_projects.py`

- Appended API/registry integration tests from brief.
- **Deviation:** `test_failed_open_removes_stale_recent_entry` uses `shutil.rmtree(root)` instead of `root.rmdir()` because `open()` creates `.tova/project.json`, leaving the directory non-empty on Windows.

## Self-Review

- **Brief compliance:** All wiring steps implemented; route ordering correct; `recent_path=None` preserves existing `ProjectRegistry()` test behavior.
- **Task 1 interfaces:** Consumed unchanged — no redesign of `RecentProjectsStore`, `resolve_data_dir`, or `RecentProjectRecord`.
- **Self-heal:** Stale entries removed on failed open when directory missing/invalid.
- **Scope:** Focused diff across four files; no unrelated changes.

## Concerns

1. **Test deviation:** Brief used `root.rmdir()` but fails after metadata creation; switched to `shutil.rmtree`.
2. **`RecentProjectsStore.record` swallows OSError internally** — registry's try/except on record is defensive per brief but unlikely to trigger.

## Files Touched

- `apps/api/app/core/config.py`
- `apps/api/app/services/projects.py`
- `apps/api/app/api/projects.py`
- `apps/api/tests/test_recent_projects.py`

## Commits

None (per brief; workspace has no `.git`).
