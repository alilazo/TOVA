import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { WorkspacePanelSwitch } from "@/components/shell/WorkspacePanelSwitch"

describe("WorkspacePanelSwitch", () => {
  it("renders the active panel content with motion wrapper", () => {
    render(
      <WorkspacePanelSwitch panelKey="team-floor">
        <div>Team Floor panel</div>
      </WorkspacePanelSwitch>,
    )
    expect(screen.getByText("Team Floor panel")).toBeInTheDocument()
    expect(document.querySelector(".workspace-panel-switch")).not.toBeNull()
  })

  it("accepts the Settings panel key", () => {
    render(
      <WorkspacePanelSwitch panelKey="settings">
        <div>Settings panel</div>
      </WorkspacePanelSwitch>,
    )
    expect(screen.getByText("Settings panel")).toBeInTheDocument()
  })
})
