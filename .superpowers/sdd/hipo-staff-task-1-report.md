# Task 1: StaffDirectoryScreen Behavior Report

## Status

DONE_WITH_CONCERNS

## Files Changed

- Created `apps/web/tests/staff-directory-screen.test.tsx`
- Created `apps/web/src/components/staff/StaffDirectoryScreen.tsx`

## TDD Evidence

### RED

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result: FAIL as expected before implementation.

Relevant failure:

```text
Error: Failed to resolve import "@/components/staff/StaffDirectoryScreen" from "tests/staff-directory-screen.test.tsx". Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

### GREEN

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result: PASS after implementation.

Relevant output:

```text
Test Files  1 passed (1)
Tests  4 passed (4)
```

## Additional Verification

Command:

```bash
pnpm verify
```

Result: FAILED during the full web test suite after lint and typecheck completed successfully.

Relevant failure:

```text
tests/navigation-rail.test.tsx > NavigationRail > disables Search and Team Floor when no project is open
AssertionError: expected "vi.fn()" to be called with arguments: [ 'missions' ]
ReferenceError: ResizeObserver is not defined
Test Files  1 failed | 28 passed (29)
Tests  1 failed | 135 passed (136)
```

The failure is in `tests/navigation-rail.test.tsx`, outside Task 1's changed files. Because `pnpm verify` stops at tests, the build step did not run.

IDE diagnostics for the two edited files reported no linter errors.

## Implementation Summary

- Added `StaffDirectoryScreen` with the required props: `staff`, `isLoading`, and `error`.
- Renders the directory as ID badge buttons with staff count, role, description, avatar, and availability text.
- Uses `PixelAvatar` for every badge portrait, preserving existing stock/custom/pixel avatar fallback behavior.
- Uses the existing `StaffProfileDialog` when a badge is opened.
- Adds search over display name, name, role, role key, department, seniority, description, status, and tags.
- Handles loading, error, empty staff, and empty search states.
- Keeps the component standalone and does not wire it into routing or `App.tsx`.
- Adds only class names and structure; no CSS styling was added.

## Self-Review

- Confirmed no git commits were created.
- Confirmed Task 2 scope was avoided: no Staff tab enablement, no routing, no app wiring.
- Confirmed Task 3 scope was avoided: no visual CSS changes.
- Confirmed component reuses `StaffProfileDialog` and `PixelAvatar`.
- Adjusted the first implementation after GREEN failed because exit animation left filtered cards in the DOM and duplicated selected profile text while the dialog was open.

## Concerns

- `pnpm verify` is not fully green because the existing navigation rail test fails with `ResizeObserver is not defined` and a missing `onChange("missions")` call. This appears outside the Task 1 change set, but it prevents a full repository verification pass.

## Review Fix Follow-Up - 2026-07-30

Status: PASS.

Fix report:

- Moved first-open drop tracking in `apps/web/src/components/staff/StaffDirectoryScreen.tsx` out of the render/state-initializer path and into a commit-time effect.
- Added a regression test that simulates an abandoned render before the first committed mount, proving the drop animation remains enabled for the committed mount.
- Expanded the staff directory search test to cover name, role, department, tags, and description with representative values.
- No git commits were created.

Focused test:

```text
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx

 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web


 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  17:20:52
   Duration  3.42s (transform 167ms, setup 313ms, import 1.08s, tests 523ms, environment 1.27s)
```

## Role Search Review Fix - 2026-07-30

Status: PASS.

Fix report:

- Changed the staff directory role search assertion from `frontend` to `front-end` so it depends on the visible role text `Front-End Developer` rather than `roleKey`.
- Preserved the broader search coverage for display name/name, role, department, tags, and description.
- No git commits were created.

Focused test:

```text
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx

 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web


 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  17:25:19
   Duration  3.45s (transform 186ms, setup 323ms, import 1.12s, tests 508ms, environment 1.28s)
```
