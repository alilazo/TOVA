# Task 1 Report: `ProjectWorkspace.delete` + registry tool

## Status: DONE

## Summary

Implemented sandboxed single-file delete on `ProjectWorkspace`, wired it through `RepositoryToolRegistry` as `repository.delete`, and registered the LLM tool definition. No approval gating was added (deferred to Tasks 3–4).

## Files changed

| File | Change |
|------|--------|
| `apps/api/tests/test_repository_tools.py` | Added 2 delete tests |
| `apps/api/app/tools/repository.py` | Added `ProjectWorkspace.delete` |
| `apps/api/app/tools/registry.py` | Added `_delete` handler + registry mapping |
| `apps/api/app/orchestration/tool_definitions.py` | Added `repository.delete` tool definition |

## TDD evidence

### Step 1 — RED (failing tests added)

Added:

- `test_deletes_single_file_and_rejects_directories` — verifies file unlink + directory rejection
- `test_registry_delete_tool_unlinks_file` — verifies registry tool execution

### Step 2 — RED confirmed

```bash
cd "F:/Programming Projects/TOVA/apps/api"; uv run pytest tests/test_repository_tools.py -k "delete" -v
```

```
tests/test_repository_tools.py::test_deletes_single_file_and_rejects_directories FAILED
tests/test_repository_tools.py::test_registry_delete_tool_unlinks_file FAILED

FAILED ... AttributeError: 'ProjectWorkspace' object has no attribute 'delete'
FAILED ... AssertionError: assert False is True  (unknown_tool)

2 failed, 7 deselected in 0.37s
```

### Step 3 — Implementation

**`repository.py`** — `delete(relative_path)` resolves path, rejects non-files, unlinks, returns `{"path": posix_relative}`.

**`registry.py`** — `"repository.delete": self._delete` in handlers map; `_delete` validates `path` via `PathInput`, calls workspace delete, returns `ToolExecutionResult`.

**`tool_definitions.py`** — `repository.delete` tool with required `path` and `purpose` parameters (purpose consumed by approval runner in later tasks).

### Step 4 — GREEN confirmed

```bash
cd "F:/Programming Projects/TOVA/apps/api"; uv run pytest tests/test_repository_tools.py -k "delete" -v
```

```
tests/test_repository_tools.py::test_deletes_single_file_and_rejects_directories PASSED
tests/test_repository_tools.py::test_registry_delete_tool_unlinks_file PASSED

2 passed, 7 deselected in 0.14s
```

## Self-review

- **Scope:** Changes limited to the four files listed in the brief.
- **No approval logic:** Registry executes delete immediately; `purpose` is schema-only for future approval runner.
- **No recursive delete:** `is_file()` guard rejects directories; only single-file `unlink()`.
- **Sandbox:** Reuses existing `resolve()` for traversal/exclusion checks.
- **Conventions:** Matches existing `read`/`write` error patterns and registry handler structure.
- **Commits:** Skipped per instructions.

## Concerns

None.
