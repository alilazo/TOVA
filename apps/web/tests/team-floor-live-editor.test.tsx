import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  editorProps: [] as Array<{
    path?: string
    language?: string
    value?: string
    options?: {
      readOnly?: boolean
      domReadOnly?: boolean
      minimap?: { enabled?: boolean }
    }
  }>,
  readProjectFile: vi.fn(),
  typewriterCalls: [] as Array<{ previous?: string, target: string }>,
  typewriterHandles: [] as Array<{ cancel: ReturnType<typeof vi.fn>, done: Promise<void> }>,
}))

vi.mock("@monaco-editor/react", () => ({
  default: (props: {
    path?: string
    language?: string
    value?: string
    options?: {
      readOnly?: boolean
      domReadOnly?: boolean
      minimap?: { enabled?: boolean }
    }
  }) => {
    mocks.editorProps.push(props)
    return (
      <div
        data-testid="monaco-editor"
        data-dom-readonly={String(props.options?.domReadOnly)}
        data-language={props.language}
        data-minimap={String(props.options?.minimap?.enabled)}
        data-path={props.path}
        data-readonly={String(props.options?.readOnly)}
      >
        {props.value}
      </div>
    )
  },
}))

vi.mock("@/features/projects/project-api", () => ({
  languageForPath: (path: string) => {
    if (path.endsWith(".tsx") || path.endsWith(".ts")) return "typescript"
    if (path.endsWith(".css")) return "css"
    return "plaintext"
  },
  readProjectFile: mocks.readProjectFile,
}))

vi.mock("@/features/mission/typewriter", () => ({
  startTypewriter: (options: {
    previous?: string
    target: string
    onUpdate: (visible: string) => void
  }) => {
    const handle = { cancel: vi.fn(), done: new Promise<void>(() => undefined) }
    mocks.typewriterCalls.push({ previous: options.previous, target: options.target })
    mocks.typewriterHandles.push(handle)
    options.onUpdate(options.target)
    return handle
  },
}))

import { TeamFloorLiveEditor } from "@/components/team-floor/TeamFloorLiveEditor"

import { staffProfiles } from "./fixtures/staff"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={client}>
      {node}
    </QueryClientProvider>,
  )
}

describe("TeamFloorLiveEditor", () => {
  afterEach(() => {
    mocks.editorProps.length = 0
    mocks.typewriterCalls.length = 0
    mocks.typewriterHandles.length = 0
    mocks.readProjectFile.mockReset()
  })

  it("shows idle copy when no active file is available", () => {
    renderWithClient(
      <TeamFloorLiveEditor
        staff={staffProfiles}
        projectId="project_1"
        activeFile={null}
        fileRevision={0}
        editorOwnerId={null}
      />,
    )

    expect(screen.getByLabelText("Live code stage")).toBeInTheDocument()
    expect(screen.getByText("Waiting for the first file write")).toBeInTheDocument()
    expect(mocks.readProjectFile).not.toHaveBeenCalled()
  })

  it("shows finished copy instead of a live writer after mission completion", async () => {
    mocks.readProjectFile.mockResolvedValueOnce({
      path: "index.html",
      content: "<button>Click</button>",
    })

    const view = renderWithClient(
      <TeamFloorLiveEditor
        staff={staffProfiles}
        projectId="project_1"
        activeFile="index.html"
        fileRevision={1}
        editorOwnerId={null}
        missionStatus="completed"
      />,
    )

    await screen.findByTestId("monaco-editor")
    expect(screen.getAllByText("Mission finished").length).toBeGreaterThan(0)
    expect(screen.queryByText(/is writing/)).not.toBeInTheDocument()
    expect(view.container.querySelector(".team-floor__stage-status")).toBeNull()
  })

  it("renders read-only Monaco with the active writer and fetched file content", async () => {
    const writer = {
      ...staffProfiles[4],
      id: "staff_writer",
      displayName: "Writer",
    }
    mocks.readProjectFile.mockResolvedValueOnce({
      path: "src/App.tsx",
      content: "const value = 1",
    })

    renderWithClient(
      <TeamFloorLiveEditor
        staff={[writer]}
        projectId="project_1"
        activeFile="src/App.tsx"
        fileRevision={1}
        editorOwnerId={writer.id}
      />,
    )

    const editor = await screen.findByTestId("monaco-editor")
    expect(screen.getByText("Writer is writing...")).toBeInTheDocument()
    expect(screen.queryByText("LIVE WRITER")).not.toBeInTheDocument()
    expect(editor).toHaveAttribute("data-path", "src/App.tsx")
    expect(editor).toHaveAttribute("data-language", "typescript")
    expect(editor).toHaveAttribute("data-readonly", "true")
    expect(editor).toHaveAttribute("data-dom-readonly", "true")
    expect(editor).toHaveAttribute("data-minimap", "false")
    expect(editor).toHaveTextContent("const value = 1")
  })

  it("refetches on fileRevision and resets previous content on active file change", async () => {
    mocks.readProjectFile
      .mockResolvedValueOnce({ path: "src/App.tsx", content: "const value = 1" })
      .mockResolvedValueOnce({ path: "src/App.tsx", content: "const value = 2" })
      .mockResolvedValueOnce({ path: "src/styles.css", content: ".stage { color: red; }" })

    const view = renderWithClient(
      <TeamFloorLiveEditor
        staff={staffProfiles}
        projectId="project_1"
        activeFile="src/App.tsx"
        fileRevision={1}
        editorOwnerId="staff_lina"
      />,
    )

    await screen.findByText("const value = 1")

    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TeamFloorLiveEditor
          staff={staffProfiles}
          projectId="project_1"
          activeFile="src/App.tsx"
          fileRevision={2}
          editorOwnerId="staff_lina"
        />
      </QueryClientProvider>,
    )

    await screen.findByText("const value = 2")

    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TeamFloorLiveEditor
          staff={staffProfiles}
          projectId="project_1"
          activeFile="src/styles.css"
          fileRevision={3}
          editorOwnerId="staff_lina"
        />
      </QueryClientProvider>,
    )

    await screen.findByText(".stage { color: red; }")

    expect(mocks.readProjectFile).toHaveBeenNthCalledWith(1, "project_1", "src/App.tsx")
    expect(mocks.readProjectFile).toHaveBeenNthCalledWith(2, "project_1", "src/App.tsx")
    expect(mocks.readProjectFile).toHaveBeenNthCalledWith(3, "project_1", "src/styles.css")
    await waitFor(() => expect(mocks.typewriterHandles[0]?.cancel).toHaveBeenCalled())
    expect(mocks.typewriterCalls[1]).toMatchObject({
      previous: "const value = 1",
      target: "const value = 2",
    })
    expect(mocks.typewriterCalls[2]).toMatchObject({
      previous: "",
      target: ".stage { color: red; }",
    })
  })

  it("clears writing status when a newer revision fetch fails", async () => {
    mocks.readProjectFile
      .mockResolvedValueOnce({ path: "src/App.tsx", content: "const value = 1" })
      .mockRejectedValueOnce(new Error("Failed to read file"))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const view = render(
      <QueryClientProvider client={client}>
        <TeamFloorLiveEditor
          staff={staffProfiles}
          projectId="project_1"
          activeFile="src/App.tsx"
          fileRevision={1}
          editorOwnerId="staff_lina"
        />
      </QueryClientProvider>,
    )

    await screen.findByText("const value = 1")
    expect(screen.getByText("Lina is writing...")).toBeInTheDocument()

    view.rerender(
      <QueryClientProvider client={client}>
        <TeamFloorLiveEditor
          staff={staffProfiles}
          projectId="project_1"
          activeFile="src/App.tsx"
          fileRevision={2}
          editorOwnerId="staff_lina"
        />
      </QueryClientProvider>,
    )

    await screen.findByRole("alert")
    await waitFor(() => {
      expect(screen.queryByText("Lina is writing...")).not.toBeInTheDocument()
    })
    expect(screen.getByText("Watching file writes")).toBeInTheDocument()
    expect(mocks.typewriterHandles[0]?.cancel).toHaveBeenCalled()
  })
})
