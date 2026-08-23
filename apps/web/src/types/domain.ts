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

export type TerminalMissionStatus = Extract<
  MissionStatus,
  "completed" | "failed" | "cancelled"
>

const TERMINAL_MISSION_STATUSES: readonly TerminalMissionStatus[] = [
  "completed",
  "failed",
  "cancelled",
]

export function isTerminalMissionStatus(
  status: unknown,
): status is TerminalMissionStatus {
  return TERMINAL_MISSION_STATUSES.some((candidate) => candidate === status)
}

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
  changedPaths?: string[]
  testInstructions?: string[]
  acceptanceCriteria?: string[]
  status: "preparing" | "animating" | "accepted" | "completed"
}

export interface WorkLog {
  currentAction: string | null
  objective: string | null
  inputs: string[]
  toolActivity: string[]
  observations: string[]
  decisionSummary: string | null
  output: string[]
  nextAction: string | null
  errors: string[]
}
