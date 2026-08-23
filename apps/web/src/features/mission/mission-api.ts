import { apiRequest } from "@/lib/api"
import type { EventEnvelope } from "@/types/events"

export interface MissionRecord {
  id: string
  project_id: string
  objective: string
  team_id?: "hipo"
  project_root: string
  status: string
  model_profile_id: string
  model: string
  session_id?: string | null
  turn_index?: number | null
  context_summary?: string
}

export interface MissionTurnRecord {
  mission_id: string
  prompt: string
  status: string
  model_profile_id: string
  model: string
  created_at: string
  updated_at: string
  summary: string
}

export interface MissionSessionRecord {
  id: string
  project_id: string
  project_root: string
  title: string
  team_id?: "hipo"
  status: string
  active_mission_id: string
  created_at: string
  updated_at: string
  turns: MissionTurnRecord[]
}

export type CommandApprovalPayload = {
  kind?: "command"
  mission_id: string
  staff_id: string
  executable: string
  args: string[]
  cwd: string
  purpose: string
  timeout_seconds?: number
  expected_outputs?: string[]
}

export type FileDeleteApprovalPayload = {
  kind: "file_delete"
  mission_id: string
  staff_id: string
  staff_display_name: string
  path: string
  purpose: string
}

export type BrowserAuditApprovalPayload = {
  kind: "browser_audit"
  mission_id: string
  staff_id: string
  staff_display_name: string
  url: string
  purpose: string
  acceptance_criteria: string[]
}

export type ApprovalRequestPayload =
  | CommandApprovalPayload
  | FileDeleteApprovalPayload
  | BrowserAuditApprovalPayload

export interface ApprovalRequest {
  id: string
  request: ApprovalRequestPayload
  status: "pending" | "accepted" | "rejected" | "executing" | "executed" | "failed"
}

export function createMission(input: {
  projectId: string
  objective: string
  modelProfileId: string
  model: string
  teamId?: "hipo"
}) {
  return apiRequest<MissionRecord>(`/api/projects/${input.projectId}/missions`, {
    method: "POST",
    body: JSON.stringify({
      objective: input.objective,
      team_id: input.teamId ?? "hipo",
      model_profile_id: input.modelProfileId,
      model: input.model,
    }),
  })
}

export function createMissionSession(input: {
  projectId: string
  prompt: string
  modelProfileId: string
  model: string
  teamId?: "hipo"
}) {
  return apiRequest<MissionSessionRecord>(`/api/projects/${input.projectId}/mission-sessions`, {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt,
      team_id: input.teamId ?? "hipo",
      model_profile_id: input.modelProfileId,
      model: input.model,
    }),
  })
}

export function appendMissionSessionTurn(input: {
  sessionId: string
  prompt: string
  modelProfileId: string
  model: string
  teamId?: "hipo"
}) {
  return apiRequest<MissionSessionRecord>(`/api/mission-sessions/${input.sessionId}/turns`, {
    method: "POST",
    body: JSON.stringify({
      prompt: input.prompt,
      team_id: input.teamId ?? "hipo",
      model_profile_id: input.modelProfileId,
      model: input.model,
    }),
  })
}

export function listMissionSessions(projectId: string) {
  return apiRequest<MissionSessionRecord[]>(`/api/projects/${projectId}/mission-sessions`)
}

export function getMissionSession(sessionId: string) {
  return apiRequest<MissionSessionRecord>(`/api/mission-sessions/${sessionId}`)
}

export function getMission(missionId: string) {
  return apiRequest<MissionRecord>(`/api/missions/${missionId}`)
}

export function controlMission(missionId: string, action: "start" | "pause" | "resume" | "cancel") {
  return apiRequest<MissionRecord>(`/api/missions/${missionId}/${action}`, {
    method: "POST",
  })
}

export function listMissionEvents(missionId: string) {
  return apiRequest<EventEnvelope[]>(`/api/missions/${missionId}/events`)
}

export function listApprovals(missionId: string) {
  return apiRequest<ApprovalRequest[]>(`/api/missions/${missionId}/approvals`)
}

export function resolveApproval(
  approvalId: string,
  decision: "accept" | "reject",
) {
  return apiRequest<ApprovalRequest>(
    `/api/approvals/${approvalId}/${decision}`,
    { method: "POST" },
  )
}

export interface MissionPlanAssignmentView {
  staff_id: string
  staff_role: string
  role: string
  display_name: string
  avatar: string
  objective: string
  rationale: string
  sequence: number
}

export interface MissionPlanView {
  interpretation: string
  mission_summary: string
  assignments: MissionPlanAssignmentView[]
}

export function getMissionPlan(missionId: string) {
  return apiRequest<MissionPlanView>(`/api/missions/${missionId}/plan`)
}

export function acceptMissionPlan(
  missionId: string,
  body: {
    interpretation: string
    assignments: Array<{
      staff_role: string
      rationale: string
      objective?: string
    }>
  },
) {
  return apiRequest<MissionPlanView>(`/api/missions/${missionId}/plan/accept`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function regenerateMissionPlan(missionId: string, notes = "") {
  return apiRequest<{ status: string }>(`/api/missions/${missionId}/plan/regenerate`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  })
}

export function denyMissionPlan(missionId: string, notes = "") {
  return apiRequest<{ status: string }>(`/api/missions/${missionId}/plan/deny`, {
    method: "POST",
    body: JSON.stringify({ notes }),
  })
}
