# Task 6 Report: Approval dialog for file deletes

## Status: DONE

## Summary

Extended `ApprovalRequest` to a discriminated union on `request.kind` (`command` | `file_delete`) and branched `CommandApprovalDialog` so file deletes show the delete-specific title, body, purpose, and **Approve and delete** button while command approvals keep existing markup (missing `kind` treated as command).

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/features/mission/mission-api.ts` | Discriminated `ApprovalRequestPayload` (`CommandApprovalPayload` / `FileDeleteApprovalPayload`) |
| `apps/web/src/components/approvals/CommandApprovalDialog.tsx` | Branch on `kind === "file_delete"` for title, description, body, primary button |
| `apps/web/tests/command-approval-dialog.test.tsx` | New UI test for file-delete copy |

## TDD evidence

### Step 1 — RED (failing test added)

Created `apps/web/tests/command-approval-dialog.test.tsx` asserting delete title, “Ava wants to delete”, path `hello.html`, and **Approve and delete**.

### Step 2 — RED confirmed

```bash
pnpm --filter @tova/web exec vitest run tests/command-approval-dialog.test.tsx -v
```

```
FAIL — Unable to find text: File delete approval required
Uncaught TypeError: Cannot read properties of undefined (reading 'join')
(command-only dialog accessed args on file_delete payload)
1 failed
```

### Step 3 — Implementation

- Types: `kind?: "command"` vs `kind: "file_delete"` with `staff_display_name` + `path`
- Dialog: delete copy per spec; command UI unchanged when kind is missing/command

### Step 4 — GREEN confirmed

```bash
pnpm --filter @tova/web exec vitest run tests/command-approval-dialog.test.tsx tests/app-staff-source.test.tsx
```

```
Test Files  2 passed (2)
Tests  3 passed (3)
```

### Step 5 — Commit

Skipped (no commit requested).

## Concerns

- No regression test that command approval copy still renders when `kind` is missing or `"command"`.
- Dialog still named `CommandApprovalDialog`; rename/generalize left for a later cleanup if desired.
