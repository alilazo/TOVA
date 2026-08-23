# Task 5 Report: Versioned `staff.file.deleted` on web + reducer

## Status: DONE

## Summary

Mirrored `staff.file.deleted` on the web event contract, extended `MissionProjection` with `lastDeletedFile`, cleared active editor / `file_output` artifacts on delete, projected deleted paths into work-log outputs, and synced `App.tsx` to close the UI tab and invalidate explorer/file queries.

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/types/events.ts` | Added `staff.file.deleted` next to other `staff.file.*` types |
| `apps/web/src/features/mission/mission-event-reducer.ts` | `lastDeletedFile`; delete handler clears active/editorOwner/artifacts, bumps `fileRevision` |
| `apps/web/src/features/mission/work-log-projection.ts` | Added `staff.file.deleted` to `outputFileEvents` |
| `apps/web/src/app/App.tsx` | `useEffect` on `lastDeletedFile` → `closeFile` + invalidate/remove queries |
| `apps/web/tests/mission-event-reducer.test.ts` | Delete clears active/artifacts; initial `lastDeletedFile` is null |

## TDD evidence

### Step 1 — RED (failing test added)

Added `clears active file and work output when a file is deleted` (and `initializes lastDeletedFile as null`) to `mission-event-reducer.test.ts`.

### Step 2 — RED confirmed

```bash
pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts -t "clears active file"
```

```
AssertionError: expected 'hello.html' to be '' // Object.is equality
1 failed | 14 skipped
```

### Step 3 — Implementation

- Web `eventTypes` includes `staff.file.deleted` (API already had it from Task 4)
- Reducer: `lastDeletedFile: string | null`; on delete set path, bump revision, clear active/editor when matching, filter `file_output` artifacts
- Work log: deleted paths join `output`
- App: close tab + invalidate `project-entries` + remove `project-file` query for deleted path

### Step 4 — GREEN confirmed

```bash
pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts tests/work-log-projection.test.ts
```

```
Test Files  2 passed (2)
Tests  18 passed (18)
```

### Step 5 — Commit

Skipped (no commit requested).

## Concerns

- `lastDeletedFile` is sticky until the next delete; the App effect depends on `fileRevision` as well so re-delete of the same path still closes/invalidates. Opening another file does not clear `lastDeletedFile`.
- No dedicated work-log-projection test for delete; covered only via `outputFileEvents` membership + existing suite still green.
- App delete sync is not covered by a component/integration test in this task.
