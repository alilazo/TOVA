import type { RuntimeState } from "@/features/models/model-api"
import { cn } from "@/lib/utils"

export function ConnectionBadge({
  state,
  model,
  onClick,
}: {
  state: RuntimeState | "checking"
  model?: string | null
  onClick?: () => void
}) {
  const statusLabel = state === "connected"
    ? "Connected"
    : state === "checking"
      ? "Checking"
      : state === "unavailable"
        ? "Unavailable"
        : "Configure"
  const modelLabel = model?.trim()
    || (state === "connected" ? "Local model" : "No model")

  return (
    <button
      type="button"
      className={cn("connection-badge", state === "connected" && "is-connected")}
      onClick={onClick}
      aria-label="Local model runtime"
    >
      <span className="connection-badge__status">
        <i aria-hidden="true" />
        {statusLabel}
      </span>
      <span className="connection-badge__model">{modelLabel}</span>
    </button>
  )
}
