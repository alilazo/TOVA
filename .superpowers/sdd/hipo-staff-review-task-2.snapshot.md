# Review package: HiPo Staff Task 2 (no git)

## Files

## FILE: apps/web/src/components/shell/WorkspacePanelSwitch.tsx

```
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"

export type WorkspacePanelKey = "team-floor" | "staff" | "workspace"

interface WorkspacePanelSwitchProps {
  panelKey: WorkspacePanelKey
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

## FILE: apps/web/src/components/shell/AppShell.tsx

```
import type { ReactNode } from "react"

import type { NavigationPanel } from "@/stores/ui-store"

import { NavigationRail } from "./NavigationRail"
import { TopBar } from "./TopBar"

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

export function AppShell({
  activePanel,
  onPanelChange,
  projectOpen,
  hideTeamPanel = false,
  sidebar,
  workspace,
  teamPanel,
  overlays,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-shell__body">
        <NavigationRail
          active={activePanel}
          onChange={onPanelChange}
          projectOpen={projectOpen}
        />
        {sidebar}
        <main className="app-shell__workspace">{workspace}</main>
        {!hideTeamPanel && teamPanel}
      </div>
      {overlays}
    </div>
  )
}

```

## FILE: apps/web/src/app/App.tsx

```
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { ActivityFeed } from "@/components/activity/ActivityFeed"
import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
import { CodeWorkspace } from "@/components/editor/CodeWorkspace"
import { HandoffOverlay } from "@/components/handoff/HandoffOverlay"
import { MissionComposer } from "@/components/mission/MissionComposer"
import { MissionControlBar } from "@/components/mission/MissionControlBar"
import { ProjectExplorer } from "@/components/repository/ProjectExplorer"
import { AppShell } from "@/components/shell/AppShell"
import { WorkspacePanelSwitch } from "@/components/shell/WorkspacePanelSwitch"
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar"
import { EngineeringTeamPanel } from "@/components/staff/EngineeringTeamPanel"
import { StaffDirectoryScreen } from "@/components/staff/StaffDirectoryScreen"
import { TeamFloor } from "@/components/team-floor/TeamFloor"
import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
import { listMissionSessions } from "@/features/mission/mission-api"
import { useLiveRuntime } from "@/features/mission/use-live-runtime"
import { getRuntimeStatus } from "@/features/models/model-api"
import { getActiveProject, type ProjectRecord } from "@/features/projects/project-api"
import { getStaffProfiles } from "@/features/staff/staff-api"
import { useUiStore } from "@/stores/ui-store"
import { isTerminalMissionStatus } from "@/types/domain"

export function App() {
  const client = useQueryClient()
  const activePanel = useUiStore((state) => state.activePanel)
  const setActivePanel = useUiStore((state) => state.setActivePanel)
  const selectedStaffId = useUiStore((state) => state.selectedStaffId)
  const selectStaff = useUiStore((state) => state.selectStaff)
  const workLogOpen = useUiStore((state) => state.workLogOpen)
  const setWorkLogOpen = useUiStore((state) => state.setWorkLogOpen)
  const activeFile = useUiStore((state) => state.activeFile)
  const openFiles = useUiStore((state) => state.openFiles)
  const openFile = useUiStore((state) => state.openFile)
  const closeFile = useUiStore((state) => state.closeFile)
  const clearFiles = useUiStore((state) => state.clearFiles)
  const liveRuntime = useLiveRuntime()
  const runtimeStatus = useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    retry: 1,
  })
  const project = useQuery({
    queryKey: ["active-project"],
    queryFn: getActiveProject,
    retry: 1,
  })
  const staff = useQuery({
    queryKey: ["staff"],
    queryFn: getStaffProfiles,
    staleTime: 60_000,
  })
  const missionSessions = useQuery({
    queryKey: ["mission-sessions", project.data?.id],
    queryFn: () => listMissionSessions(project.data!.id),
    enabled: Boolean(project.data),
  })
  const roster = staff.data ?? []
  const [dismissedHandoffId, setDismissedHandoffId] = useState<string | null>(null)
  const visibleHandoff =
    liveRuntime.projection.activeHandoff?.id === dismissedHandoffId
      ? null
      : liveRuntime.projection.activeHandoff

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

  const selectedStaff =
    roster.find((profile) => profile.id === selectedStaffId) ?? roster[0] ?? null

  const onProjectOpened = (next: ProjectRecord) => {
    clearFiles()
    void client.setQueryData(["active-project"], next)
    void client.invalidateQueries({ queryKey: ["mission-sessions", next.id] })
  }

  const sidebar = activePanel === "explorer"
    ? (project.data ? (
      <ProjectExplorer
        project={project.data}
        activeFile={activeFile}
        onOpenFile={openFile}
        onProjectOpened={onProjectOpened}
      />
    ) : null)
    : (
      <WorkspaceSidebar
        panel={activePanel}
        staff={roster}
        staffLoading={staff.isPending}
        staffError={staff.error}
        runtimeStatus={runtimeStatus.data}
        mission={liveRuntime.mission}
        missionSessions={missionSessions.data ?? []}
        selectedMissionSessionId={liveRuntime.session?.id ?? null}
        onSelectMissionSession={(sessionId) => {
          const selected = missionSessions.data?.find((item) => item.id === sessionId)
          if (!selected) return
          setActivePanel("team-floor")
          void liveRuntime.selectSession(selected)
        }}
      />
    )

  const hasProject = Boolean(project.data)
  useEffect(() => {
    if (hasProject) return
    if (activePanel === "search" || activePanel === "team-floor") {
      setActivePanel("explorer")
    }
  }, [activePanel, hasProject, setActivePanel])
  const missionControlStatus = isTerminalMissionStatus(liveRuntime.mission?.status)
    ? liveRuntime.mission.status
    : liveRuntime.projection.status

  const workspaceClass = [
    "mission-workspace",
    !hasProject ? "mission-workspace--no-project" : "",
  ].filter(Boolean).join(" ")
  const workspacePanelKey = activePanel === "team-floor"
    ? "team-floor"
    : activePanel === "staff"
      ? "staff"
      : "workspace"

  const workspace = (
    <div className={workspaceClass}>
      {liveRuntime.error && (
        <p className="mission-runtime-error" role="alert">{liveRuntime.error}</p>
      )}
      <WorkspacePanelSwitch
        panelKey={workspacePanelKey}
      >
        {activePanel === "team-floor" ? (
          <TeamFloor
            staff={roster}
            currentStaffId={liveRuntime.projection.currentStaffId}
            statuses={liveRuntime.projection.staffStatuses}
            selectedStaffIds={liveRuntime.projection.selectedStaffIds}
            artifacts={liveRuntime.projection.artifacts}
            activity={liveRuntime.projection.activity}
            onSelectStaff={selectStaff}
            projectId={project.data?.id ?? null}
            activeFile={liveRuntime.projection.activeFile || null}
            fileRevision={liveRuntime.projection.fileRevision}
            editorOwnerId={liveRuntime.projection.editorOwnerId}
            hasStarted={liveRuntime.hasStarted}
            missionStatus={liveRuntime.projection.status}
            objective={liveRuntime.projection.objective}
            assemblyRoles={liveRuntime.projection.assemblyRoles}
            planReview={liveRuntime.projection.planReview}
            missionId={liveRuntime.mission?.id ?? null}
            startedAt={liveRuntime.projection.startedAt}
            endedAt={liveRuntime.projection.endedAt}
            onOpenWorkOutput={(path) => {
              openFile(path)
              setActivePanel("explorer")
            }}
          />
        ) : activePanel === "staff" ? (
          <StaffDirectoryScreen
            staff={roster}
            isLoading={staff.isPending}
            error={staff.error}
          />
        ) : (
          <CodeWorkspace
            staff={roster}
            projectId={project.data?.id ?? null}
            activeFile={activeFile}
            openFiles={openFiles}
            editorOwnerId={liveRuntime.projection.editorOwnerId}
            missionStatus={liveRuntime.projection.status}
            onSelectFile={openFile}
            onCloseFile={closeFile}
            onProjectOpened={onProjectOpened}
          />
        )}
      </WorkspacePanelSwitch>
      {hasProject && (
        <ActivityFeed
          staff={roster}
          hasStarted={liveRuntime.hasStarted}
          missionStatus={liveRuntime.projection.status}
          events={liveRuntime.projection.activity}
        />
      )}
    </div>
  )

  return (
    <AppShell
      activePanel={activePanel}
      onPanelChange={setActivePanel}
      projectOpen={hasProject}
      hideTeamPanel={activePanel === "staff"}
      sidebar={sidebar}
      workspace={workspace}
      teamPanel={(
        <EngineeringTeamPanel
          staff={roster}
          onSelectStaff={selectStaff}
          isLoading={staff.isPending}
          error={staff.error}
          missionControls={liveRuntime.hasStarted ? (
            <>
              <MissionControlBar
                title={liveRuntime.mission?.objective ?? "Live mission"}
                playing={liveRuntime.playing}
                paused={liveRuntime.paused}
                status={missionControlStatus}
                onPause={liveRuntime.pause}
                onResume={liveRuntime.resume}
                onCancel={liveRuntime.cancel}
                onDismiss={liveRuntime.dismiss}
              />
              {isTerminalMissionStatus(missionControlStatus) && (
                <MissionComposer
                  mode="followup"
                  projectName={project.data?.name}
                  liveRuntime={{
                    state: runtimeStatus.data?.state ?? "unavailable",
                    profileId: runtimeStatus.data?.selectedProfileId ?? "",
                    model: runtimeStatus.data?.selectedModel ?? "",
                  }}
                  onStart={(request) => {
                    if (!project.data) return
                    setActivePanel("team-floor")
                    void liveRuntime.sendFollowUp({
                      request: request.request,
                      projectId: project.data.id,
                      modelProfileId: request.modelProfile,
                      model: request.model,
                    }).then(() => {
                      void client.invalidateQueries({
                        queryKey: ["mission-sessions", project.data?.id],
                      })
                    })
                  }}
                />
              )}
            </>
          ) : (
            <MissionComposer
              mode={liveRuntime.session ? "followup" : "new"}
              projectName={project.data?.name}
              liveRuntime={{
                state: runtimeStatus.data?.state ?? "unavailable",
                profileId: runtimeStatus.data?.selectedProfileId ?? "",
                model: runtimeStatus.data?.selectedModel ?? "",
              }}
              onStart={(request) => {
                if (!project.data) return
                setActivePanel("team-floor")
                const action = liveRuntime.session
                  ? liveRuntime.sendFollowUp
                  : liveRuntime.start
                void action({
                  request: request.request,
                  projectId: project.data.id,
                  modelProfileId: request.modelProfile,
                  model: request.model,
                }).then(() => {
                  void client.invalidateQueries({
                    queryKey: ["mission-sessions", project.data?.id],
                  })
                })
              }}
            />
          )}
        />
      )}
      overlays={(
        <>
          {selectedStaff && (
            <WorkLogDrawer
              open={workLogOpen}
              staff={selectedStaff}
              log={liveRuntime.projection.workLogs[selectedStaff.id]}
              onOpenChange={setWorkLogOpen}
            />
          )}
          <HandoffOverlay
            handoff={visibleHandoff}
            staff={roster}
            onDismiss={() => setDismissedHandoffId(visibleHandoff?.id ?? null)}
          />
          <CommandApprovalDialog missionId={liveRuntime.mission?.id} />
        </>
      )}
    />
  )
}

```

## FILE: apps/web/tests/app-panel-transition.test.tsx

```
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

## FILE: apps/web/tests/app-staff-directory.test.tsx

```
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
vi.mock("@/features/models/model-api", () => ({ getRuntimeStatus: mocks.getRuntimeStatus }))
vi.mock("@/features/projects/project-api", () => ({ getActiveProject: mocks.getActiveProject }))
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

## FILE: apps/web/tests/navigation-rail.test.tsx

```
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { NavigationRail } from "@/components/shell/NavigationRail"
import { TooltipProvider } from "@/components/ui/tooltip"

function renderRail(node: ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>)
}

describe("NavigationRail", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  it("disables Search and Team Floor when no project is open", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderRail(
      <NavigationRail
        active="explorer"
        onChange={onChange}
        projectOpen={false}
      />,
    )

    const search = screen.getByRole("button", { name: "Search" })
    const teamFloor = screen.getByRole("button", { name: "Team Floor" })
    const explorer = screen.getByRole("button", { name: "Explorer" })
    const missions = screen.getByRole("button", { name: "Missions" })
    const staff = screen.getByRole("button", { name: "HiPo Staff" })

    expect(search).toBeDisabled()
    expect(teamFloor).toBeDisabled()
    expect(explorer).toBeEnabled()
    expect(missions).toBeEnabled()
    expect(staff).toBeEnabled()
    expect(onChange).not.toHaveBeenCalled()

    await user.click(missions)
    expect(onChange).toHaveBeenCalledWith("missions")
  })

  it("enables Search and Team Floor when a project is open", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderRail(
      <NavigationRail
        active="explorer"
        onChange={onChange}
        projectOpen
      />,
    )

    const search = screen.getByRole("button", { name: "Search" })
    const teamFloor = screen.getByRole("button", { name: "Team Floor" })
    expect(search).toBeEnabled()
    expect(teamFloor).toBeEnabled()

    await user.click(search)
    expect(onChange).toHaveBeenCalledWith("search")
  })
})

```

## FILE: .superpowers/sdd/hipo-staff-task-2-report.md

```
# Task 2 Report: App Integration and Panel Routing

## Status

Implemented HiPo Staff app routing and panel integration without backend changes or staff directory CSS changes.

## RED Evidence

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/app-panel-transition.test.tsx tests/app-staff-directory.test.tsx tests/navigation-rail.test.tsx
```

Result: failed as expected after test harness stabilization.

- Test files: 1 failed, 2 passed.
- Tests: 1 failed, 5 passed.
- Expected failure: `tests/app-staff-directory.test.tsx` could not find `[data-testid="staff-directory"]`, showing `activePanel === "staff"` still rendered the workspace path instead of the staff directory.

Notes:

- Initial RED attempts surfaced test harness gaps unrelated to the product behavior: `TopBar` model dialog imports and Radix tooltip `ResizeObserver` behavior in jsdom. Those were narrowed with test-only mocks/stubs before accepting RED.

## GREEN Evidence

Focused command:

```bash
pnpm --filter @tova/web exec vitest run tests/app-panel-transition.test.tsx tests/app-staff-directory.test.tsx tests/navigation-rail.test.tsx tests/staff-directory-screen.test.tsx
```

Result: passed.

- Test files: 4 passed.
- Tests: 11 passed.

Full frontend verification:

```bash
pnpm verify
```

Result: passed.

- `pnpm --filter @tova/web lint`: passed.
- `pnpm --filter @tova/web typecheck`: passed.
- `pnpm --filter @tova/web test`: 30 files passed, 140 tests passed.
- `pnpm --filter @tova/web build`: passed.

## Files Changed

- `apps/web/src/components/shell/WorkspacePanelSwitch.tsx`
  - Added exported `WorkspacePanelKey = "team-floor" | "staff" | "workspace"`.
  - Updated props to consume the exported key type.
- `apps/web/src/components/shell/AppShell.tsx`
  - Added optional `hideTeamPanel?: boolean`.
  - Preserved default behavior by rendering `teamPanel` unless `hideTeamPanel` is true.
- `apps/web/src/app/App.tsx`
  - Imported `StaffDirectoryScreen`.
  - Added staff-aware `workspacePanelKey`.
  - Routed `activePanel === "staff"` to `StaffDirectoryScreen`.
  - Passed `hideTeamPanel={activePanel === "staff"}` to `AppShell`.
  - Left the no-project redirect scoped to Search and Team Floor only.
- `apps/web/tests/app-panel-transition.test.tsx`
  - Added coverage for the `staff` workspace panel key.
- `apps/web/tests/app-staff-directory.test.tsx`
  - Added app integration coverage for staff rendering in the main workspace.
  - Added coverage that staff remains available without a project.
  - Verified the right Engineering Team panel is hidden while staff is active.
- `apps/web/tests/navigation-rail.test.tsx`
  - Added coverage that `HiPo Staff` remains enabled without a project.
  - Added a local `ResizeObserver` stub for Radix tooltip behavior in jsdom.
- `apps/web/tests/staff-directory-screen.test.tsx`
  - Fixed existing lint/typecheck issues in the framer-motion mock and throw helper so full verification can pass.

## Concerns

- `pnpm verify` build completed with the existing Vite warning that one chunk is larger than 700 kB after minification.
- The new app integration test uses focused component mocks to isolate routing and shell behavior; the full test suite and build still passed after the integration changes.

## Self-Review

- Confirmed staff directory routing is frontend-only and does not touch backend APIs.
- Confirmed no staff directory CSS was added.
- Confirmed `HiPo Staff` remains enabled when no project is open.
- Confirmed existing no-project disabled behavior for Search and Team Floor is preserved.
- Confirmed `AppShell` keeps existing callers compatible because `hideTeamPanel` defaults to false.
- Confirmed the right Engineering Team panel is hidden only for the staff panel.
- No git commits were made.

```
