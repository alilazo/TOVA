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
import { CurrentActionDetails } from "./CurrentActionDetails"
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
                <CurrentActionDetails action={latestAction} description={active.description} />
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
        <span>Time <strong aria-label="Mission elapsed time">{elapsed ?? "—"}</strong></span>
      </footer>
    </section>
  )
}
