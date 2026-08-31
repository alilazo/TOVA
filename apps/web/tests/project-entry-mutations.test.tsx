import type { PropsWithChildren } from "react"
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiRequest } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  apiRequest,
}))

import {
  createProjectEntry,
  deleteProjectEntry,
  moveProjectEntry,
  type ProjectEntry,
} from "@/features/projects/project-api"
import { useProjectEntryMutations } from "@/features/projects/use-project-entry-mutations"
import { useUiStore } from "@/stores/ui-store"

function projectEntry(path: string, kind: ProjectEntry["kind"]): ProjectEntry {
  return {
    name: path.split("/").at(-1) ?? path,
    path,
    kind,
  }
}

function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    )
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe("project entry API", () => {
  beforeEach(() => {
    apiRequest.mockReset()
  })

  it("creates an entry with the exact POST body", async () => {
    const entry = projectEntry("src/components", "dir")
    apiRequest.mockResolvedValueOnce(entry)

    await expect(
      createProjectEntry("project_a", "src/components", "dir"),
    ).resolves.toEqual(entry)
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/projects/project_a/entries",
      {
        method: "POST",
        body: JSON.stringify({ path: "src/components", kind: "dir" }),
      },
    )
  })

  it("moves an entry with the exact PATCH body", async () => {
    const entry = projectEntry("app", "dir")
    apiRequest.mockResolvedValueOnce(entry)

    await expect(
      moveProjectEntry("project_a", "src", "app"),
    ).resolves.toEqual(entry)
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/projects/project_a/entries",
      {
        method: "PATCH",
        body: JSON.stringify({
          source_path: "src",
          destination_path: "app",
        }),
      },
    )
  })

  it("deletes an entry with the exact DELETE body", async () => {
    const entry = projectEntry("build", "dir")
    apiRequest.mockResolvedValueOnce(entry)

    await expect(
      deleteProjectEntry("project_a", "build", true),
    ).resolves.toEqual(entry)
    expect(apiRequest).toHaveBeenCalledWith(
      "/api/projects/project_a/entries",
      {
        method: "DELETE",
        body: JSON.stringify({ path: "build", recursive: true }),
      },
    )
  })
})

describe("useProjectEntryMutations", () => {
  beforeEach(() => {
    apiRequest.mockReset()
    useUiStore.getState().clearFiles()
  })

  it("creates without changing editor state and invalidates only submitted project data", async () => {
    const client = createClient()
    client.setQueryData(["project-entries", "project_a", "."], [])
    client.setQueryData(["project-entries", "project_a", "src"], [])
    client.setQueryData(["project-entries", "project_b", "."], [])
    client.setQueryData(["project-references", "project_a", "button"], [])
    client.setQueryData(["project-references", "project_b", "button"], [])
    client.setQueryData(["project-file", "project_a", "src/existing.ts"], {
      path: "src/existing.ts",
      content: "draft",
    })
    useUiStore.setState({
      activeFile: "src/existing.ts",
      openFiles: ["src/existing.ts"],
      draftByPath: { "src/existing.ts": "draft" },
      dirtyPaths: { "src/existing.ts": true },
    })
    const editorState = {
      activeFile: useUiStore.getState().activeFile,
      openFiles: useUiStore.getState().openFiles,
      draftByPath: useUiStore.getState().draftByPath,
      dirtyPaths: useUiStore.getState().dirtyPaths,
    }
    apiRequest.mockResolvedValueOnce(projectEntry("src/new.ts", "file"))
    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      { wrapper: wrapperFor(client) },
    )

    await act(async () => {
      await result.current.createEntry("src/new.ts", "file")
    })

    expect(useUiStore.getState()).toMatchObject(editorState)
    expect(client.getQueryState(
      ["project-entries", "project_a", "."],
    )?.isInvalidated).toBe(true)
    expect(client.getQueryState(
      ["project-entries", "project_a", "src"],
    )?.isInvalidated).toBe(true)
    expect(client.getQueryState(
      ["project-references", "project_a", "button"],
    )?.isInvalidated).toBe(true)
    expect(client.getQueryState(
      ["project-entries", "project_b", "."],
    )?.isInvalidated).toBe(false)
    expect(client.getQueryState(
      ["project-references", "project_b", "button"],
    )?.isInvalidated).toBe(false)
    expect(client.getQueryState(
      ["project-file", "project_a", "src/existing.ts"],
    )).toBeDefined()
  })

  it("relocates submitted project state before removing and invalidating caches", async () => {
    const client = createClient()
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
        path: "src",
        kind: "dir",
      },
    })
    const cacheEffects: string[] = []
    vi.spyOn(client, "removeQueries").mockImplementation(() => {
      cacheEffects.push(useUiStore.getState().activeFile ?? "none")
    })
    vi.spyOn(client, "invalidateQueries").mockImplementation(() => {
      cacheEffects.push(useUiStore.getState().activeFile ?? "none")
      return Promise.resolve()
    })
    apiRequest.mockResolvedValueOnce(projectEntry("app", "dir"))
    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      { wrapper: wrapperFor(client) },
    )

    await act(async () => {
      await result.current.moveEntry("src", "app")
    })

    expect(useUiStore.getState()).toMatchObject({
      activeFile: "app/App.tsx",
      openFiles: ["app/App.tsx"],
      draftByPath: { "app/App.tsx": "draft" },
      dirtyPaths: { "app/App.tsx": true },
      selectedProjectEntry: {
        projectId: "project_a",
        path: "app/App.tsx",
        kind: "file",
      },
      cutEntry: {
        projectId: "project_a",
        path: "app",
        kind: "dir",
      },
    })
    expect(cacheEffects).not.toHaveLength(0)
    expect(cacheEffects.every((path) => path === "app/App.tsx")).toBe(true)
  })

  it("removes only old file queries within a moved source", async () => {
    const client = createClient()
    const removed = ["src/App.tsx", "src/components/Button.tsx"] as const
    const retained = [
      ["project-file", "project_a", "source/App.tsx"],
      ["project-file", "project_a", "src-other/App.tsx"],
      ["project-file", "project_b", "src/App.tsx"],
      ["project-file-revision", "project_a", "src/App.tsx"],
    ] as const
    for (const path of removed) {
      client.setQueryData(["project-file", "project_a", path], path)
    }
    for (const key of retained) client.setQueryData(key, key)
    client.setQueryData(["project-entries", "project_a", "."], [])
    client.setQueryData(["project-references", "project_a", "App"], [])
    apiRequest.mockResolvedValueOnce(projectEntry("app", "dir"))
    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      { wrapper: wrapperFor(client) },
    )

    await act(async () => {
      await result.current.moveEntry("src", "app")
    })

    for (const path of removed) {
      expect(client.getQueryState(
        ["project-file", "project_a", path],
      )).toBeUndefined()
    }
    for (const key of retained) {
      expect(client.getQueryState(key)).toBeDefined()
    }
    expect(client.getQueryState(
      ["project-entries", "project_a", "."],
    )?.isInvalidated).toBe(true)
    expect(client.getQueryState(
      ["project-references", "project_a", "App"],
    )?.isInvalidated).toBe(true)
  })

  it("settles a move while a source directory query is still fetching", async () => {
    const client = createClient()
    const hanging = deferred<ProjectEntry[]>()
    apiRequest.mockResolvedValueOnce(projectEntry("lib/src", "dir"))

    function Host({ children }: PropsWithChildren) {
      useQuery({
        queryKey: ["project-entries", "project_a", "src"],
        queryFn: () => hanging.promise,
        retry: false,
      })
      useQuery({
        queryKey: ["project-entries", "project_a", "."],
        queryFn: () => Promise.resolve([projectEntry("src", "dir")]),
        retry: false,
      })
      return children
    }

    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>
            <Host>{children}</Host>
          </QueryClientProvider>
        ),
      },
    )

    await waitFor(() => {
      expect(client.getQueryState(
        ["project-entries", "project_a", "src"],
      )?.fetchStatus).toBe("fetching")
    })

    await act(async () => {
      await result.current.moveEntry("src", "lib/src")
    })

    expect(result.current.pending).toBe(false)
    expect(client.getQueryState(
      ["project-entries", "project_a", "."],
    )?.fetchStatus).toBe("idle")
  })

  it("keeps a successful move when directory refresh fails", async () => {
    const client = createClient()
    let listingCalls = 0
    apiRequest.mockResolvedValueOnce(projectEntry("lib/src", "dir"))

    function Host({ children }: PropsWithChildren) {
      useQuery({
        queryKey: ["project-entries", "project_a", "."],
        queryFn: () => {
          listingCalls += 1
          if (listingCalls > 1) return Promise.reject(new Error("stale listing"))
          return Promise.resolve([projectEntry("src", "dir")])
        },
        retry: false,
      })
      return children
    }

    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={client}>
            <Host>{children}</Host>
          </QueryClientProvider>
        ),
      },
    )

    await waitFor(() => {
      expect(client.getQueryState(
        ["project-entries", "project_a", "."],
      )?.status).toBe("success")
    })

    await act(async () => {
      await result.current.moveEntry("src", "lib/src")
    })

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()
    expect(useUiStore.getState().cutEntry).toBeNull()
  })

  it("deletes submitted project state and file queries by subtree", async () => {
    const client = createClient()
    useUiStore.setState({
      activeFile: "build/report.txt",
      openFiles: ["README.md", "build/report.txt"],
      draftByPath: { "build/report.txt": "draft" },
      dirtyPaths: { "build/report.txt": true },
      selectedProjectEntry: {
        projectId: "project_b",
        path: "build",
        kind: "dir",
      },
      cutEntry: {
        projectId: "project_a",
        path: "build/report.txt",
        kind: "file",
      },
    })
    client.setQueryData(
      ["project-file", "project_a", "build/report.txt"],
      "report",
    )
    client.setQueryData(
      ["project-file", "project_a", "build-other/report.txt"],
      "sibling",
    )
    client.setQueryData(
      ["project-file", "project_b", "build/report.txt"],
      "other project",
    )
    client.setQueryData(["project-entries", "project_a", "."], [])
    client.setQueryData(["project-references", "project_a", "report"], [])
    apiRequest.mockResolvedValueOnce(projectEntry("build", "dir"))
    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      { wrapper: wrapperFor(client) },
    )

    await act(async () => {
      await result.current.deleteEntry("build", true)
    })

    expect(useUiStore.getState()).toMatchObject({
      activeFile: "README.md",
      openFiles: ["README.md"],
      draftByPath: {},
      dirtyPaths: {},
      selectedProjectEntry: {
        projectId: "project_b",
        path: "build",
        kind: "dir",
      },
      cutEntry: null,
    })
    expect(client.getQueryState(
      ["project-file", "project_a", "build/report.txt"],
    )).toBeUndefined()
    expect(client.getQueryState(
      ["project-file", "project_a", "build-other/report.txt"],
    )).toBeDefined()
    expect(client.getQueryState(
      ["project-file", "project_b", "build/report.txt"],
    )).toBeDefined()
    expect(client.getQueryState(
      ["project-entries", "project_a", "."],
    )?.isInvalidated).toBe(true)
    expect(client.getQueryState(
      ["project-references", "project_a", "report"],
    )?.isInvalidated).toBe(true)
  })

  it("preserves the server error and failed cut context", async () => {
    const client = createClient()
    const cutEntry = {
      projectId: "project_a",
      path: "src",
      kind: "dir" as const,
    }
    useUiStore.getState().setCutEntry(cutEntry)
    client.setQueryData(["project-entries", "project_a", "."], [])
    apiRequest.mockRejectedValueOnce(new Error("Destination already exists"))
    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      { wrapper: wrapperFor(client) },
    )

    await act(async () => {
      await expect(result.current.moveEntry("src", "app")).rejects.toThrow(
        "Destination already exists",
      )
    })

    expect(result.current.error).toBe("Destination already exists")
    expect(useUiStore.getState().cutEntry).toEqual(cutEntry)
    expect(client.getQueryState(
      ["project-entries", "project_a", "."],
    )?.isInvalidated).toBe(false)
  })

  it("keeps pending and delayed errors scoped to the submitted project", async () => {
    const client = createClient()
    const request = deferred<ProjectEntry>()
    apiRequest.mockReturnValueOnce(request.promise)
    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectEntryMutations(projectId),
      {
        initialProps: { projectId: "project_a" },
        wrapper: wrapperFor(client),
      },
    )
    let action!: Promise<ProjectEntry>

    act(() => {
      action = result.current.createEntry("pending.ts", "file")
    })
    await waitFor(() => expect(result.current.pending).toBe(true))

    rerender({ projectId: "project_b" })
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()

    const failure = expect(action).rejects.toThrow("Project A failed")
    await act(async () => {
      request.reject(new Error("Project A failed"))
      await failure
    })

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()

    rerender({ projectId: "project_a" })
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBe("Project A failed")
  })

  it("ignores an older failure after the latest submission succeeds", async () => {
    const client = createClient()
    const older = deferred<ProjectEntry>()
    const newer = deferred<ProjectEntry>()
    apiRequest
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      { wrapper: wrapperFor(client) },
    )
    let olderAction!: Promise<ProjectEntry>
    let newerAction!: Promise<ProjectEntry>

    act(() => {
      olderAction = result.current.createEntry("older.ts", "file")
      newerAction = result.current.createEntry("newer.ts", "file")
    })
    const olderFailure = expect(olderAction).rejects.toThrow("Older failed")
    await act(async () => {
      newer.resolve(projectEntry("newer.ts", "file"))
      await newerAction
    })
    expect(result.current.pending).toBe(true)
    expect(result.current.error).toBeNull()

    await act(async () => {
      older.reject(new Error("Older failed"))
      await olderFailure
    })

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it("retains a newer failure when an older failure settles later", async () => {
    const client = createClient()
    const older = deferred<ProjectEntry>()
    const newer = deferred<ProjectEntry>()
    apiRequest
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      { wrapper: wrapperFor(client) },
    )
    let olderAction!: Promise<ProjectEntry>
    let newerAction!: Promise<ProjectEntry>

    act(() => {
      olderAction = result.current.createEntry("older.ts", "file")
      newerAction = result.current.createEntry("newer.ts", "file")
    })
    const olderFailure = expect(olderAction).rejects.toThrow("Older failed")
    const newerFailure = expect(newerAction).rejects.toThrow("Newer failed")
    await act(async () => {
      newer.reject(new Error("Newer failed"))
      await newerFailure
    })
    expect(result.current.pending).toBe(true)
    expect(result.current.error).toBe("Newer failed")

    await act(async () => {
      older.reject(new Error("Older failed"))
      await olderFailure
    })

    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBe("Newer failed")
  })

  it("tracks all overlapping requests for the current project", async () => {
    const client = createClient()
    const first = deferred<ProjectEntry>()
    const second = deferred<ProjectEntry>()
    apiRequest
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(
      () => useProjectEntryMutations("project_a"),
      { wrapper: wrapperFor(client) },
    )
    let firstAction!: Promise<ProjectEntry>
    let secondAction!: Promise<ProjectEntry>

    act(() => {
      firstAction = result.current.createEntry("one.ts", "file")
      secondAction = result.current.createEntry("two.ts", "file")
    })
    await waitFor(() => expect(result.current.pending).toBe(true))

    await act(async () => {
      second.resolve(projectEntry("two.ts", "file"))
      await secondAction
    })
    expect(result.current.pending).toBe(true)

    await act(async () => {
      first.resolve(projectEntry("one.ts", "file"))
      await firstAction
    })
    expect(result.current.pending).toBe(false)
  })

  it("applies delayed success to the submitted project after a project change", async () => {
    const client = createClient()
    const move = deferred<ProjectEntry>()
    apiRequest.mockReturnValueOnce(move.promise)
    useUiStore.setState({
      selectedProjectEntry: {
        projectId: "project_b",
        path: "src",
        kind: "dir",
      },
      cutEntry: {
        projectId: "project_a",
        path: "src",
        kind: "dir",
      },
    })
    client.setQueryData(["project-entries", "project_a", "."], [])
    client.setQueryData(["project-entries", "project_b", "."], [])
    client.setQueryData(["project-references", "project_a", "src"], [])
    client.setQueryData(["project-references", "project_b", "src"], [])
    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectEntryMutations(projectId),
      {
        initialProps: { projectId: "project_a" },
        wrapper: wrapperFor(client),
      },
    )
    let action!: Promise<ProjectEntry>

    act(() => {
      action = result.current.moveEntry("src", "app")
    })
    rerender({ projectId: "project_b" })
    await act(async () => {
      move.resolve(projectEntry("app", "dir"))
      await action
    })

    expect(useUiStore.getState().selectedProjectEntry).toEqual({
      projectId: "project_b",
      path: "src",
      kind: "dir",
    })
    expect(useUiStore.getState().cutEntry).toEqual({
      projectId: "project_a",
      path: "app",
      kind: "dir",
    })
    expect(client.getQueryState(
      ["project-entries", "project_a", "."],
    )?.isInvalidated).toBe(true)
    expect(client.getQueryState(
      ["project-references", "project_a", "src"],
    )?.isInvalidated).toBe(true)
    expect(client.getQueryState(
      ["project-entries", "project_b", "."],
    )?.isInvalidated).toBe(false)
    expect(client.getQueryState(
      ["project-references", "project_b", "src"],
    )?.isInvalidated).toBe(false)
  })

  it("refreshes every entry query for the currently active project", async () => {
    const client = createClient()
    client.setQueryData(["project-entries", "project_a", "."], [])
    client.setQueryData(["project-entries", "project_b", "."], [])
    client.setQueryData(["project-entries", "project_b", "src"], [])
    client.setQueryData(["project-references", "project_b", "src"], [])
    const { result, rerender } = renderHook(
      ({ projectId }) => useProjectEntryMutations(projectId),
      {
        initialProps: { projectId: "project_a" },
        wrapper: wrapperFor(client),
      },
    )

    rerender({ projectId: "project_b" })
    await act(async () => {
      await result.current.refreshEntries()
    })

    expect(client.getQueryState(
      ["project-entries", "project_b", "."],
    )?.isInvalidated).toBe(true)
    expect(client.getQueryState(
      ["project-entries", "project_b", "src"],
    )?.isInvalidated).toBe(true)
    expect(client.getQueryState(
      ["project-entries", "project_a", "."],
    )?.isInvalidated).toBe(false)
    expect(client.getQueryState(
      ["project-references", "project_b", "src"],
    )?.isInvalidated).toBe(false)
    expect(apiRequest).not.toHaveBeenCalled()
  })

  it("propagates refresh refetch failures", async () => {
    const client = createClient()
    const queryFn = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Directory disappeared"))
    const { result } = renderHook(
      () => ({
        entries: useQuery({
          queryKey: ["project-entries", "project_a", "."],
          queryFn,
        }),
        mutations: useProjectEntryMutations("project_a"),
      }),
      { wrapper: wrapperFor(client) },
    )

    await waitFor(() => expect(result.current.entries.isSuccess).toBe(true))
    await expect(result.current.mutations.refreshEntries()).rejects.toThrow(
      "Directory disappeared",
    )
  })
})
