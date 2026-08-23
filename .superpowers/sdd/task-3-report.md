# Task 3 Report: Frontend API helper + RecentProjectsList

## Status

**DONE**

## Summary

Added `RecentProjectRecord` / `listRecentProjects()` to `project-api.ts`, implemented shared `RecentProjectsList` with TanStack Query/mutation, and verified with TDD Vitest tests. Not wired into empty states yet (Task 4).

## TDD Evidence

### RED — Step 2

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx
```

Result: **FAIL** (exit code 1) — `Failed to resolve import "@/components/repository/RecentProjectsList"`.

### GREEN — Step 4

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx
```

Result: **PASS** (exit code 0) — 4 tests passed.

## Changes

### Modified: `apps/web/src/features/projects/project-api.ts`

- Added `RecentProjectRecord` interface and `listRecentProjects()` → `GET /api/projects/recent`.

### Created: `apps/web/src/components/repository/RecentProjectsList.tsx`

- `useQuery(["recent-projects"])` + `useMutation` calling `openProject(root)`.
- Success: invalidate `recent-projects` + `active-project`, call `onOpened`.
- Error: map missing-directory messages to `That folder is no longer available`; invalidate `recent-projects`.
- Local `expanded` state; slice to 5 rows; View more / Show less when >5.
- Returns `null` while loading or when history empty (unless error alert is showing).

### Created: `apps/web/tests/recent-projects-list.test.tsx`

- Verbatim tests from brief: empty hide, expand/collapse, open row, error + refresh.

## Self-Review

- **Brief compliance:** API helper and component match spec; tests verbatim; no Task 4 wiring.
- **UI:** Compact markup with `.recent-projects` BEM classes; CSS deferred to Task 5.
- **Deviation:** Return `null` during loading and keep section visible when `alertText` is set after self-heal refresh — required for tests and UX (error survives empty refetch).

## Concerns

1. **No CSS yet** — rows rely on unstyled markup until Task 5 `globals.css`.
2. **Error alert persists** after list self-heals to empty; user must dismiss implicitly by opening another project or navigating away (no explicit dismiss in v1 spec).

## Files Touched

- `apps/web/src/features/projects/project-api.ts`
- `apps/web/src/components/repository/RecentProjectsList.tsx`
- `apps/web/tests/recent-projects-list.test.tsx`

## Commits

None (per instructions).
