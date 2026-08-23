import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@monaco-editor/react", () => ({
  default: () => <div data-testid="monaco-editor" />,
}))

vi.mock("@/features/projects/project-api", () => ({
  languageForPath: () => "typescript",
  readProjectFile: vi.fn().mockResolvedValue({ path: "src/App.tsx", content: "export {}" }),
}))

import { TeamFloor } from "@/components/team-floor/TeamFloor"
import type { MissionStatus } from "@/types/domain"

import { staffProfiles } from "./fixtures/staff"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      {node}
    </QueryClientProvider>,
  )
}

const baseProps = {
  staff: staffProfiles,
  currentStaffId: "staff_alex" as string | null,
  statuses: {
    staff_alex: "working" as const,
    staff_maya: "working" as const,
  },
  selectedStaffIds: ["staff_alex", "staff_maya"],
  artifacts: [],
  activity: [],
  onSelectStaff: () => undefined,
  projectId: "project_1" as string | null,
  activeFile: null as string | null,
  fileRevision: 0,
  editorOwnerId: null as string | null,
  hasStarted: false,
  missionStatus: null as MissionStatus | null,
  objective: null as string | null,
  assemblyRoles: [] as string[],
}

describe("TeamFloor", () => {
  it("splits workforce and live editor in the Team Floor body", () => {
    const { container } = renderWithClient(<TeamFloor {...baseProps} />)

    expect(screen.getByRole("region", { name: "Team Floor" })).toBeInTheDocument()
    expect(container.querySelector(".team-floor__body")).not.toBeNull()
    expect(container.querySelector(".team-floor__workforce")).not.toBeNull()
    expect(screen.getByRole("region", { name: "Live code stage" })).toBeInTheDocument()
    expect(screen.getByText("Waiting for the first file write")).toBeInTheDocument()
  })

  it("shows elapsed mission time in the footer", () => {
    renderWithClient(
      <TeamFloor
        {...baseProps}
        hasStarted
        startedAt="2026-07-23T18:00:00.000Z"
        endedAt="2026-07-23T18:01:05.000Z"
      />,
    )

    expect(screen.getByLabelText("Mission elapsed time")).toHaveTextContent("1:05")
  })

  it("formats Ava's browser QA verdict as a criteria checklist", () => {
    renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={["staff_ava"]}
        currentStaffId="staff_ava"
        statuses={{ staff_ava: "completed" }}
        activity={[
          {
            id: "activity_qa",
            timestamp: "2026-07-31T21:00:00.000Z",
            staffId: "staff_ava",
            title:
              "QA Verdict: PASS. The website was audited against 4 acceptance criteria. Results: 1. Page background is white: PASS. 2. Text color is black: PASS. 3. Button contains 'Press Me!': PASS. 4. Hover effect is visible: PASS. No console errors or failed requests detected.",
            status: "completed",
            eventType: "browser_qa_audit",
          },
        ]}
      />,
    )

    expect(screen.getByText("QA Verdict")).toBeInTheDocument()
    expect(screen.getByText("4 passed")).toBeInTheDocument()
    const criteria = screen.getByRole("list", { name: "Acceptance criteria results" })
    expect(within(criteria).getByText("Page background is white")).toBeInTheDocument()
    expect(within(criteria).getByText("Button contains 'Press Me!'")).toBeInTheDocument()
    expect(within(criteria).getAllByText("PASS")).toHaveLength(4)
  })

  it("formats Ava's QA test report as readable sections", () => {
    renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={["staff_ava"]}
        currentStaffId="staff_ava"
        statuses={{ staff_ava: "completed" }}
        activity={[
          {
            id: "activity_qa_report",
            timestamp: "2026-07-31T21:00:00.000Z",
            staffId: "staff_ava",
            title:
              "QA Test Report: 2-Button Verification Scope: - index.html: Verify presence and rendering of 2 buttons. - script.js: Verify both buttons have click handlers. Acceptance Criteria: 1. Page loads without errors. 2. Exactly 2 buttons are visible on the page. Results: - PASS: Page loaded without errors. - PASS: 2 buttons rendered (#action-btn, #secondary-btn). Conclusion: The page satisfies all acceptance criteria.",
            status: "completed",
            eventType: "staff.action.completed",
          },
        ]}
      />,
    )

    expect(screen.getByRole("region", { name: "QA test report" })).toBeInTheDocument()
    expect(screen.getByText("2-Button Verification")).toBeInTheDocument()
    expect(screen.getByText("Scope")).toBeInTheDocument()
    expect(screen.getByText("Acceptance Criteria")).toBeInTheDocument()
    const results = screen.getByRole("list", { name: "QA report results" })
    expect(within(results).getByText("Page loaded without errors.")).toBeInTheDocument()
    expect(within(results).getAllByText("PASS")).toHaveLength(2)
    expect(screen.getByText("The page satisfies all acceptance criteria.")).toBeInTheDocument()
  })

  it("formats Ava's terse QA completion summary as a QA summary card", () => {
    renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={["staff_ava"]}
        currentStaffId="staff_ava"
        statuses={{ staff_ava: "completed" }}
        activity={[
          {
            id: "activity_qa_summary",
            timestamp: "2026-07-31T21:00:00.000Z",
            staffId: "staff_ava",
            title:
              "All acceptance criteria verified and passing. The 3rd button (#easter-egg-btn) is visible on index.html, styled pink via .btn-pink (background #ff69b4, border #ff1493), and triggers a rainbow background animation when clicked. Browser audit passed all 4 criteria with zero console errors or failed requests. No code changes were needed — the feature was already implemented correctly in the existing files (index.html, style.css, script.js).",
            status: "completed",
            eventType: "staff.action.completed",
          },
        ]}
      />,
    )

    expect(screen.getByRole("region", { name: "QA summary" })).toBeInTheDocument()
    expect(screen.getByText("All acceptance criteria verified and passing.")).toBeInTheDocument()
    expect(screen.getByText(/#easter-egg-btn/)).toBeInTheDocument()
    expect(screen.getByText(/Browser audit passed all 4 criteria/)).toBeInTheDocument()
  })

  it("shows Alex while mission has started without assignees and omits Now Running banner", () => {
    const { container } = renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={[]}
        currentStaffId={null}
        statuses={{}}
        hasStarted
        missionStatus="analyzing"
        objective="Build a centered button page"
      />,
    )

    expect(screen.queryByText(/Now Running/i)).not.toBeInTheDocument()
    expect(screen.queryByText("Everything is loading right now.")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Alex" })).toBeInTheDocument()
    expect(screen.queryByText("CURRENT WORK OUTPUT")).not.toBeInTheDocument()
    expect(screen.getByText("Coordinator is assembling the team…")).toBeInTheDocument()
    expect(screen.queryByText("No mission is running")).not.toBeInTheDocument()
    expect(container.querySelectorAll(".pixel-avatar__cell.is-filled").length).toBeGreaterThan(0)
  })

  it("animates the coordinator team assembly ellipsis", async () => {
    vi.useFakeTimers()
    try {
      renderWithClient(
        <TeamFloor
          {...baseProps}
          selectedStaffIds={[]}
          currentStaffId={null}
          statuses={{}}
          hasStarted
          missionStatus="analyzing"
          objective="Build a centered button page"
        />,
      )

      expect(screen.getByText("Coordinator is assembling the team…")).toBeInTheDocument()
      await act(() => vi.advanceTimersByTime(650))
      expect(screen.getByText("Coordinator is assembling the team..")).toBeInTheDocument()
      await act(() => vi.advanceTimersByTime(650))
      expect(screen.getByText("Coordinator is assembling the team.")).toBeInTheDocument()
      await act(() => vi.advanceTimersByTime(650))
      expect(screen.getByText("Coordinator is assembling the team…")).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it("shows Alex plan review when a proposed plan is present", () => {
    const { container } = renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={[]}
        currentStaffId={null}
        statuses={{}}
        hasStarted
        missionStatus="awaiting_approval"
        missionId="mission_1"
        planReview={{
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
        }}
      />,
    )

    expect(screen.getByText("Waiting for confirmation")).toBeInTheDocument()
    expect(screen.getByLabelText("Alex plan review")).toBeInTheDocument()
    expect(screen.getByText("Build a centered button page.")).toBeInTheDocument()
    expect(screen.getByText("Front-end owns the page markup.")).toBeInTheDocument()
    expect(screen.queryByText("CURRENT WORK OUTPUT")).not.toBeInTheDocument()
    expect(screen.queryByText("Everything is loading right now.")).not.toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Lina pixel portrait" })).toHaveClass("pixel-avatar")
    expect(
      container.querySelector(".team-floor__plan-list > li > span:not(.pixel-avatar)"),
    ).not.toBeNull()
  })

  it("lists assembly candidates with avatars in the live stage", () => {
    const { container } = renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={[]}
        currentStaffId={null}
        statuses={{}}
        hasStarted
        missionStatus="assembling_team"
        objective="Ship the button page"
        assemblyRoles={["frontend_developer", "project_coordinator"]}
      />,
    )

    expect(screen.getByText("Alex is selecting the team")).toBeInTheDocument()
    expect(screen.getByText("Lina")).toBeInTheDocument()
    expect(screen.getByText("Front-End Developer")).toBeInTheDocument()
    expect(container.querySelector(".team-floor__assembly-list")).not.toBeNull()
    expect(container.querySelectorAll(".pixel-avatar__cell.is-filled").length).toBeGreaterThan(0)
  })

  it("prefers editorOwnerId for workflow highlight when a file is active", () => {
    renderWithClient(
      <TeamFloor
        {...baseProps}
        currentStaffId="staff_alex"
        activeFile="src/App.tsx"
        fileRevision={2}
        editorOwnerId="staff_maya"
      />,
    )

    const mayaNode = screen.getByRole("button", { name: /Maya/ })
    const alexNode = screen.getByRole("button", { name: /Alex/ })
    expect(mayaNode).toHaveClass("is-active")
    expect(alexNode).not.toHaveClass("is-active")
  })

  it("opens file work outputs via clickable chips", () => {
    const onOpenWorkOutput = vi.fn()
    renderWithClient(
      <TeamFloor
        {...baseProps}
        selectedStaffIds={["staff_lina"]}
        currentStaffId="staff_lina"
        statuses={{ staff_lina: "working" }}
        hasStarted
        missionStatus="running"
        onOpenWorkOutput={onOpenWorkOutput}
        artifacts={[
          {
            id: "a1",
            staffId: "staff_lina",
            type: "file_output",
            name: "index.html",
            summary: "Created index.html",
          },
          {
            id: "a2",
            staffId: "staff_lina",
            type: "note",
            name: "Mission note",
            summary: "Not a file",
          },
        ]}
      />,
    )

    const chip = screen.getByRole("button", { name: /Open index\.html in Explorer/i })
    expect(chip).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Mission note/i })).not.toBeInTheDocument()
    expect(screen.getByText("Mission note")).toBeInTheDocument()

    chip.click()
    expect(onOpenWorkOutput).toHaveBeenCalledWith("index.html")
  })

  it("builds the workflow from the supplied roster", () => {
    const customStaff = {
      ...staffProfiles[0],
      id: "staff_custom",
      displayName: "Custom",
    }

    renderWithClient(
      <TeamFloor
        {...baseProps}
        staff={[customStaff]}
        currentStaffId={customStaff.id}
        selectedStaffIds={[customStaff.id]}
      />,
    )

    expect(screen.getByRole("button", { name: /Custom/ })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Custom" })).toBeInTheDocument()
  })
})
