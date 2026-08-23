import type { MissionStatus } from "@/types/domain"

const RUNNING: ReadonlySet<MissionStatus> = new Set([
  "analyzing",
  "assembling_team",
  "team_ready",
  "running",
  "testing",
  "reviewing",
])

export function missionStatusLabel(
  status: MissionStatus | null | undefined,
): string {
  if (!status) return "Idle"
  if (status === "draft" || status === "submitted") return "Draft"
  if (RUNNING.has(status)) return "Running"
  if (status === "paused") return "Paused"
  if (status === "awaiting_approval") return "Waiting for confirmation"
  if (status === "blocked") return "Blocked"
  if (status === "completed") return "Finished"
  if (status === "failed") return "Error"
  if (status === "cancelled") return "Cancelled"
  return "Idle"
}
