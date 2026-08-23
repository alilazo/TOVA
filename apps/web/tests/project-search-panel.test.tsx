import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ProjectSearchPanel } from "@/components/repository/ProjectSearchPanel"

const search = vi.hoisted(() => vi.fn())

vi.mock("@/features/projects/project-api", () => ({
  searchProjectReferences: search,
}))

describe("ProjectSearchPanel", () => {
  it("lists matching project files", async () => {
    search.mockResolvedValue([
      { path: "index.html", kind: "file", name: "index.html" },
    ])
    const onOpenFile = vi.fn()
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <ProjectSearchPanel
          projectId="project_1"
          onOpenFile={onOpenFile}
        />
      </QueryClientProvider>,
    )

    await user.type(screen.getByLabelText("Search repository"), "index")
    expect(await screen.findByRole("button", { name: "index.html" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "index.html" }))
    expect(onOpenFile).toHaveBeenCalledWith("index.html")
  })
})
