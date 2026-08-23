import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  apiRequest,
}))

import {
  appendMissionSessionTurn,
  createMissionSession,
  getMission,
  listMissionSessions,
} from "@/features/mission/mission-api"

describe("mission session API", () => {
  beforeEach(() => {
    apiRequest.mockReset()
  })

  it("creates a Team Chat session for the first prompt", async () => {
    apiRequest.mockResolvedValueOnce({ id: "session_1" })

    await createMissionSession({
      projectId: "project_1",
      prompt: "Build a website",
      modelProfileId: "profile_1",
      model: "qwen-local",
    })

    expect(apiRequest).toHaveBeenCalledWith("/api/projects/project_1/mission-sessions", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Build a website",
        team_id: "hipo",
        model_profile_id: "profile_1",
        model: "qwen-local",
      }),
    })
  })

  it("appends follow-up prompts to the selected Team Chat session", async () => {
    apiRequest.mockResolvedValueOnce({ id: "session_1" })

    await appendMissionSessionTurn({
      sessionId: "session_1",
      prompt: "Fix the header",
      modelProfileId: "profile_1",
      model: "qwen-local",
    })

    expect(apiRequest).toHaveBeenCalledWith("/api/mission-sessions/session_1/turns", {
      method: "POST",
      body: JSON.stringify({
        prompt: "Fix the header",
        team_id: "hipo",
        model_profile_id: "profile_1",
        model: "qwen-local",
      }),
    })
  })

  it("loads sessions and missions by id", async () => {
    apiRequest.mockResolvedValueOnce([])
    apiRequest.mockResolvedValueOnce({ id: "mission_1" })

    await listMissionSessions("project_1")
    await getMission("mission_1")

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project_1/mission-sessions",
    )
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/missions/mission_1")
  })
})
