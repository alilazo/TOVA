import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { useUiStore } from "@/stores/ui-store"
import type { ProjectRecord } from "@/features/projects/project-api"

const mocks = vi.hoisted(() => ({
  getActiveProject: vi.fn(),
  getRuntimeStatus: vi.fn().mockResolvedValue({
    state: "connected",
    selectedProfileId: "profile_1",
    selectedModel: "qwen/qwen3.6-35b-a3b",
  }),
  getStaffProfiles: vi.fn().mockResolvedValue([]),
  listMissionSessions: vi.fn().mockResolvedValue([]),
  dismiss: vi.fn(),
  selectSession: vi.fn(),
  projection: {
    status: "completed",
    currentStaffId: null,
    activeFile: "script.js",
    fileRevision: 1,
    editorOwnerId: null,
    selectedStaffIds: [],
    staffStatuses: {},
    activity: [],
    artifacts: [],
    workLogs: {},
    activeHandoff: null,
    lastSequence: 4,
    processedEventIds: [],
  },
}))

vi.mock("@/components/activity/ActivityFeed", () => ({ ActivityFeed: () => null }))
vi.mock("@/components/approvals/CommandApprovalDialog", () => ({
  CommandApprovalDialog: () => null,
}))
vi.mock("@/components/editor/CodeWorkspace", () => ({
  CodeWorkspace: ({
    onProjectOpened,
  }: {
    onProjectOpened?: (project: ProjectRecord) => void
  }) => (
    <button
      type="button"
      onClick={() => onProjectOpened?.({
        id: "project_b",
        name: "next",
        root: "F:\\Projects\\next",
      })}
    >
      Switch project
    </button>
  ),
}))
vi.mock("@/components/handoff/HandoffOverlay", () => ({ HandoffOverlay: () => null }))
vi.mock("@/components/mission/MissionComposer", () => ({ MissionComposer: () => null }))
vi.mock("@/components/mission/MissionControlBar", () => ({ MissionControlBar: () => null }))
vi.mock("@/components/repository/ProjectExplorer", () => ({
  ProjectExplorer: ({
    onProjectOpened,
  }: {
    onProjectOpened: (project: ProjectRecord) => void
  }) => (
    <button
      type="button"
      onClick={() => onProjectOpened({
        id: "project_b",
        name: "next",
        root: "F:\\Projects\\next",
      })}
    >
      Switch project
    </button>
  ),
}))
vi.mock("@/components/shell/WorkspaceSidebar", () => ({
  WorkspaceSidebar: () => <aside data-testid="workspace-sidebar" />,
}))
vi.mock("@/components/staff/EngineeringTeamPanel", () => ({
  EngineeringTeamPanel: () => <aside data-testid="engineering-team" />,
}))
vi.mock("@/components/team-floor/TeamFloor", () => ({ TeamFloor: () => null }))
vi.mock("@/components/work-log/WorkLogDrawer", () => ({ WorkLogDrawer: () => null }))
vi.mock("@/features/mission/use-live-runtime", () => ({
  useLiveRuntime: () => ({
    mission: {
      id: "mission_old",
      project_id: "project_a",
      objective: "Hello World",
      project_root: "F:\\Projects\\a",
      status: "completed",
      model_profile_id: "profile_1",
      model: "qwen/qwen3.6-35b-a3b",
    },
    session: { id: "session_old" },
    projection: mocks.projection,
    error: null,
    hasStarted: true,
    playing: false,
    paused: false,
    start: vi.fn(),
    sendFollowUp: vi.fn(),
    selectSession: mocks.selectSession,
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    dismiss: () => {
      mocks.projection.activeFile = ""
      mocks.dismiss()
    },
  }),
}))
vi.mock("@/features/models/model-api", () => ({
  getRuntimeStatus: mocks.getRuntimeStatus,
  listModelProfiles: vi.fn().mockResolvedValue([]),
  discoverModels: vi.fn(),
  selectModel: vi.fn(),
  testModel: vi.fn(),
}))
vi.mock("@/features/projects/project-api", () => ({
  getActiveProject: mocks.getActiveProject,
  listRecentProjects: vi.fn().mockResolvedValue([]),
  openSampleProject: vi.fn(),
}))
vi.mock("@/features/mission/mission-api", () => ({
  listMissionSessions: mocks.listMissionSessions,
}))
vi.mock("@/features/staff/staff-api", () => ({ getStaffProfiles: mocks.getStaffProfiles }))
vi.mock("@/components/shell/AppShell", async () => {
  const actual = await vi.importActual<typeof import("@/components/shell/AppShell")>(
    "@/components/shell/AppShell",
  )
  return actual
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

describe("App project switch", () => {
  beforeEach(() => {
    mocks.dismiss.mockClear()
    mocks.selectSession.mockClear()
    mocks.projection.activeFile = "script.js"
    mocks.getActiveProject.mockResolvedValue({
      id: "project_a",
      name: "hello",
      root: "F:\\Projects\\a",
    })
    useUiStore.setState({
      activePanel: "explorer",
      activeFile: "script.js",
      openFiles: ["script.js"],
    })
  })

  it("dismisses the previous mission and clears open files when a new project opens", async () => {
    const user = userEvent.setup()
    renderApp()
    expect(await screen.findByRole("button", { name: "Switch project" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Switch project" }))

    expect(mocks.dismiss).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(useUiStore.getState().activeFile).toBeNull()
      expect(useUiStore.getState().openFiles).toEqual([])
    })
  })
})
