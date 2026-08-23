import type { WorkLog } from "@/types/domain"
import type { EventEnvelope } from "@/types/events"

const actionEvents: readonly EventEnvelope["event_type"][] = [
  "staff.action.started",
  "staff.action.updated",
  "staff.action.completed",
]

const inputEvents: readonly EventEnvelope["event_type"][] = [
  "staff.file.opened",
  "staff.file.read",
]

const outputFileEvents: readonly EventEnvelope["event_type"][] = [
  "staff.file.created",
  "staff.file.updated",
  "staff.file.saved",
  "staff.file.deleted",
]

const artifactEvents: readonly EventEnvelope["event_type"][] = [
  "artifact.created",
  "artifact.updated",
]

const failureEvents: readonly EventEnvelope["event_type"][] = [
  "mission.failed",
  "mission.cancelled",
  "model.request.failed",
]

function appendUnique(items: string[], value: string | undefined): string[] {
  if (!value || items.includes(value)) return items
  return [...items, value]
}

export function createEmptyWorkLog(): WorkLog {
  return {
    currentAction: null,
    objective: null,
    inputs: [],
    toolActivity: [],
    observations: [],
    decisionSummary: null,
    output: [],
    nextAction: null,
    errors: [],
  }
}

export function reduceStaffWorkLog(
  current: WorkLog,
  event: EventEnvelope,
): WorkLog {
  const { payload } = event
  let next = current

  if (event.event_type === "staff.assigned") {
    next = {
      ...next,
      objective: payload.objective ?? payload.summary ?? next.objective,
    }
  }

  if (actionEvents.includes(event.event_type)) {
    next = {
      ...next,
      currentAction: payload.summary ?? payload.title ?? next.currentAction,
    }
  }

  if (event.event_type === "staff.action.updated") {
    next = {
      ...next,
      toolActivity: appendUnique(next.toolActivity, payload.tool),
    }
  }

  if (inputEvents.includes(event.event_type)) {
    next = {
      ...next,
      inputs: appendUnique(next.inputs, payload.file_path),
    }
  }

  if (event.event_type === "staff.research.result") {
    next = {
      ...next,
      observations: appendUnique(
        next.observations,
        payload.summary ?? payload.title,
      ),
    }
  }

  if (event.event_type === "staff.decision.recorded") {
    next = {
      ...next,
      decisionSummary: payload.summary ?? payload.title ?? next.decisionSummary,
    }
  }

  if (outputFileEvents.includes(event.event_type)) {
    next = {
      ...next,
      output: appendUnique(next.output, payload.file_path),
    }
  }

  if (artifactEvents.includes(event.event_type)) {
    next = {
      ...next,
      output: appendUnique(next.output, payload.title),
    }
  }

  if (event.event_type === "staff.test.result" && payload.tool === "qa.browser.audit") {
    const verdict = payload.verdict ? `QA browser audit: ${payload.verdict}` : "QA browser audit"
    next = {
      ...next,
      observations: appendUnique(next.observations, payload.summary ?? verdict),
      output: appendUnique(next.output, verdict),
    }
  }

  if (payload.next_action) {
    next = {
      ...next,
      nextAction: payload.next_action,
    }
  }

  if (failureEvents.includes(event.event_type)) {
    next = {
      ...next,
      errors: appendUnique(
        next.errors,
        payload.error ?? payload.summary ?? event.event_type,
      ),
    }
  }

  return next
}
