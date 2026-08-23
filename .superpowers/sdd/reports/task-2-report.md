# Task 2 Report: Discriminated approval schemas

## Status: DONE

## Summary

Extended approval schemas with a discriminated union (`ApprovalRequestPayload`) supporting `CommandRequest` and `FileDeleteRequest`. Updated `ApprovalRegistry.request` to accept either payload type while keeping command approvals backward compatible via `kind: Literal["command"] = "command"`. Added `FileDeleteResult` schema for Task 3. Did not implement `ApprovedFileDeleteRunner`.

## Files changed

| File | Change |
|------|--------|
| `apps/api/tests/test_approval_kinds.py` | Created — 3 tests for kind defaults, round-trip, registry |
| `apps/api/app/schemas/approvals.py` | Added `kind` discriminator, `FileDeleteRequest`, `ApprovalRequestPayload`, `FileDeleteResult` |
| `apps/api/app/services/approvals.py` | `request` param renamed to `request: ApprovalRequestPayload` |

## TDD evidence

### Step 1 — RED (failing tests added)

Created `test_approval_kinds.py` with:

- `test_command_request_defaults_kind`
- `test_file_delete_request_round_trips`
- `test_registry_accepts_file_delete_requests`

### Step 2 — RED confirmed

```bash
cd "F:/Programming Projects/TOVA/apps/api"; uv run pytest tests/test_approval_kinds.py -v
```

```
ImportError: cannot import name 'FileDeleteRequest' from 'app.schemas.approvals'
```

### Step 3 — Implementation

**`schemas/approvals.py`**

- `CommandRequest.kind: Literal["command"] = "command"` (backward compatible default)
- New `FileDeleteRequest` with `kind="file_delete"`, `staff_display_name`, `path`, `purpose`
- `ApprovalRequestPayload = Annotated[CommandRequest | FileDeleteRequest, Field(discriminator="kind")]`
- `ApprovalRecord.request` typed as `ApprovalRequestPayload`
- `FileDeleteResult` added (unused until Task 3)

**`services/approvals.py`**

- Import `ApprovalRequestPayload` instead of `CommandRequest`
- `request(self, request: ApprovalRequestPayload)` — stores payload unchanged; `list_for_mission` still uses `record.request.mission_id` (present on both variants)

### Step 4 — GREEN confirmed

```bash
cd "F:/Programming Projects/TOVA/apps/api"; uv run pytest tests/test_approval_kinds.py tests/test_command_approvals.py -v
```

```
tests/test_approval_kinds.py::test_command_request_defaults_kind PASSED
tests/test_approval_kinds.py::test_file_delete_request_round_trips PASSED
tests/test_approval_kinds.py::test_registry_accepts_file_delete_requests PASSED
tests/test_command_approvals.py::test_command_waits_for_approval_then_runs_once PASSED
tests/test_command_approvals.py::test_rejection_timeout_output_cap_and_cwd_validation PASSED

5 passed in 0.38s
```

## Self-review

- **Scope:** Only the three files listed in the brief were modified.
- **Backward compatibility:** Existing `CommandRequest(...)` calls work without `kind`; default serializes as `"command"`.
- **Discriminator:** Pydantic round-trip restores `FileDeleteRequest` from dumped JSON (verified in test).
- **Registry:** No behavioral change for commands; file-delete payloads register and list by mission correctly.
- **Out of scope:** No `ApprovedFileDeleteRunner`, no API route changes, no agent_runner wiring.
- **Commits:** Skipped per instructions.

## Concerns

- **Type narrowing:** Callers accessing `ApprovalRecord.request.path` need runtime `kind == "file_delete"` checks or type guards; static checkers may warn until Task 3 wires the runner.
- **API serialization:** Frontend/event consumers will see `kind` on all approval payloads; downstream Task 4 should ensure UI handles both kinds.
