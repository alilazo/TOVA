import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
import * as missionApi from "@/features/mission/mission-api"

vi.mock("@/features/mission/mission-api", async () => {
  const actual = await vi.importActual<typeof missionApi>(
    "@/features/mission/mission-api",
  )
  return {
    ...actual,
    listApprovals: vi.fn(),
    resolveApproval: vi.fn(),
  }
})

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CommandApprovalDialog missionId="mission-1" />
    </QueryClientProvider>,
  )
}

describe("CommandApprovalDialog", () => {
  it("shows command timeout and expected outputs before approval", async () => {
    vi.mocked(missionApi.listApprovals).mockResolvedValue([
      {
        id: "approval_cmd",
        status: "pending",
        request: {
          kind: "command",
          mission_id: "mission-1",
          staff_id: "staff_lina",
          executable: "node",
          args: ["-e", "console.log('ok')"],
          cwd: ".",
          purpose: "Run a bounded check",
          timeout_seconds: 30,
          expected_outputs: ["ok"],
        },
      },
    ])
    renderDialog()
    expect(
      await screen.findByText("Action needed: approve this command"),
    ).toBeInTheDocument()
    expect(screen.getByText("Timeout")).toBeInTheDocument()
    expect(screen.getByText("30 seconds")).toBeInTheDocument()
    expect(screen.getByText("Expected outputs")).toBeInTheDocument()
    expect(screen.getByText("ok")).toBeInTheDocument()
  })

  it("shows file delete approval copy", async () => {
    vi.mocked(missionApi.listApprovals).mockResolvedValue([
      {
        id: "approval_1",
        status: "pending",
        request: {
          kind: "file_delete",
          mission_id: "mission-1",
          staff_id: "staff_ava",
          staff_display_name: "Ava",
          path: "hello.html",
          purpose: "Remove unused hello page",
        },
      },
    ])
    renderDialog()
    expect(
      await screen.findByText("Action needed: approve this file delete"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Ava wants to delete/)).toBeInTheDocument()
    expect(screen.getByText("hello.html")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Approve and delete/i }),
    ).toBeInTheDocument()
  })

  it("shows browser audit approval copy", async () => {
    vi.mocked(missionApi.listApprovals).mockResolvedValue([
      {
        id: "approval_browser",
        status: "pending",
        request: {
          kind: "browser_audit",
          mission_id: "mission-1",
          staff_id: "staff_ava",
          staff_display_name: "Ava",
          url: "http://127.0.0.1:5173",
          purpose: "Inspect generated UI",
          acceptance_criteria: ["Button is visible", "Hover state is obvious"],
        },
      },
    ])
    renderDialog()

    expect(
      await screen.findByText("Action needed: approve this browser audit"),
    ).toBeInTheDocument()
    expect(screen.getByText(/Ava wants to inspect/)).toBeInTheDocument()
    expect(screen.getByText("http://127.0.0.1:5173")).toBeInTheDocument()
    const criteria = screen.getByRole("list", { name: /Acceptance criteria/i })
    expect(within(criteria).getByText("Button is visible")).toBeInTheDocument()
    expect(within(criteria).getByText("Hover state is obvious")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Approve browser audit/i }),
    ).toBeInTheDocument()
  })
})
