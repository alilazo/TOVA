# Task 1 review package (no git — file snapshots)

## apps/web/src/components/team-floor/TeamFloor.tsx
import { ArrowRight, CheckCircle2, FileStack, GitBranch } from "lucide-react"
import { motion } from "framer-motion"

import type { PlanReview } from "@/features/mission/mission-event-reducer"
import { useMissionElapsed } from "@/features/mission/use-mission-elapsed"
import { formatStatus } from "@/lib/utils"
import type {
  ActivityItem,
  Artifact,
  MissionStatus,
  StaffProfile,
  StaffStatus,
} from "@/types/domain"

import { PixelAvatar } from "../staff/PixelAvatar"
import { StatusBadge } from "../staff/StatusBadge"
import { TeamFloorLiveEditor } from "./TeamFloorLiveEditor"

interface TeamFloorProps {
  staff: StaffProfile[]
  currentStaffId: string | null
  statuses: Record<string, StaffStatus>
  selectedStaffIds: string[]
  artifacts: Artifact[]
  activity: ActivityItem[]
  onSelectStaff: (staffId: string) => void
  projectId: string | null
  activeFile: string | null
  fileRevision: number
  editorOwnerId: string | null
  hasStarted?: boolean
  missionStatus?: MissionStatus | null
  objective?: string | null
  assemblyRoles?: string[]
  planReview?: PlanReview | null
  missionId?: string | null
  onPlanError?: (message: string) => void
  startedAt?: string | null
  endedAt?: string | null
  onOpenWorkOutput?: (path: string) => void
}

type WorkOutputItem =
  | { kind: "file"; path: string }
  | { kind: "text"; label: string }

export function TeamFloor({
  staff,
  currentStaffId,
  statuses,
  selectedStaffIds,
  artifacts,
  activity,
  onSelectStaff,
  projectId,
  activeFile,
  fileRevision,
  editorOwnerId,
  hasStarted = false,
  missionStatus = null,
  assemblyRoles = [],
  planReview = null,
  missionId = null,
  onPlanError,
  startedAt = null,
  endedAt = null,
  onOpenWorkOutput,
}: TeamFloorProps) {
  const elapsed = useMissionElapsed(startedAt, endedAt)
  const team = staff.filter((profile) => selectedStaffIds.includes(profile.id))
  const coordinator =
    staff.find((profile) => profile.roleKey === "project_coordinator") ?? null
  const planningWithoutTeam = hasStarted && team.length === 0
  const awaitingPlanReview = Boolean(planReview)
  const highlightStaffId = activeFile && editorOwnerId ? editorOwnerId : currentStaffId
  const active = planningWithoutTeam
    ? coordinator
    : team.find((member) => member.id === currentStaffId) ?? team[0] ?? null
  const highlightIndex = planningWithoutTeam
    ? 0
    : highlightStaffId
      ? team.findIndex((member) => member.id === highlightStaffId)
      : -1
  const missionComplete =
    team.length > 0 && team.every((member) => statuses[member.id] === "completed")
  const completedCount = team.filter((member) => statuses[member.id] === "completed").length
  const upcomingCount = missionComplete
    ? 0
    : Math.max(team.length - completedCount - (active && !planningWithoutTeam ? 1 : 0), 0)
  const latestAction = planningWithoutTeam
    ? awaitingPlanReview
      ? "Waiting for confirmation of the proposed team plan."
      : missionStatus === "assembling_team" || assemblyRoles.length > 0
        ? "Selecting the engineering team for this mission."
        : "Creating a bounded mission plan."
    : active
      ? [...activity].reverse().find((item) => item.staffId === active.id)?.title
        ?? "Waiting for the next observable action."
      : null
  const activeStatus: StaffStatus = planningWithoutTeam
    ? awaitingPlanReview || missionStatus === "awaiting_approval"
      ? "awaiting_approval"
      : missionStatus === "assembling_team" || assemblyRoles.length > 0
        ? "working"
        : "analyzing"
    : statuses[active?.id ?? ""] ?? "working"
  const showWorkOutput = Boolean(active && active.roleKey !== "project_coordinator")
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
  const workflowMembers = planningWithoutTeam && coordinator ? [coordinator] : team

  return (
    <section className="team-floor" aria-label="Team Floor">
      <header className="team-floor__header">
        <span>
          <strong>Team Floor</strong>
          <small>Visible mission execution workspace</small>
        </span>
        <span className="team-floor__phase"><GitBranch /> Active workflow</span>
      </header>
      {awaitingPlanReview && (
        <div className="team-floor__boot" role="status">
          <strong>Waiting for confirmation</strong>
          <p>Review Alex's interpretation and team choices before work starts.</p>
        </div>
      )}
      <div className="team-floor__workflow" aria-label="Mission workflow">
        {workflowMembers.map((member, index) => (
          <div key={member.id} className="team-floor__node-wrap">
            <button
              type="button"
              className={index === highlightIndex ? "team-floor__node is-active" : "team-floor__node"}
              onClick={() => onSelectStaff(member.id)}
            >
              <PixelAvatar avatar={member.avatar} name={member.displayName} size="sm" />
              <span>{member.displayName}</span>
              {(missionComplete || statuses[member.id] === "completed") && (
                <CheckCircle2 aria-label="Completed" />
              )}
            </button>
            {index < workflowMembers.length - 1 && <ArrowRight aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="team-floor__body">
        <div className="team-floor__workforce">
          {active ? (
            <motion.div
              key={active.id}
              className="active-staff-stage"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="active-staff-stage__identity">
                <PixelAvatar avatar={active.avatar} name={active.displayName} size="lg" />
                <span>
                  <small>ACTIVE EMPLOYEE</small>
                  <h2>{active.displayName}</h2>
                  <p>{active.role}</p>
                  <StatusBadge status={activeStatus} />
                </span>
              </div>
              <div className="active-staff-stage__action">
                <small>CURRENT ACTION</small>
                <strong>{latestAction}</strong>
                <p>{active.description}</p>
              </div>
              {showWorkOutput && (
                <div className="active-staff-stage__output">
                  <small>CURRENT WORK OUTPUT</small>
                  {workOutputs.length > 0 ? workOutputs.map((item) =>
                    item.kind === "file" ? (
                      <button
                        key={`file:${item.path}`}
                        type="button"
                        className="active-staff-stage__output-chip"
                        aria-label={`Open ${item.path} in Explorer`}
                        onClick={() => onOpenWorkOutput?.(item.path)}
                      >
                        <FileStack />{item.path}
                      </button>
                    ) : (
                      <span key={`text:${item.label}`}>
                        <FileStack />{item.label}
                      </span>
                    ),
                  ) : (
                    <span>No file outputs yet</span>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            <div className="team-floor__empty">
              <strong>No mission is running</strong>
              <p>Start a mission to assemble the team and display its workflow.</p>
            </div>
          )}
        </div>
        <TeamFloorLiveEditor
          staff={staff}
          projectId={projectId}
          activeFile={activeFile}
          fileRevision={fileRevision}
          editorOwnerId={editorOwnerId}
          hasStarted={hasStarted}
          missionStatus={missionStatus}
          assemblyRoles={assemblyRoles}
          coordinator={coordinator}
          planReview={planReview}
          missionId={missionId}
          onPlanError={onPlanError}
        />
      </div>
      <footer className="team-floor__timeline">
        <span>Completed <strong>{completedCount}</strong></span>
        <span>Current <strong>{active?.displayName ?? "None"}</strong></span>
        <span>Upcoming <strong>{upcomingCount}</strong></span>
        <span>State <strong>{formatStatus(activeStatus)}</strong></span>
        <span>Time <strong aria-label="Mission elapsed time">{elapsed ?? "â€”"}</strong></span>
      </footer>
    </section>
  )
}

## apps/web/tests/team-floor.test.tsx (relevant test + imports)
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"
vi.mock("@monaco-editor/react", () => ({
vi.mock("@/features/projects/project-api", () => ({
  readProjectFile: vi.fn().mockResolvedValue({ path: "src/App.tsx", content: "export {}" }),
    <QueryClientProvider client={client}>
    </QueryClientProvider>,
  activity: [],
  fileRevision: 0,
  it("shows Alex plan review when a proposed plan is present", () => {
        planReview={{
    expect(screen.getByLabelText("Alex plan review")).toBeInTheDocument()
        fileRevision={2}
  it("opens file work outputs via clickable chips", () => {
    const onOpenWorkOutput = vi.fn()
        onOpenWorkOutput={onOpenWorkOutput}
            name: "Mission note",
    expect(screen.queryByRole("button", { name: /Mission note/i })).not.toBeInTheDocument()
    expect(screen.getByText("Mission note")).toBeInTheDocument()
    expect(onOpenWorkOutput).toHaveBeenCalledWith("index.html")

## FULL TEST FILE

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@monaco-editor/react", () => ({
  default: () => <div data-testid="monaco-editor" />,
}))

vi.mock("@/features/projects/project-api", () => ({
  languageForPath: () => "typescript",
  readProjectFile: vi.fn().mockResolvedValue({ path: "src/App.tsx", content: "export {}" }),
}))

import { TeamFloor } from "@/components/team-floor/TeamFloor"
import type { MissionStatus } from "@/types/domain"

import { staffProfiles } from "./fixtures/staff"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      {node}
    </QueryClientProvider>,
  )
}

const baseProps = {
  staff: staffProfiles,
  currentStaffId: "staff_alex" as string | null,
  statuses: {
    staff_alex: "working" as const,
    staff_maya: "working" as const,
  },
  selectedStaffIds: ["staff_alex", "staff_maya"],
  artifacts: [],
  activity: [],
  onSelectStaff: () => undefined,
  projectId: "project_1" as string | null,
  activeFile: null as string | null,
  fileRevision: 0,
  editorOwnerId: null as string | null,
  hasStarted: false,
  missionStatus: null as MissionStatus | null,
  objective: null as string | null,
  assemblyRoles: [] as string[],
}

describe("TeamFloor", () => {
  it("splits workforce and live editor in the Team Floor body", () => {
    const { container } = renderWithClient(<TeamFloor {...baseProps} />)

    expect(screen.getByRole("region", { name: "Team Floor" })).toBeInTheDocument()
    expect(container.querySelector(".team-floor__body")).not.toBeNull()
    expect(container.querySelector(".team-floor__workforce")).not.toBeNull()
    expect(screen.getByRole("region", { name: "Live code stage" })).toBeInTheDocument()
    expect(screen.getByText("Waiting for the first file write")).toBeInTheDocument()
  })

  it("shows elapsed mission time in the footer", () => {
    renderWithClient(
      <TeamFloor
        {...baseProps}
        hasStarted
        startedAt="2026-07-23T18:00:00.000Z"
        endedAt="2026-07-23T18:01:05.000Z"
      />,
    )

    expect(screen.getByLabelText("Mission elapsed time")).toHaveTextContent("1:05")
  })

  it("shows Alex while mission has started without assignees and omits Now Running banner", () => {
    const { container } = renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={[]}
        currentStaffId={null}
        statuses={{}}
        hasStarted
        missionStatus="analyzing"
        objective="Build a centered button page"
      />,
    )

    expect(screen.queryByText(/Now Running/i)).not.toBeInTheDocument()
    expect(screen.queryByText("Everything is loading right now.")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Alex" })).toBeInTheDocument()
    expect(screen.queryByText("CURRENT WORK OUTPUT")).not.toBeInTheDocument()
    expect(screen.getByText("Coordinator is assembling the teamâ€¦")).toBeInTheDocument()
    expect(screen.queryByText("No mission is running")).not.toBeInTheDocument()
    expect(container.querySelectorAll(".pixel-avatar__cell.is-filled").length).toBeGreaterThan(0)
  })

  it("shows Alex plan review when a proposed plan is present", () => {
    const { container } = renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={[]}
        currentStaffId={null}
        statuses={{}}
        hasStarted
        missionStatus="awaiting_approval"
        missionId="mission_1"
        planReview={{
          interpretation: "Build a centered button page.",
          summary: "Ship a minimal centered button page.",
          assignments: [
            {
              staffId: "staff_lina",
              staffRole: "frontend_developer",
              role: "Front-End Developer",
              displayName: "Lina",
              avatar: "lina",
              objective: "Create index.html",
              rationale: "Front-end owns the page markup.",
              sequence: 1,
            },
          ],
        }}
      />,
    )

    expect(screen.getByText("Waiting for confirmation")).toBeInTheDocument()
    expect(screen.getByLabelText("Alex plan review")).toBeInTheDocument()
    expect(screen.getByText("Build a centered button page.")).toBeInTheDocument()
    expect(screen.getByText("Front-end owns the page markup.")).toBeInTheDocument()
    expect(screen.queryByText("CURRENT WORK OUTPUT")).not.toBeInTheDocument()
    expect(screen.queryByText("Everything is loading right now.")).not.toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Lina pixel portrait" })).toHaveClass("pixel-avatar")
    expect(
      container.querySelector(".team-floor__plan-list > li > span:not(.pixel-avatar)"),
    ).not.toBeNull()
  })

  it("lists assembly candidates with avatars in the live stage", () => {
    const { container } = renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={[]}
        currentStaffId={null}
        statuses={{}}
        hasStarted
        missionStatus="assembling_team"
        objective="Ship the button page"
        assemblyRoles={["frontend_developer", "project_coordinator"]}
      />,
    )

    expect(screen.getByText("Alex is selecting the team")).toBeInTheDocument()
    expect(screen.getByText("Lina")).toBeInTheDocument()
    expect(screen.getByText("Front-End Developer")).toBeInTheDocument()
    expect(container.querySelector(".team-floor__assembly-list")).not.toBeNull()
    expect(container.querySelectorAll(".pixel-avatar__cell.is-filled").length).toBeGreaterThan(0)
  })

  it("prefers editorOwnerId for workflow highlight when a file is active", () => {
    renderWithClient(
      <TeamFloor
        {...baseProps}
        currentStaffId="staff_alex"
        activeFile="src/App.tsx"
        fileRevision={2}
        editorOwnerId="staff_maya"
      />,
    )

    const mayaNode = screen.getByRole("button", { name: /Maya/ })
    const alexNode = screen.getByRole("button", { name: /Alex/ })
    expect(mayaNode).toHaveClass("is-active")
    expect(alexNode).not.toHaveClass("is-active")
  })

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

  it("builds the workflow from the supplied roster", () => {
    const customStaff = {
      ...staffProfiles[0],
      id: "staff_custom",
      displayName: "Custom",
    }

    renderWithClient(
      <TeamFloor
        {...baseProps}
        staff={[customStaff]}
        currentStaffId={customStaff.id}
        selectedStaffIds={[customStaff.id]}
      />,
    )

    expect(screen.getByRole("button", { name: /Custom/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Custom" })).toBeInTheDocument()
  })
})

## CSS chip rules from globals.css

.active-staff-stage__output {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.active-staff-stage__action strong {
  font-size: 11px;
  line-height: 1.45;
}

.active-staff-stage__output > span,
.active-staff-stage__output-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 5px;
  background: #f5f5f2;
  padding: 6px;
  font-size: 9px;
}

.active-staff-stage__output-chip {
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.active-staff-stage__output-chip:hover {
  background: #ebebe7;
}

.active-staff-stage__output svg {
  width: 11px;
}

.team-floor__stage {
  display: grid;
  grid-template-columns: minmax(145px, 0.45fr) minmax(280px, 1fr);
.active-staff-stage__output > span,
.active-staff-stage__output-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 5px;
  background: #f5f5f2;
  padding: 6px;
  font-size: 9px;
}

.active-staff-stage__output-chip {
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.active-staff-stage__output-chip:hover {
  background: #ebebe7;
}

.active-staff-stage__output svg {
  width: 11px;
}

.team-floor__stage {
  display: grid;
  grid-template-columns: minmax(145px, 0.45fr) minmax(280px, 1fr);
  min-width: 0;
  min-height: 0;
  margin: 12px 12px 12px 8px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}

