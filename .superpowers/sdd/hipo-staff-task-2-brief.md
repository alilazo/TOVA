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
