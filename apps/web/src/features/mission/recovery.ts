export const MISSION_RECOVERY_MESSAGE =
  "Mission could not be recovered after the API restarted. Reopen the project to see saved work, then send a follow-up if needed."

export function recoveryMessageForClose(code: number): string | null {
  if (code === 4404) return MISSION_RECOVERY_MESSAGE
  return null
}

export function recoveryActionForError(message: string): string | null {
  const text = message.toLowerCase()
  if (!text.trim()) return null
  if (text.includes("api restarted") || text.includes("could not be recovered")) {
    return "Reopen the project to see saved work, then send a follow-up if needed."
  }
  if (text.includes("local model server") || text.includes("unavailable")) {
    return "Start LM Studio Local Server, load a model, then retry Connect."
  }
  if (text.includes("not connected") || text.includes("unconfigured")) {
    return "Open Connect local model, start LM Studio, and finish setup."
  }
  return "Check Settings → Diagnostics, then retry the last action."
}
