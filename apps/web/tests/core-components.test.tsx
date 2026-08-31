import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/features/staff/staff-api", async () => {
  const actual = await vi.importActual<typeof import("@/features/staff/staff-api")>(
    "@/features/staff/staff-api",
  )
  return {
    ...actual,
    getStaffDocument: vi.fn().mockResolvedValue({
      id: "staff_maya",
      slug: "maya-researcher",
      markdown: "---\nid: staff_maya\n---\n# Identity\nMaya\n",
    }),
    saveStaffDocument: vi.fn(),
  }
})

import { ActivityFeed } from "@/components/activity/ActivityFeed"
import { ActivityFeedRow } from "@/components/activity/ActivityFeedRow"
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar"
import { EngineeringTeamPanel } from "@/components/staff/EngineeringTeamPanel"
import { StatusBadge } from "@/components/staff/StatusBadge"
import { TeamMemberCard } from "@/components/staff/TeamMemberCard"

import { staffProfiles } from "./fixtures/staff"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe("Phase 1 core components", () => {
  it("renders staff cards without status badges or availability switches", () => {
    const maya = staffProfiles.find((staff) => staff.id === "staff_maya")
    expect(staffProfiles).toHaveLength(7)
    expect(maya).toBeDefined()

    const { container } = render(
      <TeamMemberCard
        staff={maya!}
        available
        onOpenProfile={() => undefined}
        onOpenWorkLog={() => undefined}
      />,
    )

    expect(screen.getByText("Maya")).toBeInTheDocument()
    expect(screen.getByText("Researcher")).toBeInTheDocument()
    expect(screen.queryByText("Available")).not.toBeInTheDocument()
    expect(screen.queryByRole("switch")).not.toBeInTheDocument()
    expect(container.querySelector(".team-card")).not.toHaveClass("is-disabled")
  })

  it("greys out a team card when availability is off", () => {
    const maya = staffProfiles.find((staff) => staff.id === "staff_maya")!

    const { container } = render(
      <TeamMemberCard
        staff={maya}
        available={false}
        onOpenProfile={() => undefined}
        onOpenWorkLog={() => undefined}
      />,
    )

    expect(container.querySelector(".team-card")).toHaveClass("is-disabled")
  })

  it("shows discrete mission status in the Live Activity header", () => {
    render(
      <ActivityFeed
        hasStarted
        missionStatus="awaiting_approval"
        staff={staffProfiles}
        events={[]}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent("Waiting for confirmation")
    expect(screen.queryByLabelText("Mission progress")).not.toBeInTheDocument()
  })

  it("renders human-readable activity without hidden-reasoning labels", () => {
    const maya = staffProfiles.find((staff) => staff.id === "staff_maya")!
    render(
      <ActivityFeedRow
        staff={maya}
        event={{
          id: "evt_1",
          timestamp: "2026-07-23T18:00:00Z",
          staffId: "staff_maya",
          title: "Maya reviewed the repository structure",
          status: "completed",
          filePath: "services/orchestrator.py",
          eventType: "staff.file.read",
        }}
      />,
    )

    expect(screen.getByText("Maya reviewed the repository structure")).toBeInTheDocument()
    expect(screen.getByText("services/orchestrator.py")).toBeInTheDocument()
    expect(screen.queryByText(/chain-of-thought/i)).not.toBeInTheDocument()
  })

  it("resolves activity portraits from the supplied roster", () => {
    const customStaff = {
      ...staffProfiles[0],
      id: "staff_custom",
      displayName: "Custom",
    }

    render(
      <ActivityFeed
        staff={[customStaff]}
        events={[{
          id: "evt_custom",
          timestamp: "2026-07-23T18:00:00Z",
          staffId: customStaff.id,
          title: "Custom completed API review",
          status: "completed",
          eventType: "staff.completed",
        }]}
      />,
    )

    expect(screen.getByRole("img", { name: "Custom pixel portrait" })).toBeInTheDocument()
  })

  it("shows truthful Engineering Team loading and error states", () => {
    const commonProps = {
      staff: [],
      onSelectStaff: () => undefined,
    }
    const view = render(<EngineeringTeamPanel {...commonProps} isLoading error={null} />)

    expect(screen.getByRole("status")).toHaveTextContent("Loading staff profiles")
    expect(screen.queryByText("Staff profiles synced")).not.toBeInTheDocument()

    view.rerender(
      <EngineeringTeamPanel
        {...commonProps}
        isLoading={false}
        error={new Error("Staff profiles are unavailable")}
      />,
    )

    expect(screen.getByRole("alert")).toHaveTextContent("Staff profiles are unavailable")
    expect(screen.queryByText("Staff profiles synced")).not.toBeInTheDocument()
  })

  it("shows a distinct Engineering Team empty state without a synced claim", () => {
    render(
      <EngineeringTeamPanel
        staff={[]}
        onSelectStaff={() => undefined}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent("No staff profiles available")
    expect(screen.queryByText("Staff profiles synced")).not.toBeInTheDocument()
  })

  it("lists the full roster and opens a profile dialog from the card body", async () => {
    const onSelectStaff = vi.fn()
    renderWithClient(
      <EngineeringTeamPanel
        staff={staffProfiles}
        onSelectStaff={onSelectStaff}
        missionControls={<form className="mission-composer" aria-label="Mission composer">Composer</form>}
      />,
    )

    expect(screen.getByText("7 team members")).toBeInTheDocument()
    expect(screen.getByRole("form", { name: "Mission composer" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "View Maya Work Log" }))
    expect(onSelectStaff).toHaveBeenCalledWith("staff_maya")

    fireEvent.click(screen.getByRole("button", { name: "Open Maya profile" }))
    expect(await screen.findByRole("heading", { name: "Maya" })).toBeInTheDocument()
    expect(screen.getByText(staffProfiles.find((s) => s.id === "staff_maya")!.description))
      .toBeInTheDocument()
  })

  it("shows status text in addition to color", () => {
    render(<StatusBadge status="blocked" />)
    expect(screen.getByText("Blocked")).toBeInTheDocument()
  })

  it("shows honest empty search and mission panels", () => {
    const view = renderWithClient(
      <WorkspaceSidebar
        panel="search"
        staff={[]}
        staffLoading={false}
        staffError={null}
        runtimeStatus={undefined}
        mission={null}
      />,
    )

    expect(screen.getByLabelText("Search repository")).toBeInTheDocument()
    expect(screen.getByText("Type to search the open project.")).toBeInTheDocument()

    view.rerender(
      <WorkspaceSidebar
        panel="missions"
        staff={[]}
        staffLoading={false}
        staffError={null}
        runtimeStatus={undefined}
        mission={null}
      />,
    )
    expect(screen.getByText("No mission history is available in this session.")).toBeInTheDocument()
  })

  it("lists stored Team Chat sessions in the Missions panel", () => {
    const onSelectMissionSession = vi.fn()
    render(
      <WorkspaceSidebar
        panel="missions"
        staff={[]}
        staffLoading={false}
        staffError={null}
        runtimeStatus={undefined}
        mission={null}
        missionSessions={[{
          id: "session_1",
          project_id: "project_1",
          project_root: "F:/tmp/site",
          title: "Build a minimal website",
          status: "completed",
          active_mission_id: "mission_1",
          created_at: "2026-07-28T00:00:00Z",
          updated_at: "2026-07-28T00:05:00Z",
          turns: [{
            mission_id: "mission_1",
            prompt: "Build a minimal website",
            status: "completed",
            model_profile_id: "profile_1",
            model: "qwen-local",
            created_at: "2026-07-28T00:00:00Z",
            updated_at: "2026-07-28T00:05:00Z",
            summary: "Built and QA tested.",
          }],
        }]}
        selectedMissionSessionId="session_1"
        onSelectMissionSession={onSelectMissionSession}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: /Build a minimal website/ }))
    expect(screen.getByText("1 turn")).toBeInTheDocument()
    expect(screen.getByText("Status: Completed")).toBeInTheDocument()
    expect(onSelectMissionSession).toHaveBeenCalledWith("session_1")
  })

  it("derives staff panel counts from the supplied roster", () => {
    render(
      <WorkspaceSidebar
        panel="staff"
        staff={staffProfiles}
        staffLoading={false}
        staffError={null}
        runtimeStatus={undefined}
        mission={null}
      />,
    )

    expect(screen.getByText("7 profiles available")).toBeInTheDocument()
    expect(screen.getByText("1 coordinator")).toBeInTheDocument()
    expect(screen.getByText("6 specialists")).toBeInTheDocument()
  })

  it("shows the selected local model runtime state and model", () => {
    render(
      <WorkspaceSidebar
        panel="settings"
        staff={[]}
        staffLoading={false}
        staffError={null}
        runtimeStatus={{
          state: "connected",
          provider: "lm-studio",
          selectedProfileId: "profile_1",
          selectedModel: "qwen/qwen3.6-35b-a3b",
          errorCode: null,
          error: null,
        }}
        mission={null}
      />,
    )

    expect(screen.getByText("Models")).toBeInTheDocument()
    expect(screen.getByText("Local model")).toBeInTheDocument()
    expect(screen.getByText("Connected")).toBeInTheDocument()
    expect(screen.getByText("qwen/qwen3.6-35b-a3b")).toBeInTheDocument()
  })

  it("distinguishes loading, error, and successful empty staff states", () => {
    const view = render(
      <WorkspaceSidebar
        panel="staff"
        staff={[]}
        staffLoading
        staffError={null}
        runtimeStatus={undefined}
        mission={null}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent("Loading staff profiles")
    expect(screen.queryByText("No staff profiles are available.")).not.toBeInTheDocument()

    view.rerender(
      <WorkspaceSidebar
        panel="staff"
        staff={[]}
        staffLoading={false}
        staffError={new Error("request failed")}
        runtimeStatus={undefined}
        mission={null}
      />,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Staff profiles are unavailable")
    expect(screen.queryByText("No staff profiles are available.")).not.toBeInTheDocument()

    view.rerender(
      <WorkspaceSidebar
        panel="staff"
        staff={[]}
        staffLoading={false}
        staffError={null}
        runtimeStatus={undefined}
        mission={null}
      />,
    )
    expect(screen.getByRole("status")).toHaveTextContent("No staff profiles are available")
  })

  it("shows a planning state on Team Floor while a mission is starting", () => {
    render(
      <WorkspaceSidebar
        panel="team-floor"
        staff={staffProfiles}
        staffLoading={false}
        staffError={null}
        runtimeStatus={undefined}
        mission={null}
        isStarting
      />,
    )

    expect(screen.queryByText("No team workflow is active in this session.")).not.toBeInTheDocument()
    expect(screen.getByText("Coordinator is creating a bounded mission plan.")).toBeInTheDocument()
    expect(screen.getByText("Status: Analyzing")).toBeInTheDocument()
  })

  it("shows the live mission status including failed on the team floor panel", () => {
    render(
      <WorkspaceSidebar
        panel="team-floor"
        staff={staffProfiles}
        staffLoading={false}
        staffError={null}
        runtimeStatus={undefined}
        mission={{
          id: "mission_1",
          project_id: "project_1",
          objective: "Build a fun minimal website and QA test it.",
          project_root: "F:/tmp/site",
          status: "failed",
          model_profile_id: "profile_1",
          model: "fake-model",
        }}
      />,
    )

    expect(screen.getByText("Status: Failed")).toBeInTheDocument()
    expect(screen.queryByText("Status: Running")).not.toBeInTheDocument()
  })
})
