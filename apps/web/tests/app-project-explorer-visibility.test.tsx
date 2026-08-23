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
}))

vi.mock("@/components/activity/ActivityFeed", () => ({
  ActivityFeed: () => null,
}))
vi.mock("@/components/approvals/CommandApprovalDialog", () => ({
  CommandApprovalDialog: () => null,
}))
vi.mock("@/components/editor/CodeWorkspace", () => ({
  CodeWorkspace: () => <div data-testid="code-workspace" />,
}))
vi.mock("@/components/handoff/HandoffOverlay", () => ({
  HandoffOverlay: () => null,
}))
vi.mock("@/components/mission/MissionComposer", () => ({
  MissionComposer: () => null,
}))
vi.mock("@/components/mission/MissionControlBar", () => ({
  MissionControlBar: () => null,
}))
vi.mock("@/components/repository/ProjectExplorer", () => ({
  ProjectExplorer: () => <aside data-testid="project-explorer" />,
}))
vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({
    sidebar,
    workspace,
  }: {
    sidebar: ReactNode
    workspace: ReactNode
  }) => (
    <>
      {sidebar}
      {workspace}
    </>
  ),
}))
vi.mock("@/components/shell/WorkspaceSidebar", () => ({
  WorkspaceSidebar: () => <aside data-testid="workspace-sidebar" />,
}))
vi.mock("@/components/staff/EngineeringTeamPanel", () => ({
  EngineeringTeamPanel: () => null,
}))
vi.mock("@/components/team-floor/TeamFloor", () => ({
  TeamFloor: () => null,
}))
vi.mock("@/components/work-log/WorkLogDrawer", () => ({
  WorkLogDrawer: () => null,
}))
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
vi.mock("@/features/models/model-api", () => ({
  getRuntimeStatus: mocks.getRuntimeStatus,
  listModelProfiles: vi.fn().mockResolvedValue([]),
  discoverModels: vi.fn(),
  selectModel: vi.fn(),
  testModel: vi.fn(),
}))
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
vi.mock("@/features/staff/staff-api", () => ({
  getStaffProfiles: mocks.getStaffProfiles,
}))

import { App } from "@/app/App"

describe("App project explorer visibility", () => {
  beforeEach(() => {
    mocks.getActiveProject.mockReset()
  })

  it("hides the Project pane when no project is open", async () => {
    mocks.getActiveProject.mockResolvedValue(null)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId("code-workspace")).toBeInTheDocument()
    })
    expect(screen.queryByTestId("project-explorer")).not.toBeInTheDocument()
  })

  it("shows the Project pane when a project is open", async () => {
    mocks.getActiveProject.mockResolvedValue({
      id: "project_1",
      name: "Demo",
      root: "F:\\Projects\\demo",
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    )

    expect(await screen.findByTestId("project-explorer")).toBeInTheDocument()
  })
})
