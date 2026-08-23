import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/projects/project-api", () => ({
  listProjectEntries: vi.fn().mockResolvedValue([]),
  openProject: vi.fn(),
}))

import {
  copyProjectFilePath,
  ProjectExplorer,
} from "@/components/repository/ProjectExplorer"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe("ProjectExplorer", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("does not repeat the active project name or path in the explorer", () => {
    renderWithClient(
      <ProjectExplorer
        project={{
          id: "project_1",
          name: "TOVA test",
          root: "C:\\Projects\\sample-app",
        }}
        activeFile={null}
        onOpenFile={() => undefined}
        onProjectOpened={() => undefined}
      />,
    )

    expect(screen.getByText("PROJECT")).toBeInTheDocument()
    expect(screen.queryByLabelText("Active project")).not.toBeInTheDocument()
    expect(screen.queryByText("TOVA test")).not.toBeInTheDocument()
    expect(
      screen.queryByText("C:\\Projects\\sample-app"),
    ).not.toBeInTheDocument()
  })

  it("shows Copy File Path in the Project menu when a project is open", async () => {
    const user = userEvent.setup()
    renderWithClient(
      <ProjectExplorer
        project={{
          id: "project_1",
          name: "TOVA test",
          root: "C:\\Projects\\sample-app",
        }}
        activeFile={null}
        onOpenFile={() => undefined}
        onProjectOpened={() => undefined}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Project menu" }))
    const item = await screen.findByRole("menuitem", { name: "Copy File Path" })
    expect(item).not.toHaveAttribute("data-disabled")
  })

  it("copies a path through copyProjectFilePath", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    await copyProjectFilePath("C:\\Projects\\sample-app")
    expect(writeText).toHaveBeenCalledWith("C:\\Projects\\sample-app")
  })
})
