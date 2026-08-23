### Task 5: Versioned `staff.file.deleted` on web + reducer

**Files:**
- Modify: `apps/api/app/schemas/events.py` (if not done in Task 4)
- Modify: `apps/web/src/types/events.ts`
- Modify: `apps/web/src/features/mission/mission-event-reducer.ts`
- Modify: `apps/web/src/features/mission/work-log-projection.ts`
- Modify: `apps/web/src/app/App.tsx`
- Test: `apps/web/tests/mission-event-reducer.test.ts`
- Test: `apps/web/tests/work-log-projection.test.ts` (extend if needed)

**Interfaces:**
- Consumes: `EventEnvelope` with `event_type: "staff.file.deleted"`, payload `file_path`
- Produces: projection fields —
  - `lastDeletedFile: string | null` (new)
  - clear `activeFile` / `editorOwnerId` when deleted path was active
  - remove matching `file_output` artifacts
  - bump `fileRevision`
  - App closes ui-store tab + invalidates `project-entries`

- [ ] **Step 1: Write the failing reducer test**

Add to `apps/web/tests/mission-event-reducer.test.ts`:

```ts
it("clears active file and work output when a file is deleted", () => {
  const projection = [
    event(1, "staff.file.created", {
      title: "Wrote hello.html",
      file_path: "hello.html",
    }, "staff_lina"),
    event(2, "staff.file.deleted", {
      title: "Deleted hello.html",
      file_path: "hello.html",
    }, "staff_lina"),
  ].reduce(missionEventReducer, createInitialMissionProjection())

  expect(projection.activeFile).toBe("")
  expect(projection.lastDeletedFile).toBe("hello.html")
  expect(projection.fileRevision).toBe(2)
  expect(
    projection.artifacts.filter((a) => a.type === "file_output"),
  ).toHaveLength(0)
})
```

Extend `MissionProjection` / `createInitialMissionProjection` expectations accordingly (`lastDeletedFile: null` initially).

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts -t "clears active file"
```

Expected: FAIL — unknown event type / no `lastDeletedFile`.

- [ ] **Step 3: Implement event type + reducer + App sync**

1. Add `"staff.file.deleted"` to both event Literal/arrays (API + web), next to other `staff.file.*` entries.

2. In `mission-event-reducer.ts`:
   - Add `lastDeletedFile: string | null` to `MissionProjection` and initialize `null`.
   - Handle delete:

```ts
if (event.event_type === "staff.file.deleted" && payload.file_path) {
  const filePath = payload.file_path
  const wasActive = next.activeFile === filePath
  next = {
    ...next,
    lastDeletedFile: filePath,
    fileRevision: next.fileRevision + 1,
    activeFile: wasActive ? "" : next.activeFile,
    editorOwnerId: wasActive ? null : next.editorOwnerId,
    artifacts: next.artifacts.filter(
      (artifact) =>
        !(artifact.type === "file_output" && artifact.name === filePath),
    ),
  }
}
```

3. In `work-log-projection.ts`, add `"staff.file.deleted"` to `outputFileEvents` so the deleted path appears in work-log outputs.

4. In `App.tsx`, after the existing open-file effect, add:

```tsx
useEffect(() => {
  const deleted = liveRuntime.projection.lastDeletedFile
  if (!deleted) return
  closeFile(deleted)
  void client.invalidateQueries({ queryKey: ["project-entries", project.data?.id] })
  void client.removeQueries({ queryKey: ["project-file", project.data?.id, deleted] })
}, [
  client,
  closeFile,
  liveRuntime.projection.lastDeletedFile,
  liveRuntime.projection.fileRevision,
  project.data?.id,
])
```

- [ ] **Step 4: Run web tests**

```bash
pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts tests/work-log-projection.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit only if the user asked** — otherwise skip.

---
