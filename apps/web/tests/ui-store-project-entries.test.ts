import { beforeEach, describe, expect, it } from "vitest"

import { useUiStore } from "@/stores/ui-store"

describe("project entry editor state", () => {
  beforeEach(() => {
    useUiStore.getState().clearFiles()
  })

  it("seeds, edits, and saves file drafts", () => {
    const store = useUiStore.getState()

    store.seedFileDraft("src/App.tsx", "server content")
    expect(useUiStore.getState().draftByPath["src/App.tsx"]).toBe(
      "server content",
    )
    expect(useUiStore.getState().dirtyPaths["src/App.tsx"]).toBe(false)

    store.setFileDraft("src/App.tsx", "local content")
    expect(useUiStore.getState().draftByPath["src/App.tsx"]).toBe(
      "local content",
    )
    expect(useUiStore.getState().dirtyPaths["src/App.tsx"]).toBe(true)

    store.markFileSaved("src/App.tsx")
    expect(useUiStore.getState().dirtyPaths["src/App.tsx"]).toBe(false)
  })

  it("sets project-scoped selection and cut entries", () => {
    const selected = {
      projectId: "project_a",
      path: "src",
      kind: "dir" as const,
    }
    const cut = {
      projectId: "project_b",
      path: "README.md",
      kind: "file" as const,
    }

    useUiStore.getState().selectProjectEntry(selected)
    useUiStore.getState().setCutEntry(cut)

    expect(useUiStore.getState().selectedProjectEntry).toEqual(selected)
    expect(useUiStore.getState().cutEntry).toEqual(cut)
    useUiStore.getState().selectProjectEntry(null)
    useUiStore.getState().setCutEntry(null)
    expect(useUiStore.getState().selectedProjectEntry).toBeNull()
    expect(useUiStore.getState().cutEntry).toBeNull()
  })

  it("normalizes file, draft, selection, and cut paths at ingress", () => {
    const store = useUiStore.getState()

    store.openFile(".\\src\\App.tsx")
    store.seedFileDraft("src\\App.tsx", "server content")
    store.setFileDraft(".\\src\\App.tsx", "local content")
    store.markFileSaved("src\\App.tsx")
    store.selectProjectEntry({
      projectId: "project_a",
      path: "src\\components",
      kind: "dir",
    })
    store.setCutEntry({
      projectId: "project_a",
      path: ".\\src\\App.tsx",
      kind: "file",
    })

    expect(useUiStore.getState()).toMatchObject({
      activeFile: "src/App.tsx",
      openFiles: ["src/App.tsx"],
      draftByPath: { "src/App.tsx": "local content" },
      dirtyPaths: { "src/App.tsx": false },
      selectedProjectEntry: {
        projectId: "project_a",
        path: "src/components",
        kind: "dir",
      },
      cutEntry: {
        projectId: "project_a",
        path: "src/App.tsx",
        kind: "file",
      },
    })
  })

  it("treats equivalent normalized relocations as a complete no-op", () => {
    const store = useUiStore.getState()
    store.openFile("src\\App.tsx")
    store.seedFileDraft("src\\App.tsx", "draft")
    const stateBeforeRelocation = useUiStore.getState()

    store.relocatePath(".\\src", "src\\")

    expect(useUiStore.getState()).toBe(stateBeforeRelocation)
    expect(useUiStore.getState().draftByPath).toEqual({
      "src/App.tsx": "draft",
    })
  })

  it("relocates exact paths and descendants while preserving sibling prefixes", () => {
    useUiStore.setState({
      activeFile: "src/components/App.tsx",
      openFiles: [
        "src/components/App.tsx",
        "src/index.ts",
        "source/index.ts",
      ],
      draftByPath: {
        "src/components/App.tsx": "draft",
        "source/index.ts": "sibling",
      },
      dirtyPaths: {
        "src/components/App.tsx": true,
        "source/index.ts": false,
      },
      selectedProjectEntry: {
        projectId: "project_a",
        path: "src/components",
        kind: "dir",
      },
      cutEntry: {
        projectId: "project_a",
        path: "src/index.ts",
        kind: "file",
      },
    })

    useUiStore.getState().relocatePath("src", "app")

    const state = useUiStore.getState()
    expect(state.activeFile).toBe("app/components/App.tsx")
    expect(state.openFiles).toEqual([
      "app/components/App.tsx",
      "app/index.ts",
      "source/index.ts",
    ])
    expect(state.draftByPath).toEqual({
      "app/components/App.tsx": "draft",
      "source/index.ts": "sibling",
    })
    expect(state.dirtyPaths).toEqual({
      "app/components/App.tsx": true,
      "source/index.ts": false,
    })
    expect(state.selectedProjectEntry?.path).toBe("app/components")
    expect(state.cutEntry?.path).toBe("app/index.ts")
  })

  it("lets relocated records win destination-key collisions", () => {
    useUiStore.setState({
      draftByPath: {
        "src/App.tsx": "moved draft",
        "app/App.tsx": "stale destination",
      },
      dirtyPaths: {
        "src/App.tsx": true,
        "app/App.tsx": false,
      },
    })

    useUiStore.getState().relocatePath("src", "app")

    expect(useUiStore.getState().draftByPath).toEqual({
      "app/App.tsx": "moved draft",
    })
    expect(useUiStore.getState().dirtyPaths).toEqual({
      "app/App.tsx": true,
    })
  })

  it("deduplicates relocated tab collisions in stable order", () => {
    const store = useUiStore.getState()
    store.openFile("app/App.tsx")
    store.openFile("src/App.tsx")
    store.openFile("src/Other.tsx")
    store.openFile("src/App.tsx")

    store.relocatePath("src", "app")

    expect(useUiStore.getState().openFiles).toEqual([
      "app/App.tsx",
      "app/Other.tsx",
    ])
    expect(useUiStore.getState().activeFile).toBe("app/App.tsx")
    expect(useUiStore.getState().openFiles).toContain(
      useUiStore.getState().activeFile,
    )
  })

  it("does not remap scoped entries belonging to another project", () => {
    useUiStore.setState({
      selectedProjectEntry: {
        projectId: "project_b",
        path: "src",
        kind: "dir",
      },
      cutEntry: {
        projectId: "project_a",
        path: "src/App.tsx",
        kind: "file",
      },
    })

    useUiStore.getState().relocatePath("src", "app", "project_a")

    expect(useUiStore.getState().selectedProjectEntry?.path).toBe("src")
    expect(useUiStore.getState().cutEntry?.path).toBe("app/App.tsx")
  })

  it("treats relocating a path to itself as a no-op", () => {
    useUiStore.setState({
      activeFile: "src/App.tsx",
      openFiles: ["src/App.tsx"],
      draftByPath: { "src/App.tsx": "draft" },
      dirtyPaths: { "src/App.tsx": true },
    })

    useUiStore.getState().relocatePath("src", "src")

    expect(useUiStore.getState()).toMatchObject({
      activeFile: "src/App.tsx",
      openFiles: ["src/App.tsx"],
      draftByPath: { "src/App.tsx": "draft" },
      dirtyPaths: { "src/App.tsx": true },
    })
  })

  it("removes only a matching subtree and falls back to the last open file", () => {
    useUiStore.setState({
      activeFile: "app/components/App.tsx",
      openFiles: [
        "README.md",
        "app/components/App.tsx",
        "app/index.ts",
        "app-other/index.ts",
      ],
      draftByPath: {
        "app/components/App.tsx": "draft",
        "app-other/index.ts": "sibling",
      },
      dirtyPaths: {
        "app/components/App.tsx": true,
        "app-other/index.ts": false,
      },
      selectedProjectEntry: {
        projectId: "project_a",
        path: "app/components",
        kind: "dir",
      },
      cutEntry: {
        projectId: "project_a",
        path: "app/index.ts",
        kind: "file",
      },
    })

    useUiStore.getState().removePathTree("app")

    const state = useUiStore.getState()
    expect(state.openFiles).toEqual(["README.md", "app-other/index.ts"])
    expect(state.activeFile).toBe("app-other/index.ts")
    expect(state.draftByPath).toEqual({
      "app-other/index.ts": "sibling",
    })
    expect(state.dirtyPaths).toEqual({
      "app-other/index.ts": false,
    })
    expect(state.selectedProjectEntry).toBeNull()
    expect(state.cutEntry).toBeNull()
  })

  it("normalizes backslash subtree-removal boundaries", () => {
    const store = useUiStore.getState()
    store.openFile("README.md")
    store.openFile("src\\components\\App.tsx")
    store.seedFileDraft("src\\components\\App.tsx", "draft")

    store.removePathTree(".\\src\\components\\")

    expect(useUiStore.getState()).toMatchObject({
      activeFile: "README.md",
      openFiles: ["README.md"],
      draftByPath: {},
      dirtyPaths: {},
    })
  })

  it("does not remove scoped entries belonging to another project", () => {
    useUiStore.setState({
      selectedProjectEntry: {
        projectId: "project_b",
        path: "app",
        kind: "dir",
      },
      cutEntry: {
        projectId: "project_a",
        path: "app/App.tsx",
        kind: "file",
      },
    })

    useUiStore.getState().removePathTree("app", "project_a")

    expect(useUiStore.getState().selectedProjectEntry?.path).toBe("app")
    expect(useUiStore.getState().cutEntry).toBeNull()
  })

  it("clears all file and project-entry state", () => {
    useUiStore.setState({
      activeFile: "src/App.tsx",
      openFiles: ["src/App.tsx"],
      draftByPath: { "src/App.tsx": "draft" },
      dirtyPaths: { "src/App.tsx": true },
      selectedProjectEntry: {
        projectId: "project_a",
        path: "src/App.tsx",
        kind: "file",
      },
      cutEntry: {
        projectId: "project_a",
        path: "src/App.tsx",
        kind: "file",
      },
    })

    useUiStore.getState().clearFiles()

    expect(useUiStore.getState()).toMatchObject({
      activeFile: null,
      openFiles: [],
      draftByPath: {},
      dirtyPaths: {},
      selectedProjectEntry: null,
      cutEntry: null,
    })
  })
})
