import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  acceptMissionPlan: vi.fn(),
  regenerateMissionPlan: vi.fn(),
  denyMissionPlan: vi.fn(),
}))

vi.mock("@/features/mission/mission-api", () => ({
  acceptMissionPlan: mocks.acceptMissionPlan,
  regenerateMissionPlan: mocks.regenerateMissionPlan,
  denyMissionPlan: mocks.denyMissionPlan,
}))

import { PlanReviewPanel } from "@/components/team-floor/PlanReviewPanel"
import type { PlanReview } from "@/features/mission/mission-event-reducer"

const planReview: PlanReview = {
  interpretation: "Build a centered button page.",
  summary: "Ship a minimal centered button page.",
  assignments: [
    {
      staffId: "staff_lina",
      staffRole: "frontend_developer",
      role: "Front-End Developer",
      displayName: "Lina",
      avatar: "lina",
      objective: "Create index.html",
      rationale: "Front-end owns the page markup.",
      sequence: 1,
    },
  ],
}

describe("PlanReviewPanel", () => {
  beforeEach(() => {
    mocks.acceptMissionPlan.mockReset()
    mocks.regenerateMissionPlan.mockReset()
    mocks.denyMissionPlan.mockReset()
    mocks.acceptMissionPlan.mockResolvedValue(planReview)
    mocks.regenerateMissionPlan.mockResolvedValue({ status: "regenerating" })
    mocks.denyMissionPlan.mockResolvedValue({ status: "denied" })
  })

  it("shows interpretation, members, and why text", () => {
    const { container } = render(
      <PlanReviewPanel missionId="mission_1" planReview={planReview} />,
    )

    expect(screen.getByLabelText("Alex plan review")).toBeInTheDocument()
    expect(screen.getByText("Build a centered button page.")).toBeInTheDocument()
    expect(screen.getByText("Lina")).toBeInTheDocument()
    expect(screen.getByText("Front-end owns the page markup.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeInTheDocument()
    const avatar = screen.getByRole("img", { name: "Lina pixel portrait" })
    expect(avatar.className).toContain("pixel-avatar--md")
    const textBlock = container.querySelector(
      ".team-floor__plan-list > li > span:not(.pixel-avatar)",
    )
    expect(textBlock).not.toBeNull()
    expect(textBlock).toContainElement(screen.getByText("Lina"))
  })

  it("enables editable fields and posts Accept with drafts", async () => {
    render(
      <PlanReviewPanel missionId="mission_1" planReview={planReview} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.change(screen.getByDisplayValue("Build a centered button page."), {
      target: { value: "Edited interpretation" },
    })
    fireEvent.change(screen.getByLabelText("Why Lina"), {
      target: { value: "Edited why" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))

    await waitFor(() => {
      expect(mocks.acceptMissionPlan).toHaveBeenCalledWith("mission_1", {
        interpretation: "Edited interpretation",
        assignments: [
          {
            staff_role: "frontend_developer",
            rationale: "Edited why",
            objective: "Create index.html",
          },
        ],
      })
    })
  })

  it("can remove an assignment before accepting the plan", async () => {
    const planWithCoordinator: PlanReview = {
      ...planReview,
      assignments: [
        {
          staffId: "staff_alex",
          staffRole: "project_coordinator",
          role: "Project Coordinator",
          displayName: "Alex",
          avatar: "alex",
          objective: "Coordinate the work",
          rationale: "Alex plans the mission.",
          sequence: 1,
        },
        planReview.assignments[0],
      ],
    }
    render(
      <PlanReviewPanel missionId="mission_1" planReview={planWithCoordinator} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove Alex" }))
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))

    await waitFor(() => {
      expect(mocks.acceptMissionPlan).toHaveBeenCalledWith("mission_1", {
        interpretation: "Build a centered button page.",
        assignments: [
          {
            staff_role: "frontend_developer",
            rationale: "Front-end owns the page markup.",
            objective: "Create index.html",
          },
        ],
      })
    })
  })

  it("posts Regenerate with edited interpretation as notes when editing", async () => {
    render(
      <PlanReviewPanel missionId="mission_1" planReview={planReview} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    fireEvent.change(screen.getByDisplayValue("Build a centered button page."), {
      target: { value: "Please keep scope smaller" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }))

    await waitFor(() => {
      expect(mocks.regenerateMissionPlan).toHaveBeenCalledWith(
        "mission_1",
        "Please keep scope smaller",
      )
    })
  })

  it("denies the proposed plan with the current interpretation as notes", async () => {
    render(
      <PlanReviewPanel missionId="mission_1" planReview={planReview} />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Deny" }))

    await waitFor(() => {
      expect(mocks.denyMissionPlan).toHaveBeenCalledWith(
        "mission_1",
        "Build a centered button page.",
      )
    })
  })
})
