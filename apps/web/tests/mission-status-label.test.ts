import { describe, expect, it } from "vitest"

import { missionStatusLabel } from "@/features/mission/mission-status-label"
import type { MissionStatus } from "@/types/domain"

describe("missionStatusLabel", () => {
  it("returns Idle when there is no mission status", () => {
    expect(missionStatusLabel(null)).toBe("Idle")
    expect(missionStatusLabel(undefined)).toBe("Idle")
  })

  it.each([
    ["draft", "Draft"],
    ["submitted", "Draft"],
    ["analyzing", "Running"],
    ["assembling_team", "Running"],
    ["team_ready", "Running"],
    ["running", "Running"],
    ["testing", "Running"],
    ["reviewing", "Running"],
    ["paused", "Paused"],
    ["awaiting_approval", "Waiting for confirmation"],
    ["blocked", "Blocked"],
    ["completed", "Finished"],
    ["failed", "Error"],
    ["cancelled", "Cancelled"],
  ] as const satisfies ReadonlyArray<readonly [MissionStatus, string]>)(
    "maps %s to %s",
    (status, label) => {
      expect(missionStatusLabel(status)).toBe(label)
    },
  )
})
