import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { NavigationRail } from "@/components/shell/NavigationRail"
import { TooltipProvider } from "@/components/ui/tooltip"

function renderRail(node: ReactNode) {
  return render(<TooltipProvider>{node}</TooltipProvider>)
}

describe("NavigationRail", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  it("disables Search and Team Floor when no project is open", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderRail(
      <NavigationRail
        active="explorer"
        onChange={onChange}
        projectOpen={false}
      />,
    )

    const search = screen.getByRole("button", { name: "Search" })
    const teamFloor = screen.getByRole("button", { name: "Team Floor" })
    const explorer = screen.getByRole("button", { name: "Explorer" })
    const missions = screen.getByRole("button", { name: "Missions" })
    const staff = screen.getByRole("button", { name: "HiPo Staff" })

    expect(search).toBeDisabled()
    expect(teamFloor).toBeDisabled()
    expect(search).toHaveAttribute("title", "Open a project first")
    expect(explorer).toBeEnabled()
    expect(missions).toBeEnabled()
    expect(staff).toBeEnabled()
    expect(onChange).not.toHaveBeenCalled()

    await user.click(missions)
    expect(onChange).toHaveBeenCalledWith("missions")
  })

  it("enables Search and Team Floor when a project is open", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    renderRail(
      <NavigationRail
        active="explorer"
        onChange={onChange}
        projectOpen
      />,
    )

    const search = screen.getByRole("button", { name: "Search" })
    const teamFloor = screen.getByRole("button", { name: "Team Floor" })
    expect(search).toBeEnabled()
    expect(teamFloor).toBeEnabled()

    await user.click(search)
    expect(onChange).toHaveBeenCalledWith("search")
  })
})
