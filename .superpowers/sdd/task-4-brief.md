### Task 4: Integrate empty states + mount explorer without project

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/components/repository/ProjectExplorer.tsx`
- Modify: `apps/web/src/components/editor/CodeWorkspace.tsx`
- Modify: `apps/web/src/components/repository/ProjectPathDialog.tsx`
- Modify: `apps/web/tests/project-explorer.test.tsx`
- Modify: `apps/web/tests/code-workspace.test.tsx` (or add empty-state cases)

**Interfaces:**
- Consumes: `RecentProjectsList`, `listRecentProjects` (via mocks in tests)
- Produces: both empty states render recent list; explorer sidebar visible with no project

- [ ] **Step 1: Write / extend failing integration tests**

In `project-explorer.test.tsx`, mock `listRecentProjects` to return one item; render `<ProjectExplorer project={null} ... />`; assert `Open project`, `New project`, and recent name are present.

In `code-workspace.test.tsx` (or new cases), render `CodeWorkspace` with `projectId={null}`; mock recent list; assert recent name appears under empty actions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tova/web exec vitest run tests/project-explorer.test.tsx tests/code-workspace.test.tsx`

Expected: FAIL (explorer empty state may not assert recents yet; App not required for unit tests)

- [ ] **Step 3: Wire components**

1. `App.tsx` â€” change explorer branch from `project.data ? <ProjectExplorer .../> : null` to always render:

```tsx
<ProjectExplorer
  project={project.data ?? null}
  activeFile={activeFile}
  onOpenFile={openFile}
  onProjectOpened={onProjectOpened}
/>
```

2. `ProjectExplorer` empty state â€” after `.project-explorer__empty-actions`, render:

```tsx
<RecentProjectsList onOpened={onProjectOpened} />
```

3. `CodeWorkspace` empty state â€” after `.code-workspace__empty-actions`, render:

```tsx
<RecentProjectsList
  onOpened={(project) => {
    onProjectOpened?.(project)
  }}
/>
```

4. `ProjectPathDialog` `onSuccess` â€” also:

```ts
await client.invalidateQueries({ queryKey: ["recent-projects"] })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tova/web exec vitest run tests/project-explorer.test.tsx tests/code-workspace.test.tsx tests/recent-projects-list.test.tsx`

Expected: PASS

---
