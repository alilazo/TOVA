# Task 1 Report: App data dir + RecentProjectsStore

## Status

**DONE**

## Summary

Implemented machine-local TOVA app data directory resolution and a JSON-backed `RecentProjectsStore` with upsert, cap-at-20, remove-by-root, and `RecentProjectRecord` schema. Persistence primitives only — no API routes or registry wiring (deferred to Task 2).

## Brief Source Note

The file at `.superpowers/sdd/task-1-brief.md` contained a stale TeamFloor task (clickable file chips). Implementation followed **Task 1** from `docs/superpowers/plans/2026-07-30-recent-projects.md`, which matches the user assignment.

## TDD Evidence

### RED — Step 2

Command:

```bash
uv run --directory "F:/Programming Projects/TOVA/apps/api" pytest tests/test_recent_projects.py -v
```

Result: **FAIL** (exit code 2)

```
ModuleNotFoundError: No module named 'app.services.app_data'
```

Expected failure: modules not yet created.

### GREEN — Step 4

Command:

```bash
uv run --directory "F:/Programming Projects/TOVA/apps/api" pytest tests/test_recent_projects.py -v
```

Result: **PASS** (exit code 0)

```
tests/test_recent_projects.py::test_resolve_data_dir_honors_tova_data_dir PASSED
tests/test_recent_projects.py::test_record_upserts_moves_to_front_and_caps_at_20 PASSED
tests/test_recent_projects.py::test_remove_root_deletes_matching_entry PASSED
3 passed in 0.37s
```

### Full workspace verify

Command:

```bash
uv run python scripts/verify.py
```

Result: **PASS** (exit code 0) — frontend lint/typecheck/test/build, backend ruff, mypy, and all 100 pytest tests including 3 new recent-projects tests.

## Changes

### Created: `apps/api/app/services/app_data.py`

- `resolve_data_dir(env)` — honors `TOVA_DATA_DIR` override; platform defaults for Windows (`%LOCALAPPDATA%/TOVA`), macOS, and Linux.

### Created: `apps/api/app/services/recent_projects.py`

- `RecentProjectsStore(path, *, max_entries=20)` with:
  - `list()` — newest-first by `lastOpenedAt`
  - `record(project, *, opened_at=None)` — upsert by normalized root, move to front, cap entries
  - `remove_root(root)` — delete matching entry, return whether removed
- JSON format: `{ "version": 1, "projects": [...] }` with ISO-8601 UTC `lastOpenedAt`
- Root normalization: `Path.resolve()` when exists; else `expanduser` + `normcase` on Windows
- Best-effort write with parent dir creation; logs warning on I/O failure

### Modified: `apps/api/app/schemas/projects.py`

- Added `RecentProjectRecord(id, name, root, lastOpenedAt: datetime)`

### Created: `apps/api/tests/test_recent_projects.py`

- `test_resolve_data_dir_honors_tova_data_dir`
- `test_record_upserts_moves_to_front_and_caps_at_20`
- `test_remove_root_deletes_matching_entry`

## Self-Review

| Check | Result |
|-------|--------|
| Scope limited to Task 1 | Yes — no ProjectRegistry, API, or frontend |
| TDD order (RED then GREEN) | Yes |
| `TOVA_DATA_DIR` override | Yes |
| Cap at 20 entries | Yes |
| Upsert moves to front | Yes |
| `remove_root` self-heal primitive | Yes |
| Timezone-aware UTC datetimes | Yes |
| Files under ~300 lines | Yes (app_data 20, recent_projects 115, tests 45) |
| Full verify passes | Yes |
| Commits | None (per instructions) |

## Concerns

- Stale `.superpowers/sdd/task-1-brief.md` should be updated to match the Recent Projects plan to avoid future agent confusion.
- `RecentProjectsStore.list` method name shadows builtin `list` for mypy; resolved via module-level `RecentProjectList` type alias — no runtime impact.

## Files Touched

- `apps/api/app/services/app_data.py` (new)
- `apps/api/app/services/recent_projects.py` (new)
- `apps/api/app/schemas/projects.py` (modified)
- `apps/api/tests/test_recent_projects.py` (new)
