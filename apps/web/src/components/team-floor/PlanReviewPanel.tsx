import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  acceptMissionPlan,
  denyMissionPlan,
  regenerateMissionPlan,
} from "@/features/mission/mission-api"
import type { PlanReview } from "@/features/mission/mission-event-reducer"

import { PixelAvatar } from "../staff/PixelAvatar"

interface PlanReviewPanelProps {
  missionId: string
  planReview: PlanReview
  onError?: (message: string) => void
}

export function PlanReviewPanel({
  missionId,
  planReview,
  onError,
}: PlanReviewPanelProps) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [interpretation, setInterpretation] = useState(planReview.interpretation)
  const [denyNotes, setDenyNotes] = useState("")
  const [objectives, setObjectives] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      planReview.assignments.map((item) => [item.staffRole, item.objective]),
    ),
  )
  const [activeRoles, setActiveRoles] = useState<string[]>(() =>
    planReview.assignments.map((item) => item.staffRole),
  )
  const [rationales, setRationales] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      planReview.assignments.map((item) => [item.staffRole, item.rationale]),
    ),
  )
  const activeAssignments = planReview.assignments.filter((item) =>
    activeRoles.includes(item.staffRole),
  )

  async function handleAccept() {
    setBusy(true)
    setError(null)
    try {
      await acceptMissionPlan(missionId, {
        interpretation: interpretation.trim(),
        assignments: activeAssignments.map((item) => ({
          staff_role: item.staffRole,
          rationale: (rationales[item.staffRole] ?? item.rationale).trim(),
          objective: (objectives[item.staffRole] ?? item.objective).trim(),
        })),
      })
      setEditing(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to accept plan"
      setError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeny() {
    setBusy(true)
    setError(null)
    try {
      await denyMissionPlan(missionId, denyNotes.trim() || interpretation.trim())
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to deny plan"
      setError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRegenerate() {
    setBusy(true)
    setError(null)
    try {
      const notes = editing
        ? interpretation.trim()
        : ""
      await regenerateMissionPlan(missionId, notes)
      setEditing(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to regenerate plan"
      setError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="team-floor__stage team-floor__stage--plan-review" aria-label="Alex plan review">
      <header className="team-floor__plan-header">
        <div>
          <small>PLAN REVIEW</small>
          <strong>Alex's proposed team plan</strong>
          <p>{planReview.summary}</p>
        </div>
        <div className="team-floor__plan-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "Done editing" : "Edit"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void handleRegenerate()}
          >
            Regenerate
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void handleDeny()}
          >
            Deny
          </Button>
          <Button
            size="sm"
            disabled={busy || !interpretation.trim()}
            onClick={() => void handleAccept()}
          >
            Accept
          </Button>
        </div>
      </header>

      <label className="team-floor__plan-field">
        <span>Interpretation</span>
        {editing ? (
          <textarea
            value={interpretation}
            onChange={(event) => setInterpretation(event.target.value)}
            rows={3}
            disabled={busy}
          />
        ) : (
          <p>{interpretation}</p>
        )}
      </label>

      <ul className="team-floor__plan-list">
        {activeAssignments.map((assignment) => (
          <li key={assignment.staffId}>
            <PixelAvatar
              avatar={assignment.avatar}
              name={assignment.displayName}
              size="md"
            />
            <span>
              <strong>{assignment.displayName}</strong>
              <small>{assignment.role}</small>
              {editing ? (
                <textarea
                  aria-label={`Objective for ${assignment.displayName}`}
                  value={objectives[assignment.staffRole] ?? assignment.objective}
                  onChange={(event) => {
                    setObjectives((current) => ({
                      ...current,
                      [assignment.staffRole]: event.target.value,
                    }))
                  }}
                  rows={2}
                  disabled={busy}
                />
              ) : (
                <p>{objectives[assignment.staffRole] ?? assignment.objective}</p>
              )}
              {editing ? (
                <textarea
                  aria-label={`Why ${assignment.displayName}`}
                  value={rationales[assignment.staffRole] ?? assignment.rationale}
                  onChange={(event) => {
                    setRationales((current) => ({
                      ...current,
                      [assignment.staffRole]: event.target.value,
                    }))
                  }}
                  rows={2}
                  disabled={busy}
                />
              ) : (
                <p>{rationales[assignment.staffRole] ?? assignment.rationale}</p>
              )}
              {editing && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || activeAssignments.length <= 1}
                  onClick={() => {
                    setActiveRoles((current) =>
                      current.filter((role) => role !== assignment.staffRole),
                    )
                  }}
                >
                  Remove {assignment.displayName}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <label className="team-floor__plan-field">
        <span>Denial note (optional)</span>
        <textarea
          aria-label="Denial note"
          value={denyNotes}
          onChange={(event) => setDenyNotes(event.target.value)}
          rows={2}
          disabled={busy}
          placeholder="Explain what should change in a revised request."
        />
      </label>

      {error && (
        <p className="team-floor__plan-error" role="alert">{error}</p>
      )}
    </section>
  )
}
