import type { MissionSessionRecord } from "./mission-api"

export function sessionToRestore(
  sessions: MissionSessionRecord[],
  currentSessionId: string | null,
): MissionSessionRecord | null {
  if (currentSessionId || sessions.length === 0) return null
  return sessions[0] ?? null
}
