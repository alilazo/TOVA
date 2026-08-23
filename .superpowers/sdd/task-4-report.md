# Task 4 Report: Integrate empty states + mount explorer without project

## Status

**DONE**

## Summary

Wired `RecentProjectsList` into `ProjectExplorer` and `CodeWorkspace` empty states; mounted `ProjectExplorer` in `App` even when no project is open; invalidated `recent-projects` from `ProjectPathDialog` on success.

## TDD Evidence

### RED — Step 2

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/project-explorer.test.tsx tests/code-workspace.test.tsx
```

Result: **FAIL** (exit code 1) — 2 failed | 5 passed. New empty-state tests could not find "Recent App" (list not wired yet).

### GREEN — Step 4

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/project-explorer.test.tsx tests/code-workspace.test.tsx tests/recent-projects-list.test.tsx
```

Result: **PASS** (exit code 0) — 3 files, 11 tests passed.

## Changes

### Modified: `apps/web/src/app/App.tsx`

- Explorer sidebar always renders `ProjectExplorer` with `project={project.data ?? null}` instead of `null` when no project.

### Modified: `apps/web/src/components/repository/ProjectExplorer.tsx`

- Imported `RecentProjectsList`.
- Render `<RecentProjectsList onOpened={onProjectOpened} />` after `.project-explorer__empty-actions` in the no-project empty state.

### Modified: `apps/web/src/components/editor/CodeWorkspace.tsx`

- Imported `RecentProjectsList`.
- Render `<RecentProjectsList onOpened={…} />` after `.code-workspace__empty-actions` in the no-project empty state.

### Modified: `apps/web/src/components/repository/ProjectPathDialog.tsx`

- Added `await client.invalidateQueries({ queryKey: ["recent-projects"] })` in mutation `onSuccess`.

### Modified: `apps/web/tests/project-explorer.test.tsx`

- Mock `listRecentProjects`; assert Open/New project buttons and recent name when `project={null}`.

### Modified: `apps/web/tests/code-workspace.test.tsx`

- Mock `listRecentProjects`; assert recent name in empty state when `projectId={null}`.

## Self-Review

- **Brief compliance:** All four wiring steps implemented; tests extended per spec; no CSS added (Task 5).
- **Existing flows:** Open/New project dialogs unchanged; `onProjectOpened` still clears files and sets active project.
- **Scope:** Minimal diff — only imports + one JSX block per empty state + App sidebar branch + one invalidate line.

## Concerns

1. **No CSS yet** — recent list in empty states uses unstyled markup until Task 5.
2. **No App-level integration test** — brief scoped unit tests only; explorer-without-project in App is untested directly (mocked in `app-staff-source.test.tsx`).
3. **Duplicate recent lists** — both explorer sidebar and code workspace empty states show recents when no project; intentional per brief but may feel redundant if both panels visible.

## Files Touched

- `apps/web/src/app/App.tsx`
- `apps/web/src/components/repository/ProjectExplorer.tsx`
- `apps/web/src/components/editor/CodeWorkspace.tsx`
- `apps/web/src/components/repository/ProjectPathDialog.tsx`
- `apps/web/tests/project-explorer.test.tsx`
- `apps/web/tests/code-workspace.test.tsx`

## Commits

None (per instructions).
