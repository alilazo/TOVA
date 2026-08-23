# Review package: Task 3 (no git)

## Files

## FILE: apps/web/src/features/projects/project-api.ts

```
import { apiRequest } from "@/lib/api"

export interface ProjectRecord {
  id: string
  name: string
  root: string
}

export interface ProjectEntry {
  name: string
  path: string
  kind: "file" | "dir"
}

export interface ProjectFile {
  path: string
  content: string
}

export interface RecentProjectRecord {
  id: string
  name: string
  root: string
  lastOpenedAt: string
}

export function openProject(path: string, create = false) {
  return apiRequest<ProjectRecord>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ path, create }),
  })
}

export function getActiveProject() {
  return apiRequest<ProjectRecord | null>("/api/projects/active")
}

export function listRecentProjects() {
  return apiRequest<RecentProjectRecord[]>("/api/projects/recent")
}

export function listProjectEntries(projectId: string, path = ".") {
  const query = new URLSearchParams({ path })
  return apiRequest<ProjectEntry[]>(`/api/projects/${projectId}/entries?${query}`)
}

export function readProjectFile(projectId: string, path: string) {
  const query = new URLSearchParams({ path })
  return apiRequest<ProjectFile>(`/api/projects/${projectId}/files?${query}`)
}

export function writeProjectFile(projectId: string, path: string, content: string) {
  return apiRequest<ProjectFile>(`/api/projects/${projectId}/files`, {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  })
}

export function languageForPath(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript"
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript"
  if (path.endsWith(".py")) return "python"
  if (path.endsWith(".json")) return "json"
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".html")) return "html"
  if (path.endsWith(".md")) return "markdown"
  return "plaintext"
}

```

## FILE: apps/web/src/components/repository/RecentProjectsList.tsx

```
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  listRecentProjects,
  openProject,
  type ProjectRecord,
} from "@/features/projects/project-api"

const DEFAULT_VISIBLE = 5

interface RecentProjectsListProps {
  onOpened: (project: ProjectRecord) => void
}

function truncatePath(path: string, maxLength = 48): string {
  if (path.length <= maxLength) return path
  const head = Math.max(12, Math.floor(maxLength * 0.35))
  const tail = maxLength - head - 1
  return `${path.slice(0, head)}â€¦${path.slice(-tail)}`
}

function openErrorMessage(error: Error): string {
  const message = error.message.toLowerCase()
  if (
    message.includes("existing directory")
    || message.includes("not found")
  ) {
    return "That folder is no longer available"
  }
  return error.message
}

export function RecentProjectsList({ onOpened }: RecentProjectsListProps) {
  const client = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [alertText, setAlertText] = useState<string | null>(null)

  const recents = useQuery({
    queryKey: ["recent-projects"],
    queryFn: listRecentProjects,
  })

  const openRecent = useMutation({
    mutationFn: (root: string) => openProject(root),
    onSuccess: async (project) => {
      setAlertText(null)
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
      await client.invalidateQueries({ queryKey: ["active-project"] })
      onOpened(project)
    },
    onError: async (error: Error) => {
      setAlertText(openErrorMessage(error))
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
    },
  })

  if (recents.isLoading) {
    return null
  }

  const items = recents.data ?? []
  if (items.length === 0 && !alertText) {
    return null
  }

  const visibleItems = expanded ? items : items.slice(0, DEFAULT_VISIBLE)
  const canExpand = items.length > DEFAULT_VISIBLE

  return (
    <section className="recent-projects">
      <p className="recent-projects__label">Recent</p>
      {alertText && <p role="alert">{alertText}</p>}
      <ul className="recent-projects__list">
        {visibleItems.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="recent-projects__row"
              disabled={openRecent.isPending}
              onClick={() => openRecent.mutate(item.root)}
            >
              <span className="recent-projects__name">{item.name}</span>
              <span className="recent-projects__path">{truncatePath(item.root)}</span>
            </button>
          </li>
        ))}
      </ul>
      {canExpand && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="recent-projects__toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "View more"}
        </Button>
      )}
    </section>
  )
}

```

## FILE: apps/web/tests/recent-projects-list.test.tsx

```
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const listRecentProjects = vi.fn()
const openProject = vi.fn()

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

```

## FILE: .superpowers/sdd/task-3-report.md

```
# Task 3 Report: Frontend API helper + RecentProjectsList

## Status

**DONE**

## Summary

Added `RecentProjectRecord` / `listRecentProjects()` to `project-api.ts`, implemented shared `RecentProjectsList` with TanStack Query/mutation, and verified with TDD Vitest tests. Not wired into empty states yet (Task 4).

## TDD Evidence

### RED â€” Step 2

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx
```

Result: **FAIL** (exit code 1) â€” `Failed to resolve import "@/components/repository/RecentProjectsList"`.

### GREEN â€” Step 4

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx
```

Result: **PASS** (exit code 0) â€” 4 tests passed.

## Changes

### Modified: `apps/web/src/features/projects/project-api.ts`

- Added `RecentProjectRecord` interface and `listRecentProjects()` â†’ `GET /api/projects/recent`.

### Created: `apps/web/src/components/repository/RecentProjectsList.tsx`

- `useQuery(["recent-projects"])` + `useMutation` calling `openProject(root)`.
- Success: invalidate `recent-projects` + `active-project`, call `onOpened`.
- Error: map missing-directory messages to `That folder is no longer available`; invalidate `recent-projects`.
- Local `expanded` state; slice to 5 rows; View more / Show less when >5.
- Returns `null` while loading or when history empty (unless error alert is showing).

### Created: `apps/web/tests/recent-projects-list.test.tsx`

- Verbatim tests from brief: empty hide, expand/collapse, open row, error + refresh.

## Self-Review

- **Brief compliance:** API helper and component match spec; tests verbatim; no Task 4 wiring.
- **UI:** Compact markup with `.recent-projects` BEM classes; CSS deferred to Task 5.
- **Deviation:** Return `null` during loading and keep section visible when `alertText` is set after self-heal refresh â€” required for tests and UX (error survives empty refetch).

## Concerns

1. **No CSS yet** â€” rows rely on unstyled markup until Task 5 `globals.css`.
2. **Error alert persists** after list self-heals to empty; user must dismiss implicitly by opening another project or navigating away (no explicit dismiss in v1 spec).

## Files Touched

- `apps/web/src/features/projects/project-api.ts`
- `apps/web/src/components/repository/RecentProjectsList.tsx`
- `apps/web/tests/recent-projects-list.test.tsx`

## Commits

None (per instructions).

```
