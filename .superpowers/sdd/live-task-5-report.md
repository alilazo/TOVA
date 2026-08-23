# Task 5 report: replace frontend staff fixtures with `/api/staff`

## Summary

- Added `getStaffProfiles()` as the frontend roster boundary for `GET /api/staff`.
- Mapped every safe API field from snake case to the existing `StaffProfile` camel-case domain model and normalized `pixel/<name>` avatars.
- Added one TanStack Query roster query in `App` with `queryKey: ["staff"]` and `staleTime: 60_000`.
- Prop-threaded the API roster through Engineering Team, Activity Feed, Code Workspace, Team Floor, Live Editor, Work Log selection, and Handoff consumers.
- Added truthful Engineering Team loading and API error states. Empty query data remains an empty roster; no fixture fallback exists.
- Kept the Work Log presentation unchanged. Its temporary operational summaries moved behind `getWorkLogForStaff()` so production no longer imports the staff fixture module; Task 6 can replace that data boundary.

## Files

Created:

- `apps/web/src/features/staff/staff-api.ts`
- `apps/web/src/features/staff/work-log-data.ts`
- `apps/web/tests/staff-api.test.ts`
- `apps/web/tests/code-workspace.test.tsx`

Modified:

- `apps/web/src/app/App.tsx`
- `apps/web/src/components/activity/ActivityFeed.tsx`
- `apps/web/src/components/activity/ActivityFeedRow.tsx`
- `apps/web/src/components/editor/CodeWorkspace.tsx`
- `apps/web/src/components/staff/EngineeringTeamPanel.tsx`
- `apps/web/src/components/team-floor/TeamFloor.tsx`
- `apps/web/src/components/team-floor/TeamFloorLiveEditor.tsx`
- `apps/web/tests/core-components.test.tsx`
- `apps/web/tests/team-floor.test.tsx`
- `apps/web/tests/team-floor-live-editor.test.tsx`

Reviewed but unchanged:

- `apps/web/src/types/domain.ts` already defined the complete strict `StaffProfile` and `StaffStatus` domain contracts required by this task.
- `apps/web/src/components/handoff/HandoffOverlay.tsx` was already prop-driven and required no internal change.
- `apps/web/tests/mission-interactions.test.tsx` already passed an explicit roster to `HandoffOverlay`.

## RED evidence

1. `pnpm --filter @tova/web exec vitest run tests/staff-api.test.ts`
   - Failed because `@/features/staff/staff-api` did not exist.
2. Re-ran the same focused test with a minimal empty implementation.
   - Failed the intended mapping assertion: expected the fully mapped Alex profile, received `[]`.
3. `pnpm --filter @tova/web exec vitest run tests/core-components.test.tsx tests/team-floor.test.tsx tests/team-floor-live-editor.test.tsx tests/code-workspace.test.tsx`
   - 4 files failed; 5 behavior tests failed and 9 passed.
   - Failures proved Activity Feed, Engineering Team states, Team Floor, Live Editor, and Code Workspace still depended on global fixture behavior.

## GREEN evidence

1. `pnpm --filter @tova/web exec vitest run tests/staff-api.test.ts`
   - 1 file passed; 1 test passed.
2. `pnpm --filter @tova/web exec vitest run tests/staff-api.test.ts tests/core-components.test.tsx tests/team-floor.test.tsx tests/team-floor-live-editor.test.tsx tests/code-workspace.test.tsx`
   - 5 files passed; 15 tests passed.

## Search evidence

- `rg "staff-fixtures" apps/web/src`
  - No matches.
- Search for `queryKey: ["staff"]` in `apps/web/src`
  - Exactly one match, in `apps/web/src/app/App.tsx`.
- Search for roster prop threading found `staff={roster}` at every top-level consumer and explicit forwarding to nested Activity Feed Row and Team Floor Live Editor consumers.

## Verification

Final command:

```powershell
pnpm verify
```

Result: exit code 0.

- ESLint passed with zero warnings.
- Strict TypeScript typecheck passed.
- Vitest passed: 10 files, 51 tests.
- Production build passed: 2,477 modules transformed.
- IDE diagnostics reported no errors for changed source and test files.

## Self-review

- Confirmed the API request path is exactly `/api/staff`.
- Confirmed identity, role, permission, tool, and tag fields are all mapped.
- Confirmed avatar normalization removes only a leading `pixel/`.
- Confirmed roster server state is owned only by TanStack Query in `App`; Zustand remains unchanged.
- Confirmed loading and error UI never claims profiles are synced.
- Confirmed consumers receive API-derived props and no production component imports a global roster.
- Confirmed no credential, hidden profile section, permission object, or source path is requested or exposed.
- Confirmed no Git commands or commits were used.

## Concerns

- Work Log summaries remain transitional static operational data in `work-log-data.ts`, intentionally preserving the current UI until Task 6. Staff identity and metadata used by the drawer now come only from the API roster.

## Review remediation: source-of-truth and empty states

### Summary

- Added an accessible successful-empty Engineering Team state: `No staff profiles available.`
- Suppressed `Staff profiles synced` unless at least one API profile exists.
- Removed the synthetic hardcoded Alex welcome event; an empty runtime activity list now remains empty through `App`.
- Changed transitional Work Log summary selection from hardcoded staff IDs to API-provided `roleKey` values and replaced the Ethan-specific handoff sentence with identity-neutral wording.

### RED evidence

Command:

```powershell
pnpm --filter @tova/web exec vitest run tests/core-components.test.tsx tests/app-staff-source.test.tsx tests/work-log-data.test.ts
```

Result: exit code 1; 3 files failed, 3 tests failed, 6 passed.

- Engineering Team empty-state test could not find an accessible `status` and found the incorrect synced footer.
- App source-of-truth test expected zero activity items but received one synthetic welcome event.
- Work Log test expected the researcher summary to follow an API-derived role under a different staff ID but received the generic fallback.

### GREEN evidence

Focused command:

```powershell
pnpm --filter @tova/web exec vitest run tests/core-components.test.tsx tests/app-staff-source.test.tsx tests/work-log-data.test.ts
```

Result: exit code 0; 3 files passed, 9 tests passed.

Full frontend commands:

```powershell
pnpm --filter @tova/web test
pnpm --filter @tova/web typecheck
pnpm --filter @tova/web lint
```

Results:

- Full Vitest suite passed: 12 files, 54 tests.
- Strict TypeScript typecheck passed.
- ESLint passed with zero warnings.

### Search evidence and self-review

- Search of `App.tsx` found no `Alex is ready`, `staff_alex`, `staff_maya`, `staff_ethan`, or `Ethan`.
- Search of `work-log-data.ts` found no hardcoded staff IDs or `Ethan`.
- The successful-empty panel state is distinct from loading and error, uses `role="status"`, and never renders the synced footer.
- No Git commands or commits were used.
