import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ProjectRecord, RecentProjectRecord } from "@/features/projects/project-api"

const listRecentProjects = vi.fn<(...args: unknown[]) => Promise<RecentProjectRecord[]>>()
const openProject = vi.fn<(...args: unknown[]) => Promise<ProjectRecord>>()

vi.mock("@/features/projects/project-api", () => ({
  listRecentProjects: (...args: unknown[]) => listRecentProjects(...args),
  openProject: (...args: unknown[]) => openProject(...args),
}))

import { RecentProjectsList } from "@/components/repository/RecentProjectsList"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function makeRecent(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `project_${index}`,
    name: `App ${index}`,
    root: `F:\\Projects\\app-${index}`,
    lastOpenedAt: new Date(Date.UTC(2026, 6, 30, 12, index)).toISOString(),
  }))
}

describe("RecentProjectsList", () => {
  beforeEach(() => {
    listRecentProjects.mockReset()
    openProject.mockReset()
  })

  it("renders nothing when history is empty", async () => {
    listRecentProjects.mockResolvedValue([])
    const { container } = renderWithClient(
      <RecentProjectsList onOpened={() => undefined} />,
    )
    expect(await screen.findByText("Recent").catch(() => null)).toBeNull()
    expect(container.querySelector(".recent-projects")).toBeNull()
  })

  it("shows five rows and expands with View more", async () => {
    const user = userEvent.setup()
    listRecentProjects.mockResolvedValue(makeRecent(7))
    renderWithClient(<RecentProjectsList onOpened={() => undefined} />)
    expect(await screen.findByText("App 0")).toBeInTheDocument()
    expect(screen.getByText("App 4")).toBeInTheDocument()
    expect(screen.queryByText("App 5")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "View more" }))
    expect(screen.getByText("App 5")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Show less" }))
    expect(screen.queryByText("App 5")).not.toBeInTheDocument()
  })

  it("opens a project when a row is clicked", async () => {
    const user = userEvent.setup()
    const onOpened = vi.fn()
    listRecentProjects.mockResolvedValue(makeRecent(1))
    openProject.mockResolvedValue({
      id: "project_0",
      name: "App 0",
      root: "F:\\Projects\\app-0",
    })
    renderWithClient(<RecentProjectsList onOpened={onOpened} />)
    await user.click(await screen.findByRole("button", { name: /App 0/ }))
    expect(openProject).toHaveBeenCalledWith("F:\\Projects\\app-0")
    expect(onOpened).toHaveBeenCalledWith({
      id: "project_0",
      name: "App 0",
      root: "F:\\Projects\\app-0",
    })
  })

  it("shows an error and refreshes when open fails", async () => {
    const user = userEvent.setup()
    listRecentProjects
      .mockResolvedValueOnce(makeRecent(1))
      .mockResolvedValueOnce([])
    openProject.mockRejectedValue(new Error("Project root must be an existing directory"))
    renderWithClient(<RecentProjectsList onOpened={() => undefined} />)
    await user.click(await screen.findByRole("button", { name: /App 0/ }))
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That folder is no longer available",
    )
    expect(listRecentProjects).toHaveBeenCalledTimes(2)
  })
})
