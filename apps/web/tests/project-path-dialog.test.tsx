import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

const openProject = vi.hoisted(() => vi.fn())

vi.mock("@/features/projects/project-api", () => ({
  openProject,
}))

import { ProjectPathDialog } from "@/components/repository/ProjectPathDialog"

describe("ProjectPathDialog", () => {
  it("shows an actionable error when the folder cannot be opened", async () => {
    openProject.mockRejectedValue(new Error("Path is not an existing directory."))
    const user = userEvent.setup()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <ProjectPathDialog
          open
          mode="open"
          onOpenChange={() => undefined}
          onOpened={() => undefined}
        />
      </QueryClientProvider>,
    )

    await user.type(screen.getByLabelText("Folder path"), "C:\\missing-folder")
    await user.click(screen.getByRole("button", { name: /^Open$/ }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Path is not an existing directory.*Choose a folder you own/i,
    )
  })
})
