import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@monaco-editor/react", () => ({
  default: () => <div data-testid="monaco-editor" />,
}))

import type { RecentProjectRecord } from "@/features/projects/project-api"

const listRecentProjects = vi.fn<(...args: unknown[]) => Promise<RecentProjectRecord[]>>()

vi.mock("@/features/projects/project-api", () => ({
  languageForPath: () => "typescript",
  listRecentProjects: (...args: unknown[]) => listRecentProjects(...args),
  openSampleProject: vi.fn(),
  readProjectFile: vi.fn().mockResolvedValue({
    path: "src/App.tsx",
    content: "export {}",
  }),
  writeProjectFile: vi.fn(),
}))

import { CodeWorkspace } from "@/components/editor/CodeWorkspace"

import { staffProfiles } from "./fixtures/staff"

describe("CodeWorkspace", () => {
  it("shows recent projects in the empty state when no project is open", async () => {
    listRecentProjects.mockResolvedValue([
      {
        id: "project_recent",
        name: "Recent App",
        root: "F:\\Projects\\recent-app",
        lastOpenedAt: "2026-07-30T12:00:00.000Z",
      },
    ])
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId={null}
          activeFile={null}
          openFiles={[]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByRole("button", { name: "Open project" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument()
    expect(await screen.findByText("Recent App")).toBeInTheDocument()
  })

  it("resolves the editor owner from the supplied roster", async () => {
    const owner = {
      ...staffProfiles[4],
      id: "staff_custom_editor",
      displayName: "Custom Editor",
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[owner]}
          projectId="project_1"
          activeFile="src/App.tsx"
          openFiles={["src/App.tsx"]}
          editorOwnerId={owner.id}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole("img", {
      name: "Custom Editor pixel portrait",
    })).toBeInTheDocument()
    expect(screen.getByText(/is editing/)).toBeInTheDocument()
  })

  it("hides the live editing badge when the mission is finished", async () => {
    const owner = staffProfiles[0]
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[owner]}
          projectId="project_1"
          activeFile="index.html"
          openFiles={["index.html", "script.js"]}
          editorOwnerId={owner.id}
          missionStatus="completed"
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    await screen.findByTestId("monaco-editor")
    expect(screen.queryByText(/is editing/)).not.toBeInTheDocument()
  })
})
