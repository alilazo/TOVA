# Send-to-Team Transition & Work Output Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a restrained Team Floor ↔ Explorer crossfade and make CURRENT WORK OUTPUT file chips open that file in Explorer.

**Architecture:** Wrap the `App.tsx` Team Floor / Code Workspace swap in `AnimatePresence` + keyed `motion.div` with opacity/y motion gated by `useReducedMotion`. Pass an `onOpenWorkOutput(path)` callback into `TeamFloor` that calls Zustand `openFile` + `setActivePanel("explorer")`. Render `file_output` chips as buttons.

**Tech Stack:** React, Zustand (`ui-store`), framer-motion (`AnimatePresence`, `motion`, `useReducedMotion`), Vitest + Testing Library, existing TOVA CSS tokens.

## Global Constraints

- Keep UI neutral and compact (TOVA product invariants); no decorative game motion.
- Prefer TDD: failing tests before implementation.
- Do not commit unless the user explicitly asks.
- File paths for `file_output` artifacts live in `artifact.name` (existing reducer contract).
- Alex / `project_coordinator` still hides CURRENT WORK OUTPUT.

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/src/app/App.tsx` | AnimatePresence workspace swap; wire `onOpenWorkOutput` |
| `apps/web/src/components/team-floor/TeamFloor.tsx` | Clickable file-output chips |
| `apps/web/src/styles/globals.css` | Button styles for work-output chips |
| `apps/web/tests/team-floor.test.tsx` | Work-output button behavior |
| `apps/web/tests/app-panel-transition.test.tsx` | Crossfade mount + Send-to-Team panel switch (new or extend existing App tests if any) |

---

### Task 1: Clickable CURRENT WORK OUTPUT file chips

**Files:**
- Modify: `apps/web/src/components/team-floor/TeamFloor.tsx`
- Modify: `apps/web/src/styles/globals.css` (`.active-staff-stage__output` button styles)
- Test: `apps/web/tests/team-floor.test.tsx`

**Interfaces:**
- Consumes: `Artifact` from `@/types/domain` (`type`, `name`, `staffId`)
- Produces: `onOpenWorkOutput?: (path: string) => void` on `TeamFloorProps`

- [ ] **Step 1: Write the failing test**

Add to `apps/web/tests/team-floor.test.tsx`:

```tsx
it("opens file work outputs via clickable chips", () => {
  const onOpenWorkOutput = vi.fn()
  renderWithClient(
    <TeamFloor
      {...baseProps}
      selectedStaffIds={["staff_lina"]}
      currentStaffId="staff_lina"
      statuses={{ staff_lina: "working" }}
      hasStarted
      missionStatus="running"
      onOpenWorkOutput={onOpenWorkOutput}
      artifacts={[
        {
          id: "a1",
          staffId: "staff_lina",
          type: "file_output",
          name: "index.html",
          summary: "Created index.html",
        },
        {
          id: "a2",
          staffId: "staff_lina",
          type: "note",
          name: "Mission note",
          summary: "Not a file",
        },
      ]}
    />,
  )

  const chip = screen.getByRole("button", { name: /Open index\.html in Explorer/i })
  expect(chip).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /Mission note/i })).not.toBeInTheDocument()
  expect(screen.getByText("Mission note")).toBeInTheDocument()

  chip.click()
  expect(onOpenWorkOutput).toHaveBeenCalledWith("index.html")
})
```

Ensure `vi` is imported from `vitest` (already used in this file or add import).

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/team-floor.test.tsx -t "opens file work outputs"
```

Expected: FAIL — missing `onOpenWorkOutput` / no button role for the chip.

- [ ] **Step 3: Write minimal implementation**

In `TeamFloor.tsx`:

1. Add prop:

```tsx
onOpenWorkOutput?: (path: string) => void
```

2. Replace string-only `outputs` with structured entries:

```tsx
type WorkOutputItem =
  | { kind: "file"; path: string }
  | { kind: "text"; label: string }

const workOutputs: WorkOutputItem[] = showWorkOutput
  ? [
      ...artifacts
        .filter((artifact) => artifact.staffId === active?.id)
        .map((artifact): WorkOutputItem =>
          artifact.type === "file_output"
            ? { kind: "file", path: artifact.name }
            : { kind: "text", label: artifact.name },
        ),
      ...artifacts.slice(-2).map((artifact): WorkOutputItem =>
        artifact.type === "file_output"
          ? { kind: "file", path: artifact.name }
          : { kind: "text", label: artifact.name },
      ),
    ].filter((item, index, list) => {
      const key = item.kind === "file" ? `file:${item.path}` : `text:${item.label}`
      return (
        list.findIndex((candidate) => {
          const candidateKey =
            candidate.kind === "file"
              ? `file:${candidate.path}`
              : `text:${candidate.label}`
          return candidateKey === key
        }) === index
      )
    })
  : []
```

3. Render:

```tsx
{showWorkOutput && (
  <div className="active-staff-stage__output">
    <small>CURRENT WORK OUTPUT</small>
    {workOutputs.length > 0 ? (
      workOutputs.map((item) =>
        item.kind === "file" ? (
          <button
            key={`file:${item.path}`}
            type="button"
            className="active-staff-stage__output-chip"
            aria-label={`Open ${item.path} in Explorer`}
            onClick={() => onOpenWorkOutput?.(item.path)}
          >
            <FileStack aria-hidden="true" />
            {item.path}
          </button>
        ) : (
          <span key={`text:${item.label}`}>
            <FileStack aria-hidden="true" />
            {item.label}
          </span>
        ),
      )
    ) : (
      <span>No file outputs yet</span>
    )}
  </div>
)}
```

4. In `globals.css`, extend chip styles so buttons match current chips:

```css
.active-staff-stage__output-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 5px;
  background: #f5f5f2;
  padding: 6px;
  color: inherit;
  font: inherit;
  font-size: 9px;
  text-align: left;
  cursor: pointer;
}

.active-staff-stage__output-chip:hover,
.active-staff-stage__output-chip:focus-visible {
  background: #ecece8;
  outline: none;
}

.active-staff-stage__output-chip:focus-visible {
  box-shadow: 0 0 0 1px var(--line);
}
```

Keep existing `.active-staff-stage__output > span` rules for non-button rows.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/team-floor.test.tsx
```

Expected: PASS (all TeamFloor tests).

- [ ] **Step 5: Commit only if the user explicitly asks**

Do not commit by default.

---

### Task 2: Wire open-work-output to Explorer in App

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Test: `apps/web/tests/team-floor.test.tsx` already covers TeamFloor callback; add a thin App-level test if practical, otherwise verify by composing store actions in a small unit test file.

**Interfaces:**
- Consumes: `TeamFloor` `onOpenWorkOutput?: (path: string) => void`
- Produces: handler that calls `openFile(path)` then `setActivePanel("explorer")`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/open-work-output.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"

import { useUiStore } from "@/stores/ui-store"

describe("open work output navigation", () => {
  beforeEach(() => {
    useUiStore.setState({
      activePanel: "team-floor",
      activeFile: null,
      openFiles: [],
    })
  })

  it("opens the file and switches to explorer", () => {
    const { openFile, setActivePanel } = useUiStore.getState()
    openFile("style.css")
    setActivePanel("explorer")

    const state = useUiStore.getState()
    expect(state.activeFile).toBe("style.css")
    expect(state.openFiles).toContain("style.css")
    expect(state.activePanel).toBe("explorer")
  })
})
```

This locks the store contract the App handler must use. Then in App, the handler is:

```tsx
onOpenWorkOutput={(path) => {
  openFile(path)
  setActivePanel("explorer")
}}
```

If you prefer a single integration assertion, also extend an App render test — store contract test is enough for Task 2 wiring confidence when combined with Task 1.

- [ ] **Step 2: Run test to verify store contract passes**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/open-work-output.test.ts
```

Expected: PASS (documents intended navigation sequence).

- [ ] **Step 3: Wire TeamFloor in App.tsx**

In the `TeamFloor` JSX in `App.tsx`, add:

```tsx
onOpenWorkOutput={(path) => {
  openFile(path)
  setActivePanel("explorer")
}}
```

`openFile` and `setActivePanel` are already selected from `useUiStore` in `App`.

- [ ] **Step 4: Smoke-check TypeScript**

Run:

```bash
pnpm --filter @tova/web exec tsc --noEmit
```

Expected: no errors related to `onOpenWorkOutput`.

- [ ] **Step 5: Commit only if the user explicitly asks**

---

### Task 3: Restrained panel crossfade

**Files:**
- Modify: `apps/web/src/app/App.tsx`
- Test: `apps/web/tests/app-panel-transition.test.tsx` (create)

**Interfaces:**
- Consumes: `activePanel` from `useUiStore`; framer-motion `AnimatePresence`, `motion`, `useReducedMotion`
- Produces: animated workspace swap keyed by `team-floor` vs `workspace`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/app-panel-transition.test.tsx` that mounts a minimal fragment mirroring the AnimatePresence structure, or test App if fixtures allow. Prefer testing a tiny extracted helper to avoid heavy App mocks:

Create `apps/web/src/components/shell/WorkspacePanelSwitch.tsx`:

```tsx
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"

interface WorkspacePanelSwitchProps {
  panelKey: "team-floor" | "workspace"
  children: ReactNode
}

export function WorkspacePanelSwitch({
  panelKey,
  children,
}: WorkspacePanelSwitchProps) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={panelKey}
        className="workspace-panel-switch"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
```

Failing test first (file does not exist yet):

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { WorkspacePanelSwitch } from "@/components/shell/WorkspacePanelSwitch"

describe("WorkspacePanelSwitch", () => {
  it("renders the active panel content with motion wrapper", () => {
    render(
      <WorkspacePanelSwitch panelKey="team-floor">
        <div>Team Floor panel</div>
      </WorkspacePanelSwitch>,
    )
    expect(screen.getByText("Team Floor panel")).toBeInTheDocument()
    expect(document.querySelector(".workspace-panel-switch")).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/app-panel-transition.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `WorkspacePanelSwitch` and use it in App**

1. Create `apps/web/src/components/shell/WorkspacePanelSwitch.tsx` as shown above.
2. In `App.tsx`, replace the ternary with:

```tsx
<WorkspacePanelSwitch
  panelKey={activePanel === "team-floor" ? "team-floor" : "workspace"}
>
  {activePanel === "team-floor" ? (
    <TeamFloor /* existing props + onOpenWorkOutput */ />
  ) : (
    <CodeWorkspace /* existing props */ />
  )}
</WorkspacePanelSwitch>
```

Keep ActivityFeed outside the switch so it does not remount/animate on every panel change.

Optional CSS (only if layout shifts):

```css
.workspace-panel-switch {
  display: contents;
}
```

If `display: contents` breaks exit animations in the browser, use:

```css
.workspace-panel-switch {
  min-width: 0;
  min-height: 0;
  height: 100%;
}
```

and ensure parent `.mission-workspace` still lays out correctly — verify visually after start.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/app-panel-transition.test.tsx tests/team-floor.test.tsx tests/open-work-output.test.ts
```

Expected: PASS.

- [ ] **Step 5: Manual check**

1. Ensure `pnpm dev:web` is up on `:5173`.
2. Send to Team → Team Floor should crossfade in (~220ms).
3. With a file chip visible on an engineer, click it → Explorer opens that file.
4. OS reduced-motion: swap should be instant.

- [ ] **Step 6: Commit only if the user explicitly asks**

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| ~220ms opacity + y crossfade on Team Floor ↔ Explorer | Task 3 |
| `useReducedMotion` → instant | Task 3 |
| Send to Team uses existing `setActivePanel("team-floor")` so it inherits animation | Task 3 |
| File chips open path in Explorer | Tasks 1–2 |
| Non-file artifacts not clickable as file buttons | Task 1 |
| Alex still hides CURRENT WORK OUTPUT | unchanged + Task 1 keeps `showWorkOutput` |
| No decorative / game motion | Global constraints + Task 3 motion values |

## Placeholder scan

No TBD / “add tests later” / vague steps remaining.

## Type consistency

- Callback name: `onOpenWorkOutput(path: string)`
- Panel keys: `"team-floor" | "workspace"`
- Artifact filter: `type === "file_output"`, path = `name`
