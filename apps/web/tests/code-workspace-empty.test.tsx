import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ProjectRecord, RecentProjectRecord } from "@/features/projects/project-api"

import { staffProfiles } from "./fixtures/staff"

const listRecentProjects = vi.fn<(...args: unknown[]) => Promise<RecentProjectRecord[]>>()
const openProject = vi.fn<(...args: unknown[]) => Promise<ProjectRecord>>()
const openSampleProject = vi.fn<(...args: unknown[]) => Promise<ProjectRecord>>()

vi.mock("@/features/projects/project-api", async () => {
  const actual = await vi.importActual<typeof import("@/features/projects/project-api")>(
    "@/features/projects/project-api",
  )
  return {
    ...actual,
    listRecentProjects: (...args: unknown[]) => listRecentProjects(...args),
    openProject: (...args: unknown[]) => openProject(...args),
    openSampleProject: (...args: unknown[]) => openSampleProject(...args),
  }
})

import { CodeWorkspace } from "@/components/editor/CodeWorkspace"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe("CodeWorkspace empty state", () => {
  beforeEach(() => {
    listRecentProjects.mockReset()
    openProject.mockReset()
    openSampleProject.mockReset()
    listRecentProjects.mockResolvedValue([])
  })

  it("opens the bundled sample project from the empty workspace", async () => {
    const user = userEvent.setup()
    const onProjectOpened = vi.fn()
    const sample: ProjectRecord = {
      id: "project_sample",
      name: "first-mission",
      root: "C:\\Users\\tova\\sample-projects\\first-mission",
    }
    openSampleProject.mockResolvedValue(sample)

    renderWithClient(
      <CodeWorkspace
        staff={staffProfiles}
        projectId={null}
        activeFile={null}
        openFiles={[]}
        editorOwnerId={null}
        onSelectFile={() => undefined}
        onCloseFile={() => undefined}
        onProjectOpened={onProjectOpened}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Open sample project" }))
    expect(openSampleProject).toHaveBeenCalledOnce()
    expect(onProjectOpened).toHaveBeenCalledWith(sample)
  })
})
