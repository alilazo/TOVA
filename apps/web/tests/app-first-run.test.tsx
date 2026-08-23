import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getActiveProject: vi.fn().mockResolvedValue(null),
  listRecentProjects: vi.fn().mockResolvedValue([]),
  openSampleProject: vi.fn(),
  listMissionSessions: vi.fn().mockResolvedValue([]),
  selectSession: vi.fn(),
  getRuntimeStatus: vi.fn().mockResolvedValue({
    state: "connected",
    selectedProfileId: "profile_1",
    selectedModel: "qwen/qwen3.6-35b-a3b",
  }),
  getStaffProfiles: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/components/activity/ActivityFeed", () => ({ ActivityFeed: () => null }))
vi.mock("@/components/approvals/CommandApprovalDialog", () => ({
  CommandApprovalDialog: () => null,
}))
vi.mock("@/components/editor/CodeWorkspace", () => ({
  CodeWorkspace: () => <div data-testid="code-workspace" />,
}))
vi.mock("@/components/handoff/HandoffOverlay", () => ({ HandoffOverlay: () => null }))
vi.mock("@/components/mission/MissionComposer", () => ({
  MissionComposer: ({
    projectName,
    initialRequest,
  }: {
    projectName?: string | null
    initialRequest?: string
  }) => (
    <div>
      <span data-testid="composer-project">{projectName ?? ""}</span>
      <span data-testid="composer-request">{initialRequest ?? ""}</span>
    </div>
  ),
}))
vi.mock("@/components/mission/MissionControlBar", () => ({ MissionControlBar: () => null }))
vi.mock("@/components/repository/ProjectExplorer", () => ({
  ProjectExplorer: () => <aside data-testid="project-explorer" />,
}))
vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({ teamPanel }: { teamPanel: ReactNode }) => <>{teamPanel}</>,
}))
vi.mock("@/components/shell/WorkspaceSidebar", () => ({
  WorkspaceSidebar: () => <aside data-testid="workspace-sidebar" />,
}))
vi.mock("@/components/staff/EngineeringTeamPanel", () => ({
  EngineeringTeamPanel: ({ missionControls }: { missionControls?: ReactNode }) => (
    <div data-testid="team-panel">{missionControls}</div>
  ),
}))
vi.mock("@/components/team-floor/TeamFloor", () => ({ TeamFloor: () => null }))
vi.mock("@/components/work-log/WorkLogDrawer", () => ({ WorkLogDrawer: () => null }))
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
    selectSession: mocks.selectSession,
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
  listRecentProjects: mocks.listRecentProjects,
  openSampleProject: mocks.openSampleProject,
}))
vi.mock("@/features/mission/mission-api", () => ({
  listMissionSessions: mocks.listMissionSessions,
}))
vi.mock("@/features/staff/staff-api", () => ({
  getStaffProfiles: mocks.getStaffProfiles,
}))

import { App } from "@/app/App"

const sampleProject = {
  id: "project_sample",
  name: "first-mission",
  root: "C:\\Users\\tova\\sample-projects\\first-mission",
  starterObjective: "Make the Count button increment a visible number.",
}

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  )
}

describe("App first-run sample project", () => {
  beforeEach(() => {
    mocks.getActiveProject.mockReset()
    mocks.listRecentProjects.mockReset()
    mocks.openSampleProject.mockReset()
    mocks.getActiveProject.mockResolvedValue(null)
    mocks.listRecentProjects.mockResolvedValue([])
    mocks.openSampleProject.mockResolvedValue(sampleProject)
    mocks.listMissionSessions.mockReset()
    mocks.selectSession.mockReset()
    mocks.listMissionSessions.mockResolvedValue([])
  })

  it("opens the sample project and prefills the canned mission when history is empty", async () => {
    renderApp()

    await waitFor(() => {
      expect(mocks.openSampleProject).toHaveBeenCalledOnce()
    })
    expect(await screen.findByTestId("composer-project")).toHaveTextContent("first-mission")
    expect(screen.getByTestId("composer-request")).toHaveTextContent(
      "Make the Count button increment a visible number.",
    )
  })

  it("does not steal a returning user's recent project", async () => {
    mocks.listRecentProjects.mockResolvedValue([
      {
        id: "project_recent",
        name: "my-app",
        root: "F:\\Projects\\my-app",
        lastOpenedAt: "2026-08-20T00:00:00.000Z",
      },
    ])
    renderApp()

    await waitFor(() => {
      expect(mocks.listRecentProjects).toHaveBeenCalled()
    })
    expect(mocks.openSampleProject).not.toHaveBeenCalled()
    expect(screen.getByTestId("composer-project")).toHaveTextContent("")
  })

  it("restores the newest mission session onto the Team Floor", async () => {
    mocks.getActiveProject.mockResolvedValue(sampleProject)
    mocks.listRecentProjects.mockResolvedValue([
      {
        id: sampleProject.id,
        name: sampleProject.name,
        root: sampleProject.root,
        lastOpenedAt: "2026-08-20T00:00:00.000Z",
      },
    ])
    mocks.listMissionSessions.mockResolvedValue([
      {
        id: "session_latest",
        project_id: sampleProject.id,
        project_root: sampleProject.root,
        title: "Count button",
        status: "completed",
        active_mission_id: "mission_latest",
        created_at: "2026-08-20T21:00:00.000Z",
        updated_at: "2026-08-20T21:00:00.000Z",
        turns: [],
      },
    ])
    renderApp()
    await waitFor(() => {
      expect(mocks.selectSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: "session_latest" }),
      )
    })
  })
})
