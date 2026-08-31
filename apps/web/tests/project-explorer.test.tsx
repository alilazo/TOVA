import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  createProjectEntry,
  deleteProjectEntry,
  listProjectEntries,
  moveProjectEntry,
  openProject,
} = vi.hoisted(() => ({
  createProjectEntry: vi.fn(),
  deleteProjectEntry: vi.fn(),
  listProjectEntries: vi.fn(),
  moveProjectEntry: vi.fn(),
  openProject: vi.fn(),
}))

vi.mock("@/features/projects/project-api", () => ({
  createProjectEntry,
  deleteProjectEntry,
  listProjectEntries,
  moveProjectEntry,
  openProject,
}))

import {
  copyProjectFilePath,
  ProjectExplorer,
} from "@/components/repository/ProjectExplorer"
import type { ProjectEntry } from "@/features/projects/project-api"
import { useUiStore } from "@/stores/ui-store"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    ),
  }
}

const project = {
  id: "project_1",
  name: "TOVA test",
  root: "C:\\Projects\\sample-app",
}

const rootEntries: ProjectEntry[] = [
  { name: "src", path: "src", kind: "dir" },
  { name: "README.md", path: "README.md", kind: "file" },
]

const srcEntries: ProjectEntry[] = [
  { name: "index.ts", path: "src/index.ts", kind: "file" },
]

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function renderExplorer(overrides?: {
  activeFile?: string | null
  onOpenFile?: (path: string) => void
}) {
  return renderWithClient(
    <ProjectExplorer
      project={project}
      activeFile={overrides?.activeFile ?? null}
      onOpenFile={overrides?.onOpenFile ?? (() => undefined)}
      onProjectOpened={() => undefined}
    />,
  )
}

function stubMoveTree() {
  const moveRoot: ProjectEntry[] = [
    { name: "src", path: "src", kind: "dir" },
    { name: "archive", path: "archive", kind: "dir" },
    { name: "README.md", path: "README.md", kind: "file" },
  ]
  const srcChildren: ProjectEntry[] = [
    { name: "app.ts", path: "src/app.ts", kind: "file" },
    { name: "nested", path: "src/nested", kind: "dir" },
  ]
  listProjectEntries.mockImplementation(
    (_projectId: string, path: string) => {
      if (path === ".") return Promise.resolve(moveRoot)
      if (path === "src") return Promise.resolve(srcChildren)
      return Promise.resolve([])
    },
  )
}

async function expandSrcFile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("treeitem", { name: "src" }))
  return screen.findByRole("treeitem", { name: "app.ts" })
}

function stubDeleteSiblings() {
  let root: ProjectEntry[] = [{ name: "src", path: "src", kind: "dir" }]
  let srcChildren: ProjectEntry[] = [
    { name: "a.ts", path: "src/a.ts", kind: "file" },
    { name: "b.ts", path: "src/b.ts", kind: "file" },
    { name: "c.ts", path: "src/c.ts", kind: "file" },
  ]
  listProjectEntries.mockImplementation(
    (_projectId: string, path: string) => {
      if (path === ".") return Promise.resolve(root)
      if (path === "src") return Promise.resolve(srcChildren)
      return Promise.resolve([])
    },
  )
  deleteProjectEntry.mockImplementation(
    (_projectId: string, path: string) => {
      const fromRoot = root.find((entry) => entry.path === path)
      const fromSrc = srcChildren.find((entry) => entry.path === path)
      const entry = fromRoot ?? fromSrc
      root = root.filter((candidate) => candidate.path !== path)
      srcChildren = srcChildren.filter((candidate) => candidate.path !== path)
      return Promise.resolve(entry ?? {
        name: path.split("/").at(-1) ?? path,
        path,
        kind: "file" as const,
      })
    },
  )
}

async function openDeleteDialog(
  user: ReturnType<typeof userEvent.setup>,
  name: string | RegExp,
) {
  fireEvent.contextMenu(await screen.findByRole("treeitem", { name }))
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }))
  return screen.findByRole("alertdialog")
}

describe("ProjectExplorer", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    createProjectEntry.mockReset()
    deleteProjectEntry.mockReset()
    listProjectEntries.mockReset()
    moveProjectEntry.mockReset()
    openProject.mockReset()
    listProjectEntries.mockImplementation(
      (_projectId: string, path: string) =>
        Promise.resolve(path === "." ? rootEntries : path === "src" ? srcEntries : []),
    )
    createProjectEntry.mockImplementation(
      (_projectId: string, path: string, kind: ProjectEntry["kind"]) =>
        Promise.resolve({
          name: path.split("/").at(-1) ?? path,
          path,
          kind,
        }),
    )
    moveProjectEntry.mockImplementation(
      (_projectId: string, _sourcePath: string, destinationPath: string) =>
        Promise.resolve({
          name: destinationPath.split("/").at(-1) ?? destinationPath,
          path: destinationPath,
          kind: "file",
        }),
    )
    useUiStore.getState().clearFiles()
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

  it("hides the project menu once New project dialog opens", async () => {
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
    await user.click(await screen.findByRole("menuitem", { name: "New project…" }))

    expect(await screen.findByRole("heading", { name: "New project" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Copy File Path" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Open project…" })).not.toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "New project…" })).not.toBeInTheDocument()
  })

  it("exposes compact toolbar actions and exact file, folder, and root menus", async () => {
    const user = userEvent.setup()
    renderExplorer()

    for (const name of [
      "New File",
      "New Folder",
      "Refresh Explorer",
      "Collapse All",
    ]) {
      expect(screen.getByRole("button", { name })).toBeEnabled()
    }

    const file = await screen.findByRole("treeitem", { name: /README\.md/ })
    fireEvent.contextMenu(file)
    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toEqual(["Open", "RenameF2", "CutCtrl+X", "Copy Path", "Delete"])

    await user.keyboard("{Escape}")
    const folder = screen.getByRole("treeitem", { name: /src/ })
    fireEvent.contextMenu(folder)
    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toEqual([
      "New File",
      "New Folder",
      "RenameF2",
      "CutCtrl+X",
      "PasteCtrl+V",
      "Copy Path",
      "Refresh",
      "Delete",
    ])

    await user.keyboard("{Escape}")
    fireEvent.contextMenu(screen.getByRole("tree"))
    expect(
      (await screen.findAllByRole("menuitem")).map((item) => item.textContent),
    ).toEqual([
      "New File",
      "New Folder",
      "PasteCtrl+V",
      "Copy Project Path",
      "Refresh",
      "Collapse All",
    ])
  })

  it("opens a focused row menu with Shift+F10 and the row action trigger", async () => {
    const user = userEvent.setup()
    renderExplorer()
    const file = await screen.findByRole("treeitem", { name: /README\.md/ })

    file.focus()
    await user.keyboard("{Shift>}{F10}{/Shift}")
    expect(await screen.findByRole("menuitem", { name: "Open" })).toBeVisible()

    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", {
      name: "Actions for README.md",
    }))
    expect(await screen.findByRole("menuitem", { name: "Open" })).toBeVisible()
  })

  it("opens a row action menu with Enter without opening or toggling the entry", async () => {
    const onOpenFile = vi.fn()
    const user = userEvent.setup()
    renderExplorer({ onOpenFile })
    const fileActions = await screen.findByRole("button", {
      name: "Actions for README.md",
    })

    fileActions.focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("menuitem", { name: "Open" })).toBeVisible()
    expect(onOpenFile).not.toHaveBeenCalled()

    await user.keyboard("{Escape}")
    const folder = screen.getByRole("treeitem", { name: /src/ })
    const folderActions = screen.getByRole("button", { name: "Actions for src" })
    expect(folder).toHaveAttribute("aria-expanded", "false")
    folderActions.focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("menuitem", { name: "New File" })).toBeVisible()
    expect(folder).toHaveAttribute("aria-expanded", "false")
  })

  it("restores row focus when its context menu is dismissed", async () => {
    const user = userEvent.setup()
    renderExplorer()
    const file = await screen.findByRole("treeitem", { name: /README\.md/ })

    file.focus()
    await user.keyboard("{Shift>}{F10}{/Shift}")
    expect(await screen.findByRole("menuitem", { name: "Open" })).toHaveFocus()
    await user.keyboard("{Escape}")

    expect(file).toHaveFocus()
  })

  it("returns focus to the initiating control after inline edit cancellation", async () => {
    const user = userEvent.setup()
    renderExplorer()
    const newFile = screen.getByRole("button", { name: "New File" })

    await user.click(newFile)
    const rootInput = screen.getByRole("textbox", { name: "New file name" })
    expect(rootInput).toHaveFocus()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(newFile).toHaveFocus())

    const file = await screen.findByRole("treeitem", { name: /README\.md/ })
    file.focus()
    await user.keyboard("{F2}")
    expect(screen.getByRole("textbox", { name: "Rename README.md" }))
      .toHaveFocus()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(
      screen.getByRole("treeitem", { name: "README.md" }),
    ).toHaveFocus())

    const newFolder = screen.getByRole("button", { name: "New Folder" })
    await user.click(newFolder)
    const folderInput = screen.getByRole("textbox", { name: "New folder name" })
    fireEvent.blur(folderInput)
    await waitFor(() => expect(newFolder).toHaveFocus())
  })

  it("nests folder groups under treeitems and gives naming rows treeitem semantics", async () => {
    const user = userEvent.setup()
    renderExplorer()
    const tree = await screen.findByRole("tree", { name: "Project files" })
    const folder = screen.getByRole("treeitem", { name: /src/ })

    expect(Array.from(tree.children).every(
      (child) => child.getAttribute("role") === "treeitem",
    )).toBe(true)
    await user.click(folder)
    const group = within(folder).getByRole("group")
    expect(group.parentElement).toBe(folder)
    expect(within(group).getByRole("treeitem", { name: /index\.ts/ }))
      .toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "New File" }))
    const input = screen.getByRole("textbox", { name: "New file name" })
    expect(input.closest('[role="treeitem"]')).not.toBeNull()
  })

  it("creates a root file, announces progress, seeds its draft, and opens it", async () => {
    const request = deferred<ProjectEntry>()
    createProjectEntry.mockReturnValueOnce(request.promise)
    const onOpenFile = vi.fn()
    const user = userEvent.setup()
    renderExplorer({ onOpenFile })

    await user.click(screen.getByRole("button", { name: "New File" }))
    const input = screen.getByRole("textbox", { name: "New file name" })
    expect(input).toHaveFocus()
    await user.type(input, "app.ts")
    await user.keyboard("{Enter}")

    expect(createProjectEntry).toHaveBeenCalledWith(
      project.id,
      "app.ts",
      "file",
    )
    expect(screen.getByRole("status")).toHaveTextContent("Creating app.ts")
    expect(screen.getByRole("button", { name: "New Folder" })).toBeDisabled()

    request.resolve({ name: "app.ts", path: "app.ts", kind: "file" })
    await waitFor(() => expect(onOpenFile).toHaveBeenCalledWith("app.ts"))
    expect(useUiStore.getState().draftByPath["app.ts"]).toBe("")
    expect(screen.getByRole("status")).toHaveTextContent("Created app.ts")
  })

  it("targets toolbar creation at the selected folder or selected file parent", async () => {
    const user = userEvent.setup()
    renderExplorer()
    const folder = await screen.findByRole("treeitem", { name: /src/ })

    await user.click(folder)
    await user.click(screen.getByRole("button", { name: "New Folder" }))
    await user.type(
      screen.getByRole("textbox", { name: "New folder name" }),
      "components",
    )
    await user.keyboard("{Enter}")
    await waitFor(() => expect(createProjectEntry).toHaveBeenCalledWith(
      project.id,
      "src/components",
      "dir",
    ))
    expect(screen.getByRole("treeitem", { name: /src/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    )

    const nestedFile = await screen.findByRole("treeitem", { name: /index\.ts/ })
    await user.click(nestedFile)
    await user.click(screen.getByRole("button", { name: "New File" }))
    await user.type(
      screen.getByRole("textbox", { name: "New file name" }),
      "next.ts",
    )
    await user.keyboard("{Enter}")
    await waitFor(() => expect(createProjectEntry).toHaveBeenCalledWith(
      project.id,
      "src/next.ts",
      "file",
    ))
  })

  it("cancels inline naming with Escape or blur without submitting", async () => {
    const user = userEvent.setup()
    renderExplorer()

    await user.click(screen.getByRole("button", { name: "New File" }))
    await user.type(
      screen.getByRole("textbox", { name: "New file name" }),
      "cancelled.ts",
    )
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("textbox", { name: "New file name" }))
      .not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "New Folder" }))
    const input = screen.getByRole("textbox", { name: "New folder name" })
    await user.type(input, "blurred")
    fireEvent.blur(input)
    expect(screen.queryByRole("textbox", { name: "New folder name" }))
      .not.toBeInTheDocument()
    expect(createProjectEntry).not.toHaveBeenCalled()
  })

  it("retains focus and the input for invalid, colliding, and API-rejected names", async () => {
    createProjectEntry.mockRejectedValueOnce(new Error("Storage is read-only"))
    const user = userEvent.setup()
    renderExplorer()

    await user.click(screen.getByRole("button", { name: "New File" }))
    const input = screen.getByRole("textbox", { name: "New file name" })
    await user.keyboard("{Enter}")
    expect(screen.getByRole("alert")).toHaveTextContent("Name is required")
    expect(input).toHaveFocus()

    await user.type(input, "bad/name.ts")
    await user.keyboard("{Enter}")
    expect(screen.getByRole("alert")).toHaveTextContent(
      "unsupported character",
    )
    expect(input).toHaveFocus()

    await user.clear(input)
    await user.type(input, "README.md")
    await user.keyboard("{Enter}")
    expect(screen.getByRole("alert")).toHaveTextContent("already exists")
    expect(input).toHaveFocus()
    expect(createProjectEntry).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, "new.ts")
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Storage is read-only",
    )
    expect(input).toHaveFocus()
    expect(input).toHaveValue("new.ts")
    expect(screen.getByRole("status")).toHaveTextContent(
      "Could not create new.ts",
    )
  })

  it("renames with F2, rejects sibling collisions, and keeps keyboard focus", async () => {
    const user = userEvent.setup()
    renderExplorer()
    const file = await screen.findByRole("treeitem", { name: /README\.md/ })

    file.focus()
    await user.keyboard("{F2}")
    const input = screen.getByRole("textbox", { name: "Rename README.md" })
    expect(input).toHaveFocus()
    await user.clear(input)
    await user.type(input, "src")
    await user.keyboard("{Enter}")
    expect(screen.getByRole("alert")).toHaveTextContent("already exists")
    expect(input).toHaveFocus()
    expect(moveProjectEntry).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, "GUIDE.md")
    await user.keyboard("{Enter}")
    await waitFor(() => expect(moveProjectEntry).toHaveBeenCalledWith(
      project.id,
      "README.md",
      "GUIDE.md",
    ))
    expect(screen.queryByRole("textbox", { name: "Rename README.md" }))
      .not.toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(
      "Renamed README.md to GUIDE.md",
    )
  })

  it("uses nested siblings and parent paths when renaming", async () => {
    const nestedEntries: ProjectEntry[] = [
      { name: "index.ts", path: "src/index.ts", kind: "file" },
      { name: "main.ts", path: "src/main.ts", kind: "file" },
    ]
    listProjectEntries.mockImplementation(
      (_projectId: string, path: string) =>
        Promise.resolve(path === "." ? rootEntries : path === "src" ? nestedEntries : []),
    )
    const user = userEvent.setup()
    renderExplorer()
    await user.click(await screen.findByRole("treeitem", { name: /src/ }))
    const file = await screen.findByRole("treeitem", { name: /index\.ts/ })

    file.focus()
    await user.keyboard("{F2}")
    const input = screen.getByRole("textbox", { name: "Rename index.ts" })
    await user.keyboard("{Enter}")
    expect(screen.getByRole("alert")).toHaveTextContent("unchanged")
    expect(input).toHaveFocus()

    await user.clear(input)
    await user.type(input, "main.ts")
    await user.keyboard("{Enter}")
    expect(screen.getByRole("alert")).toHaveTextContent("already exists")
    expect(moveProjectEntry).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, "entry.ts")
    await user.keyboard("{Enter}")
    await waitFor(() => expect(moveProjectEntry).toHaveBeenCalledWith(
      project.id,
      "src/index.ts",
      "src/entry.ts",
    ))
  })

  it("opens files and toggles folders with Enter", async () => {
    const onOpenFile = vi.fn()
    const user = userEvent.setup()
    renderExplorer({ onOpenFile })
    const folder = await screen.findByRole("treeitem", { name: /src/ })

    folder.focus()
    await user.keyboard("{Enter}")
    expect(folder).toHaveAttribute("aria-expanded", "true")
    const nestedFile = await screen.findByRole("treeitem", { name: /index\.ts/ })

    nestedFile.focus()
    await user.keyboard("{Enter}")
    expect(onOpenFile).toHaveBeenCalledWith("src/index.ts")

    folder.focus()
    await user.keyboard("{Enter}")
    expect(folder).toHaveAttribute("aria-expanded", "false")
  })

  it("targets folder context creation and expands a newly created folder", async () => {
    let currentRoot = [...rootEntries]
    listProjectEntries.mockImplementation(
      (_projectId: string, path: string) =>
        Promise.resolve(path === "." ? currentRoot : path === "src" ? srcEntries : []),
    )
    createProjectEntry.mockImplementationOnce(
      (_projectId: string, path: string, kind: ProjectEntry["kind"]) => {
        const created = { name: "assets", path, kind }
        currentRoot = [...currentRoot, created]
        return Promise.resolve(created)
      },
    )
    const user = userEvent.setup()
    renderExplorer()
    const folder = await screen.findByRole("treeitem", { name: /src/ })

    fireEvent.contextMenu(folder)
    await user.click(await screen.findByRole("menuitem", { name: "New File" }))
    await user.type(
      screen.getByRole("textbox", { name: "New file name" }),
      "nested.ts",
    )
    await user.keyboard("{Escape}")
    expect(createProjectEntry).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Collapse All" }))
    await user.click(screen.getByRole("button", { name: "New Folder" }))
    await user.type(
      screen.getByRole("textbox", { name: "New folder name" }),
      "assets",
    )
    await user.keyboard("{Enter}")
    const createdFolder = await screen.findByRole("treeitem", { name: /assets/ })
    expect(createdFolder).toHaveAttribute("aria-expanded", "true")
  })

  it("copies absolute Windows paths and announces clipboard failures", async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    renderExplorer()
    const file = await screen.findByRole("treeitem", { name: /README\.md/ })

    fireEvent.contextMenu(file)
    await user.click(await screen.findByRole("menuitem", { name: "Copy Path" }))
    expect(writeText).toHaveBeenCalledWith(
      "C:\\Projects\\sample-app\\README.md",
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "Copied C:\\Projects\\sample-app\\README.md",
    )

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
    fireEvent.contextMenu(screen.getByRole("tree"))
    await user.click(await screen.findByRole("menuitem", {
      name: "Copy Project Path",
    }))
    expect(screen.getByRole("status")).toHaveTextContent(
      "Clipboard access is unavailable",
    )
    expect(screen.getByRole("status")).toHaveTextContent(
      "C:\\Projects\\sample-app",
    )
  })

  it("refreshes every active project directory query and collapses folders", async () => {
    const user = userEvent.setup()
    renderExplorer()
    const folder = await screen.findByRole("treeitem", { name: /src/ })
    await user.click(folder)
    await screen.findByRole("treeitem", { name: /index\.ts/ })
    listProjectEntries.mockClear()

    await user.click(screen.getByRole("button", { name: "Refresh Explorer" }))
    await waitFor(() => {
      expect(listProjectEntries).toHaveBeenCalledWith(project.id, ".")
      expect(listProjectEntries).toHaveBeenCalledWith(project.id, "src")
    })
    expect(screen.getByRole("status")).toHaveTextContent(
      "Project files refreshed",
    )

    await user.click(screen.getByRole("button", { name: "Collapse All" }))
    expect(folder).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("treeitem", { name: /index\.ts/ }))
      .not.toBeInTheDocument()
  })

  it("selects the context target and disables every conflicting menu action while pending", async () => {
    const request = deferred<ProjectEntry>()
    createProjectEntry.mockReturnValueOnce(request.promise)
    const user = userEvent.setup()
    renderExplorer()
    const folder = await screen.findByRole("treeitem", { name: /src/ })

    fireEvent.contextMenu(folder)
    await user.click(await screen.findByRole("menuitem", { name: "New Folder" }))
    expect(useUiStore.getState().selectedProjectEntry).toEqual({
      projectId: project.id,
      path: "src",
      kind: "dir",
    })
    const input = screen.getByRole("textbox", { name: "New folder name" })
    await user.type(input, "pending")
    await user.keyboard("{Enter}")
    expect(input).toBeDisabled()

    fireEvent.contextMenu(screen.getByRole("tree"))
    const menu = await screen.findByRole("menu")
    for (const item of within(menu).getAllByRole("menuitem")) {
      expect(item).toHaveAttribute("data-disabled")
    }

    request.resolve({ name: "pending", path: "src/pending", kind: "dir" })
    await waitFor(() => expect(screen.queryByRole("textbox", {
      name: "New folder name",
    })).not.toBeInTheDocument())
  })

  it("rejects reserved dot-segment names and keeps the editor focused", async () => {
    const user = userEvent.setup()
    renderExplorer()

    await user.click(screen.getByRole("button", { name: "New File" }))
    const input = screen.getByRole("textbox", { name: "New file name" })
    await user.type(input, ".")
    await user.keyboard("{Enter}")
    expect(screen.getByRole("alert")).toHaveTextContent("reserved")
    expect(input).toHaveFocus()
    expect(createProjectEntry).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, "..")
    await user.keyboard("{Enter}")
    expect(screen.getByRole("alert")).toHaveTextContent("reserved")
    expect(input).toHaveFocus()
    expect(createProjectEntry).not.toHaveBeenCalled()
  })

  it("announces refresh failures and keeps nested folder errors recoverable", async () => {
    const user = userEvent.setup()
    listProjectEntries.mockImplementation(
      (_projectId: string, path: string) => {
        if (path === ".") return Promise.resolve(rootEntries)
        return Promise.reject(new Error("Directory disappeared"))
      },
    )
    renderExplorer()
    const folder = await screen.findByRole("treeitem", { name: /src/ })
    await user.click(folder)
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load src",
    )

    listProjectEntries.mockRejectedValue(new Error("Project root disappeared"))
    await user.click(screen.getByRole("button", { name: "Refresh Explorer" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(
      "Could not refresh",
    ))
    expect(screen.getByRole("status")).toHaveTextContent(
      "Project root disappeared",
    )
  })

  it("disables project-changing menu items while an entry mutation is pending", async () => {
    const request = deferred<ProjectEntry>()
    createProjectEntry.mockReturnValueOnce(request.promise)
    const user = userEvent.setup()
    renderExplorer()

    await user.click(screen.getByRole("button", { name: "New File" }))
    await user.type(screen.getByRole("textbox", { name: "New file name" }), "busy.ts")
    await user.keyboard("{Enter}")
    await user.click(screen.getByRole("button", { name: "Project menu" }))

    expect(screen.getByRole("menuitem", { name: "Copy File Path" }))
      .not.toHaveAttribute("data-disabled")
    expect(screen.getByRole("menuitem", { name: "Open project…" }))
      .toHaveAttribute("data-disabled")
    expect(screen.getByRole("menuitem", { name: "New project…" }))
      .toHaveAttribute("data-disabled")

    request.resolve({ name: "busy.ts", path: "busy.ts", kind: "file" })
    await waitFor(() => expect(screen.queryByRole("textbox", {
      name: "New file name",
    })).not.toBeInTheDocument())
  })

  it("keeps a renamed folder expanded at its destination", async () => {
    let currentRoot = [...rootEntries]
    listProjectEntries.mockImplementation(
      (_projectId: string, path: string) => {
        if (path === ".") return Promise.resolve(currentRoot)
        if (path === "src" || path === "lib") return Promise.resolve(srcEntries)
        return Promise.resolve([])
      },
    )
    moveProjectEntry.mockImplementation(
      (_projectId: string, _source: string, destination: string) => {
        currentRoot = currentRoot.map((entry) =>
          entry.path === "src"
            ? { name: "lib", path: destination, kind: "dir" }
            : entry,
        )
        return Promise.resolve({ name: "lib", path: destination, kind: "dir" })
      },
    )
    const user = userEvent.setup()
    renderExplorer()
    const folder = await screen.findByRole("treeitem", { name: /src/ })
    await user.click(folder)
    await screen.findByRole("treeitem", { name: /index\.ts/ })

    folder.focus()
    await user.keyboard("{F2}")
    const input = screen.getByRole("textbox", { name: "Rename src" })
    await user.clear(input)
    await user.type(input, "lib")
    await user.keyboard("{Enter}")

    const renamed = await screen.findByRole("treeitem", { name: /lib/ })
    expect(renamed).toHaveAttribute("aria-expanded", "true")
    expect(await screen.findByRole("treeitem", { name: /index\.ts/ }))
      .toBeInTheDocument()
  })

  it("cuts with Ctrl+X, pastes into the focused folder, and clears cut on success", async () => {
    stubMoveTree()
    const user = userEvent.setup()
    renderExplorer()
    const file = await expandSrcFile(user)

    file.focus()
    await user.keyboard("{Control>}x{/Control}")
    expect(file.querySelector(".file-tree__entry")).toHaveClass("is-cut")
    expect(screen.getByRole("status")).toHaveTextContent("Cut")
    expect(useUiStore.getState().cutEntry).toEqual({
      projectId: project.id,
      path: "src/app.ts",
      kind: "file",
    })

    const archive = screen.getByRole("treeitem", { name: "archive" })
    archive.focus()
    await user.keyboard("{Control>}v{/Control}")
    await waitFor(() => expect(moveProjectEntry).toHaveBeenCalledWith(
      "project_1",
      "src/app.ts",
      "archive/app.ts",
    ))
    expect(useUiStore.getState().cutEntry).toBeNull()
    expect(file.querySelector(".file-tree__entry")).not.toHaveClass("is-cut")
  })

  it("keeps cut state after a colliding paste and clears it with Escape", async () => {
    stubMoveTree()
    moveProjectEntry.mockRejectedValueOnce(new Error("Destination already exists"))
    const user = userEvent.setup()
    renderExplorer()
    const file = await expandSrcFile(user)

    file.focus()
    await user.keyboard("{Control>}x{/Control}")
    screen.getByRole("treeitem", { name: "archive" }).focus()
    await user.keyboard("{Control>}v{/Control}")
    await waitFor(() => expect(moveProjectEntry).toHaveBeenCalledWith(
      "project_1",
      "src/app.ts",
      "archive/app.ts",
    ))
    expect(useUiStore.getState().cutEntry?.path).toBe("src/app.ts")
    expect(file.querySelector(".file-tree__entry")).toHaveClass("is-cut")
    expect(screen.getByRole("status")).toHaveTextContent("already exists")

    file.focus()
    await user.keyboard("{Escape}")
    expect(useUiStore.getState().cutEntry).toBeNull()
    expect(file.querySelector(".file-tree__entry")).not.toHaveClass("is-cut")
  })

  it("clears cut state when project switching calls clearFiles", async () => {
    stubMoveTree()
    const user = userEvent.setup()
    renderExplorer()
    const file = await expandSrcFile(user)

    file.focus()
    await user.keyboard("{Control>}x{/Control}")
    expect(useUiStore.getState().cutEntry?.path).toBe("src/app.ts")

    useUiStore.getState().clearFiles()
    await waitFor(() => {
      expect(useUiStore.getState().cutEntry).toBeNull()
      expect(file.querySelector(".file-tree__entry")).not.toHaveClass("is-cut")
    })
  })

  it("moves a dragged file onto a folder or the project root", async () => {
    stubMoveTree()
    const user = userEvent.setup()
    renderExplorer()
    const file = await expandSrcFile(user)
    const archive = screen.getByRole("treeitem", { name: "archive" })
    const tree = screen.getByRole("tree")

    expect(file).toHaveAttribute("draggable", "true")
    fireEvent.dragStart(file)
    fireEvent.dragOver(archive)
    expect(archive.querySelector(".file-tree__entry")).toHaveClass("is-drop-target")
    expect(screen.getByRole("status")).toHaveTextContent("archive")

    fireEvent.drop(archive)
    await waitFor(() => expect(moveProjectEntry).toHaveBeenCalledWith(
      "project_1",
      "src/app.ts",
      "archive/app.ts",
    ))

    moveProjectEntry.mockClear()
    fireEvent.dragStart(file)
    fireEvent.dragOver(tree)
    expect(tree).toHaveClass("is-drop-target")
    expect(screen.getByRole("status")).toHaveTextContent("root")
    fireEvent.drop(tree)
    await waitFor(() => expect(moveProjectEntry).toHaveBeenCalledWith(
      "project_1",
      "src/app.ts",
      "app.ts",
    ))
  })

  it("does not move when dropping into the current parent or a descendant", async () => {
    stubMoveTree()
    const user = userEvent.setup()
    renderExplorer()
    const file = await expandSrcFile(user)
    const src = screen.getByRole("treeitem", { name: "src" })
    const nested = await screen.findByRole("treeitem", { name: "nested" })

    fireEvent.dragStart(file)
    fireEvent.dragOver(src)
    expect(src.querySelector(".file-tree__entry")).not.toHaveClass("is-drop-target")
    fireEvent.drop(src)
    expect(moveProjectEntry).not.toHaveBeenCalled()

    fireEvent.dragStart(src)
    fireEvent.dragOver(nested)
    expect(nested.querySelector(".file-tree__entry")).not.toHaveClass("is-drop-target")
    fireEvent.drop(nested)
    expect(moveProjectEntry).not.toHaveBeenCalled()
  })

  it("clears cut state after a successful drag-and-drop move", async () => {
    stubMoveTree()
    const user = userEvent.setup()
    renderExplorer()
    const file = await expandSrcFile(user)
    file.focus()
    await user.keyboard("{Control>}x{/Control}")
    expect(useUiStore.getState().cutEntry?.path).toBe("src/app.ts")

    fireEvent.dragStart(file)
    fireEvent.drop(screen.getByRole("treeitem", { name: "archive" }))
    await waitFor(() => expect(moveProjectEntry).toHaveBeenCalledWith(
      "project_1",
      "src/app.ts",
      "archive/app.ts",
    ))
    expect(useUiStore.getState().cutEntry).toBeNull()
  })

  it("names the file path in the delete confirmation dialog", async () => {
    const user = userEvent.setup()
    renderExplorer()

    const dialog = await openDeleteDialog(user, "README.md")
    expect(dialog).toHaveTextContent("README.md")
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus()
    expect(dialog).not.toHaveTextContent(/unsaved changes will be discarded/i)
  })

  it("warns that unsaved changes will be discarded for a dirty open file", async () => {
    useUiStore.getState().openFile("README.md")
    useUiStore.getState().seedFileDraft("README.md", "")
    useUiStore.getState().setFileDraft("README.md", "edited")
    const user = userEvent.setup()
    renderExplorer()

    expect(await openDeleteDialog(user, "README.md")).toHaveTextContent(
      /unsaved changes will be discarded/i,
    )
  })

  it("confirms recursive folder deletion and calls deleteProjectEntry", async () => {
    const user = userEvent.setup()
    renderExplorer()

    const dialog = await openDeleteDialog(user, "src")
    expect(dialog).toHaveTextContent(/all descendants will be permanently removed/i)
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(deleteProjectEntry).toHaveBeenCalledWith(
      "project_1",
      "src",
      true,
    ))
  })

  it("cancels deletion without mutating tabs or drafts", async () => {
    useUiStore.getState().openFile("README.md")
    useUiStore.getState().seedFileDraft("README.md", "keep me")
    const user = userEvent.setup()
    renderExplorer()

    const dialog = await openDeleteDialog(user, "README.md")
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }))

    expect(deleteProjectEntry).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(useUiStore.getState().openFiles).toEqual(["README.md"])
    expect(useUiStore.getState().draftByPath["README.md"]).toBe("keep me")
    await user.click(screen.getByRole("button", { name: "New File" }))
    expect(await screen.findByRole("textbox", { name: /new file name/i })).toBeInTheDocument()
  })

  it("opens the same delete dialog when Delete is pressed on a focused row", async () => {
    const user = userEvent.setup()
    renderExplorer()
    const file = await screen.findByRole("treeitem", { name: "README.md" })

    file.focus()
    await user.keyboard("{Delete}")

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("README.md")
  })

  it("focuses the next sibling after deleting the middle of three visible rows", async () => {
    stubDeleteSiblings()
    const user = userEvent.setup()
    renderExplorer()
    await user.click(await screen.findByRole("treeitem", { name: "src" }))
    await screen.findByRole("treeitem", { name: "b.ts" })

    const dialog = await openDeleteDialog(user, "b.ts")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(deleteProjectEntry).toHaveBeenCalledWith(
      "project_1",
      "src/b.ts",
      false,
    ))
    await waitFor(() => expect(
      screen.getByRole("treeitem", { name: "c.ts" }),
    ).toHaveFocus())
  })

  it("focuses the previous sibling after deleting the last of three visible rows", async () => {
    stubDeleteSiblings()
    const user = userEvent.setup()
    renderExplorer()
    await user.click(await screen.findByRole("treeitem", { name: "src" }))
    await screen.findByRole("treeitem", { name: "c.ts" })

    const dialog = await openDeleteDialog(user, "c.ts")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(
      screen.getByRole("treeitem", { name: "b.ts" }),
    ).toHaveFocus())
  })

  it("focuses the parent after deleting the only visible child", async () => {
    let srcChildren: ProjectEntry[] = [...srcEntries]
    listProjectEntries.mockImplementation(
      (_projectId: string, path: string) => {
        if (path === ".") return Promise.resolve(rootEntries)
        if (path === "src") return Promise.resolve(srcChildren)
        return Promise.resolve([])
      },
    )
    deleteProjectEntry.mockImplementation(
      (_projectId: string, path: string) => {
        srcChildren = srcChildren.filter((entry) => entry.path !== path)
        return Promise.resolve({
          name: "index.ts",
          path,
          kind: "file",
        })
      },
    )
    const user = userEvent.setup()
    renderExplorer()
    await user.click(await screen.findByRole("treeitem", { name: "src" }))
    await screen.findByRole("treeitem", { name: "index.ts" })

    const dialog = await openDeleteDialog(user, "index.ts")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(
      screen.getByRole("treeitem", { name: "src" }),
    ).toHaveFocus())
  })

  it("keeps the delete dialog open and shows an error when deletion fails", async () => {
    deleteProjectEntry.mockRejectedValueOnce(new Error("Directory is not empty"))
    const user = userEvent.setup()
    renderExplorer()

    const dialog = await openDeleteDialog(user, "src")
    await user.click(within(dialog).getByRole("button", { name: "Delete" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Directory is not empty")
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(deleteProjectEntry).toHaveBeenCalledWith("project_1", "src", true)
  })
})
