import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"

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
vi.mock("@/components/approvals/CommandApprovalDialog", () => ({
  CommandApprovalDialog: () => null,
}))
vi.mock("@/components/editor/CodeWorkspace", () => ({
  CodeWorkspace: () => <div data-testid="code-workspace" />,
}))
vi.mock("@/components/handoff/HandoffOverlay", () => ({ HandoffOverlay: () => null }))
vi.mock("@/components/mission/MissionComposer", () => ({ MissionComposer: () => null }))
vi.mock("@/components/mission/MissionControlBar", () => ({ MissionControlBar: () => null }))
vi.mock("@/components/repository/ProjectExplorer", () => ({ ProjectExplorer: () => null }))
vi.mock("@/components/shell/WorkspaceSidebar", () => ({
  WorkspaceSidebar: () => <aside data-testid="workspace-sidebar" />,
}))
vi.mock("@/components/shell/TopBar", () => ({ TopBar: () => null }))
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
vi.mock("@/features/models/model-api", () => ({ getRuntimeStatus: mocks.getRuntimeStatus, listModelProfiles: vi.fn().mockResolvedValue([]), discoverModels: vi.fn(), selectModel: vi.fn(), testModel: vi.fn() }))
vi.mock("@/features/projects/project-api", () => ({
  getActiveProject: mocks.getActiveProject,
  listRecentProjects: vi.fn().mockResolvedValue([
    {
      id: "project_recent",
      name: "existing",
      root: "F:\\Projects\\existing",
      lastOpenedAt: "2026-08-20T00:00:00.000Z",
    },
  ]),
  openSampleProject: vi.fn(),
}))
vi.mock("@/features/mission/mission-api", () => ({
  listMissionSessions: vi.fn().mockResolvedValue([]),
}))
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
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe("App HiPo Staff directory", () => {
  beforeEach(() => {
    mocks.activePanel = "staff"
    mocks.setActivePanel.mockClear()
    mocks.getActiveProject.mockResolvedValue(null)
    mocks.getStaffProfiles.mockResolvedValue([])
  })

  it("renders the staff roster without stripping the engineering rail", async () => {
    mocks.getActiveProject.mockResolvedValue({
      id: "project_1",
      name: "Demo",
      root: "F:\\Projects\\demo",
    })
    renderApp()
    expect(await screen.findByTestId("staff-directory")).toBeInTheDocument()
    expect(screen.getByTestId("engineering-team")).toBeInTheDocument()
    expect(screen.queryByTestId("code-workspace")).not.toBeInTheDocument()
  })

  it("keeps staff available without a project", async () => {
    renderApp()
    await waitFor(() => {
      expect(mocks.setActivePanel).not.toHaveBeenCalledWith("explorer")
    })
  })
})
