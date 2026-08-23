# Task 5 review package
### apps/web/src/types/events.ts

`tsx
import { z } from "zod"

export const eventTypes = [
  "mission.created",
  "mission.submitted",
  "mission.analysis.started",
  "mission.analysis.updated",
  "mission.plan.proposed",
  "mission.plan.accepted",
  "mission.plan.regenerating",
  "mission.team.assembly.started",
  "mission.team.member.selected",
  "mission.team.assembly.completed",
  "mission.started",
  "mission.paused",
  "mission.resumed",
  "mission.blocked",
  "mission.completed",
  "mission.failed",
  "model.connection.changed",
  "model.request.started",
  "model.request.completed",
  "model.request.failed",
  "staff.assigned",
  "staff.status.changed",
  "staff.action.started",
  "staff.action.updated",
  "staff.action.completed",
  "staff.file.opened",
  "staff.file.read",
  "staff.file.created",
  "staff.file.updated",
  "staff.file.saved",
  "staff.file.deleted",
  "staff.command.started",
  "staff.command.output",
  "staff.command.completed",
  "staff.research.started",
  "staff.research.result",
  "staff.decision.recorded",
  "staff.test.started",
  "staff.test.result",
  "handoff.preparing",
  "handoff.started",
  "handoff.accepted",
  "handoff.completed",
  "approval.requested",
  "approval.accepted",
  "approval.rejected",
  "artifact.created",
  "artifact.updated",
  "activity.created",
] as const

export const eventPayloadSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  objective: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  tool: z.string().optional(),
  error: z.string().optional(),
  file_path: z.string().optional(),
  progress_percent: z.number().min(0).max(100).optional(),
  phase: z.string().optional(),
  handoff_id: z.string().optional(),
  from_staff_id: z.string().optional(),
  to_staff_id: z.string().optional(),
  artifact_id: z.string().optional(),
  artifact_type: z.string().optional(),
  artifact_count: z.number().int().nonnegative().optional(),
  tool_name: z.string().optional(),
  command: z.string().optional(),
  next_action: z.string().optional(),
}).passthrough()

export const eventEnvelopeSchema = z.object({
  version: z.literal("1.0"),
  event_id: z.string(),
  event_type: z.enum(eventTypes),
  timestamp: z.string(),
  project_id: z.string(),
  mission_id: z.string(),
  staff_id: z.string().nullable(),
  sequence: z.number().int().positive(),
  payload: eventPayloadSchema,
})

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>

`
### apps/web/src/features/mission/mission-event-reducer.ts

`tsx
import type {
  ActiveHandoff,
  ActivityItem,
  Artifact,
  MissionStatus,
  StaffStatus,
  WorkLog,
} from "@/types/domain"
import type { EventEnvelope } from "@/types/events"

import {
  createEmptyWorkLog,
  reduceStaffWorkLog,
} from "./work-log-projection"

export interface PlanReviewAssignment {
  staffId: string
  staffRole: string
  role: string
  displayName: string
  avatar: string
  objective: string
  rationale: string
  sequence: number
}

export interface PlanReview {
  interpretation: string
  summary: string
  assignments: PlanReviewAssignment[]
}

export interface MissionProjection {
  status: MissionStatus
  objective: string | null
  assemblyRoles: string[]
  planReview: PlanReview | null
  startedAt: string | null
  endedAt: string | null
  currentStaffId: string | null
  activeFile: string
  lastDeletedFile: string | null
  fileRevision: number
  editorOwnerId: string | null
  selectedStaffIds: string[]
  staffStatuses: Record<string, StaffStatus>
  activity: ActivityItem[]
  artifacts: Artifact[]
  workLogs: Record<string, WorkLog>
  activeHandoff: ActiveHandoff | null
  lastSequence: number
  processedEventIds: string[]
}

export function createInitialMissionProjection(): MissionProjection {
  return {
    status: "draft",
    objective: null,
    assemblyRoles: [],
    planReview: null,
    startedAt: null,
    endedAt: null,
    currentStaffId: null,
    activeFile: "",
    lastDeletedFile: null,
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
  }
}

function parsePlanReview(payload: EventEnvelope["payload"]): PlanReview | null {
  if (typeof payload.interpretation !== "string") return null
  if (typeof payload.mission_summary !== "string") return null
  if (!Array.isArray(payload.assignments)) return null
  const assignments = payload.assignments.flatMap((item): PlanReviewAssignment[] => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    if (
      typeof row.staff_id !== "string"
      || typeof row.staff_role !== "string"
      || typeof row.role !== "string"
      || typeof row.display_name !== "string"
      || typeof row.avatar !== "string"
      || typeof row.objective !== "string"
      || typeof row.rationale !== "string"
      || typeof row.sequence !== "number"
    ) {
      return []
    }
    return [{
      staffId: row.staff_id,
      staffRole: row.staff_role,
      role: row.role,
      displayName: row.display_name,
      avatar: row.avatar,
      objective: row.objective,
      rationale: row.rationale,
      sequence: row.sequence,
    }]
  })
  if (assignments.length === 0) return null
  return {
    interpretation: payload.interpretation,
    summary: payload.mission_summary,
    assignments: assignments.sort((left, right) => left.sequence - right.sequence),
  }
}

function isMissionStatus(value: string | undefined): value is MissionStatus {
  return [
    "draft", "submitted", "analyzing", "assembling_team", "team_ready",
    "running", "paused", "awaiting_approval", "blocked", "testing",
    "reviewing", "completed", "failed", "cancelled",
  ].includes(value ?? "")
}

function isStaffStatus(value: string | undefined): value is StaffStatus {
  return [
    "available", "assigned", "queued", "analyzing", "researching", "working",
    "coding", "reviewing", "testing", "blocked", "handing_off",
    "awaiting_approval", "completed", "offline", "error",
  ].includes(value ?? "")
}

const missionEventStatus: Partial<
  Record<EventEnvelope["event_type"], MissionStatus>
> = {
  "mission.created": "draft",
  "mission.submitted": "submitted",
  "mission.analysis.started": "analyzing",
  "mission.analysis.updated": "analyzing",
  "mission.plan.proposed": "awaiting_approval",
  "mission.plan.accepted": "assembling_team",
  "mission.plan.regenerating": "analyzing",
  "mission.team.assembly.started": "assembling_team",
  "mission.team.assembly.completed": "team_ready",
  "mission.started": "running",
  "mission.paused": "paused",
  "mission.resumed": "running",
  "mission.blocked": "blocked",
  "mission.completed": "completed",
  "mission.failed": "failed",
}

export function missionEventReducer(
  state: MissionProjection,
  event: EventEnvelope,
): MissionProjection {
  if (
    event.sequence <= state.lastSequence ||
    state.processedEventIds.includes(event.event_id)
  ) {
    return state
  }

  const payload = event.payload
  const activityTitle = (() => {
    if (typeof payload.title === "string" && payload.title.trim()) return payload.title
    if (typeof payload.summary === "string" && payload.summary.trim()) return payload.summary
    if (
      event.event_type === "mission.plan.proposed"
      && typeof payload.mission_summary === "string"
      && payload.mission_summary.trim()
    ) {
      return payload.mission_summary
    }
    if (
      event.event_type === "mission.plan.accepted"
    ) {
      return "Plan accepted"
    }
    if (event.event_type === "mission.plan.regenerating") {
      return "Regenerating plan"
    }
    return event.event_type
  })()
  let next: MissionProjection = {
    ...state,
    lastSequence: event.sequence,
    processedEventIds: [...state.processedEventIds, event.event_id],
    activity: [
      ...state.activity,
      {
        id: event.event_id,
        timestamp: event.timestamp,
        staffId: event.staff_id,
        title: activityTitle,
        status: payload.status ?? "completed",
        eventType: event.event_type,
        ...(payload.file_path ? { filePath: payload.file_path } : {}),
      },
    ],
  }

  if (event.event_type.startsWith("mission.")) {
    const status = isMissionStatus(payload.status)
      ? payload.status
      : missionEventStatus[event.event_type] ?? next.status
    next = {
      ...next,
      status,
      currentStaffId: event.staff_id ?? next.currentStaffId,
    }

    if (
      (event.event_type === "mission.created" || event.event_type === "mission.started")
      && typeof payload.objective === "string"
      && payload.objective.trim().length > 0
    ) {
      next = { ...next, objective: payload.objective }
    }

    if (event.event_type === "mission.started" && !next.startedAt) {
      next = { ...next, startedAt: event.timestamp, endedAt: null }
    }

    if (event.event_type === "mission.plan.proposed") {
      next = { ...next, planReview: parsePlanReview(payload) }
    }

    if (event.event_type === "mission.plan.accepted") {
      next = { ...next, planReview: null }
    }

    if (event.event_type === "mission.team.assembly.started") {
      const roles = Array.isArray(payload.roles)
        ? payload.roles.filter((role): role is string => typeof role === "string")
        : []
      next = { ...next, assemblyRoles: roles, planReview: null }
    }

    if (
      event.event_type === "mission.completed"
      || event.event_type === "mission.failed"
      || status === "cancelled"
    ) {
      next = {
        ...next,
        assemblyRoles: [],
        planReview: null,
        editorOwnerId: null,
        endedAt: next.endedAt ?? event.timestamp,
      }
    }
  }

  if (event.event_type === "mission.team.member.selected" && event.staff_id) {
    next = {
      ...next,
      selectedStaffIds: next.selectedStaffIds.includes(event.staff_id)
        ? next.selectedStaffIds
        : [...next.selectedStaffIds, event.staff_id],
      staffStatuses: {
        ...next.staffStatuses,
        [event.staff_id]: "queued",
      },
    }
  }

  if (
    ["staff.status.changed", "staff.assigned", "staff.action.started",
      "staff.action.completed", "staff.test.started"].includes(event.event_type)
    && event.staff_id
  ) {
    const inferredStatus: StaffStatus = event.event_type === "staff.assigned"
      ? "queued"
      : event.event_type === "staff.action.completed"
        ? "completed"
        : event.event_type === "staff.test.started"
          ? "testing"
          : "working"
    next = {
      ...next,
      currentStaffId: event.staff_id,
      selectedStaffIds: next.selectedStaffIds.includes(event.staff_id)
        ? next.selectedStaffIds
        : [...next.selectedStaffIds, event.staff_id],
      staffStatuses: {
        ...next.staffStatuses,
        [event.staff_id]: isStaffStatus(payload.status)
          ? payload.status
          : inferredStatus,
      },
    }
  }

  if (
    ["staff.file.opened", "staff.file.created", "staff.file.updated"].includes(
      event.event_type,
    ) &&
    payload.file_path
  ) {
    next = {
      ...next,
      activeFile: payload.file_path,
      editorOwnerId: event.staff_id,
      currentStaffId: event.staff_id ?? next.currentStaffId,
      fileRevision: next.fileRevision + 1,
    }

    if (
      event.event_type === "staff.file.created" ||
      event.event_type === "staff.file.updated"
    ) {
      const filePath = payload.file_path
      const existingIndex = next.artifacts.findIndex(
        (artifact) => artifact.type === "file_output" && artifact.name === filePath,
      )
      const existing = existingIndex >= 0 ? next.artifacts[existingIndex] : undefined
      const entry: Artifact = {
        id: existing?.id ?? event.event_id,
        staffId: event.staff_id,
        type: "file_output",
        name: filePath,
        summary: payload.title ?? payload.summary ?? filePath,
      }
      const artifacts = [...next.artifacts]
      if (existingIndex >= 0) {
        artifacts[existingIndex] = entry
      } else {
        artifacts.push(entry)
      }
      next = { ...next, artifacts }
    }
  }

  if (event.event_type === "staff.file.deleted" && payload.file_path) {
    const filePath = payload.file_path
    const wasActive = next.activeFile === filePath
    next = {
      ...next,
      lastDeletedFile: filePath,
      fileRevision: next.fileRevision + 1,
      activeFile: wasActive ? "" : next.activeFile,
      editorOwnerId: wasActive ? null : next.editorOwnerId,
      artifacts: next.artifacts.filter(
        (artifact) =>
          !(artifact.type === "file_output" && artifact.name === filePath),
      ),
    }
  }

  if (event.event_type === "artifact.created") {
    next = {
      ...next,
      artifacts: [
        ...next.artifacts,
        {
          id: payload.artifact_id ?? event.event_id,
          staffId: event.staff_id,
          type: payload.artifact_type ?? "final_report",
          name: payload.title ?? "Mission artifact",
          summary: payload.summary ?? "",
        },
      ],
    }
  }

  if (
    event.event_type === "handoff.started" &&
    payload.from_staff_id &&
    payload.to_staff_id
  ) {
    next = {
      ...next,
      activeHandoff: {
        id: payload.handoff_id ?? event.event_id,
        fromStaffId: payload.from_staff_id,
        toStaffId: payload.to_staff_id,
        title: payload.title ?? "Work ready",
        summary: payload.summary ?? "",
        artifactCount: payload.artifact_count ?? 0,
        status: "animating",
      },
    }
  }

  if (event.event_type === "handoff.accepted" && next.activeHandoff) {
    next = {
      ...next,
      currentStaffId: next.activeHandoff.toStaffId,
      activeHandoff: { ...next.activeHandoff, status: "accepted" },
    }
  }

  if (event.event_type === "handoff.completed") {
    next = { ...next, activeHandoff: null }
  }

  if (event.event_type === "mission.completed") {
    next = {
      ...next,
      currentStaffId: event.staff_id,
      editorOwnerId: null,
      staffStatuses: Object.fromEntries(
        next.selectedStaffIds.map((staffId) => [staffId, "completed"]),
      ),
    }
  }

  if (event.staff_id) {
    next = {
      ...next,
      workLogs: {
        ...next.workLogs,
        [event.staff_id]: reduceStaffWorkLog(
          next.workLogs[event.staff_id] ?? createEmptyWorkLog(),
          event,
        ),
      },
    }
  }

  return next
}

`
### apps/web/src/features/mission/work-log-projection.ts

`tsx
import type { WorkLog } from "@/types/domain"
import type { EventEnvelope } from "@/types/events"

const actionEvents: readonly EventEnvelope["event_type"][] = [
  "staff.action.started",
  "staff.action.updated",
  "staff.action.completed",
]

const inputEvents: readonly EventEnvelope["event_type"][] = [
  "staff.file.opened",
  "staff.file.read",
]

const outputFileEvents: readonly EventEnvelope["event_type"][] = [
  "staff.file.created",
  "staff.file.updated",
  "staff.file.saved",
  "staff.file.deleted",
]

const artifactEvents: readonly EventEnvelope["event_type"][] = [
  "artifact.created",
  "artifact.updated",
]

const failureEvents: readonly EventEnvelope["event_type"][] = [
  "mission.failed",
  "model.request.failed",
]

function appendUnique(items: string[], value: string | undefined): string[] {
  if (!value || items.includes(value)) return items
  return [...items, value]
}

export function createEmptyWorkLog(): WorkLog {
  return {
    currentAction: null,
    objective: null,
    inputs: [],
    toolActivity: [],
    observations: [],
    decisionSummary: null,
    output: [],
    nextAction: null,
    errors: [],
  }
}

export function reduceStaffWorkLog(
  current: WorkLog,
  event: EventEnvelope,
): WorkLog {
  const { payload } = event
  let next = current

  if (event.event_type === "staff.assigned") {
    next = {
      ...next,
      objective: payload.objective ?? payload.summary ?? next.objective,
    }
  }

  if (actionEvents.includes(event.event_type)) {
    next = {
      ...next,
      currentAction: payload.summary ?? payload.title ?? next.currentAction,
    }
  }

  if (event.event_type === "staff.action.updated") {
    next = {
      ...next,
      toolActivity: appendUnique(next.toolActivity, payload.tool),
    }
  }

  if (inputEvents.includes(event.event_type)) {
    next = {
      ...next,
      inputs: appendUnique(next.inputs, payload.file_path),
    }
  }

  if (event.event_type === "staff.research.result") {
    next = {
      ...next,
      observations: appendUnique(
        next.observations,
        payload.summary ?? payload.title,
      ),
    }
  }

  if (event.event_type === "staff.decision.recorded") {
    next = {
      ...next,
      decisionSummary: payload.summary ?? payload.title ?? next.decisionSummary,
    }
  }

  if (outputFileEvents.includes(event.event_type)) {
    next = {
      ...next,
      output: appendUnique(next.output, payload.file_path),
    }
  }

  if (artifactEvents.includes(event.event_type)) {
    next = {
      ...next,
      output: appendUnique(next.output, payload.title),
    }
  }

  if (payload.next_action) {
    next = {
      ...next,
      nextAction: payload.next_action,
    }
  }

  if (failureEvents.includes(event.event_type)) {
    next = {
      ...next,
      errors: appendUnique(
        next.errors,
        payload.error ?? payload.summary ?? event.event_type,
      ),
    }
  }

  return next
}

`
### apps/web/src/app/App.tsx

`tsx
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
import { TeamFloor } from "@/components/team-floor/TeamFloor"
import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
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
      />
    )

  const hasProject = Boolean(project.data)
  const missionControlStatus = isTerminalMissionStatus(liveRuntime.mission?.status)
    ? liveRuntime.mission.status
    : liveRuntime.projection.status

  const workspaceClass = [
    "mission-workspace",
    !hasProject ? "mission-workspace--no-project" : "",
  ].filter(Boolean).join(" ")

  const workspace = (
    <div className={workspaceClass}>
      {liveRuntime.error && (
        <p className="mission-runtime-error" role="alert">{liveRuntime.error}</p>
      )}
      <WorkspacePanelSwitch
        panelKey={activePanel === "team-floor" ? "team-floor" : "workspace"}
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
      sidebar={sidebar}
      workspace={workspace}
      teamPanel={(
        <EngineeringTeamPanel
          staff={roster}
          onSelectStaff={selectStaff}
          isLoading={staff.isPending}
          error={staff.error}
          missionControls={liveRuntime.hasStarted ? (
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
          ) : (
            <MissionComposer
              projectName={project.data?.name}
              liveRuntime={{
                state: runtimeStatus.data?.state ?? "unavailable",
                profileId: runtimeStatus.data?.selectedProfileId ?? "",
                model: runtimeStatus.data?.selectedModel ?? "",
              }}
              onStart={(request) => {
                if (!project.data) return
                setActivePanel("team-floor")
                void liveRuntime.start({
                  request: request.request,
                  projectId: project.data.id,
                  modelProfileId: request.modelProfile,
                  model: request.model,
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

`
### apps/web/tests/mission-event-reducer.test.ts

`tsx
import { describe, expect, it } from "vitest"

import {
  createInitialMissionProjection,
  missionEventReducer,
} from "@/features/mission/mission-event-reducer"
import type { EventEnvelope } from "@/types/events"

const event = (
  sequence: number,
  eventType: EventEnvelope["event_type"],
  payload: EventEnvelope["payload"],
  staffId: string | null = null,
): EventEnvelope => ({
  version: "1.0",
  event_id: `evt_${sequence}`,
  event_type: eventType,
  timestamp: `2026-07-23T18:00:${sequence.toString().padStart(2, "0")}Z`,
  project_id: "project_orion",
  mission_id: "mission_orchestration",
  staff_id: staffId,
  sequence,
  payload,
})

describe("missionEventReducer", () => {
  it("rebuilds mission, staff, file, activity, artifact, and handoff state", () => {
    const events: EventEnvelope[] = [
      event(1, "mission.analysis.started", {
        title: "Analyzing mission",
        status: "analyzing",
        progress_percent: 8,
      }, "staff_alex"),
      event(2, "staff.status.changed", {
        status: "researching",
        title: "Maya started repository research",
      }, "staff_maya"),
      event(3, "staff.file.opened", {
        title: "Maya opened the orchestration service",
        file_path: "services/orchestrator.py",
      }, "staff_maya"),
      event(4, "artifact.created", {
        artifact_id: "artifact_research",
        artifact_type: "research_note",
        title: "Repository research brief",
        summary: "Existing mission state patterns identified.",
      }, "staff_maya"),
      event(5, "handoff.started", {
        handoff_id: "handoff_maya_ethan",
        from_staff_id: "staff_maya",
        to_staff_id: "staff_ethan",
        title: "Research complete",
        summary: "Implementation evidence is ready.",
        artifact_count: 1,
      }, "staff_maya"),
    ]

    const projection = events.reduce(
      missionEventReducer,
      createInitialMissionProjection(),
    )

    expect(projection.status).toBe("analyzing")
    expect(projection.currentStaffId).toBe("staff_maya")
    expect(projection.staffStatuses.staff_maya).toBe("researching")
    expect(projection.activeFile).toBe("services/orchestrator.py")
    expect(projection.activity).toHaveLength(5)
    expect(projection.artifacts[0]?.name).toBe("Repository research brief")
    expect(projection.activeHandoff?.toStaffId).toBe("staff_ethan")
    expect(projection.lastSequence).toBe(5)
  })

  it("bumps fileRevision on successive file updates to the same path", () => {
    const opened = event(1, "staff.file.opened", {
      title: "Opened a.ts",
      file_path: "a.ts",
    }, "staff_maya")
    const updated = event(2, "staff.file.updated", {
      title: "Wrote a.ts",
      file_path: "a.ts",
    }, "staff_maya")
    const projection = [opened, updated].reduce(
      missionEventReducer,
      createInitialMissionProjection(),
    )
    expect(projection.activeFile).toBe("a.ts")
    expect(projection.fileRevision).toBe(2)
    expect(projection.editorOwnerId).toBe("staff_maya")
  })

  it("projects file creates and updates into Team Floor work outputs", () => {
    const projection = [
      event(1, "staff.file.created", {
        title: "Wrote index.html",
        file_path: "index.html",
      }, "staff_lina"),
      event(2, "staff.file.updated", {
        title: "Updated index.html",
        file_path: "index.html",
      }, "staff_lina"),
      event(3, "staff.file.opened", {
        title: "Opened script.js",
        file_path: "script.js",
      }, "staff_lina"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.artifacts).toEqual([
      {
        id: "evt_1",
        staffId: "staff_lina",
        type: "file_output",
        name: "index.html",
        summary: "Updated index.html",
      },
    ])
    expect(projection.activeFile).toBe("script.js")
  })

  it("clears active file and work output when a file is deleted", () => {
    const projection = [
      event(1, "staff.file.created", {
        title: "Wrote hello.html",
        file_path: "hello.html",
      }, "staff_lina"),
      event(2, "staff.file.deleted", {
        title: "Deleted hello.html",
        file_path: "hello.html",
      }, "staff_lina"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.activeFile).toBe("")
    expect(projection.lastDeletedFile).toBe("hello.html")
    expect(projection.fileRevision).toBe(2)
    expect(
      projection.artifacts.filter((a) => a.type === "file_output"),
    ).toHaveLength(0)
  })

  it("initializes lastDeletedFile as null", () => {
    expect(createInitialMissionProjection().lastDeletedFile).toBeNull()
  })

  it("uses summary as activity title when title is absent", () => {
    const projection = missionEventReducer(
      createInitialMissionProjection(),
      event(1, "staff.action.updated", { summary: "Wrote a.ts", ok: true }, "staff_maya"),
    )
    expect(projection.activity[0]?.title).toBe("Wrote a.ts")
  })

  it("projects isolated work logs for each staff member", () => {
    const projection = [
      event(1, "staff.assigned", {
        objective: "Implement live runtime",
      }, "staff_maya"),
      event(2, "staff.action.updated", {
        summary: "Wrote src/runtime.ts",
        tool: "repository.write",
      }, "staff_maya"),
      event(3, "staff.decision.recorded", {
        summary: "Keep the event projection pure",
      }, "staff_ethan"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.workLogs.staff_maya).toMatchObject({
      objective: "Implement live runtime",
      currentAction: "Wrote src/runtime.ts",
      toolActivity: ["repository.write"],
    })
    expect(projection.workLogs.staff_ethan).toMatchObject({
      decisionSummary: "Keep the event projection pure",
      objective: null,
    })
  })

  it("does not expose fabricated phase or progress state", () => {
    const projection = createInitialMissionProjection()

    expect(projection).not.toHaveProperty("phase")
    expect(projection).not.toHaveProperty("progress")
  })

  it("tracks mission start and end timestamps for the Team Floor timer", () => {
    const started = missionEventReducer(
      createInitialMissionProjection(),
      event(1, "mission.started", { summary: "Mission started" }),
    )
    expect(started.startedAt).toBe("2026-07-23T18:00:01Z")
    expect(started.endedAt).toBeNull()

    const completed = missionEventReducer(
      started,
      event(2, "mission.completed", { summary: "Done" }),
    )
    expect(completed.startedAt).toBe("2026-07-23T18:00:01Z")
    expect(completed.endedAt).toBe("2026-07-23T18:00:02Z")
  })

  it("uses readable activity titles for plan review events", () => {
    const proposed = event(1, "mission.plan.proposed", {
      interpretation: "Build a hello page.",
      mission_summary: "Ship a minimal hello page.",
      assignments: [
        {
          staff_id: "staff_lina",
          staff_role: "frontend_developer",
          role: "Front-End Developer",
          display_name: "Lina",
          avatar: "lina",
          objective: "Create hello.html",
          rationale: "Front-end owns the page.",
          sequence: 1,
        },
      ],
    })
    const accepted = event(2, "mission.plan.accepted", {
      interpretation: "Build a hello page.",
      mission_summary: "Ship a minimal hello page.",
      assignments: proposed.payload.assignments,
    })
    const projection = [proposed, accepted].reduce(
      missionEventReducer,
      createInitialMissionProjection(),
    )
    expect(projection.activity[0]?.title).toBe("Ship a minimal hello page.")
    expect(projection.activity[1]?.title).toBe("Plan accepted")
  })

  it("projects plan review from mission.plan.proposed and clears on accept", () => {
    const proposed = event(1, "mission.plan.proposed", {
      interpretation: "Build a centered button page.",
      mission_summary: "Ship a minimal centered button page.",
      assignments: [
        {
          staff_id: "staff_lina",
          staff_role: "frontend_developer",
          role: "Front-End Developer",
          display_name: "Lina",
          avatar: "lina",
          objective: "Create index.html",
          rationale: "Front-end owns the page markup.",
          sequence: 1,
        },
      ],
    })
    const accepted = event(2, "mission.plan.accepted", {
      interpretation: "Build a centered button page.",
      mission_summary: "Ship a minimal centered button page.",
      assignments: proposed.payload.assignments,
    })

    const awaiting = missionEventReducer(createInitialMissionProjection(), proposed)
    expect(awaiting.status).toBe("awaiting_approval")
    expect(awaiting.planReview).toEqual({
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
    })

    const afterAccept = missionEventReducer(awaiting, accepted)
    expect(afterAccept.status).toBe("assembling_team")
    expect(afterAccept.planReview).toBeNull()
  })

  it("ignores duplicate and out-of-order events", () => {
    const initial = createInitialMissionProjection()
    const later = event(4, "mission.started", {
      title: "Mission started",
      status: "running",
      progress_percent: 20,
    })
    const earlier = event(3, "mission.failed", {
      title: "Stale failure",
      status: "failed",
    })

    const projection = [later, earlier, later].reduce(missionEventReducer, initial)

    expect(projection.status).toBe("running")
    expect(projection.activity).toHaveLength(1)
    expect(projection.lastSequence).toBe(4)
  })

  it("stores mission objective and assembly roles for Team Floor startup", () => {
    const projection = [
      event(1, "mission.created", {
        objective: "Build a centered button page",
      }),
      event(2, "mission.started", {
        summary: "Mission started",
      }),
      event(3, "mission.analysis.started", {
        summary: "Coordinator is creating a bounded mission plan",
      }),
      event(4, "mission.team.assembly.started", {
        summary: "Assembling team",
        roles: ["frontend_developer", "project_coordinator"],
      }),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(projection.objective).toBe("Build a centered button page")
    expect(projection.status).toBe("assembling_team")
    expect(projection.assemblyRoles).toEqual([
      "frontend_developer",
      "project_coordinator",
    ])
  })

  it("clears assembly roles when the mission ends", () => {
    const started = [
      event(1, "mission.created", { objective: "Ship MVP" }),
      event(2, "mission.team.assembly.started", {
        roles: ["frontend_developer"],
      }),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    const completed = missionEventReducer(
      started,
      event(3, "mission.completed", { summary: "Done" }),
    )

    expect(completed.assemblyRoles).toEqual([])
    expect(completed.objective).toBe("Ship MVP")
  })

  it("clears the live editor owner when the mission completes", () => {
    const withFile = [
      event(1, "staff.file.updated", {
        title: "Wrote index.html",
        file_path: "index.html",
      }, "staff_alex"),
      event(2, "staff.file.updated", {
        title: "Wrote script.js",
        file_path: "script.js",
      }, "staff_alex"),
    ].reduce(missionEventReducer, createInitialMissionProjection())

    expect(withFile.editorOwnerId).toBe("staff_alex")
    expect(withFile.activeFile).toBe("script.js")

    const completed = missionEventReducer(
      withFile,
      event(3, "mission.completed", { summary: "Operation delivered" }),
    )

    expect(completed.status).toBe("completed")
    expect(completed.editorOwnerId).toBeNull()
    expect(completed.activeFile).toBe("script.js")
  })
})

`
