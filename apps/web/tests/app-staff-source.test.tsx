import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getActiveProject: vi.fn().mockResolvedValue({
    id: "project_1",
    name: "Project",
  }),
  getRuntimeStatus: vi.fn().mockResolvedValue({
    state: "connected",
    selectedProfileId: "profile_1",
    selectedModel: "model_1",
  }),
  getStaffProfiles: vi.fn().mockResolvedValue([]),
  activeHandoff: null as null | {
    id: string
    fromStaffId: string
    toStaffId: string
    title: string
    summary: string
    artifactCount: number
    status: "animating"
  },
  start: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  cancel: vi.fn(),
}))

vi.mock("@/components/activity/ActivityFeed", () => ({
  ActivityFeed: ({ events }: { events: unknown[] }) => (
    <div data-testid="activity-count">{events.length}</div>
  ),
}))
vi.mock("@/components/approvals/CommandApprovalDialog", () => ({
  CommandApprovalDialog: () => null,
}))
vi.mock("@/components/editor/CodeWorkspace", () => ({
  CodeWorkspace: () => null,
}))
vi.mock("@/components/handoff/HandoffOverlay", () => ({
  HandoffOverlay: ({
    handoff,
    onDismiss,
  }: {
    handoff: { id: string } | null
    onDismiss: () => void
  }) => handoff
    ? <button onClick={onDismiss}>handoff:{handoff.id}</button>
    : null,
}))
vi.mock("@/components/mission/MissionComposer", () => ({
  MissionComposer: () => null,
}))
vi.mock("@/components/mission/MissionControlBar", () => ({
  MissionControlBar: () => null,
}))
vi.mock("@/components/repository/ProjectExplorer", () => ({
  ProjectExplorer: () => null,
}))
vi.mock("@/components/shell/AppShell", () => ({
  AppShell: ({
    workspace,
    teamPanel,
    overlays,
  }: {
    workspace: ReactNode
    teamPanel: ReactNode
    overlays?: ReactNode
  }) => <>{workspace}{teamPanel}{overlays}</>,
}))
vi.mock("@/components/shell/WorkspaceSidebar", () => ({
  WorkspaceSidebar: () => null,
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
      activeHandoff: mocks.activeHandoff,
      lastSequence: 0,
      processedEventIds: [],
    },
    error: null,
    hasStarted: false,
    playing: false,
    paused: false,
    start: mocks.start,
    pause: mocks.pause,
    resume: mocks.resume,
    cancel: mocks.cancel,
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
vi.mock("@/features/staff/staff-api", () => ({
  getStaffProfiles: mocks.getStaffProfiles,
}))

import { App } from "@/app/App"

describe("App staff source", () => {
  beforeEach(() => {
    mocks.activeHandoff = null
    mocks.start.mockClear()
    mocks.pause.mockClear()
    mocks.resume.mockClear()
    mocks.cancel.mockClear()
  })

  it("does not synthesize staff readiness when live activity is empty", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>,
    )

    expect(await screen.findByTestId("activity-count")).toHaveTextContent("0")
    expect(screen.queryByText(/ready to receive a software mission/i)).not.toBeInTheDocument()
  })

  it("dismisses only the current handoff locally and shows a new handoff", async () => {
    mocks.activeHandoff = {
      id: "handoff_1",
      fromStaffId: "staff_maya",
      toStaffId: "staff_ethan",
      title: "Research complete",
      summary: "Implementation brief ready.",
      artifactCount: 1,
      status: "animating",
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const app = () => (
      <QueryClientProvider client={client}>
        <App />
      </QueryClientProvider>
    )
    const view = render(app())

    fireEvent.click(await screen.findByRole("button", { name: "handoff:handoff_1" }))
    expect(screen.queryByRole("button", { name: "handoff:handoff_1" })).not.toBeInTheDocument()
    expect(mocks.start).not.toHaveBeenCalled()
    expect(mocks.pause).not.toHaveBeenCalled()
    expect(mocks.resume).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()

    mocks.activeHandoff = { ...mocks.activeHandoff, id: "handoff_2" }
    view.rerender(app())
    expect(screen.getByRole("button", { name: "handoff:handoff_2" })).toBeInTheDocument()
  })
})
