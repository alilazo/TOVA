import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { HandoffOverlay } from "@/components/handoff/HandoffOverlay"
import { MissionComposer } from "@/components/mission/MissionComposer"
import { MissionControlBar } from "@/components/mission/MissionControlBar"
import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
import { useUiStore } from "@/stores/ui-store"
import type { MissionStatus } from "@/types/domain"

import { staffProfiles } from "./fixtures/staff"

describe("Mission interactions", () => {
  it("prefills a canned mission request and enables Send to Team", () => {
    let submitted = ""
    render(
      <MissionComposer
        projectName="first-mission"
        initialRequest="Make the Count button increment a visible number."
        liveRuntime={{
          state: "connected",
          profileId: "profile_1",
          model: "qwen/qwen3.6-35b-a3b",
        }}
        onStart={(request) => { submitted = request.request }}
      />,
    )

    expect(screen.getByLabelText("Mission request")).toHaveValue(
      "Make the Count button increment a visible number.",
    )
    fireEvent.click(screen.getByRole("button", { name: "Send to Team" }))
    expect(submitted).toBe("Make the Count button increment a visible number.")
  })

  it("submits a typed mission request when project and model are ready", () => {
    let submitted = ""
    render(
      <MissionComposer
        projectName="demo-app"
        liveRuntime={{
          state: "connected",
          profileId: "profile_1",
          model: "qwen/qwen3.6-35b-a3b",
        }}
        onStart={(request) => { submitted = request.request }}
      />,
    )

    fireEvent.change(screen.getByLabelText("Mission request"), {
      target: { value: "Add project creation and team orchestration" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send to Team" }))

    expect(submitted).toBe("Add project creation and team orchestration")
    expect(screen.getByLabelText("HiPo Team")).toBeInTheDocument()
    expect(screen.queryByLabelText("Priority")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Request type")).not.toBeInTheDocument()
    expect(screen.queryByText(/Start a software mission/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Team: coordinator choice/)).not.toBeInTheDocument()
  })

  it("inserts a project file reference from a slash command", () => {
    let submitted = ""
    const onReferenceQueryChange = vi.fn()
    render(
      <MissionComposer
        projectName="demo-app"
        liveRuntime={{
          state: "connected",
          profileId: "profile_1",
          model: "qwen/qwen3.6-35b-a3b",
        }}
        projectReferences={[
          { name: "index.html", path: "src/index.html", kind: "file" },
          { name: "infra", path: "infra", kind: "dir" },
        ]}
        onProjectReferenceQueryChange={onReferenceQueryChange}
        onStart={(request) => { submitted = request.request }}
      />,
    )

    const input = screen.getByLabelText("Mission request")
    fireEvent.change(input, { target: { value: "Ask Alex to inspect /ind" } })

    expect(onReferenceQueryChange).toHaveBeenLastCalledWith("ind")
    expect(screen.getByRole("listbox", { name: "Project references" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("option", { name: "src/index.html file" }))

    expect(input).toHaveValue("Ask Alex to inspect /src/index.html ")
    expect(screen.getByLabelText("Attached file references")).toBeInTheDocument()
    expect(screen.getByText("/src/index.html")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Send to Team" }))
    expect(submitted).toBe("Ask Alex to inspect /src/index.html")
  })

  it("submits follow-up prompts in chat form and clears the input", () => {
    const onStart = vi.fn()
    render(
      <MissionComposer
        mode="followup"
        projectName="demo-app"
        liveRuntime={{
          state: "connected",
          profileId: "profile_1",
          model: "qwen/qwen3.6-35b-a3b",
        }}
        onStart={onStart}
      />,
    )

    const input = screen.getByLabelText("Team chat message")
    fireEvent.change(input, { target: { value: "Fix the header" } })
    fireEvent.click(screen.getByRole("button", { name: "Send follow-up" }))

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      request: "Fix the header",
    }))
    expect(input).toHaveValue("")
  })

  it("explains that a project is required before sending", () => {
    render(
      <MissionComposer
        liveRuntime={{
          state: "connected",
          profileId: "profile_1",
          model: "qwen/qwen3.6-35b-a3b",
        }}
        onStart={() => undefined}
      />,
    )
    expect(screen.getByRole("button", { name: "Open project first" })).toBeDisabled()
  })

  it("requires a non-empty objective before sending", () => {
    const onStart = vi.fn()
    render(
      <MissionComposer
        projectName="demo-app"
        liveRuntime={{
          state: "connected",
          profileId: "profile_1",
          model: "qwen/qwen3.6-35b-a3b",
        }}
        onStart={onStart}
      />,
    )

    expect(screen.getByRole("button", { name: "Describe task" })).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Mission request"), {
      target: { value: "   " },
    })
    expect(screen.getByRole("button", { name: "Describe task" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Describe task" }))
    expect(onStart).not.toHaveBeenCalled()
  })

  it("opens model setup when Connect local model is clicked and shows readiness hint", () => {
    useUiStore.setState({ runtimeDialogOpen: false })

    render(
      <MissionComposer
        projectName="demo-app"
        liveRuntime={{
          state: "unconfigured",
          profileId: "",
          model: "",
        }}
        onStart={() => undefined}
      />,
    )
    fireEvent.change(screen.getByLabelText("Mission request"), {
      target: { value: "Build a landing page" },
    })
    expect(
      screen.getByText(/Model required/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Connect a local model to enable sending/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/LM Studio/i)).not.toBeInTheDocument()
    const connect = screen.getByRole("button", { name: "Connect local model" })
    expect(connect).toBeEnabled()
    fireEvent.click(connect)
    expect(useUiStore.getState().runtimeDialogOpen).toBe(true)
  })

  it("starts taller and grows when the resize handle is dragged up", () => {
    render(
      <MissionComposer
        projectName="demo-app"
        liveRuntime={{
          state: "connected",
          profileId: "profile_1",
          model: "qwen/qwen3.6-35b-a3b",
        }}
        onStart={() => undefined}
      />,
    )

    const textarea = screen.getByLabelText("Mission request")
    expect(textarea).toHaveStyle({ height: "176px" })

    const handle = screen.getByRole("separator", { name: "Resize mission composer" })
    fireEvent.pointerDown(handle, { clientY: 400, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 340, pointerId: 1 })
    fireEvent.pointerUp(handle, { pointerId: 1 })

    expect(textarea).toHaveStyle({ height: "236px" })
  })

    it("makes plan and approval waits the loudest control-bar state", () => {
      render(
        <MissionControlBar
          title="Review the Count button"
          playing
          paused={false}
          status="awaiting_approval"
          onPause={() => undefined}
          onResume={() => undefined}
          onCancel={() => undefined}
        />,
      )

      expect(screen.getByText("WAITING FOR YOU")).toBeInTheDocument()
      expect(
        screen.getByText(/Approve the plan or pending request to continue/i),
      ).toBeInTheDocument()
    })

    it("pauses and cancels an active nonterminal mission", () => {
    const onPause = vi.fn()
    const onCancel = vi.fn()
    render(
      <MissionControlBar
        title="Build runtime health"
        playing
        paused={false}
        status="running"
        onPause={onPause}
        onResume={() => undefined}
        onCancel={onCancel}
      />,
    )

    expect(screen.queryByRole("combobox", { name: "Playback speed" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Restart demo")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel mission" }))
    expect(onPause).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it("resumes a paused nonterminal mission", () => {
    const onResume = vi.fn()
    render(
      <MissionControlBar
        title="Build runtime health"
        playing={false}
        paused
        status="paused"
        onPause={() => undefined}
        onResume={onResume}
        onCancel={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Resume" }))
    expect(onResume).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Cancel mission" })).toBeEnabled()
  })

  it.each([
    "completed",
    "failed",
    "cancelled",
  ] satisfies MissionStatus[])("offers New mission for terminal status %s", (status) => {
    const onCancel = vi.fn()
    const onDismiss = vi.fn()
    render(
      <MissionControlBar
        title="Build runtime health"
        playing={false}
        paused={false}
        status={status}
        onPause={() => undefined}
        onResume={() => undefined}
        onCancel={onCancel}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.queryByRole("button", { name: /^(Pause|Resume)$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cancel mission" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "New mission" }))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("dismisses a Maya-to-Ethan handoff without offering a skip control", () => {
    const onDismiss = vi.fn()
    render(
      <HandoffOverlay
        handoff={{
          id: "handoff_maya_ethan",
          fromStaffId: "staff_maya",
          toStaffId: "staff_ethan",
          title: "Research complete",
          summary: "Maya prepared an implementation brief.",
          artifactCount: 3,
          status: "animating",
        }}
        staff={staffProfiles}
        onDismiss={onDismiss}
      />,
    )

    expect(screen.getByRole("dialog", { name: "Research complete" })).toBeInTheDocument()
    expect(screen.getByText("Handing off to Ethan")).toBeInTheDocument()
    expect(screen.getByText("3 artifacts included")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Skip handoff" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it("labels safe operational sections in the Work Log", () => {
    const maya = staffProfiles.find((staff) => staff.id === "staff_maya")!
    render(
      <WorkLogDrawer
        open
        staff={maya}
        onOpenChange={() => undefined}
        log={{
          currentAction: "Reviewing repository structure.",
          objective: "Identify orchestration boundaries.",
          inputs: ["User request", "Coordinator plan"],
          toolActivity: ["Repository search", "File opened"],
          observations: ["Mission services are isolated."],
          decisionSummary: "Use the existing service boundary.",
          output: ["Research brief"],
          nextAction: "Prepare handoff.",
          errors: [],
        }}
      />,
    )

    expect(screen.getByText("Work Log")).toBeInTheDocument()
    expect(screen.getByText("Current action")).toBeInTheDocument()
    expect(screen.getByText("Decision summary")).toBeInTheDocument()
    expect(screen.getByText("Next action")).toBeInTheDocument()
    expect(screen.queryByText("Errors")).not.toBeInTheDocument()
  })

  it("renders honest empty Work Log values when no events exist", () => {
    const maya = staffProfiles.find((staff) => staff.id === "staff_maya")!
    render(
      <WorkLogDrawer
        open
        staff={maya}
        onOpenChange={() => undefined}
      />,
    )

    expect(screen.getAllByText("No live activity recorded.")).toHaveLength(4)
    expect(screen.getAllByText("No live entries recorded.")).toHaveLength(4)
    expect(screen.queryByText("Errors")).not.toBeInTheDocument()
  })

  it("shows errors only when live failure events exist", () => {
    const maya = staffProfiles.find((staff) => staff.id === "staff_maya")!
    render(
      <WorkLogDrawer
        open
        staff={maya}
        onOpenChange={() => undefined}
        log={{
          currentAction: null,
          objective: null,
          inputs: [],
          toolActivity: [],
          observations: [],
          decisionSummary: null,
          output: [],
          nextAction: null,
          errors: ["staff iteration failed"],
        }}
      />,
    )

    expect(screen.getByText("Errors")).toBeInTheDocument()
    expect(screen.getByText("staff iteration failed")).toBeInTheDocument()
  })
})
