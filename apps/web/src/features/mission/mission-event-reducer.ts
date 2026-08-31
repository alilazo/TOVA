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
  "mission.plan.denied": "cancelled",
  "mission.team.assembly.started": "assembling_team",
  "mission.team.assembly.completed": "team_ready",
  "mission.started": "running",
  "mission.paused": "paused",
  "mission.resumed": "running",
  "mission.blocked": "blocked",
  "mission.completed": "completed",
  "mission.failed": "failed",
  "mission.cancelled": "cancelled",
}

export function missionStatusForEvent(
  eventType: EventEnvelope["event_type"],
): MissionStatus | null {
  return missionEventStatus[eventType] ?? null
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

    if (event.event_type === "mission.plan.denied") {
      next = {
        ...next,
        planReview: null,
        assemblyRoles: [],
        endedAt: next.endedAt ?? event.timestamp,
      }
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
      || event.event_type === "mission.cancelled"
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
      "staff.action.completed", "staff.test.started", "staff.test.result"].includes(event.event_type)
    && event.staff_id
  ) {
    const inferredStatus: StaffStatus = event.event_type === "staff.assigned"
      ? "queued"
      : event.event_type === "staff.action.completed"
        ? "completed"
        : event.event_type === "staff.test.result"
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
      lastDeletedFile: null,
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

  if (
    event.event_type === "staff.test.result" &&
    payload.tool === "qa.browser.audit" &&
    event.staff_id
  ) {
    const verdict = typeof payload.verdict === "string" ? payload.verdict : "completed"
    const title = `QA browser audit: ${verdict}`
    next = {
      ...next,
      artifacts: [
        ...next.artifacts,
        {
          id: event.event_id,
          staffId: event.staff_id,
          type: "qa_report",
          name: title,
          summary: payload.summary ?? title,
        },
      ],
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
        changedPaths: payload.changed_paths ?? [],
        testInstructions: payload.test_instructions ?? [],
        acceptanceCriteria: payload.acceptance_criteria ?? [],
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
      activity: next.activity.map((item) => (
        item.status === "completed" || item.status === "failed" || item.status === "blocked"
          ? item
          : { ...item, status: "completed" }
      )),
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
