import { describe, expect, it } from "vitest"

import { sessionToRestore } from "@/features/mission/restore-session"
import type { MissionSessionRecord } from "@/features/mission/mission-api"

function session(
  id: string,
  updatedAt: string,
  status = "completed",
): MissionSessionRecord {
  return {
    id,
    project_id: "project_1",
    project_root: "C:\\tmp\\first-mission",
    title: id,
    status,
    active_mission_id: `mission_${id}`,
    created_at: updatedAt,
    updated_at: updatedAt,
    turns: [],
  }
}

describe("sessionToRestore", () => {
  it("restores the newest session when none is selected", () => {
    const newest = session("session_new", "2026-08-20T21:00:00.000Z")
    const older = session("session_old", "2026-08-20T20:00:00.000Z")
    expect(sessionToRestore([newest, older], null)?.id).toBe("session_new")
  })

  it("does not steal an already selected session", () => {
    const newest = session("session_new", "2026-08-20T21:00:00.000Z")
    expect(sessionToRestore([newest], "session_new")).toBeNull()
  })

  it("returns null when there is no history", () => {
    expect(sessionToRestore([], null)).toBeNull()
  })
})
