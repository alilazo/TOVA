import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, screen } from "@testing-library/react"
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

vi.mock("@/features/projects/project-api", () => ({
  languageForPath: () => "html",
  listRecentProjects: vi.fn().mockResolvedValue([]),
  openSampleProject: vi.fn(),
  readProjectFile: vi.fn((projectId: string, path: string) => (
    Promise.resolve({
      path,
      content: projectId === "project_a" ? "FROM_A" : "FROM_B",
    })
  )),
  writeProjectFile: vi.fn(),
}))

import { CodeWorkspace } from "@/components/editor/CodeWorkspace"
import { useUiStore } from "@/stores/ui-store"

describe("CodeWorkspace project switch", () => {
  beforeEach(() => {
    useUiStore.getState().clearFiles()
  })

  it("discards editor drafts when the project changes", async () => {
    const user = userEvent.setup()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
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

    const editor = await screen.findByLabelText("File editor")
    expect(editor).toHaveValue("FROM_A")
    await user.clear(editor)
    await user.type(editor, "DRAFT_A")
    expect(editor).toHaveValue("DRAFT_A")
    expect(useUiStore.getState().draftByPath).toEqual({
      "index.html": "DRAFT_A",
    })
    expect(useUiStore.getState().dirtyPaths).toEqual({
      "index.html": true,
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

    expect(await screen.findByLabelText("File editor")).toHaveValue("FROM_B")
    expect(screen.queryByDisplayValue("DRAFT_A")).not.toBeInTheDocument()
    expect(useUiStore.getState().draftByPath).toEqual({})
    expect(useUiStore.getState().dirtyPaths).toEqual({})
  })
})
