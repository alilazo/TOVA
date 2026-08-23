# Task 2 Review Package
## FILE: apps/web/src/features/mission/mission-event-reducer.ts
```
import type {
  ActiveHandoff,
  ActivityItem,
  Artifact,
  MissionStatus,
  StaffStatus,
} from "@/types/domain"
import type { EventEnvelope } from "@/types/events"

export interface MissionProjection {
  status: MissionStatus
  phase: MissionStatus
  progress: number
  currentStaffId: string | null
  activeFile: string
  fileRevision: number
  editorOwnerId: string | null
  selectedStaffIds: string[]
  staffStatuses: Record<string, StaffStatus>
  activity: ActivityItem[]
  artifacts: Artifact[]
  activeHandoff: ActiveHandoff | null
  lastSequence: number
  processedEventIds: string[]
}

export function createInitialMissionProjection(): MissionProjection {
  return {
    status: "draft",
    phase: "draft",
    progress: 0,
    currentStaffId: null,
    activeFile: "",
    fileRevision: 0,
    editorOwnerId: null,
    selectedStaffIds: [],
    staffStatuses: {},
    activity: [],
    artifacts: [],
    activeHandoff: null,
    lastSequence: 0,
    processedEventIds: [],
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

const missionEventState: Partial<Record<EventEnvelope["event_type"], {
  status: MissionStatus
  progress: number
}>> = {
  "mission.created": { status: "draft", progress: 2 },
  "mission.submitted": { status: "submitted", progress: 5 },
  "mission.analysis.started": { status: "analyzing", progress: 10 },
  "mission.analysis.updated": { status: "analyzing", progress: 20 },
  "mission.team.assembly.started": { status: "assembling_team", progress: 25 },
  "mission.team.assembly.completed": { status: "team_ready", progress: 35 },
  "mission.started": { status: "running", progress: 40 },
  "mission.paused": { status: "paused", progress: 40 },
  "mission.resumed": { status: "running", progress: 40 },
  "mission.blocked": { status: "blocked", progress: 40 },
  "mission.completed": { status: "completed", progress: 100 },
  "mission.failed": { status: "failed", progress: 100 },
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
        title: payload.title ?? payload.summary ?? event.event_type,
        status: payload.status ?? "completed",
        eventType: event.event_type,
        ...(payload.file_path ? { filePath: payload.file_path } : {}),
      },
    ],
  }

  if (event.event_type.startsWith("mission.")) {
    const inferred = missionEventState[event.event_type]
    const status = isMissionStatus(payload.status)
      ? payload.status
      : inferred?.status ?? next.status
    const phase = isMissionStatus(payload.phase) ? payload.phase : status
    next = {
      ...next,
      status,
      phase,
      progress: payload.progress_percent ?? inferred?.progress ?? next.progress,
      currentStaffId: event.staff_id ?? next.currentStaffId,
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
      staffStatuses: Object.fromEntries(
        next.selectedStaffIds.map((staffId) => [staffId, "completed"]),
      ),
    }
  }

  return next
}

```
## FILE: apps/web/src/types/domain.ts
```
export type StaffStatus =
  | "available"
  | "assigned"
  | "queued"
  | "analyzing"
  | "researching"
  | "working"
  | "coding"
  | "reviewing"
  | "testing"
  | "blocked"
  | "handing_off"
  | "awaiting_approval"
  | "completed"
  | "offline"
  | "error"

export type MissionStatus =
  | "draft"
  | "submitted"
  | "analyzing"
  | "assembling_team"
  | "team_ready"
  | "running"
  | "paused"
  | "awaiting_approval"
  | "blocked"
  | "testing"
  | "reviewing"
  | "completed"
  | "failed"
  | "cancelled"

export interface StaffProfile {
  id: string
  employeeId: string
  slug: string
  name: string
  displayName: string
  role: string
  roleKey: string
  department: string
  seniority: string
  avatar: string
  description: string
  status: StaffStatus
  modelProfile: string
  tools: string[]
  canDelegate: boolean
  canApprove: boolean
  tags: string[]
}

export interface RepositoryFile {
  path: string
  name: string
  language: string
  content: string
  status?: "modified" | "added"
}

export interface ActivityItem {
  id: string
  timestamp: string
  staffId: string | null
  title: string
  status: string
  eventType: string
  filePath?: string
}

export interface Artifact {
  id: string
  staffId: string | null
  type: string
  name: string
  summary: string
}

export interface ActiveHandoff {
  id: string
  fromStaffId: string
  toStaffId: string
  title: string
  summary: string
  artifactCount: number
  status: "preparing" | "animating" | "accepted" | "completed"
}

export interface WorkLog {
  currentAction: string
  objective: string
  inputs: string[]
  toolActivity: string[]
  observations: string[]
  decisionSummary: string
  output: string[]
  nextAction: string
}

```
## FILE: apps/web/src/types/events.ts
```
import { z } from "zod"

export const eventTypes = [
  "mission.created",
  "mission.submitted",
  "mission.analysis.started",
  "mission.analysis.updated",
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
  status: z.string().optional(),
  severity: z.string().optional(),
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

```
## FILE: apps/web/tests/mission-event-reducer.test.ts
```
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

  it("uses summary as activity title when title is absent", () => {
    const projection = missionEventReducer(
      createInitialMissionProjection(),
      event(1, "staff.action.updated", { summary: "Wrote a.ts", ok: true }, "staff_maya"),
    )
    expect(projection.activity[0]?.title).toBe("Wrote a.ts")
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
})

```

