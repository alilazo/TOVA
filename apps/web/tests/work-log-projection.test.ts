import { describe, expect, it } from "vitest"

import {
  createEmptyWorkLog,
  reduceStaffWorkLog,
} from "@/features/mission/work-log-projection"
import type { EventEnvelope } from "@/types/events"

const event = (
  sequence: number,
  eventType: EventEnvelope["event_type"],
  payload: EventEnvelope["payload"],
): EventEnvelope => ({
  version: "1.0",
  event_id: `evt_${sequence}`,
  event_type: eventType,
  timestamp: `2026-07-25T18:00:${sequence.toString().padStart(2, "0")}Z`,
  project_id: "project_tova",
  mission_id: "mission_live_runtime",
  staff_id: "staff_engineer",
  sequence,
  payload,
})

describe("work-log projection", () => {
  it("projects only persisted live staff event values", () => {
    const events: EventEnvelope[] = [
      event(1, "staff.assigned", { objective: "Implement live runtime" }),
      event(2, "staff.action.updated", {
        summary: "Wrote src/runtime.ts",
        tool: "repository.write",
      }),
      event(3, "staff.file.created", { file_path: "src/runtime.ts" }),
      event(4, "artifact.created", { title: "Runtime report" }),
      event(5, "staff.decision.recorded", {
        summary: "Use live provider only",
      }),
      event(6, "model.request.failed", { error: "staff iteration failed" }),
    ]

    const log = events.reduce(reduceStaffWorkLog, createEmptyWorkLog())

    expect(log.objective).toBe("Implement live runtime")
    expect(log.currentAction).toBe("Wrote src/runtime.ts")
    expect(log.toolActivity).toContain("repository.write")
    expect(log.output).toContain("src/runtime.ts")
    expect(log.output).toContain("Runtime report")
    expect(log.decisionSummary).toBe("Use live provider only")
    expect(log.errors).toContain("staff iteration failed")
  })

  it("starts with only null and empty values", () => {
    const log = createEmptyWorkLog()

    expect(log).toEqual({
      currentAction: null,
      objective: null,
      inputs: [],
      toolActivity: [],
      observations: [],
      decisionSummary: null,
      output: [],
      nextAction: null,
      errors: [],
    })
    expect(Object.values(log).flat()).not.toContainEqual(expect.any(String))
  })

  it("deduplicates arrays in first-seen event order", () => {
    const events: EventEnvelope[] = [
      event(1, "staff.action.updated", {
        summary: "Read source",
        tool: "repository.read",
      }),
      event(2, "staff.action.updated", {
        summary: "Read source again",
        tool: "repository.read",
      }),
      event(3, "staff.action.updated", {
        summary: "Wrote source",
        tool: "repository.write",
      }),
      event(4, "staff.file.created", { file_path: "src/runtime.ts" }),
      event(5, "staff.file.created", { file_path: "src/runtime.ts" }),
      event(6, "artifact.created", { title: "Runtime report" }),
    ]

    const log = events.reduce(reduceStaffWorkLog, createEmptyWorkLog())

    expect(log.toolActivity).toEqual(["repository.read", "repository.write"])
    expect(log.output).toEqual(["src/runtime.ts", "Runtime report"])
  })
})
