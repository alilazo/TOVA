import { Pause, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  isTerminalMissionStatus,
  type MissionStatus,
} from "@/types/domain"

interface MissionControlBarProps {
  playing: boolean
  paused: boolean
  status: MissionStatus
  title: string
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onDismiss?: () => void
}

export function MissionControlBar({
  playing,
  paused,
  status,
  title,
  onPause,
  onResume,
  onCancel,
  onDismiss,
}: MissionControlBarProps) {
  const terminal = isTerminalMissionStatus(status)
  const waiting = status === "awaiting_approval"
  const label =
    status === "completed"
      ? "MISSION FINISHED"
      : status === "failed"
        ? "MISSION FAILED"
        : status === "cancelled"
          ? "MISSION CANCELLED"
          : waiting
            ? "WAITING FOR YOU"
            : status === "paused"
              ? "MISSION PAUSED"
              : "ACTIVE MISSION"

  return (
    <section className="mission-controls" aria-label="Mission controls">
      <span className="mission-controls__summary">
        <i className={playing && !terminal ? "is-live" : ""} />
        <span className="mission-controls__copy">
          <small>{label}</small>
          <strong className="mission-controls__title">{title}</strong>
          {waiting ? (
            <small>
              Approve the plan or pending request to continue.
            </small>
          ) : status === "paused" ? (
            <small>
              Pause waits between agent steps. An in-flight model request is not aborted.
            </small>
          ) : null}
        </span>
      </span>
      <div>
        {!terminal && (
          <>
            <Button
              size="sm"
              onClick={paused ? onResume : onPause}
            >
              {paused
                ? <Play data-icon="inline-start" />
                : <Pause data-icon="inline-start" />}
              {paused ? "Resume" : "Pause"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
            >
              Cancel mission
            </Button>
          </>
        )}
        {terminal && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDismiss}
          >
            New mission
          </Button>
        )}
      </div>
    </section>
  )
}
