# Task 4 Report: Staff permissions, agent runner routing, prompts

## Status: DONE

## Summary

Wired `filesystem_delete` into staff YAML, gated `repository.delete` in `AgentRunner._allowed_tools`, and routed delete through `ApprovedFileDeleteRunner` (approval-first) before the generic `repository.*` → `tools.execute` path. On success the runner emits `staff.file.deleted`. Prompts instruct models to use delete instead of emptying files. Ava keeps `filesystem_write: false` with `filesystem_delete: true` only.

## Files changed

| File | Change |
|------|--------|
| `apps/api/tests/test_repository_delete_agent.py` | Created — Ava approve-then-delete vs Maya deny |
| `HiPo-Staff/staff/ethan-software-engineer.md` | `filesystem_delete: true` + `repository.delete` tool |
| `HiPo-Staff/staff/lina-frontend-developer.md` | same |
| `HiPo-Staff/staff/noah-backend-developer.md` | same |
| `HiPo-Staff/staff/ava-qa-tester.md` | `filesystem_delete: true`, `repository.delete`; write stays false |
| `HiPo-Staff/staff/alex-project-coordinator.md` | `filesystem_delete: false` |
| `HiPo-Staff/staff/maya-researcher.md` | `filesystem_delete: false` |
| `HiPo-Staff/staff/dr-rao-advisor.md` | `filesystem_delete: false` |
| `apps/api/app/orchestration/agent_runner.py` | allow + approval route + emit |
| `apps/api/app/orchestration/prompts.py` | delete guidance |
| `apps/api/app/schemas/events.py` | `staff.file.deleted` Literal |

## TDD evidence

### Step 1 — RED (failing test added)

Created `test_repository_delete_agent.py` importing `FakeProvider` / `one_assignment_plan` from `tests.test_agent_runtime`.

### Step 2 — RED confirmed

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_delete_agent.py -v
```

```
AssertionError: assert None is True
# ava.permissions.get("filesystem_delete") missing
1 failed in 0.34s
```

### Step 3–4 — Implementation

- Staff YAML permission matrix per design
- `_allowed_tools`: add `repository.delete` iff `filesystem_delete is True`
- `_execute_tool`: handle `repository.delete` before generic `repository.*` branch; build `FileDeleteRequest` with `staff_display_name`; run `ApprovedFileDeleteRunner`; emit `staff.file.deleted` with `file_path` + `title` on success
- `prompts.py`: require `repository.delete` for removals
- `events.py`: API `EventType` includes `staff.file.deleted`

### Step 5 — GREEN confirmed

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_delete_agent.py tests/test_agent_runtime.py tests/test_file_delete_approvals.py -v
```

```
12 passed in 0.44s
```

## Self-review

- **Ava:** `filesystem_write: false`, `filesystem_delete: true`, tools include `repository.delete`.
- **Routing:** Delete never goes through bare `tools.execute` without approval.
- **Commits:** None (per instructions).
- **Web mirror:** Event Literal added on API only; Task 5 still owns web `events.ts` / reducer sync.

## Concerns

- Web event contract still lacks `staff.file.deleted` until Task 5 — API/web temporarily out of sync by design of this split.
- `RepositoryToolRegistry` still exposes `_delete` via `tools.execute`; safe only because agent_runner short-circuits first. Direct registry callers could still bypass approval if something else calls execute.

## Important review fix — `file_mutations` after delete

### Finding

Successful `repository.delete` did not increment `file_mutations` because `_FILE_MUTATION_TOOLS` was only `{repository.write, repository.apply_patch}`. Write-capable staff who only deleted then summarized hit `needs_write` remediation and could fail with “without repository file mutations.”

### Verification before change

- `_FILE_MUTATION_TOOLS` is used solely for post-success counting (`call.name in _FILE_MUTATION_TOOLS and tool_result.get("ok")`).
- Delete branch returns `{"ok": True, ...}` on approved success and runs through the same increment site after `_execute_tool`.

### Fix

Added `repository.delete` to `_FILE_MUTATION_TOOLS` in `apps/api/app/orchestration/agent_runner.py`. Ava remains `filesystem_write: false`.

### Test

`test_write_capable_completes_after_approved_delete_without_write` in `tests/test_repository_delete_agent.py`: Ethan deletes (approved) then summarizes; completes without write/patch; no `staff.file.created` / `staff.file.updated`.

### RED

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_delete_agent.py::test_write_capable_completes_after_approved_delete_without_write -v
```

```
IndexError: pop from empty list
# needs_write remediation consumed an extra model turn after successful delete
1 failed in 0.42s
```

### GREEN

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_delete_agent.py tests/test_agent_runtime.py -v
```

```
11 passed in 0.45s
```
