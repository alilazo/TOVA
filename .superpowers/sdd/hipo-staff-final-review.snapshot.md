# Final review package: HiPo Staff Directory (no git)

Spec: docs/superpowers/specs/2026-07-30-hipo-staff-directory-design.md
Plan: docs/superpowers/plans/2026-07-30-hipo-staff-directory.md

Verification:
- pnpm verify PASS: 30 files, 143 tests, build pass
- uv run python scripts/verify.py PASS: backend 102 tests, ruff/mypy pass
- Impeccable detector: warning only for existing body font Inter at globals.css line 80

## Files

## FILE: apps/web/src/components/staff/StaffDirectoryScreen.tsx

```
import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import type { StaffProfile } from "@/types/domain"

import { PixelAvatar } from "./PixelAvatar"
import { StaffProfileDialog } from "./StaffProfileDialog"

export interface StaffDirectoryScreenProps {
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
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
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
  const [shouldDrop] = useState(() => !openedInSession.current)
  const shouldAnimateDrop = shouldDrop && !reduceMotion
  const badgeLiftMotion = reduceMotion ? undefined : { y: -2 }

  useEffect(() => {
    if (shouldDrop) openedInSession.current = true
  }, [shouldDrop])

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
          placeholder="Search names, roles, tags..."
        />
      </label>

      {isLoading ? (
        <p className="staff-directory__state" role="status">
          Loading staff profiles...
        </p>
      ) : error ? (
        <p className="staff-directory__state" role="alert">
          Staff profiles are unavailable.
        </p>
      ) : staff.length === 0 ? (
        <p className="staff-directory__state" role="status">
          No staff profiles are available.
        </p>
      ) : profileStaff ? null : visibleStaff.length === 0 ? (
        <p className="staff-directory__state">No staff match that search.</p>
      ) : (
        <div className="staff-directory__grid">
          {visibleStaff.map((member, index) => {
            const available = availabilityOverrides[member.id] ?? member.status !== "offline"
            return (
              <motion.button
                key={member.id}
                type="button"
                className="staff-badge-card"
                aria-label={`Open ${member.displayName} profile`}
                initial={shouldAnimateDrop ? { opacity: 0, y: -28, rotate: -1 } : false}
                animate={shouldAnimateDrop ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 1 }}
                whileFocus={badgeLiftMotion}
                whileHover={badgeLiftMotion}
                transition={{
                  delay: shouldAnimateDrop ? Math.min(index * 0.04, 0.28) : 0,
                  duration: 0.24,
                }}
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

## FILE: apps/web/tests/staff-directory-screen.test.tsx

```
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { createElement, StrictMode, type ButtonHTMLAttributes, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getStaffDocument, reducedMotion, saveStaffDocument } = vi.hoisted(() => ({
  getStaffDocument: vi.fn(),
  saveStaffDocument: vi.fn(),
  reducedMotion: { current: false },
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

vi.mock("framer-motion", () => {
  type MotionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    animate?: unknown
    initial?: false | Record<string, unknown>
    transition?: { delay?: number; duration?: number }
    whileFocus?: Record<string, unknown>
    whileHover?: Record<string, unknown>
  }
  const motionY = (motion?: Record<string, unknown>) => {
    return typeof motion?.y === "number" ? String(motion.y) : ""
  }

  return {
    motion: {
      button: ({ initial, transition, ...props }: MotionButtonProps) => {
        const { animate, whileFocus, whileHover, ...buttonProps } = props
        void animate
        return createElement("button", {
          ...buttonProps,
          "data-drop-initial": initial ? "true" : "false",
          "data-transition-delay": String(transition?.delay ?? ""),
          "data-while-focus-y": motionY(whileFocus),
          "data-while-hover-y": motionY(whileHover),
        })
      },
    },
    useReducedMotion: () => reducedMotion.current,
  }
})

import { StaffDirectoryScreen } from "@/components/staff/StaffDirectoryScreen"

import { staffProfiles } from "./fixtures/staff"

const globalsCss = readFileSync(resolve(process.cwd(), "src/styles/globals.css"), "utf8")

function cssRuleBody(selectorPattern: string): string {
  const match = new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(globalsCss)
  expect(match).not.toBeNull()
  return match?.[1] ?? ""
}

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
    reducedMotion.current = false
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

  it("keeps the first-open drop animation enabled when an attempted render is abandoned", () => {
    function ThrowOnRender(): ReactNode {
      throw new Error("abandoned staff directory render")
    }

    expect(() =>
      renderWithClient(
        <StrictMode>
          <StaffDirectoryScreen staff={staffProfiles} />
          <ThrowOnRender />
        </StrictMode>,
      ),
    ).toThrow("abandoned staff directory render")

    renderWithClient(
      <StrictMode>
        <StaffDirectoryScreen staff={staffProfiles} />
      </StrictMode>,
    )

    expect(screen.getByRole("button", { name: "Open Maya profile" })).toHaveAttribute(
      "data-drop-initial",
      "true",
    )
  })

  it("renders staff as ID badge cards with role and description", () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    expect(screen.getByRole("heading", { name: "HiPo Staff" })).toBeInTheDocument()
    expect(screen.getByText("7 staff profiles")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.getByText("Researcher")).toBeInTheDocument()
    expect(
      screen.getByText(
        staffProfiles.find((staff) => staff.id === "staff_maya")!.description,
      ),
    ).toBeInTheDocument()
  })

  it("uses badge-card structure for the directory wall", () => {
    const { container } = renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    expect(container.querySelector(".staff-directory")).not.toBeNull()
    expect(container.querySelectorAll(".staff-badge-card")).toHaveLength(staffProfiles.length)
    expect(container.querySelector(".staff-badge-card__clip")).not.toBeNull()
    expect(container.querySelector(".staff-badge-card__name-strip")).not.toBeNull()
  })

  it("keeps badge hover and focus lift in motion props", () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    const badge = screen.getByRole("button", { name: "Open Maya profile" })
    expect(badge).toHaveAttribute("data-while-hover-y", "-2")
    expect(badge).toHaveAttribute("data-while-focus-y", "-2")
  })

  it("omits badge lift motion paths for reduced motion", () => {
    reducedMotion.current = true

    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    const badge = screen.getByRole("button", { name: "Open Maya profile" })
    expect(badge).toHaveAttribute("data-while-hover-y", "")
    expect(badge).toHaveAttribute("data-while-focus-y", "")

    const badgeRule = cssRuleBody("\\.staff-badge-card")
    const hoverRule = cssRuleBody(
      "\\.staff-badge-card:hover,\\s*\\.staff-badge-card:focus-visible",
    )

    expect(badgeRule).not.toMatch(/\btransform\s+\d+ms\b/)
    expect(hoverRule).toContain("border-color")
    expect(hoverRule).toContain("box-shadow")
    expect(hoverRule).not.toMatch(/\btransform\s*:/)
    expect(globalsCss).not.toMatch(/\.staff-badge-card:active\s*\{[\s\S]*?\btransform\s*:/)
  })

  it("filters by name, role, department, tags, and description", () => {
    const searchableProfiles = staffProfiles.map((member) => {
      if (member.id === "staff_maya") {
        return {
          ...member,
          department: "Behavior Lab",
          description: "Maps decision trails for field research.",
        }
      }
      if (member.id === "staff_lina") {
        return {
          ...member,
          tags: ["accessibility-review"],
        }
      }
      return member
    })

    renderWithClient(<StaffDirectoryScreen staff={searchableProfiles} />)
    const search = screen.getByRole("searchbox", { name: "Search staff" })

    fireEvent.change(search, { target: { value: "maya" } })
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Lina profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "front-end" } })
    expect(screen.getByRole("button", { name: "Open Lina profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Maya profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "behavior lab" } })
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Lina profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "accessibility-review" } })
    expect(screen.getByRole("button", { name: "Open Lina profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Maya profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "decision trails" } })
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Lina profile" })).not.toBeInTheDocument()

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

## FILE: docs/superpowers/specs/2026-07-30-hipo-staff-directory-design.md

```
# HiPo Staff Directory Design

Date: 2026-07-30

## Goal

Turn the `HiPo Staff` tab into a dedicated main workspace for browsing HiPo Staff members as clean ID-style badges. The screen should support search, open the existing staff profile modal on card click, and keep the restrained TOVA interface language.

## Locked decisions

- Approach: **Staff Directory Wall**
- `HiPo Staff` remains available even when no project is open
- When `HiPo Staff` is active, hide the right `EngineeringTeamPanel` to avoid duplicate staff surfaces
- The main workspace switches away from `CodeWorkspace` into a staff directory screen
- The existing right-rail `EngineeringTeamPanel` and `TeamMemberCard` behavior remains unchanged outside this tab
- Clicking a staff badge opens the existing `StaffProfileDialog`
- Search filters staff by display name, role, department, tags, and description
- Badge cards use the existing `PixelAvatar` so stock/custom avatars and pixel fallbacks keep working
- First open in the session plays a restrained badge drop-in animation; subsequent visits use normal workspace motion
- Respect reduced motion: no drop animation; use a simple fade
- Visual language: compact, mostly neutral, ID-badge inspired; no gradients, glass, cartoon office scenes, or decorative game mechanics

## Screen Layout

### Main Area

When `activePanel === "staff"`:

- Main workspace content becomes `StaffDirectoryScreen`
- Right team panel is hidden
- Existing left sidebar may still show the `WorkspaceSidebar` summary for `HiPo Staff`, unless implementation tests show it creates redundant controls. The required non-duplication rule applies to the right Engineering Team rail.

`StaffDirectoryScreen` layout:

- Header row:
  - Title: `HiPo Staff`
  - Supporting copy: short operational phrase, e.g. `Browse the local workforce layer.`
  - Count summary: total profiles and visible filtered count when searching
- Search row:
  - Input label: `Search staff`
  - Placeholder: `Search names, roles, tagsâ€¦`
- Directory grid:
  - Responsive badge cards
  - Desktop target: 3-4 cards per row depending available width
  - Narrow screens: 1-2 cards per row
- Empty states:
  - Loading: `Loading staff profilesâ€¦`
  - Error: `Staff profiles are unavailable.`
  - No profiles: `No staff profiles are available.`
  - No search results: `No staff match that search.`

## Badge Card Design

Each staff badge is a clickable button/card with:

- Subtle lanyard/clip detail at top
- Off-white card body with a restrained black name strip or header strip
- Pixel avatar in a framed portrait area
- Primary text: `staff.role`
- Secondary text: `staff.description`, clamped to a few lines
- Footer row:
  - `HiPo Staff` label
  - Compact role/status chip, e.g. `Available`, `Offline`, or role key

Interaction:

- Hover/focus: slight lift, soft shadow, subtle border darkening
- Active press: settle back down slightly
- Disabled/offline is not required; offline staff can still open the profile
- Keyboard: each badge is reachable as a button with an accessible label like `Open Maya profile`

## Animation

Use `framer-motion`, already present in the app.

- First open in the session:
  - Cards start slightly above their final position
  - Animate down into place with opacity and a short stagger
  - Motion is subtle and quick, like ID badges settling onto a wall
- Subsequent visits:
  - Do not replay the full badge drop
  - Keep normal workspace transition
- Reduced motion:
  - Disable y/rotate/drop motion
  - Keep a simple opacity fade if needed

Session behavior can be component-local or a small UI-store flag. It does not need backend persistence.

## Modal Reuse

The directory screen reuses `StaffProfileDialog` exactly like `EngineeringTeamPanel`:

- Track `profileStaffId`
- Find selected `StaffProfile`
- Pass `available` from staff status plus local availability overrides
- Preserve `onAvailableChange` behavior
- Close by clearing selected staff id

This keeps profile preview/edit/metadata, avatar editing, availability toggle, dirty-close confirmation, and save behavior unchanged.

## Data

Use existing `StaffProfile` fields:

- `displayName`
- `role`
- `roleKey`
- `department`
- `seniority`
- `avatar`
- `description`
- `status`
- `tags`

No backend changes are required.

## App Integration

- `NavigationRail` behavior does not change for `staff`; it stays enabled without a project
- `App.tsx` branches workspace rendering:
  - `activePanel === "team-floor"` -> `TeamFloor`
  - `activePanel === "staff"` -> `StaffDirectoryScreen`
  - otherwise -> `CodeWorkspace`
- `WorkspacePanelSwitch` must support a stable panel key for staff, e.g. `"staff"`
- `AppShell` should hide `teamPanel` while staff is active, via a boolean prop or conditional rendering
- `EngineeringTeamPanel` remains available for normal project/workspace screens

## Testing

Frontend tests should cover:

- `StaffDirectoryScreen` renders staff badge cards with avatar, role, and description
- Search filters by display name, role, department, tags, and description
- No-results copy appears for unmatched search
- Clicking a badge opens `StaffProfileDialog`
- App hides the right `EngineeringTeamPanel` when `activePanel === "staff"`
- Staff tab remains enabled when no project is open
- `WorkspacePanelSwitch` supports the staff screen key
- Existing `EngineeringTeamPanel` and `StaffProfileDialog` behavior remains passing

Verification:

- Focused Vitest for new/changed staff/app tests
- `pnpm verify`
- If backend untouched, full `uv run python scripts/verify.py` is optional but preferred before final completion

## Non-goals

- New backend staff APIs
- Replacing `StaffProfileDialog`
- Changing staff markdown format
- Changing the right Engineering Team rail cards outside staff tab
- Large visual rebrand of TOVA
- Persisting search text or animation state across browser reloads

## Implementation Notes

- No git repository is available in this workspace, so commits are skipped unless git becomes available.
- The checkout may not include every stock avatar asset directory; `PixelAvatar` fallback must remain intact.

```

## FILE: docs/superpowers/plans/2026-07-30-hipo-staff-directory.md

```
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
          placeholder="Search names, roles, tagsâ€¦"
        />
      </label>

      {isLoading ? (
        <p className="staff-directory__state" role="status">Loading staff profilesâ€¦</p>
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

```

## FILE: apps/web/src/styles/globals.css (staff-directory excerpt)

```
  width: 18px;
}

.handoff-overlay__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8f8f6;
  padding: 10px;
}

.handoff-overlay__status span,
.handoff-overlay__status small {
  color: var(--muted-text);
  font-size: 9px;
}

.staff-directory {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  height: 100%;
  gap: 14px;
  background: #f7f7f4;
  padding: 18px;
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
  background: var(--panel);
  padding-left: 30px;
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
  appearance: none;
  border: 1px solid #e3e3de;
  border-radius: 11px;
  background: #fffefa;
  padding: 18px 12px 10px;
  color: #22231f;
  font: inherit;
  text-align: left;
  box-shadow: 0 1px 2px color-mix(in srgb, #000 5%, transparent);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
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
  min-height: 0;
  gap: 7px;
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

.team-floor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.team-floor__boot {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 3px;
  border-bottom: 1px solid var(--line);
  background: #f7f7f4;
  padding: 8px 12px;
}

.team-floor__boot strong {
  font-size: 11px;
  line-height: 1.35;
}

.team-floor__boot p {
  margin: 0;
  color: var(--muted-text);
  font-size: 10px;
}

.team-floor__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  border-bottom: 1px solid var(--line);
  padding: 0 12px;
}

.team-floor__header > span:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.team-floor__header small {
  color: var(--muted-text);
  font-size: 9px;
}

.team-floor__phase {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--muted-text);
  font-size: 9px;
}

.team-floor__phase svg {
  width: 12px;
}

.team-floor__workflow {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  min-height: 44px;
  overflow-x: auto;
  border-bottom: 1px solid var(--line);
  padding: 8px 12px;
}

.team-floor__node-wrap {
```
