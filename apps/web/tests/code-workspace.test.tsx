import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string
    onChange?: (value: string | undefined) => void
  }) => (
    <textarea
      data-testid="monaco-editor"
      aria-label="File editor"
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}))

import type { RecentProjectRecord } from "@/features/projects/project-api"
import { useUiStore } from "@/stores/ui-store"

const listRecentProjects = vi.fn<(...args: unknown[]) => Promise<RecentProjectRecord[]>>()
const writeProjectFile = vi.fn<
  (projectId: string, path: string, content: string) => Promise<{
    path: string
    content: string
  }>
>()

vi.mock("@/features/projects/project-api", () => ({
  languageForPath: () => "typescript",
  listRecentProjects: (...args: unknown[]) => listRecentProjects(...args),
  openSampleProject: vi.fn(),
  readProjectFile: vi.fn((_projectId: string, path: string) => Promise.resolve({
    path,
    content: "export {}",
  })),
  writeProjectFile: (
    projectId: string,
    path: string,
    content: string,
  ) => writeProjectFile(projectId, path, content),
}))

import { CodeWorkspace } from "@/components/editor/CodeWorkspace"

import { staffProfiles } from "./fixtures/staff"

describe("CodeWorkspace", () => {
  beforeEach(() => {
    useUiStore.getState().clearFiles()
    writeProjectFile.mockReset().mockImplementation(
      (...args) => Promise.resolve({ path: args[1], content: args[2] }),
    )
  })

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

  it("preserves an unsaved descendant draft when its path is relocated", async () => {
    const user = userEvent.setup()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId="project_1"
          activeFile="src/main.ts"
          openFiles={["src/main.ts"]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )
    const editor = await screen.findByLabelText("File editor")

    await user.clear(editor)
    await user.type(editor, "UNSAVED")
    act(() => useUiStore.getState().relocatePath("src", "app"))
    view.rerender(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId="project_1"
          activeFile="app/main.ts"
          openFiles={["app/main.ts"]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByLabelText("File editor")).toHaveValue("UNSAVED")
    expect(useUiStore.getState().draftByPath["app/main.ts"]).toBe("UNSAVED")
    expect(useUiStore.getState().dirtyPaths["app/main.ts"]).toBe(true)
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
  })

  it("marks the submitted path clean and preserves query invalidation if the active file changes", async () => {
    const user = userEvent.setup()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidateQueries = vi.spyOn(client, "invalidateQueries")
      .mockResolvedValue(undefined)
    let resolveWrite: ((file: { path: string; content: string }) => void) | undefined
    writeProjectFile.mockImplementation(
      () => new Promise((resolve) => {
        resolveWrite = resolve
      }),
    )
    const view = render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId="project_1"
          activeFile="src/main.ts"
          openFiles={["src/main.ts", "src/other.ts"]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )
    const editor = await screen.findByLabelText("File editor")
    await user.clear(editor)
    await user.type(editor, "MAIN_DRAFT")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(writeProjectFile).toHaveBeenCalledWith(
        "project_1",
        "src/main.ts",
        "MAIN_DRAFT",
      )
    })

    view.rerender(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId="project_1"
          activeFile="src/other.ts"
          openFiles={["src/main.ts", "src/other.ts"]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )
    const otherEditor = await screen.findByLabelText("File editor")
    await user.clear(otherEditor)
    await user.type(otherEditor, "OTHER_DRAFT")
    await act(async () => {
      resolveWrite?.({ path: "src/main.ts", content: "MAIN_DRAFT" })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(useUiStore.getState().dirtyPaths["src/main.ts"]).toBe(false)
    })
    expect(useUiStore.getState().dirtyPaths["src/other.ts"]).toBe(true)
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["project-file", "project_1", "src/main.ts"],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["project-entries", "project_1"],
    })
  })

  it("keeps a newer same-path draft dirty when an earlier save resolves", async () => {
    const user = userEvent.setup()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    let resolveWrite: ((file: { path: string; content: string }) => void) | undefined
    writeProjectFile.mockImplementation(
      () => new Promise((resolve) => {
        resolveWrite = resolve
      }),
    )
    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId="project_1"
          activeFile="src/main.ts"
          openFiles={["src/main.ts"]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )
    const editor = await screen.findByLabelText("File editor")
    await user.clear(editor)
    await user.type(editor, "CONTENT_A")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(writeProjectFile).toHaveBeenCalledWith(
        "project_1",
        "src/main.ts",
        "CONTENT_A",
      )
    })

    await user.clear(editor)
    await user.type(editor, "CONTENT_B")
    await act(async () => {
      resolveWrite?.({ path: "src/main.ts", content: "CONTENT_A" })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled()
    })
    expect(editor).toHaveValue("CONTENT_B")
    expect(useUiStore.getState().draftByPath["src/main.ts"]).toBe("CONTENT_B")
    expect(useUiStore.getState().dirtyPaths["src/main.ts"]).toBe(true)
  })

  it("does not clean a new project's same-path draft when an old save resolves", async () => {
    const user = userEvent.setup()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    let resolveWrite: ((file: { path: string; content: string }) => void) | undefined
    writeProjectFile.mockImplementation(
      () => new Promise((resolve) => {
        resolveWrite = resolve
      }),
    )
    const view = render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId="project_a"
          activeFile="index.html"
          openFiles={["index.html"]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )
    const projectAEditor = await screen.findByLabelText("File editor")
    await user.clear(projectAEditor)
    await user.type(projectAEditor, "PROJECT_A")
    await user.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(writeProjectFile).toHaveBeenCalledWith(
        "project_a",
        "index.html",
        "PROJECT_A",
      )
    })

    act(() => useUiStore.getState().clearFiles())
    view.rerender(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId="project_b"
          activeFile="index.html"
          openFiles={["index.html"]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )
    const projectBEditor = await screen.findByLabelText("File editor")
    await user.clear(projectBEditor)
    await user.type(projectBEditor, "PROJECT_B")
    await act(async () => {
      resolveWrite?.({ path: "index.html", content: "PROJECT_A" })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled()
    })
    expect(projectBEditor).toHaveValue("PROJECT_B")
    expect(useUiStore.getState().draftByPath["index.html"]).toBe("PROJECT_B")
    expect(useUiStore.getState().dirtyPaths["index.html"]).toBe(true)
  })
})
