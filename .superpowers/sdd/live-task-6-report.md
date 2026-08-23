# Task 6 report: Project Work Logs exclusively from live events

## Summary

- Replaced transitional role-based Work Log summaries with a pure `EventEnvelope` projection.
- Added per-staff `workLogs` to `MissionProjection`; every persisted event with a `staff_id` is reduced into only that staff member's log.
- Projected typed live objective, action, tool, file, artifact, research, decision, next-action, and failure fields without inventing absent values.
- Deduplicated all projected arrays while preserving first-seen event order.
- Removed `phase` and `progress` from `MissionProjection` and removed probabilistic progress constants and writes from the mission reducer.
- Updated the Work Log drawer to render honest empty states and show Errors only when live failure events exist.
- Connected `App` directly to `liveRuntime.projection.workLogs`.
- Deleted all transitional static Work Log data, including the older fixture block in `staff-fixtures.ts`.

## Files

Created:

- `apps/web/src/features/mission/work-log-projection.ts`
- `apps/web/tests/work-log-projection.test.ts`
- `.superpowers/sdd/live-task-6-report.md`

Modified:

- `apps/web/src/features/mission/mission-event-reducer.ts`
- `apps/web/src/features/mission/use-demo-runtime.ts`
- `apps/web/src/types/events.ts`
- `apps/web/src/types/domain.ts`
- `apps/web/src/components/work-log/WorkLogDrawer.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/src/features/staff/staff-fixtures.ts`
- `apps/web/tests/mission-event-reducer.test.ts`
- `apps/web/tests/mission-interactions.test.tsx`
- `apps/web/tests/app-staff-source.test.tsx`

Deleted:

- `apps/web/src/features/staff/work-log-data.ts`
- `apps/web/tests/work-log-data.test.ts`

## Exact RED evidence

Command:

```powershell
pnpm --filter @tova/web exec vitest run tests/work-log-projection.test.ts tests/mission-event-reducer.test.ts
```

Result: exit code 1.

- `tests/work-log-projection.test.ts` failed to resolve the not-yet-created `work-log-projection` module.
- Reducer test `projects isolated work logs for each staff member` failed because `projection.workLogs` was undefined.
- Reducer test `does not expose fabricated phase or progress state` failed because the initial projection still had `phase: "draft"`.
- Vitest summary: 2 test files failed; 2 tests failed and 4 passed.

## Exact GREEN evidence

Focused projection and reducer command:

```powershell
pnpm --filter @tova/web exec vitest run tests/work-log-projection.test.ts tests/mission-event-reducer.test.ts
```

Result: exit code 0; 2 files passed, 9 tests passed.

Focused drawer and App command:

```powershell
pnpm --filter @tova/web exec vitest run tests/mission-interactions.test.tsx tests/app-staff-source.test.tsx
```

Result: exit code 0; 2 files passed, 12 tests passed.

## Deletion and search evidence

- Search in `apps/web/src` for `getWorkLogForStaff`, `work-log-data`, `knownWorkLogsByRole`, `export const workLogs`, fabricated preparing-work text, and `No blockers recorded` returned no matches.
- Search in `mission-event-reducer.ts` for `phase`, `progress`, `progress_percent`, and `missionEventState` returned no matches.
- Glob for `apps/web/**/work-log-data.*` returned zero files.
- Remaining `workLogs` source references are only the typed mission projection, reducer integration, and `App` projection lookup.

## Verification

The first full check exposed and prevented retention of dead static data:

- Full tests passed: 12 files, 60 tests.
- Lint passed with zero warnings.
- Typecheck failed with four `TS2741` errors because the old `workLogs` fixture block in `staff-fixtures.ts` lacked the new `errors` field.
- Remediation: deleted that entire fabricated Work Log fixture block instead of extending it.

Final command:

```powershell
pnpm verify
```

Result: exit code 0.

- ESLint passed with zero warnings.
- Strict TypeScript typecheck passed.
- Vitest passed: 12 files, 60 tests.
- Production build passed: 2,477 modules transformed.
- IDE diagnostics reported no errors in changed source and test files.

## Self-review

- Confirmed `createEmptyWorkLog()` contains only null scalars and empty arrays.
- Confirmed the reducer is pure and uses only typed payload fields selected by event type.
- Confirmed live backend `staff.assigned.payload.objective` is typed and projected; `tool` and `error` are also typed on the version `1.0` frontend contract.
- Confirmed action updates use `payload.summary` and `payload.tool`, file events use `payload.file_path`, and failures use `payload.error ?? payload.summary ?? event.event_type`.
- Confirmed arrays deduplicate without reordering first-seen values.
- Confirmed events without a staff ID cannot create a staff Work Log.
- Confirmed the drawer's empty-state copy is presentation-only and never enters projected data.
- Confirmed no Git commands or commits were used.

## Concerns

- The backend envelope still models payloads as the pre-existing `dict[str, Any]`; frontend version `1.0` validation now explicitly types every field consumed by this projection, but Python does not yet enforce event-specific payload shapes.
