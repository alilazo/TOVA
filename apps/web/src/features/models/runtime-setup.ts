import type { RuntimeState } from "@/features/models/model-api"

export const RUNTIME_SETUP_DISMISS_MS = 90_000

export function shouldAutoOpenRuntimeSetup(input: {
  state: RuntimeState | undefined
  dialogOpen: boolean
  dismissedUntil: number | null
  now?: number
}): boolean {
  if (input.dialogOpen || !input.state) {
    return false
  }
  const now = input.now ?? Date.now()
  if (input.dismissedUntil != null && now < input.dismissedUntil) {
    return false
  }
  return input.state === "unconfigured" || input.state === "unavailable"
}
