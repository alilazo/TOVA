# Task 2 Report: App Integration and Panel Routing

## Status

Implemented HiPo Staff app routing and panel integration without backend changes or staff directory CSS changes.

## RED Evidence

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/app-panel-transition.test.tsx tests/app-staff-directory.test.tsx tests/navigation-rail.test.tsx
```

Result: failed as expected after test harness stabilization.

- Test files: 1 failed, 2 passed.
- Tests: 1 failed, 5 passed.
- Expected failure: `tests/app-staff-directory.test.tsx` could not find `[data-testid="staff-directory"]`, showing `activePanel === "staff"` still rendered the workspace path instead of the staff directory.

Notes:

- Initial RED attempts surfaced test harness gaps unrelated to the product behavior: `TopBar` model dialog imports and Radix tooltip `ResizeObserver` behavior in jsdom. Those were narrowed with test-only mocks/stubs before accepting RED.

## GREEN Evidence

Focused command:

```bash
pnpm --filter @tova/web exec vitest run tests/app-panel-transition.test.tsx tests/app-staff-directory.test.tsx tests/navigation-rail.test.tsx tests/staff-directory-screen.test.tsx
```

Result: passed.

- Test files: 4 passed.
- Tests: 11 passed.

Full frontend verification:

```bash
pnpm verify
```

Result: passed.

- `pnpm --filter @tova/web lint`: passed.
- `pnpm --filter @tova/web typecheck`: passed.
- `pnpm --filter @tova/web test`: 30 files passed, 140 tests passed.
- `pnpm --filter @tova/web build`: passed.

## Files Changed

- `apps/web/src/components/shell/WorkspacePanelSwitch.tsx`
  - Added exported `WorkspacePanelKey = "team-floor" | "staff" | "workspace"`.
  - Updated props to consume the exported key type.
- `apps/web/src/components/shell/AppShell.tsx`
  - Added optional `hideTeamPanel?: boolean`.
  - Preserved default behavior by rendering `teamPanel` unless `hideTeamPanel` is true.
- `apps/web/src/app/App.tsx`
  - Imported `StaffDirectoryScreen`.
  - Added staff-aware `workspacePanelKey`.
  - Routed `activePanel === "staff"` to `StaffDirectoryScreen`.
  - Passed `hideTeamPanel={activePanel === "staff"}` to `AppShell`.
  - Left the no-project redirect scoped to Search and Team Floor only.
- `apps/web/tests/app-panel-transition.test.tsx`
  - Added coverage for the `staff` workspace panel key.
- `apps/web/tests/app-staff-directory.test.tsx`
  - Added app integration coverage for staff rendering in the main workspace.
  - Added coverage that staff remains available without a project.
  - Verified the right Engineering Team panel is hidden while staff is active.
- `apps/web/tests/navigation-rail.test.tsx`
  - Added coverage that `HiPo Staff` remains enabled without a project.
  - Added a local `ResizeObserver` stub for Radix tooltip behavior in jsdom.
- `apps/web/tests/staff-directory-screen.test.tsx`
  - Fixed existing lint/typecheck issues in the framer-motion mock and throw helper so full verification can pass.

## Concerns

- `pnpm verify` build completed with the existing Vite warning that one chunk is larger than 700 kB after minification.
- The new app integration test uses focused component mocks to isolate routing and shell behavior; the full test suite and build still passed after the integration changes.

## Self-Review

- Confirmed staff directory routing is frontend-only and does not touch backend APIs.
- Confirmed no staff directory CSS was added.
- Confirmed `HiPo Staff` remains enabled when no project is open.
- Confirmed existing no-project disabled behavior for Search and Team Floor is preserved.
- Confirmed `AppShell` keeps existing callers compatible because `hideTeamPanel` defaults to false.
- Confirmed the right Engineering Team panel is hidden only for the staff panel.
- No git commits were made.
