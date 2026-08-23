# HiPo Staff Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `HiPo Staff` tab into a dedicated main workspace with searchable ID-style staff badges that open the existing `StaffProfileDialog`.

**Architecture:** Add a focused `StaffDirectoryScreen` component for the main workspace. Reuse existing `StaffProfileDialog`, `PixelAvatar`, `StaffProfile`, and staff query data; update `App.tsx` to route `activePanel === "staff"` into the new screen and hide the right `EngineeringTeamPanel` while staff is active. Keep all visual work in existing BEM-style CSS in `globals.css`.

**Tech Stack:** React, TypeScript, TanStack Query-owned server state, Zustand UI state, Framer Motion, Vitest/Testing Library, global CSS.

**Spec:** `docs/superpowers/specs/2026-07-30-hipo-staff-directory-design.md`

## Global Constraints

- `HiPo Staff` remains available even when no project is open.
- When `HiPo Staff` is active, hide the right `EngineeringTeamPanel` to avoid duplicate staff surfaces.
- The main workspace switches away from `CodeWorkspace` into a staff directory screen.
- Clicking a staff badge opens the existing `StaffProfileDialog`.
- Search filters staff by display name, role, department, tags, and description.
- Badge cards use the existing `PixelAvatar` so stock/custom avatars and pixel fallbacks keep working.
- First open in the session plays a restrained badge drop-in animation; subsequent visits use normal workspace motion.
- Respect reduced motion: no drop animation; use a simple fade.
- Visual language: compact, mostly neutral, ID-badge inspired; no gradients, glass, cartoon office scenes, or decorative game mechanics.
- No backend changes are required.
- No git repository is available in this workspace, so commits are skipped unless git becomes available.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/components/staff/StaffDirectoryScreen.tsx` | New main workspace screen, search, badge grid, modal state |
| `apps/web/src/components/shell/WorkspacePanelSwitch.tsx` | Accept `"staff"` panel key for transitions |
| `apps/web/src/app/App.tsx` | Route staff active panel to `StaffDirectoryScreen`; hide right team panel |
| `apps/web/src/styles/globals.css` | Staff directory and badge styles/animations |
| `apps/web/tests/staff-directory-screen.test.tsx` | Directory render/search/modal unit coverage |
| `apps/web/tests/app-staff-directory.test.tsx` | App-level active-panel integration / right rail hidden |
| `apps/web/tests/app-panel-transition.test.tsx` | Update panel switch accepted keys |
| `apps/web/tests/navigation-rail.test.tsx` | Assert Staff remains enabled without project |

---

### Task 1: StaffDirectoryScreen Behavior

**Files:**
- Create: `apps/web/src/components/staff/StaffDirectoryScreen.tsx`
- Create: `apps/web/tests/staff-directory-screen.test.tsx`

**Interfaces:**
- Consumes:
  - `StaffProfile` from `@/types/domain`
  - `PixelAvatar({ avatar, name, size? })`
  - `StaffProfileDialog({ staff, open, available, onAvailableChange, onOpenChange })`
- Produces:
  - `StaffDirectoryScreen({ staff, isLoading?, error? }: StaffDirectoryScreenProps)`
  - `StaffDirectoryScreenProps`:
    ```ts
    interface StaffDirectoryScreenProps {
      staff: StaffProfile[]
      isLoading?: boolean
      error?: Error | null
    }
    ```

- [ ] **Step 1: Write failing behavior tests**

Create `apps/web/tests/staff-directory-screen.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getStaffDocument, saveStaffDocument } = vi.hoisted(() => ({
  getStaffDocument: vi.fn(),
  saveStaffDocument: vi.fn(),
}))

vi.mock("@/features/staff/staff-api", async () => {
  const actual = await vi.importActual<typeof import("@/features/staff/staff-api")>(
    "@/features/staff/staff-api",
  )
  return {
    ...actual,
    getStaffDocument,
    saveStaffDocument,
  }
})

import { StaffDirectoryScreen } from "@/components/staff/StaffDirectoryScreen"

import { staffProfiles } from "./fixtures/staff"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe("StaffDirectoryScreen", () => {
  beforeEach(() => {
    getStaffDocument.mockReset()
    saveStaffDocument.mockReset()
    getStaffDocument.mockResolvedValue({
      id: "staff_maya",
      slug: "maya-researcher",
      markdown: "---\nid: staff_maya\n---\n# Identity\nMaya researches carefully.\n",
    })
    saveStaffDocument.mockResolvedValue({
      id: "staff_maya",
      slug: "maya-researcher",
      markdown: "---\nid: staff_maya\n---\n# Identity\nMaya researches carefully.\n",
    })
  })

  it("renders staff as ID badge cards with role and description", () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    expect(screen.getByRole("heading", { name: "HiPo Staff" })).toBeInTheDocument()
    expect(screen.getByText("7 staff profiles")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.getByText("Researcher")).toBeInTheDocument()
    expect(screen.getByText(staffProfiles.find((staff) => staff.id === "staff_maya")!.description))
      .toBeInTheDocument()
  })

  it("filters by name, role, department, tags, and description", () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)
    const search = screen.getByRole("searchbox", { name: "Search staff" })

    fireEvent.change(search, { target: { value: "frontend" } })
    expect(screen.getByRole("button", { name: "Open Lina profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Maya profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "research" } })
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()

    fireEvent.change(search, { target: { value: "not-a-member" } })
    expect(screen.getByText("No staff match that search.")).toBeInTheDocument()
  })

  it("opens the existing staff profile dialog from a badge", async () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    fireEvent.click(screen.getByRole("button", { name: "Open Maya profile" }))

    expect(await screen.findByRole("heading", { name: "Maya" })).toBeInTheDocument()
    expect(screen.getByText("Researcher")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Maya availability" })).toBeInTheDocument()
  })

  it("shows loading, error, and empty states", () => {
    const view = renderWithClient(<StaffDirectoryScreen staff={[]} isLoading />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading staff profiles")

    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StaffDirectoryScreen staff={[]} error={new Error("unavailable")} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Staff profiles are unavailable.")

    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StaffDirectoryScreen staff={[]} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole("status")).toHaveTextContent("No staff profiles are available.")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Expected: FAIL because `StaffDirectoryScreen` does not exist.

- [ ] **Step 3: Implement StaffDirectoryScreen**

Create `apps/web/src/components/staff/StaffDirectoryScreen.tsx`:

```tsx
import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { Input } from "@/components/ui/input"
import type { StaffProfile } from "@/types/domain"

import { PixelAvatar } from "./PixelAvatar"
import { StaffProfileDialog } from "./StaffProfileDialog"

interface StaffDirectoryScreenProps {
  staff: StaffProfile[]
  isLoading?: boolean
  error?: Error | null
}

const openedInSession = { current: false }

function searchableText(staff: StaffProfile): string {
  return [
    staff.displayName,
    staff.name,
    staff.role,
    staff.roleKey,
    staff.department,
    staff.seniority,
    staff.description,
    staff.status,
    ...staff.tags,
  ].join(" ").toLowerCase()
}

function statusLabel(status: StaffProfile["status"]): string {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function StaffDirectoryScreen({
  staff,
  isLoading = false,
  error = null,
}: StaffDirectoryScreenProps) {
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState("")
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null)
  const [availabilityOverrides, setAvailabilityOverrides] = useState<Record<string, boolean>>({})
  const shouldDrop = !openedInSession.current
  openedInSession.current = true

  const normalizedQuery = query.trim().toLowerCase()
  const visibleStaff = useMemo(() => {
    if (!normalizedQuery) return staff
    return staff.filter((member) => searchableText(member).includes(normalizedQuery))
  }, [normalizedQuery, staff])
  const profileStaff = staff.find((member) => member.id === profileStaffId) ?? null

  return (
    <section className="staff-directory" aria-labelledby="staff-directory-title">
      <header className="staff-directory__header">
        <span>
          <p className="staff-directory__eyebrow">HiPo Staff</p>
          <h1 id="staff-directory-title">HiPo Staff</h1>
          <p>Browse the local workforce layer.</p>
        </span>
        <strong>
          {normalizedQuery
            ? `${visibleStaff.length} of ${staff.length} shown`
            : `${staff.length} ${staff.length === 1 ? "staff profile" : "staff profiles"}`}
        </strong>
      </header>

      <label className="staff-directory__search">
        <Search aria-hidden="true" />
        <span className="sr-only">Search staff</span>
        <Input
          type="search"
          role="searchbox"
          aria-label="Search staff"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search names, roles, tags…"
        />
      </label>

      {isLoading ? (
        <p className="staff-directory__state" role="status">Loading staff profiles…</p>
      ) : error ? (
        <p className="staff-directory__state" role="alert">Staff profiles are unavailable.</p>
      ) : staff.length === 0 ? (
        <p className="staff-directory__state" role="status">No staff profiles are available.</p>
      ) : visibleStaff.length === 0 ? (
        <p className="staff-directory__state">No staff match that search.</p>
      ) : (
        <div className="staff-directory__grid">
          <AnimatePresence initial={shouldDrop && !reduceMotion}>
            {visibleStaff.map((member, index) => {
              const available = availabilityOverrides[member.id] ?? member.status !== "offline"
              return (
                <motion.button
                  key={member.id}
                  type="button"
                  className="staff-badge-card"
                  aria-label={`Open ${member.displayName} profile`}
                  initial={shouldDrop && !reduceMotion ? { opacity: 0, y: -28, rotate: -1 } : false}
                  animate={{ opacity: 1, y: 0, rotate: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ delay: shouldDrop ? Math.min(index * 0.04, 0.28) : 0, duration: 0.24 }}
                  onClick={() => setProfileStaffId(member.id)}
                >
                  <span className="staff-badge-card__clip" aria-hidden="true" />
                  <span className="staff-badge-card__name-strip">{member.displayName}</span>
                  <span className="staff-badge-card__portrait">
                    <PixelAvatar avatar={member.avatar} name={member.displayName} size="lg" />
                  </span>
                  <span className="staff-badge-card__copy">
                    <strong>{member.role}</strong>
                    <span>{member.description}</span>
                  </span>
                  <span className="staff-badge-card__footer">
                    <strong>HiPo Staff</strong>
                    <span>{available ? "Available" : statusLabel(member.status)}</span>
                  </span>
                </motion.button>
              )
            })}
          </AnimatePresence>
        </div>
      )}

      {profileStaff && (
        <StaffProfileDialog
          staff={profileStaff}
          open
          available={availabilityOverrides[profileStaff.id] ?? profileStaff.status !== "offline"}
          onAvailableChange={(available) => {
            setAvailabilityOverrides((current) => ({
              ...current,
              [profileStaff.id]: available,
            }))
          }}
          onOpenChange={(open) => {
            if (!open) setProfileStaffId(null)
          }}
        />
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Expected: PASS.

---

### Task 2: App Integration and Panel Routing

**Files:**
- Modify: `apps/web/src/components/shell/WorkspacePanelSwitch.tsx`
- Modify: `apps/web/src/components/shell/AppShell.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/tests/app-panel-transition.test.tsx`
- Create: `apps/web/tests/app-staff-directory.test.tsx`
- Modify: `apps/web/tests/navigation-rail.test.tsx`

**Interfaces:**
- Consumes: `StaffDirectoryScreen` from Task 1
- Produces:
  - `WorkspacePanelKey = "team-floor" | "staff" | "workspace"`
  - `AppShell({ hideTeamPanel?: boolean })`
  - `App.tsx` route: `activePanel === "staff"` renders `StaffDirectoryScreen`

- [ ] **Step 1: Write failing integration tests**

Update `apps/web/tests/app-panel-transition.test.tsx`:

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

  it("accepts the HiPo Staff panel key", () => {
    render(
      <WorkspacePanelSwitch panelKey="staff">
        <div>HiPo Staff panel</div>
      </WorkspacePanelSwitch>,
    )
    expect(screen.getByText("HiPo Staff panel")).toBeInTheDocument()
  })
})
```

Create `apps/web/tests/app-staff-directory.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getActiveProject: vi.fn().mockResolvedValue(null),
  getRuntimeStatus: vi.fn().mockResolvedValue({
    state: "unconfigured",
    selectedProfileId: null,
    selectedModel: null,
  }),
  getStaffProfiles: vi.fn().mockResolvedValue([]),
  activePanel: "staff",
  setActivePanel: vi.fn(),
}))

vi.mock("@/components/activity/ActivityFeed", () => ({ ActivityFeed: () => null }))
vi.mock("@/components/approvals/CommandApprovalDialog", () => ({ CommandApprovalDialog: () => null }))
vi.mock("@/components/editor/CodeWorkspace", () => ({ CodeWorkspace: () => <div data-testid="code-workspace" /> }))
vi.mock("@/components/handoff/HandoffOverlay", () => ({ HandoffOverlay: () => null }))
vi.mock("@/components/mission/MissionComposer", () => ({ MissionComposer: () => null }))
vi.mock("@/components/mission/MissionControlBar", () => ({ MissionControlBar: () => null }))
vi.mock("@/components/repository/ProjectExplorer", () => ({ ProjectExplorer: () => null }))
vi.mock("@/components/shell/WorkspaceSidebar", () => ({ WorkspaceSidebar: () => <aside data-testid="workspace-sidebar" /> }))
vi.mock("@/components/staff/EngineeringTeamPanel", () => ({
  EngineeringTeamPanel: () => <aside data-testid="engineering-team" />,
}))
vi.mock("@/components/staff/StaffDirectoryScreen", () => ({
  StaffDirectoryScreen: () => <section data-testid="staff-directory" />,
}))
vi.mock("@/components/team-floor/TeamFloor", () => ({ TeamFloor: () => null }))
vi.mock("@/components/work-log/WorkLogDrawer", () => ({ WorkLogDrawer: () => null }))
vi.mock("@/components/shell/AppShell", async () => {
  const actual = await vi.importActual<typeof import("@/components/shell/AppShell")>(
    "@/components/shell/AppShell",
  )
  return actual
})
vi.mock("@/features/mission/use-live-runtime", () => ({
  useLiveRuntime: () => ({
    mission: null,
    session: null,
    projection: {
      status: "draft",
      currentStaffId: null,
      activeFile: "",
      fileRevision: 0,
      editorOwnerId: null,
      selectedStaffIds: [],
      staffStatuses: {},
      activity: [],
      artifacts: [],
      workLogs: {},
      activeHandoff: null,
      lastSequence: 0,
      processedEventIds: [],
    },
    error: null,
    hasStarted: false,
    playing: false,
    paused: false,
    start: vi.fn(),
    sendFollowUp: vi.fn(),
    selectSession: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    dismiss: vi.fn(),
  }),
}))
vi.mock("@/features/models/model-api", () => ({ getRuntimeStatus: mocks.getRuntimeStatus }))
vi.mock("@/features/projects/project-api", () => ({ getActiveProject: mocks.getActiveProject }))
vi.mock("@/features/mission/mission-api", () => ({ listMissionSessions: vi.fn().mockResolvedValue([]) }))
vi.mock("@/features/staff/staff-api", () => ({ getStaffProfiles: mocks.getStaffProfiles }))
vi.mock("@/stores/ui-store", async () => {
  const actual = await vi.importActual<typeof import("@/stores/ui-store")>("@/stores/ui-store")
  return {
    ...actual,
    useUiStore: (selector: (state: {
      activePanel: string
      setActivePanel: (panel: string) => void
      selectedStaffId: string
      selectStaff: (staffId: string) => void
      workLogOpen: boolean
      setWorkLogOpen: (open: boolean) => void
      activeFile: string | null
      openFiles: string[]
      openFile: (path: string) => void
      closeFile: (path: string) => void
      clearFiles: () => void
    }) => unknown) => selector({
      activePanel: mocks.activePanel,
      setActivePanel: mocks.setActivePanel,
      selectedStaffId: "staff_alex",
      selectStaff: vi.fn(),
      workLogOpen: false,
      setWorkLogOpen: vi.fn(),
      activeFile: null,
      openFiles: [],
      openFile: vi.fn(),
      closeFile: vi.fn(),
      clearFiles: vi.fn(),
    }),
  }
})

import { App } from "@/app/App"

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><App /></QueryClientProvider>)
}

describe("App HiPo Staff directory", () => {
  beforeEach(() => {
    mocks.activePanel = "staff"
    mocks.setActivePanel.mockClear()
    mocks.getActiveProject.mockResolvedValue(null)
    mocks.getStaffProfiles.mockResolvedValue([])
  })

  it("renders staff directory in the main workspace and hides the engineering rail", async () => {
    renderApp()
    expect(await screen.findByTestId("staff-directory")).toBeInTheDocument()
    expect(screen.queryByTestId("engineering-team")).not.toBeInTheDocument()
    expect(screen.queryByTestId("code-workspace")).not.toBeInTheDocument()
  })

  it("keeps staff available without a project", async () => {
    renderApp()
    await waitFor(() => {
      expect(mocks.setActivePanel).not.toHaveBeenCalledWith("explorer")
    })
  })
})
```

Update `apps/web/tests/navigation-rail.test.tsx` to assert `HiPo Staff` stays enabled when `projectOpen={false}`:

```tsx
const staff = screen.getByRole("button", { name: "HiPo Staff" })
expect(staff).toBeEnabled()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/app-panel-transition.test.tsx tests/app-staff-directory.test.tsx tests/navigation-rail.test.tsx
```

Expected: FAIL because staff panel key/app route/hide-team-panel are not wired.

- [ ] **Step 3: Implement app wiring**

1. Update `WorkspacePanelSwitch`:

```tsx
export type WorkspacePanelKey = "team-floor" | "staff" | "workspace"

interface WorkspacePanelSwitchProps {
  panelKey: WorkspacePanelKey
  children: ReactNode
}
```

2. Update `AppShell` props and render:

```tsx
interface AppShellProps {
  activePanel: NavigationPanel
  onPanelChange: (panel: NavigationPanel) => void
  projectOpen: boolean
  hideTeamPanel?: boolean
  sidebar: ReactNode
  workspace: ReactNode
  teamPanel: ReactNode
  overlays?: ReactNode
}
```

Render `{!hideTeamPanel && teamPanel}` instead of `{teamPanel}`.

3. Update `App.tsx` imports:

```tsx
import { StaffDirectoryScreen } from "@/components/staff/StaffDirectoryScreen"
```

4. Update workspace panel key and branch:

```tsx
const workspacePanelKey = activePanel === "team-floor"
  ? "team-floor"
  : activePanel === "staff"
    ? "staff"
    : "workspace"
```

Inside `WorkspacePanelSwitch`:

```tsx
{activePanel === "team-floor" ? (
  <TeamFloor ... />
) : activePanel === "staff" ? (
  <StaffDirectoryScreen
    staff={roster}
    isLoading={staff.isPending}
    error={staff.error}
  />
) : (
  <CodeWorkspace ... />
)}
```

5. Update `AppShell` call:

```tsx
hideTeamPanel={activePanel === "staff"}
```

6. Ensure no-project redirect still only redirects `search` and `team-floor`, not `staff`.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/app-panel-transition.test.tsx tests/app-staff-directory.test.tsx tests/navigation-rail.test.tsx tests/staff-directory-screen.test.tsx
```

Expected: PASS.

---

### Task 3: Staff Directory Styling and Motion Polish

**Files:**
- Modify: `apps/web/src/styles/globals.css`
- Modify: `apps/web/tests/staff-directory-screen.test.tsx` only if class assertions are needed

**Interfaces:**
- Consumes: markup classes from `StaffDirectoryScreen`
- Produces:
  - `.staff-directory`
  - `.staff-directory__header`
  - `.staff-directory__search`
  - `.staff-directory__grid`
  - `.staff-badge-card` and children

- [ ] **Step 1: Add minimal class assertion test**

Append to `staff-directory-screen.test.tsx`:

```tsx
it("uses badge-card structure for the directory wall", () => {
  const { container } = renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)
  expect(container.querySelector(".staff-directory")).not.toBeNull()
  expect(container.querySelectorAll(".staff-badge-card")).toHaveLength(staffProfiles.length)
  expect(container.querySelector(".staff-badge-card__clip")).not.toBeNull()
  expect(container.querySelector(".staff-badge-card__name-strip")).not.toBeNull()
})
```

- [ ] **Step 2: Run test to verify it passes before CSS**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Expected: PASS if Task 1 markup is in place. If this fails, adjust markup before styling.

- [ ] **Step 3: Add CSS**

Add near existing staff/team styles in `apps/web/src/styles/globals.css`:

```css
.staff-directory {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  height: 100%;
  padding: 18px;
  gap: 14px;
  background:
    linear-gradient(#f7f7f4 0 0) padding-box;
}

.staff-directory__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
}

.staff-directory__header h1 {
  margin: 0;
  font-family: var(--font-tova);
  font-size: 22px;
  letter-spacing: 0.03em;
}

.staff-directory__header p {
  margin: 0;
  color: var(--muted-text);
}

.staff-directory__header > strong {
  flex: 0 0 auto;
  color: #3f403c;
  font-size: 12px;
  font-weight: 650;
}

.staff-directory__eyebrow {
  margin: 0 0 3px !important;
  color: var(--soft-text) !important;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.staff-directory__search {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 420px;
}

.staff-directory__search svg {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--soft-text);
  pointer-events: none;
}

.staff-directory__search input {
  padding-left: 30px;
  background: #fff;
}

.staff-directory__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  align-content: start;
  min-height: 0;
  overflow: auto;
  gap: 18px 14px;
  padding: 8px 2px 18px;
}

.staff-directory__state {
  display: grid;
  min-height: 180px;
  place-items: center;
  margin: 0;
  color: var(--muted-text);
  font-size: 12px;
}

.staff-badge-card {
  position: relative;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  min-height: 238px;
  padding: 18px 12px 10px;
  border: 1px solid #e3e3de;
  border-radius: 11px;
  background: #fffefa;
  color: #22231f;
  text-align: left;
  box-shadow: 0 1px 2px color-mix(in srgb, #000 5%, transparent);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.staff-badge-card::before {
  content: "";
  position: absolute;
  top: 6px;
  left: 50%;
  width: 24px;
  height: 4px;
  border-radius: 999px;
  background: #e8e8e3;
  transform: translateX(-50%);
}

.staff-badge-card:hover,
.staff-badge-card:focus-visible {
  border-color: #d2d2cc;
  box-shadow: 0 8px 22px color-mix(in srgb, #000 12%, transparent);
  transform: translateY(-2px);
}

.staff-badge-card:active {
  transform: translateY(0);
}

.staff-badge-card__clip {
  position: absolute;
  top: -11px;
  left: 50%;
  width: 10px;
  height: 18px;
  border: 2px solid #252623;
  border-bottom: 0;
  border-radius: 5px 5px 0 0;
  transform: translateX(-50%);
}

.staff-badge-card__name-strip {
  overflow: hidden;
  border-radius: 5px;
  background: #151613;
  color: white;
  padding: 4px 7px;
  font-size: 10px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.staff-badge-card__portrait {
  display: grid;
  justify-items: start;
  padding: 18px 0 12px;
}

.staff-badge-card__portrait .pixel-avatar {
  width: 58px;
  height: 58px;
  border-radius: 7px;
  background: #fbfbf8;
}

.staff-badge-card__copy {
  display: grid;
  align-content: start;
  gap: 7px;
  min-height: 0;
}

.staff-badge-card__copy strong {
  font-size: 13px;
  line-height: 1.2;
}

.staff-badge-card__copy span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted-text);
  font-size: 10px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.staff-badge-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid var(--line);
  margin-top: 12px;
  padding-top: 8px;
}

.staff-badge-card__footer strong {
  font-family: var(--font-tova);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.staff-badge-card__footer span {
  border-radius: 999px;
  background: #1f201d;
  color: white;
  padding: 3px 6px;
  font-size: 9px;
  font-weight: 650;
}

@media (max-width: 900px) {
  .staff-directory {
    padding: 14px;
  }

  .staff-directory__header {
    align-items: flex-start;
    flex-direction: column;
  }
}
```

- [ ] **Step 4: Run focused visual tests**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx tests/app-staff-directory.test.tsx
```

Expected: PASS.

---

### Task 4: Verification and Impeccable Detector

**Files:**
- No production edits expected unless verification fails

**Interfaces:**
- Consumes all prior tasks
- Produces verification evidence and detector output

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx tests/app-staff-directory.test.tsx tests/app-panel-transition.test.tsx tests/navigation-rail.test.tsx tests/core-components.test.tsx tests/staff-profile-dialog.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
pnpm verify
```

Expected: PASS.

- [ ] **Step 3: Run full workspace verification**

Run:

```bash
uv run python scripts/verify.py
```

Expected: PASS. If this fails in untouched backend checks, report the exact failure and run the focused frontend verification as the minimum evidence.

- [ ] **Step 4: Run Impeccable detector on changed UI targets**

Run:

```bash
node C:\Users\lazoa\.agents\skills\impeccable\scripts\detect.mjs --json apps/web/src/components/staff/StaffDirectoryScreen.tsx apps/web/src/styles/globals.css apps/web/src/app/App.tsx
```

Expected: no blocking findings. Fix any findings that conflict with TOVA constraints or the approved design; if the detector asks for a product/design init, report it as a follow-up because this task preserved the incumbent visual system.

- [ ] **Step 5: Manual smoke**

With the dev server running:

1. Open `http://127.0.0.1:5173`
2. Click `HiPo Staff`
3. Confirm the main screen switches to the badge directory
4. Confirm the right Engineering Team rail is hidden
5. Search for a name and role
6. Click a badge and confirm `StaffProfileDialog` opens
7. Confirm hover lift/shadow feels subtle

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Dedicated main workspace | Task 2 |
| Hide right Engineering Team rail | Task 2 |
| Search by name/role/department/tags/description | Task 1 |
| Badge card with PixelAvatar, role, description | Task 1 + Task 3 |
| Click badge opens StaffProfileDialog | Task 1 |
| First-open badge drop animation | Task 1 |
| Reduced motion support | Task 1 |
| Compact neutral ID-badge styling | Task 3 |
| Staff tab available without project | Task 2 |
| Focused and full verification | Task 4 |

## Placeholder Scan

No `TODO`, `TBD`, or undefined implementation placeholders. Commit steps are intentionally omitted because this workspace is not a git repository.
