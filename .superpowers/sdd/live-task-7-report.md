# Live Task 7 Report

## Status

Implemented Task 7 without Git operations or commits.

- Handoff overlays now expose `Dismiss`; dismissal is App-local state keyed to the current handoff ID and does not invoke a runtime/backend control. A new handoff ID is visible normally.
- Sidebar search, missions, Team Floor, staff, and settings panels now contain real session/roster/runtime data or explicit empty states.
- Production simulation modules, static staff/repository fixtures, the demo seed script, and `FakeModelProvider` were removed. The `ModelProvider` protocol remains.
- Test data needed by component tests now lives only under `apps/web/tests/fixtures`.

## Production files changed

- `apps/web/src/components/handoff/HandoffOverlay.tsx`
  - Renamed `onSkip` to `onDismiss`.
  - Replaced `Skip handoff` with `Dismiss`.
  - Dialog close and button dismissal use the local callback.
- `apps/web/src/app/App.tsx`
  - Added `dismissedHandoffId` local state and derives `visibleHandoff`.
  - Passes the queried roster, runtime status, and current live mission to the sidebar.
  - Does not send a mission control when a handoff is dismissed.
- `apps/web/src/components/shell/WorkspaceSidebar.tsx`
  - Removed fabricated repository results, mission counts, staff counts, and runtime claims.
  - Added exact honest search and mission empty messages.
  - Derives staff totals/coordinator/specialist counts from the queried roster.
  - Shows LM Studio state and selected model from runtime status.
  - Uses the live current mission for mission/Team Floor content, otherwise explicit empty states.
- `apps/api/app/providers/base.py`
  - Removed `FakeModelProvider`; retained the typed `ModelProvider` protocol.

## Production files deleted

- `apps/web/src/features/mission/use-demo-runtime.ts`
- `apps/web/src/features/mission/demo-events.ts`
- `apps/web/src/features/repository/repository-fixtures.ts`
- `apps/web/src/features/staff/staff-fixtures.ts`
- `scripts/seed_demo.py`

## Tests changed or added

- Added `apps/web/tests/production-source-audit.test.ts`.
- Added test-only `apps/web/tests/fixtures/staff.ts`.
- Updated `apps/web/tests/mission-interactions.test.tsx`.
- Updated `apps/web/tests/core-components.test.tsx`.
- Updated `apps/web/tests/app-staff-source.test.tsx`.
- Migrated fixture imports in:
  - `apps/web/tests/team-floor.test.tsx`
  - `apps/web/tests/team-floor-live-editor.test.tsx`
  - `apps/web/tests/code-workspace.test.tsx`

## RED evidence

1. `pnpm --filter @tova/web exec vitest run tests/mission-interactions.test.tsx`
   - Exit 1.
   - 1 failed, 10 passed.
   - Expected failure: `Skip handoff` was still present instead of `Dismiss`.
2. `pnpm --filter @tova/web exec vitest run tests/production-source-audit.test.ts`
   - Exit 1.
   - 2 failed.
   - File audit found all five files scheduled for deletion.
   - Term audit found `FakeModelProvider`, simulated/virtual sidebar copy, `project_orion`, and `evt_demo`.
3. `pnpm --filter @tova/web exec vitest run tests/core-components.test.tsx tests/app-staff-source.test.tsx`
   - Exit 1.
   - 4 failed, 8 passed.
   - Expected failures covered persistent handoff visibility, fabricated search/staff/settings content, and absent honest empty states.

## GREEN evidence

- Exact focused handoff command: 1 file passed, 11 tests passed.
- Sidebar/App/audit command: 3 files passed, 14 tests passed.
  - The first GREEN attempt exposed a test-harness rerender issue because the same React element object was reused; returning fresh JSX corrected the test without changing production behavior.
- Frontend typecheck: exit 0.
- `pnpm --filter @tova/web test`: 13 files passed, 66 tests passed.
- Focused backend command from the brief: 13 tests passed.

## Production audit output

Audit scope: `apps/api/app`, `apps/web/src`, and `scripts`.

```text
rg -i "simulation|simulated|restart demo|playback speed|virtual repository|project_orion|evt_demo" apps/api/app apps/web/src scripts
No matches found
```

Additional production audit:

```text
rg -i "demo|fake|fixture" apps/api/app apps/web/src scripts
No matches found

rg "staff-fixtures|use-demo-runtime|demo-events|repository-fixtures" apps/web/src
No matches found
```

The automated production source audit also passes both its deleted-file and forbidden-term checks.

## Full verification

- `pnpm verify`: exit 0.
  - ESLint passed with zero warnings.
  - TypeScript passed.
  - Vitest: 13 files passed, 66 tests passed.
  - Production build completed; 2,477 modules transformed.
- `uv run python scripts/verify.py`: exit 0.
  - Re-ran full frontend verification successfully.
  - Ruff: all checks passed.
  - mypy: no issues in 40 source files.
  - Full API pytest: 41 passed, 1 warning.

## Self-review

- Re-read the Task 7 brief and checked each product invariant against the final sources.
- Verified dismissal only mutates local React state and that a different handoff ID is not suppressed.
- Verified all sidebar lists are generated from live props or explicit empty messages.
- Verified no deleted fixture import remains in production or tests.
- Verified test-only staff data is isolated under `apps/web/tests`.
- Verified no production simulation/demo/fake/fixture term remains in the requested source roots.

## Concerns

- The full API suite emits one existing `StarletteDeprecationWarning` from FastAPI's `TestClient` import recommending `httpx2`. It does not fail verification and is unrelated to Task 7.
- No Task 7 implementation concerns remain.

## Review follow-up: staff query states and generic audit

### Changes

- `App` now passes `staff.isPending` and `staff.error` to `WorkspaceSidebar` alongside `staff.data ?? []`.
- The Staff sidebar renders three distinct accessible query outcomes:
  - Loading: `role="status"` with `Loading staff profiles…`.
  - Error: `role="alert"` with `Staff profiles are unavailable.`.
  - Successful empty response: `role="status"` with `No staff profiles are available.`.
- Team Floor also avoids reporting zero available profiles while the roster is loading or failed.
- The production source audit now checks every file under `apps/api/app`, `apps/web/src`, and `scripts` rather than filtering to Python/TypeScript extensions.
- Audit text includes each relative filename/path and file content. The generic case-insensitive `demo|fake|fixture` rule is enforced in addition to the original specific terms. Test directories remain outside the production roots; generated `__pycache__` directories are excluded.

### Review RED

Command:

```text
pnpm --filter @tova/web exec vitest run tests/core-components.test.tsx tests/production-source-audit.test.ts
```

Result: exit 1; 2 files failed, 2 tests failed, 12 passed.

- Staff regression failed because the loading render had no accessible `status` and showed the definitive empty roster message.
- Audit regression failed because a `.txt` content fixture and a generic filename outside the old extension subset were not scanned.

### Review GREEN

- Affected tests:

```text
pnpm --filter @tova/web exec vitest run tests/core-components.test.tsx tests/production-source-audit.test.ts tests/app-staff-source.test.tsx
3 files passed; 16 tests passed
```

- Frontend typecheck: exit 0.
- Full `pnpm verify`: exit 0.
  - ESLint passed.
  - TypeScript passed.
  - Vitest: 13 files passed, 68 tests passed.
  - Vite production build passed; 2,477 modules transformed.
- Focused backend suite from the Task 7 brief: 13 tests passed.
- IDE diagnostics reported no linter errors in the reviewed files.

### Expanded production audit

Content searches for case-insensitive `demo|fake|fixture` independently returned no matches in:

- `apps/api/app`
- `apps/web/src`
- `scripts`

Filename/path globs for `*demo*`, `*fake*`, and `*fixture*` independently returned zero files in each production root. The automated source audit passed and its temporary-directory regression proves that both arbitrary file content (for example `.txt`) and filenames/paths are checked.

### Review concerns

- No new concerns.
- No Git operations or commits were performed.
