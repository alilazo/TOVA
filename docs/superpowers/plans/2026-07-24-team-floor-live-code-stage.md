# Team Floor Live Code Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Team Floor shows a professional split stage with a read-only Monaco pane that auto-follows the latest agent file write and progressively reveals content after each write.

**Architecture:** Live `repository.write` / `apply_patch` (and read/open) emit versioned `staff.file.*` events with `file_path` + human `title` (no file body on the wire). The reducer sets `activeFile`, `editorOwnerId`, and a `fileRevision` counter. Team Floor embeds a watch pane that refetches via `GET /api/projects/{id}/files` and runs a client typewriter; a newer write aborts and switches focus. Motion stays restrained and professional.

**Tech Stack:** FastAPI agent runtime, existing event protocol, React + TanStack Query, Monaco (`@monaco-editor/react`), Framer Motion (existing), Vitest + Pytest.

## Global Constraints

- Professional product motion only — no scores, XP, particles, cartoon office, glass, or decorative game chrome
- Team Floor Monaco is read-only (watch surface); Explorer remains browse/edit
- No file bodies or large diffs on the websocket — refetch after `staff.file.*`
- Follow the most recent write across the team (abort in-flight typewriter)
- Preserve product name `TOVA`; keep UI neutral and compact
- TDD: failing test before implementation; run `pnpm verify` / targeted pytest before claiming done
- Do not edit the Cursor plan file under `.cursor/plans/`

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/api/app/orchestration/agent_runner.py` | Map repository tool results → `staff.file.*` emits |
| `apps/api/tests/test_agent_runtime.py` | Assert write emits `staff.file.created` with path/title |
| `apps/web/src/features/mission/mission-event-reducer.ts` | Bump `fileRevision` on file events; activity title fallback |
| `apps/web/src/types/domain.ts` (or projection type colocated) | Add `fileRevision` on `MissionProjection` |
| `apps/web/tests/mission-event-reducer.test.ts` | Cover revision bump + title from `summary` |
| `apps/web/src/features/mission/typewriter.ts` | Pure progressive-reveal controller |
| `apps/web/tests/typewriter.test.ts` | Unit tests for reveal + abort |
| `apps/web/src/components/team-floor/TeamFloorLiveEditor.tsx` | Read-only Monaco + typewriter + path/staff badge |
| `apps/web/src/components/team-floor/TeamFloor.tsx` | Split layout: workforce strip + live editor |
| `apps/web/src/app/App.tsx` | Pass projectId/activeFile/owner/revision; invalidate on revision |
| `apps/web/src/styles/globals.css` | Compact split layout + subtle typing pulse |
| `docs/EVENT_PROTOCOL.md` | Note live runtime emits `staff.file.*` on repository tools |
| `apps/web/tests/e2e/mission-flow.spec.ts` | Optional light assertion if stable without live LM |

---

### Task 1: Emit `staff.file.*` from live repository tools

**Files:**
- Modify: `apps/api/app/orchestration/agent_runner.py`
- Modify: `apps/api/tests/test_agent_runtime.py`
- Modify: `docs/EVENT_PROTOCOL.md` (one bullet under projection rules)

**Interfaces:**
- Consumes: `RepositoryToolRegistry.execute` → `ToolExecutionResult` with `ok`, `summary`, `data` containing `path` for write/patch/read
- Produces: After successful repository tools, emits:
  - `repository.write` → `staff.file.created` if new else prefer `staff.file.updated` when `data` indicates update; if unsure, use `staff.file.updated` for writes that already existed and `staff.file.created` when `FileChangeResult` / workspace says created — simplest acceptable rule: **write → `staff.file.created` when file did not exist before write, else `staff.file.updated`**; if change metadata lacks that, emit **`staff.file.updated` for write and patch**, **`staff.file.opened` for read**
  - Payload must include `file_path: str` and `title: str` (use `result.summary`, e.g. `"Wrote result.txt"`)
  - Keep existing `staff.action.updated` emit as well (or replace only the file-specific signal — prefer **emit both**: action for logs, file for editor)

- [ ] **Step 1: Write the failing test**

In `apps/api/tests/test_agent_runtime.py`, extend `test_fake_provider_completes_mission_with_repository_tool` (or add a focused sibling) to assert after `runtime.run`:

```python
    events = await store.list_after(mission.id, 0)
    file_events = [e for e in events if e.event_type.startswith("staff.file.")]
    assert any(
        e.event_type in {"staff.file.created", "staff.file.updated"}
        and e.payload.get("file_path") == "result.txt"
        and "result.txt" in str(e.payload.get("title", ""))
        for e in file_events
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --directory apps/api pytest tests/test_agent_runtime.py::test_fake_provider_completes_mission_with_repository_tool -v`

Expected: FAIL — no `staff.file.*` events (or assertion fails)

- [ ] **Step 3: Write minimal implementation**

In `AgentRunner._execute_tool`, after successful `repository.*` execute, map and emit:

```python
        if call.name.startswith("repository."):
            result = self.tools.execute(call.name, call.arguments)
            await self._emit(
                mission_id,
                "staff.action.updated",
                {"tool": call.name, "summary": result.summary, "ok": result.ok},
                profile.id,
            )
            if result.ok:
                file_path = None
                if isinstance(result.data, dict):
                    file_path = result.data.get("path")
                if file_path is None and isinstance(call.arguments.get("path"), str):
                    file_path = call.arguments["path"]
                event_type = {
                    "repository.read": "staff.file.opened",
                    "repository.write": "staff.file.updated",
                    "repository.apply_patch": "staff.file.updated",
                }.get(call.name)
                if event_type and file_path:
                    # Prefer created when write and file is new: optional check via workspace
                    if call.name == "repository.write":
                        # If change data includes created flag use it; else treat first write as updated
                        # Spec-acceptable: emit staff.file.created when data.get("created") is True
                        created = bool(isinstance(result.data, dict) and result.data.get("created"))
                        event_type = "staff.file.created" if created else "staff.file.updated"
                    await self._emit(
                        mission_id,
                        event_type,
                        {"file_path": file_path, "title": result.summary},
                        profile.id,
                    )
            return result.model_dump()
```

If `FileChangeResult` has no `created` field today, either:
- add optional `created: bool` on write in `ProjectWorkspace.write` / `FileChangeResult`, **or**
- always emit `staff.file.updated` for write/patch (tests accept either created or updated).

Prefer adding `created: bool` on `FileChangeResult` when write creates a new file (path did not exist before).

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --directory apps/api pytest tests/test_agent_runtime.py -v`

Expected: PASS

- [ ] **Step 5: Update EVENT_PROTOCOL bullet**

Add under projection rules:

```markdown
- Live repository tools emit `staff.file.opened|created|updated` with `file_path` and a human-readable `title` (no file body).
```

- [ ] **Step 6: Commit** (only if the user asked for commits in this session)

```bash
git add apps/api/app/orchestration/agent_runner.py apps/api/app/tools/repository.py apps/api/app/tools/schemas.py apps/api/tests/test_agent_runtime.py docs/EVENT_PROTOCOL.md
git commit -m "feat: emit staff.file events from live repository tools"
```

---

### Task 2: Projection `fileRevision` + activity titles

**Files:**
- Modify: `apps/web/src/features/mission/mission-event-reducer.ts`
- Modify: `apps/web/src/types/domain.ts` (wherever `MissionProjection` is defined — check colocated type in reducer file if not in domain)
- Modify: `apps/web/tests/mission-event-reducer.test.ts`

**Interfaces:**
- Consumes: `staff.file.*` events with `file_path` / `title`
- Produces: `MissionProjection.fileRevision: number` increments on every `staff.file.opened|created|updated` that sets `activeFile`; activity `title` uses `payload.title ?? payload.summary ?? event.event_type`

- [ ] **Step 1: Locate `MissionProjection` and write failing tests**

Add to `mission-event-reducer.test.ts`:

```ts
  it("bumps fileRevision on successive file updates to the same path", () => {
    const opened = event(1, "staff.file.opened", {
      title: "Opened a.ts",
      file_path: "a.ts",
    }, "staff_maya")
    const updated = event(2, "staff.file.updated", {
      title: "Wrote a.ts",
      file_path: "a.ts",
    }, "staff_maya")
    const projection = [opened, updated].reduce(
      missionEventReducer,
      createInitialMissionProjection(),
    )
    expect(projection.activeFile).toBe("a.ts")
    expect(projection.fileRevision).toBe(2)
    expect(projection.editorOwnerId).toBe("staff_maya")
  })

  it("uses summary as activity title when title is absent", () => {
    const projection = missionEventReducer(
      createInitialMissionProjection(),
      event(1, "staff.action.updated", { summary: "Wrote a.ts", ok: true }, "staff_maya"),
    )
    expect(projection.activity[0]?.title).toBe("Wrote a.ts")
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts`

Expected: FAIL on `fileRevision` / summary title

- [ ] **Step 3: Implement**

In `createInitialMissionProjection`, set `fileRevision: 0`.

In activity construction:

```ts
title: payload.title ?? payload.summary ?? event.event_type,
```

In the `staff.file.*` block:

```ts
    next = {
      ...next,
      activeFile: payload.file_path,
      editorOwnerId: event.staff_id,
      currentStaffId: event.staff_id ?? next.currentStaffId,
      fileRevision: next.fileRevision + 1,
    }
```

Ensure `MissionProjection` type includes `fileRevision: number`. If `payload.summary` is not typed on event payload, extend the payload type or cast via existing loose payload fields.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (if user requested commits)

```bash
git add apps/web/src/features/mission/mission-event-reducer.ts apps/web/src/types apps/web/tests/mission-event-reducer.test.ts
git commit -m "feat: bump fileRevision and prefer summary titles in mission projection"
```

---

### Task 3: Typewriter helper (pure)

**Files:**
- Create: `apps/web/src/features/mission/typewriter.ts`
- Create: `apps/web/tests/typewriter.test.ts`

**Interfaces:**
- Produces:

```ts
export type TypewriterHandle = {
  cancel: () => void
  done: Promise<void>
}

/** Reveal `target` into `onUpdate` in chunks. Cancelling resolves `done` without error. */
export function startTypewriter(options: {
  target: string
  previous?: string
  charsPerTick?: number
  tickMs?: number
  onUpdate: (visible: string) => void
}): TypewriterHandle
```

Behavior:
- If `previous` is a strict prefix of `target`, only reveal the suffix (append).
- Otherwise reveal from empty → `target` (full rewrite).
- Default ~3–8 chars/tick, ~16–32ms — fast enough to finish large files in a few seconds; tests use fake timers.
- `cancel()` stops further ticks; last partial text may remain.

- [ ] **Step 1: Write failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { startTypewriter } from "@/features/mission/typewriter"

describe("startTypewriter", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("reveals content progressively", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      target: "abcdef",
      charsPerTick: 2,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(100)
    await handle.done
    expect(frames.at(-1)).toBe("abcdef")
    expect(frames.length).toBeGreaterThan(1)
  })

  it("appends when previous is a prefix", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      previous: "ab",
      target: "abcd",
      charsPerTick: 2,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(50)
    await handle.done
    expect(frames[0]).toBe("ab")
    expect(frames.at(-1)).toBe("abcd")
  })

  it("cancel stops further updates", async () => {
    const frames: string[] = []
    const handle = startTypewriter({
      target: "abcdefghij",
      charsPerTick: 1,
      tickMs: 10,
      onUpdate: (value) => frames.push(value),
    })
    await vi.advanceTimersByTimeAsync(30)
    handle.cancel()
    const count = frames.length
    await vi.advanceTimersByTimeAsync(100)
    expect(frames.length).toBe(count)
    await handle.done
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tova/web exec vitest run tests/typewriter.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement `typewriter.ts`**

Implement with `setInterval` / `setTimeout`, store cancelled flag, call `onUpdate` each tick, clear timer on complete/cancel, resolve `done`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tova/web exec vitest run tests/typewriter.test.ts`

Expected: PASS

- [ ] **Step 5: Commit** (if user requested commits)

```bash
git add apps/web/src/features/mission/typewriter.ts apps/web/tests/typewriter.test.ts
git commit -m "feat: add progressive typewriter helper for live file reveal"
```

---

### Task 4: `TeamFloorLiveEditor` component

**Files:**
- Create: `apps/web/src/components/team-floor/TeamFloorLiveEditor.tsx`
- Modify: `apps/web/src/styles/globals.css` (minimal empty/loading styles if needed)
- Test: prefer a small Vitest + Testing Library render test if the repo already uses RTL for components; otherwise cover behavior via typewriter unit tests + manual wiring in Task 5. If adding a component test:

**Interfaces:**
- Consumes: `projectId: string | null`, `activeFile: string | null`, `fileRevision: number`, `editorOwnerId: string | null`, staff display name from fixtures
- Produces: read-only Monaco showing progressive content; aria-label `"Live code stage"`

Behavior:
1. Query `["project-file", projectId, activeFile, fileRevision]` → `readProjectFile`
2. On successful content + revision change: cancel prior typewriter; `startTypewriter({ previous: visible, target: content, onUpdate: setVisible })`
3. Header: path + `{displayName} is writing…` when owner present and typewriter not done; quiet `motion` fade on path change
4. Idle copy when no `activeFile`: `Waiting for the first file write`
5. Error/empty project: compact message
6. Monaco: `options={{ readOnly: true, domReadOnly: true, minimap: { enabled: false } }}` — reuse lazy Monaco pattern from `CodeWorkspace.tsx`

- [ ] **Step 1: Scaffold component with idle state (can drive with RTL if present)**

```tsx
export function TeamFloorLiveEditor(props: {
  projectId: string | null
  activeFile: string | null
  fileRevision: number
  editorOwnerId: string | null
}) { /* ... */ }
```

- [ ] **Step 2: Wire query + typewriter effect**

```tsx
  useEffect(() => {
    if (!fileQuery.data?.content) return
    const handle = startTypewriter({
      previous: visibleRef.current,
      target: fileQuery.data.content,
      onUpdate: (value) => {
        visibleRef.current = value
        setVisible(value)
      },
    })
    return () => handle.cancel()
  }, [fileQuery.data?.content, props.activeFile, props.fileRevision])
```

Use a ref for `previous` so cancel+restart on newer write works when path changes (reset previous to `""` when `activeFile` changes).

- [ ] **Step 3: Visual pass (CSS)**

Add `.team-floor__stage` grid: workforce column / code column (stack on narrow widths). Typing pulse via existing motion or a small CSS `@keyframes` on a caret indicator — restrained.

- [ ] **Step 4: Smoke typecheck**

Run: `pnpm --filter @tova/web typecheck`

Expected: PASS

- [ ] **Step 5: Commit** (if user requested commits)

```bash
git add apps/web/src/components/team-floor/TeamFloorLiveEditor.tsx apps/web/src/styles/globals.css
git commit -m "feat: add Team Floor live read-only code stage editor"
```

---

### Task 5: Wire Team Floor split + App invalidation

**Files:**
- Modify: `apps/web/src/components/team-floor/TeamFloor.tsx`
- Modify: `apps/web/src/app/App.tsx`

**Interfaces:**
- Consumes: projection `activeFile`, `editorOwnerId`, `fileRevision`; `project.data?.id`
- Produces: Team Floor renders workforce UI + `TeamFloorLiveEditor`; App invalidates file/entries when `fileRevision` changes (not only when path string changes)

- [ ] **Step 1: Extend `TeamFloor` props and layout**

```tsx
interface TeamFloorProps {
  // existing...
  projectId: string | null
  activeFile: string | null
  fileRevision: number
  editorOwnerId: string | null
}
```

Render structure:

```tsx
<section className="team-floor" aria-label="Team Floor">
  {/* existing header + workflow */}
  <div className="team-floor__body">
    <div className="team-floor__workforce">
      {/* existing active staff stage OR empty */}
    </div>
    <TeamFloorLiveEditor
      projectId={projectId}
      activeFile={activeFile}
      fileRevision={fileRevision}
      editorOwnerId={editorOwnerId}
    />
  </div>
  {/* footer */}
</section>
```

Highlight: when `editorOwnerId` matches a workflow node, keep/ensure `is-active` styling prefers write owner when a file revision is in flight (optional: use `editorOwnerId` over `currentStaffId` for node highlight when `activeFile` set).

- [ ] **Step 2: Update `App.tsx`**

Pass new props from `liveRuntime.projection` + `project.data?.id`.

Replace the activeFile-only effect with revision-aware invalidation:

```tsx
  useEffect(() => {
    const path = liveRuntime.projection.activeFile
    if (!path) return
    openFile(path)
    void client.invalidateQueries({ queryKey: ["project-entries", project.data?.id] })
    void client.invalidateQueries({
      queryKey: ["project-file", project.data?.id, path],
    })
  }, [
    client,
    liveRuntime.projection.activeFile,
    liveRuntime.projection.fileRevision,
    openFile,
    project.data?.id,
  ])
```

- [ ] **Step 3: Run frontend unit tests + typecheck**

Run: `pnpm --filter @tova/web test` and `pnpm --filter @tova/web typecheck`

Expected: PASS

- [ ] **Step 4: Commit** (if user requested commits)

```bash
git add apps/web/src/components/team-floor/TeamFloor.tsx apps/web/src/app/App.tsx apps/web/src/styles/globals.css
git commit -m "feat: wire Team Floor split stage to live file projection"
```

---

### Task 6: Verification

**Files:** none new (run commands)

- [ ] **Step 1: Backend suite**

Run: `uv run --directory apps/api pytest tests/test_agent_runtime.py tests/test_projects_api.py -v`

Expected: PASS

- [ ] **Step 2: Full workspace verify**

Run: `uv run python scripts/verify.py`

Expected: PASS (frontend lint/typecheck/test/build + backend ruff/mypy/pytest)

- [ ] **Step 3: Manual live smoke (when LM Studio available)**

1. Open/create a blank temp project
2. Start a short live mission that writes a file
3. Switch to Team Floor
4. Confirm: path badge appears, content typewriter-reveals, explorer tree invalidates, second write switches focus and aborts prior reveal

- [ ] **Step 4: E2E (optional)**

If adding an assertion without LM Studio, keep existing open-project e2e and add only a static check that Team Floor region contains `Live code stage` / idle copy after navigating to Team Floor — no live write required.

Run: `pnpm --filter @tova/web test:e2e`

Expected: PASS

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Split workforce + coding pane | 4, 5 |
| Typewriter progressive reveal | 3, 4 |
| Follow most recent write / abort | 3, 4, 5 |
| Emit `staff.file.*` + refetch (no body on WS) | 1, 4 |
| Professional motion only | 4, 5 CSS |
| Activity human titles | 1 (`title`), 2 (`summary` fallback) |
| Invalidate explorer on writes | 5 |
| Tests backend + typewriter + projection | 1, 2, 3, 6 |
| Out of scope (token stream, multi-pane, edit-on-floor, game chrome) | Not planned |

## Placeholder / consistency notes

- Event types: `staff.file.opened|created|updated` only for this pass (`saved` unused).
- `fileRevision` is the signal for same-path rewrites.
- Typewriter defaults must keep large files usable (complete within a few seconds); tests override tick timing.
