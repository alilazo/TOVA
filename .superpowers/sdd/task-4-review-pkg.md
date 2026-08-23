# Task 4 post-fix
## FILE: apps/web/src/components/team-floor/TeamFloorLiveEditor.tsx
```
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"

import { startTypewriter } from "@/features/mission/typewriter"
import { languageForPath, readProjectFile } from "@/features/projects/project-api"
import { staffProfiles } from "@/features/staff/staff-fixtures"

import { PixelAvatar } from "../staff/PixelAvatar"

const MonacoEditor = lazy(() => import("@monaco-editor/react"))

interface TeamFloorLiveEditorProps {
  projectId: string | null
  activeFile: string | null
  fileRevision: number
  editorOwnerId: string | null
}

export function TeamFloorLiveEditor({
  projectId,
  activeFile,
  fileRevision,
  editorOwnerId,
}: TeamFloorLiveEditorProps) {
  const [visible, setVisible] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const visibleRef = useRef("")
  const previousFileRef = useRef<string | null>(activeFile)
  const owner = staffProfiles.find((staff) => staff.id === editorOwnerId)
  const language = activeFile ? languageForPath(activeFile) : "plaintext"

  const fileQuery = useQuery({
    queryKey: ["project-file", projectId, activeFile, fileRevision],
    queryFn: () => readProjectFile(projectId!, activeFile!),
    enabled: Boolean(projectId && activeFile),
  })

  useEffect(() => {
    if (previousFileRef.current === activeFile) return
    previousFileRef.current = activeFile
    visibleRef.current = ""
    setVisible("")
    setIsTyping(false)
  }, [activeFile])

  useEffect(() => {
    if (fileQuery.isError) {
      setIsTyping(false)
    }
  }, [fileQuery.isError])

  useEffect(() => {
    if (!activeFile || !fileQuery.data) return undefined

    let cancelled = false
    setIsTyping(true)

    const handle = startTypewriter({
      previous: visibleRef.current,
      target: fileQuery.data.content,
      onUpdate: (value) => {
        if (cancelled) return
        visibleRef.current = value
        setVisible(value)
      },
    })

    void handle.done.then(() => {
      if (!cancelled) setIsTyping(false)
    })

    return () => {
      cancelled = true
      handle.cancel()
      setIsTyping(false)
    }
  }, [activeFile, fileRevision, fileQuery.data])

  if (!projectId) {
    return (
      <section className="team-floor__stage team-floor__stage--empty" aria-label="Live code stage">
        <p>Open a project to show live code.</p>
      </section>
    )
  }

  if (!activeFile) {
    return (
      <section className="team-floor__stage team-floor__stage--empty" aria-label="Live code stage">
        <p>Waiting for the first file write</p>
      </section>
    )
  }

  return (
    <section className="team-floor__stage" aria-label="Live code stage">
      <aside className="team-floor__stage-status">
        {owner ? (
          <>
            <PixelAvatar avatar={owner.avatar} name={owner.displayName} size="lg" />
            <span>
              <small>LIVE WRITER</small>
              <strong>{owner.displayName}</strong>
              <p>{owner.role}</p>
            </span>
          </>
        ) : (
          <span>
            <small>LIVE WRITER</small>
            <strong>Unassigned</strong>
            <p>Waiting for a staff file event.</p>
          </span>
        )}
      </aside>
      <div className="team-floor__stage-code">
        <motion.header
          key={activeFile}
          className="team-floor__stage-header"
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          <span>
            <small>ACTIVE FILE</small>
            <strong>{activeFile}</strong>
          </span>
          {owner && isTyping ? (
            <span className="team-floor__stage-writing">
              <i aria-hidden="true" />
              {owner.displayName} is writing...
            </span>
          ) : (
            <span className="team-floor__stage-writing">Watching file writes</span>
          )}
        </motion.header>
        <div className="team-floor__stage-editor">
          {fileQuery.isLoading ? (
            <div className="editor-loading" role="status">Loading file...</div>
          ) : fileQuery.error ? (
            <p className="team-floor__stage-message" role="alert">
              {fileQuery.error.message}
            </p>
          ) : (
            <Suspense fallback={<div className="editor-loading" role="status">Loading editor...</div>}>
              <MonacoEditor
                path={activeFile}
                language={language}
                value={visible}
                theme="vs"
                options={{
                  readOnly: true,
                  domReadOnly: true,
                  minimap: { enabled: false },
                  fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                  fontSize: 12.5,
                  lineHeight: 20,
                  padding: { top: 14 },
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "gutter",
                  overviewRulerBorder: false,
                  foldingHighlight: false,
                  guides: { indentation: false },
                  wordWrap: "on",
                  automaticLayout: true,
                }}
              />
            </Suspense>
          )}
        </div>
      </div>
    </section>
  )
}

```
## FILE: apps/web/tests/team-floor-live-editor.test.tsx
```
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

  it("renders read-only Monaco with the active writer and fetched file content", async () => {
    mocks.readProjectFile.mockResolvedValueOnce({
      path: "src/App.tsx",
      content: "const value = 1",
    })

    renderWithClient(
      <TeamFloorLiveEditor
        projectId="project_1"
        activeFile="src/App.tsx"
        fileRevision={1}
        editorOwnerId="staff_lina"
      />,
    )

    const editor = await screen.findByTestId("monaco-editor")
    expect(screen.getByText("Lina is writing...")).toBeInTheDocument()
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

```

