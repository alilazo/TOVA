import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))
vi.mock("@/lib/api", () => ({
  apiRequest,
}))

import {
  getStaffDocument,
  getStaffProfiles,
  saveStaffDocument,
} from "@/features/staff/staff-api"

describe("getStaffProfiles", () => {
  beforeEach(() => {
    apiRequest.mockReset()
  })

  it("maps the safe staff response into the frontend domain model", async () => {
    apiRequest.mockResolvedValueOnce([
      {
        id: "staff_alex",
        employee_id: "TOVA-001",
        slug: "alex-project-coordinator",
        name: "Alex Morgan",
        display_name: "Alex",
        role: "Project Coordinator",
        role_key: "project_coordinator",
        department: "Program Operations",
        seniority: "Lead",
        avatar: "stock/black-white-pixel-art-guy-with-hair-and-glasses-64x64.png",
        description: "Coordinates missions and assembles engineering teams.",
        status: "available",
        model_profile: "coordinator-default",
        tools: ["Repository read", "Mission planning", "Staff assignment"],
        can_delegate: true,
        can_approve: false,
        tags: ["planning", "orchestration", "requirements"],
      },
    ])

    await expect(getStaffProfiles()).resolves.toEqual([
      {
        id: "staff_alex",
        employeeId: "TOVA-001",
        slug: "alex-project-coordinator",
        name: "Alex Morgan",
        displayName: "Alex",
        role: "Project Coordinator",
        roleKey: "project_coordinator",
        department: "Program Operations",
        seniority: "Lead",
        avatar: "stock/black-white-pixel-art-guy-with-hair-and-glasses-64x64.png",
        description: "Coordinates missions and assembles engineering teams.",
        status: "available",
        modelProfile: "coordinator-default",
        tools: ["Repository read", "Mission planning", "Staff assignment"],
        canDelegate: true,
        canApprove: false,
        tags: ["planning", "orchestration", "requirements"],
      },
    ])
    expect(apiRequest).toHaveBeenCalledOnce()
    expect(apiRequest).toHaveBeenCalledWith("/api/staff")
  })

  it("loads and saves staff markdown documents", async () => {
    apiRequest
      .mockResolvedValueOnce({
        id: "staff_alex",
        slug: "alex-project-coordinator",
        markdown: "# Identity\nAlex",
      })
      .mockResolvedValueOnce({
        id: "staff_alex",
        slug: "alex-project-coordinator",
        markdown: "# Identity\nAlex edited",
      })

    await expect(getStaffDocument("staff_alex")).resolves.toMatchObject({
      id: "staff_alex",
      markdown: "# Identity\nAlex",
    })
    await expect(
      saveStaffDocument("staff_alex", "# Identity\nAlex edited"),
    ).resolves.toMatchObject({
      markdown: "# Identity\nAlex edited",
    })
    expect(apiRequest).toHaveBeenNthCalledWith(1, "/api/staff/staff_alex/document")
    expect(apiRequest).toHaveBeenNthCalledWith(2, "/api/staff/staff_alex/document", {
      method: "PUT",
      body: JSON.stringify({ markdown: "# Identity\nAlex edited" }),
    })
  })
})
