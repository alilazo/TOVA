# Review package: HiPo Staff Task 1 re-review (no git)

## Files

## FILE: apps/web/src/components/staff/StaffDirectoryScreen.tsx

```
import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import type { StaffProfile } from "@/types/domain"

import { PixelAvatar } from "./PixelAvatar"
import { StaffProfileDialog } from "./StaffProfileDialog"

export interface StaffDirectoryScreenProps {
  staff: StaffProfile[]
  isLoading?: boolean
  error?: Error | null
}

const openedInSession = { current: false }

function searchableText(staff: StaffProfile): string {
  return [
    staff.displayName,
    staff.name,
    staff.role,
    staff.roleKey,
    staff.department,
    staff.seniority,
    staff.description,
    staff.status,
    ...staff.tags,
  ].join(" ").toLowerCase()
}

function statusLabel(status: StaffProfile["status"]): string {
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
}

export function StaffDirectoryScreen({
  staff,
  isLoading = false,
  error = null,
}: StaffDirectoryScreenProps) {
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState("")
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null)
  const [availabilityOverrides, setAvailabilityOverrides] = useState<Record<string, boolean>>({})
  const [shouldDrop] = useState(() => !openedInSession.current)

  useEffect(() => {
    if (shouldDrop) openedInSession.current = true
  }, [shouldDrop])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleStaff = useMemo(() => {
    if (!normalizedQuery) return staff
    return staff.filter((member) => searchableText(member).includes(normalizedQuery))
  }, [normalizedQuery, staff])
  const profileStaff = staff.find((member) => member.id === profileStaffId) ?? null

  return (
    <section className="staff-directory" aria-labelledby="staff-directory-title">
      <header className="staff-directory__header">
        <span>
          <p className="staff-directory__eyebrow">HiPo Staff</p>
          <h1 id="staff-directory-title">HiPo Staff</h1>
          <p>Browse the local workforce layer.</p>
        </span>
        <strong>
          {normalizedQuery
            ? `${visibleStaff.length} of ${staff.length} shown`
            : `${staff.length} ${staff.length === 1 ? "staff profile" : "staff profiles"}`}
        </strong>
      </header>

      <label className="staff-directory__search">
        <Search aria-hidden="true" />
        <span className="sr-only">Search staff</span>
        <Input
          type="search"
          role="searchbox"
          aria-label="Search staff"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search names, roles, tags..."
        />
      </label>

      {isLoading ? (
        <p className="staff-directory__state" role="status">
          Loading staff profiles...
        </p>
      ) : error ? (
        <p className="staff-directory__state" role="alert">
          Staff profiles are unavailable.
        </p>
      ) : staff.length === 0 ? (
        <p className="staff-directory__state" role="status">
          No staff profiles are available.
        </p>
      ) : profileStaff ? null : visibleStaff.length === 0 ? (
        <p className="staff-directory__state">No staff match that search.</p>
      ) : (
        <div className="staff-directory__grid">
          {visibleStaff.map((member, index) => {
            const available = availabilityOverrides[member.id] ?? member.status !== "offline"
            return (
              <motion.button
                key={member.id}
                type="button"
                className="staff-badge-card"
                aria-label={`Open ${member.displayName} profile`}
                initial={shouldDrop && !reduceMotion ? { opacity: 0, y: -28, rotate: -1 } : false}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{
                  delay: shouldDrop ? Math.min(index * 0.04, 0.28) : 0,
                  duration: 0.24,
                }}
                onClick={() => setProfileStaffId(member.id)}
              >
                <span className="staff-badge-card__clip" aria-hidden="true" />
                <span className="staff-badge-card__name-strip">{member.displayName}</span>
                <span className="staff-badge-card__portrait">
                  <PixelAvatar avatar={member.avatar} name={member.displayName} size="lg" />
                </span>
                <span className="staff-badge-card__copy">
                  <strong>{member.role}</strong>
                  <span>{member.description}</span>
                </span>
                <span className="staff-badge-card__footer">
                  <strong>HiPo Staff</strong>
                  <span>{available ? "Available" : statusLabel(member.status)}</span>
                </span>
              </motion.button>
            )
          })}
        </div>
      )}

      {profileStaff && (
        <StaffProfileDialog
          staff={profileStaff}
          open
          available={availabilityOverrides[profileStaff.id] ?? profileStaff.status !== "offline"}
          onAvailableChange={(available) => {
            setAvailabilityOverrides((current) => ({
              ...current,
              [profileStaff.id]: available,
            }))
          }}
          onOpenChange={(open) => {
            if (!open) setProfileStaffId(null)
          }}
        />
      )}
    </section>
  )
}

```

## FILE: apps/web/tests/staff-directory-screen.test.tsx

```
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { createElement, StrictMode, type ButtonHTMLAttributes, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getStaffDocument, saveStaffDocument } = vi.hoisted(() => ({
  getStaffDocument: vi.fn(),
  saveStaffDocument: vi.fn(),
}))

vi.mock("@/features/staff/staff-api", async () => {
  const actual = await vi.importActual<typeof import("@/features/staff/staff-api")>(
    "@/features/staff/staff-api",
  )
  return {
    ...actual,
    getStaffDocument,
    saveStaffDocument,
  }
})

vi.mock("framer-motion", async () => {
  type MotionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    animate?: unknown
    initial?: false | Record<string, unknown>
    transition?: { delay?: number; duration?: number }
  }

  return {
    motion: {
      button: ({ animate: _animate, initial, transition, ...props }: MotionButtonProps) =>
        createElement("button", {
          ...props,
          "data-drop-initial": initial ? "true" : "false",
          "data-transition-delay": String(transition?.delay ?? ""),
        }),
    },
    useReducedMotion: () => false,
  }
})

import { StaffDirectoryScreen } from "@/components/staff/StaffDirectoryScreen"

import { staffProfiles } from "./fixtures/staff"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe("StaffDirectoryScreen", () => {
  beforeEach(() => {
    getStaffDocument.mockReset()
    saveStaffDocument.mockReset()
    getStaffDocument.mockResolvedValue({
      id: "staff_maya",
      slug: "maya-researcher",
      markdown: "---\nid: staff_maya\n---\n# Identity\nMaya researches carefully.\n",
    })
    saveStaffDocument.mockResolvedValue({
      id: "staff_maya",
      slug: "maya-researcher",
      markdown: "---\nid: staff_maya\n---\n# Identity\nMaya researches carefully.\n",
    })
  })

  it("keeps the first-open drop animation enabled when an attempted render is abandoned", () => {
    function ThrowOnRender() {
      throw new Error("abandoned staff directory render")
    }

    expect(() =>
      renderWithClient(
        <StrictMode>
          <StaffDirectoryScreen staff={staffProfiles} />
          <ThrowOnRender />
        </StrictMode>,
      ),
    ).toThrow("abandoned staff directory render")

    renderWithClient(
      <StrictMode>
        <StaffDirectoryScreen staff={staffProfiles} />
      </StrictMode>,
    )

    expect(screen.getByRole("button", { name: "Open Maya profile" })).toHaveAttribute(
      "data-drop-initial",
      "true",
    )
  })

  it("renders staff as ID badge cards with role and description", () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    expect(screen.getByRole("heading", { name: "HiPo Staff" })).toBeInTheDocument()
    expect(screen.getByText("7 staff profiles")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.getByText("Researcher")).toBeInTheDocument()
    expect(
      screen.getByText(
        staffProfiles.find((staff) => staff.id === "staff_maya")!.description,
      ),
    ).toBeInTheDocument()
  })

  it("filters by name, role, department, tags, and description", () => {
    const searchableProfiles = staffProfiles.map((member) => {
      if (member.id === "staff_maya") {
        return {
          ...member,
          department: "Behavior Lab",
          description: "Maps decision trails for field research.",
        }
      }
      if (member.id === "staff_lina") {
        return {
          ...member,
          tags: ["accessibility-review"],
        }
      }
      return member
    })

    renderWithClient(<StaffDirectoryScreen staff={searchableProfiles} />)
    const search = screen.getByRole("searchbox", { name: "Search staff" })

    fireEvent.change(search, { target: { value: "maya" } })
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Lina profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "frontend" } })
    expect(screen.getByRole("button", { name: "Open Lina profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Maya profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "behavior lab" } })
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Lina profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "accessibility-review" } })
    expect(screen.getByRole("button", { name: "Open Lina profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Maya profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "decision trails" } })
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Lina profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "not-a-member" } })
    expect(screen.getByText("No staff match that search.")).toBeInTheDocument()
  })

  it("opens the existing staff profile dialog from a badge", async () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    fireEvent.click(screen.getByRole("button", { name: "Open Maya profile" }))

    expect(await screen.findByRole("heading", { name: "Maya" })).toBeInTheDocument()
    expect(screen.getByText("Researcher")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Maya availability" })).toBeInTheDocument()
  })

  it("shows loading, error, and empty states", () => {
    const view = renderWithClient(<StaffDirectoryScreen staff={[]} isLoading />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading staff profiles")

    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StaffDirectoryScreen staff={[]} error={new Error("unavailable")} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Staff profiles are unavailable.")

    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StaffDirectoryScreen staff={[]} />
      </QueryClientProvider>,
    )
    expect(screen.getByRole("status")).toHaveTextContent("No staff profiles are available.")
  })
})

```

## FILE: .superpowers/sdd/hipo-staff-task-1-report.md

```
# Task 1: StaffDirectoryScreen Behavior Report

## Status

DONE_WITH_CONCERNS

## Files Changed

- Created `apps/web/tests/staff-directory-screen.test.tsx`
- Created `apps/web/src/components/staff/StaffDirectoryScreen.tsx`

## TDD Evidence

### RED

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result: FAIL as expected before implementation.

Relevant failure:

```text
Error: Failed to resolve import "@/components/staff/StaffDirectoryScreen" from "tests/staff-directory-screen.test.tsx". Does the file exist?
Test Files  1 failed (1)
Tests  no tests
```

### GREEN

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result: PASS after implementation.

Relevant output:

```text
Test Files  1 passed (1)
Tests  4 passed (4)
```

## Additional Verification

Command:

```bash
pnpm verify
```

Result: FAILED during the full web test suite after lint and typecheck completed successfully.

Relevant failure:

```text
tests/navigation-rail.test.tsx > NavigationRail > disables Search and Team Floor when no project is open
AssertionError: expected "vi.fn()" to be called with arguments: [ 'missions' ]
ReferenceError: ResizeObserver is not defined
Test Files  1 failed | 28 passed (29)
Tests  1 failed | 135 passed (136)
```

The failure is in `tests/navigation-rail.test.tsx`, outside Task 1's changed files. Because `pnpm verify` stops at tests, the build step did not run.

IDE diagnostics for the two edited files reported no linter errors.

## Implementation Summary

- Added `StaffDirectoryScreen` with the required props: `staff`, `isLoading`, and `error`.
- Renders the directory as ID badge buttons with staff count, role, description, avatar, and availability text.
- Uses `PixelAvatar` for every badge portrait, preserving existing stock/custom/pixel avatar fallback behavior.
- Uses the existing `StaffProfileDialog` when a badge is opened.
- Adds search over display name, name, role, role key, department, seniority, description, status, and tags.
- Handles loading, error, empty staff, and empty search states.
- Keeps the component standalone and does not wire it into routing or `App.tsx`.
- Adds only class names and structure; no CSS styling was added.

## Self-Review

- Confirmed no git commits were created.
- Confirmed Task 2 scope was avoided: no Staff tab enablement, no routing, no app wiring.
- Confirmed Task 3 scope was avoided: no visual CSS changes.
- Confirmed component reuses `StaffProfileDialog` and `PixelAvatar`.
- Adjusted the first implementation after GREEN failed because exit animation left filtered cards in the DOM and duplicated selected profile text while the dialog was open.

## Concerns

- `pnpm verify` is not fully green because the existing navigation rail test fails with `ResizeObserver is not defined` and a missing `onChange("missions")` call. This appears outside the Task 1 change set, but it prevents a full repository verification pass.

## Review Fix Follow-Up - 2026-07-30

Status: PASS.

Fix report:

- Moved first-open drop tracking in `apps/web/src/components/staff/StaffDirectoryScreen.tsx` out of the render/state-initializer path and into a commit-time effect.
- Added a regression test that simulates an abandoned render before the first committed mount, proving the drop animation remains enabled for the committed mount.
- Expanded the staff directory search test to cover name, role, department, tags, and description with representative values.
- No git commits were created.

Focused test:

```text
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx

 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web


 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  17:20:52
   Duration  3.42s (transform 167ms, setup 313ms, import 1.08s, tests 523ms, environment 1.27s)
```

```
