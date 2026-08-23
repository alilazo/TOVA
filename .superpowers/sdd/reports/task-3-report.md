# Task 3 Report: ApprovedFileDeleteRunner

## Status: DONE

## Summary

Added `ApprovedFileDeleteRunner` mirroring `ApprovedCommandRunner`: validates file existence before requesting approval, emits `approval.requested` / `approval.accepted` / `approval.rejected` via `event_sink`, and unlinks the file on acceptance. Does not emit `staff.file.deleted` (Task 4). No agent_runner or staff-permission wiring.

## Files changed

| File | Change |
|------|--------|
| `apps/api/tests/test_file_delete_approvals.py` | Created — 2 tests for approval flow and rejection |
| `apps/api/app/tools/file_delete.py` | Created — `ApprovedFileDeleteRunner` |

## TDD evidence

### Step 1 — RED (failing tests added)

Created `test_file_delete_approvals.py` with:

- `test_delete_waits_for_approval_then_unlinks`
- `test_delete_rejection_leaves_file`

### Step 2 — RED confirmed

```bash
cd "F:/Programming Projects/TOVA/apps/api"; uv run pytest tests/test_file_delete_approvals.py -v
```

```
ModuleNotFoundError: No module named 'app.tools.file_delete'
```

### Step 3 — Implementation

**`tools/file_delete.py`**

- Pre-flight: `workspace.resolve(path, must_exist=True)` + `is_file()` check; returns `FileDeleteResult` with `error` on failure (no approval created)
- Approval flow: `request` → `approval.requested` → `wait_for_decision` → accept/reject events
- On accept: `EXECUTING` → `workspace.delete` → `EXECUTED` (or `FAILED` on delete error)
- No `staff.file.deleted` event (deferred to Task 4 agent runner)

### Step 4 — GREEN confirmed

```bash
cd "F:/Programming Projects/TOVA/apps/api"; uv run pytest tests/test_file_delete_approvals.py -v
```

```
tests/test_file_delete_approvals.py::test_delete_waits_for_approval_then_unlinks PASSED
tests/test_file_delete_approvals.py::test_delete_rejection_leaves_file PASSED

2 passed in 0.12s
```

## Self-review

- **Scope:** Only the two files listed in the brief were created; no agent_runner or permission changes.
- **Validation:** Missing/non-file paths return early with `error` and empty `approval_id`; no recursive directory delete.
- **Events:** Only `approval.*` events emitted; `staff.file.deleted` intentionally omitted.
- **Pattern:** Mirrors `ApprovedCommandRunner` structure (`event_sink`, status transitions, rejection handling).
- **Commits:** Skipped per instructions.

## Concerns

- **Missing-file test coverage:** Brief tests do not cover pre-approval validation errors (missing path, directory target); could add in Task 4 if agent_runner needs explicit behavior assertions.
- **Race after approval:** File could disappear between approval and delete; `workspace.delete` failure path sets `FAILED` but no retry — acceptable for v1.
- **Task 4 dependency:** Agent runner must wire runner, emit `staff.file.deleted`, and enforce staff delete permissions.
