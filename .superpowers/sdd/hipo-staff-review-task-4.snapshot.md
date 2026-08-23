# Review package: HiPo Staff Task 4 (no git)

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
  const shouldAnimateDrop = shouldDrop && !reduceMotion
  const badgeLiftMotion = reduceMotion ? undefined : { y: -2 }

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
                initial={shouldAnimateDrop ? { opacity: 0, y: -28, rotate: -1 } : false}
                animate={shouldAnimateDrop ? { opacity: 1, y: 0, rotate: 0 } : { opacity: 1 }}
                whileFocus={badgeLiftMotion}
                whileHover={badgeLiftMotion}
                transition={{
                  delay: shouldAnimateDrop ? Math.min(index * 0.04, 0.28) : 0,
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

vi.mock("framer-motion", () => {
  type MotionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    animate?: unknown
    initial?: false | Record<string, unknown>
    transition?: { delay?: number; duration?: number }
    whileFocus?: Record<string, unknown>
    whileHover?: Record<string, unknown>
  }
  const motionY = (motion?: Record<string, unknown>) => {
    return typeof motion?.y === "number" ? String(motion.y) : ""
  }

  return {
    motion: {
      button: ({ initial, transition, ...props }: MotionButtonProps) => {
        const { animate, whileFocus, whileHover, ...buttonProps } = props
        void animate
        return createElement("button", {
          ...buttonProps,
          "data-drop-initial": initial ? "true" : "false",
          "data-transition-delay": String(transition?.delay ?? ""),
          "data-while-focus-y": motionY(whileFocus),
          "data-while-hover-y": motionY(whileHover),
        })
      },
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
    function ThrowOnRender(): ReactNode {
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

  it("uses badge-card structure for the directory wall", () => {
    const { container } = renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    expect(container.querySelector(".staff-directory")).not.toBeNull()
    expect(container.querySelectorAll(".staff-badge-card")).toHaveLength(staffProfiles.length)
    expect(container.querySelector(".staff-badge-card__clip")).not.toBeNull()
    expect(container.querySelector(".staff-badge-card__name-strip")).not.toBeNull()
  })

  it("keeps badge hover and focus lift in motion props", () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    const badge = screen.getByRole("button", { name: "Open Maya profile" })
    expect(badge).toHaveAttribute("data-while-hover-y", "-2")
    expect(badge).toHaveAttribute("data-while-focus-y", "-2")
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

    fireEvent.change(search, { target: { value: "front-end" } })
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

## FILE: .superpowers/sdd/hipo-staff-task-4-report.md

```
# Task 4 Report: Verification and Impeccable Detector

Date: 2026-07-30

## Status

PASS with one scoped frontend fix.

Task 4 verification completed from `F:\Programming Projects\TOVA`. No git commits were created. Backend source was untouched.

## Fixes Made

- Fixed the HiPo Staff badge hover lift in `apps/web/src/components/staff/StaffDirectoryScreen.tsx`.
  - Root cause: `motion.button` left an inline transform after the first-open drop animation, so the CSS `transform: translateY(-2px)` hover rule was ignored while the hover shadow still applied.
  - Fix: moved the hover/focus lift into Framer Motion via `whileHover` and `whileFocus`, while preserving reduced-motion handling and the first-open drop animation.
- Added regression coverage in `apps/web/tests/staff-directory-screen.test.tsx`.
  - New test confirms badge hover/focus lift is passed through motion props.

## Command Evidence

### Initial focused tests

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx tests/app-staff-directory.test.tsx tests/app-panel-transition.test.tsx tests/navigation-rail.test.tsx tests/core-components.test.tsx tests/staff-profile-dialog.test.tsx
```

Result:

```text
Test Files  6 passed (6)
Tests       34 passed (34)
```

### Initial frontend verification

Command:

```bash
pnpm verify
```

Result:

```text
lint, typecheck, test, and build passed.
Test Files  30 passed (30)
Tests       141 passed (141)
Build passed.
```

Note: Vite reported the existing large chunk warning:

```text
(!) Some chunks are larger than 700 kB after minification.
```

### Initial full workspace verification

Command:

```bash
uv run python scripts/verify.py
```

Result:

```text
pnpm verify passed.
ruff check passed.
mypy passed: Success: no issues found in 48 source files.
pytest passed: 102 passed, 1 warning.
```

Backend warning observed:

```text
StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
```

### Initial Impeccable detector

Command:

```bash
node C:\Users\lazoa\.agents\skills\impeccable\scripts\detect.mjs --json apps/web/src/components/staff/StaffDirectoryScreen.tsx apps/web/src/styles/globals.css apps/web/src/app/App.tsx
```

Result:

```json
[
  {
    "antipattern": "overused-font",
    "name": "Overused font",
    "severity": "warning",
    "category": "slop",
    "file": "F:\\Programming Projects\\TOVA\\apps\\web\\src\\styles\\globals.css",
    "line": 80,
    "snippet": "font-family: Inter"
  }
]
```

Action: reported as the known unrelated body-font warning. Typography was not changed.

### Hover regression red test

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result before fix:

```text
Test Files  1 failed (1)
Tests       1 failed | 6 passed (7)

Expected the element to have attribute:
  data-while-hover-y="-2"
Received:
  data-while-hover-y=""
```

### Hover regression green test

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result after fix:

```text
Test Files  1 passed (1)
Tests       7 passed (7)
```

### Manual smoke status

Manual visual smoke through `cursor-ide-browser` could not be completed because the MCP browser tool failed to create a controlled tab:

```text
No browser tab available. Please navigate to a page first.
```

Fallback real-browser smoke was completed with Playwright against the already-running Vite dev server at `http://127.0.0.1:5173`.

Result:

```json
{
  "status": "PASS",
  "url": "http://127.0.0.1:5173/",
  "staffDirectoryVisible": true,
  "engineeringTeamVisible": false,
  "badgeCount": 7,
  "nameSearch": {
    "query": "Alex",
    "results": 1
  },
  "roleSearch": {
    "query": "Project Coordinator",
    "results": 1
  },
  "dialogOpened": true,
  "hover": {
    "before": {
      "transform": "matrix(1, -0.000346279, 0.000346279, 1, 0, -0.55553)",
      "boxShadow": "color(srgb 0 0 0 / 0.05) 0px 1px 2px 0px"
    },
    "after": {
      "transform": "matrix(1, 0, 0, 1, 0, -1.17942)",
      "boxShadow": "color(srgb 0 0 0 / 0.12) 0px 8px 22px 0px"
    }
  }
}
```

Smoke coverage:

- Opened `http://127.0.0.1:5173`.
- Clicked `HiPo Staff`.
- Confirmed the main screen switched to `.staff-directory`.
- Confirmed `.engineering-team` was not visible.
- Searched by name (`Alex`) and role (`Project Coordinator`).
- Clicked a badge and confirmed the dialog opened.
- Confirmed hover transform and shadow changed after the fix.

### Final focused tests

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx tests/app-staff-directory.test.tsx tests/app-panel-transition.test.tsx tests/navigation-rail.test.tsx tests/core-components.test.tsx tests/staff-profile-dialog.test.tsx
```

Result:

```text
Test Files  6 passed (6)
Tests       35 passed (35)
```

### Final frontend verification

Command:

```bash
pnpm verify
```

Result:

```text
lint, typecheck, test, and build passed.
Test Files  30 passed (30)
Tests       142 passed (142)
Build passed.
```

Note: Vite still reports the existing large chunk warning:

```text
(!) Some chunks are larger than 700 kB after minification.
```

### Final full workspace verification

Command:

```bash
uv run python scripts/verify.py
```

Result:

```text
pnpm verify passed.
ruff check passed.
mypy passed: Success: no issues found in 48 source files.
pytest passed: 102 passed, 1 warning.
```

Backend warning observed:

```text
StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
```

### Final Impeccable detector

Command:

```bash
node C:\Users\lazoa\.agents\skills\impeccable\scripts\detect.mjs --json apps/web/src/components/staff/StaffDirectoryScreen.tsx apps/web/src/styles/globals.css apps/web/src/app/App.tsx
```

Result:

```json
[
  {
    "antipattern": "overused-font",
    "name": "Overused font",
    "severity": "warning",
    "category": "slop",
    "file": "F:\\Programming Projects\\TOVA\\apps\\web\\src\\styles\\globals.css",
    "line": 80,
    "snippet": "font-family: Inter"
  }
]
```

Action: left unchanged per Task 4 constraint because this is the known unrelated body-font warning.

## Concerns and Follow-Ups

- The Impeccable detector exits non-zero because of the known `Inter` body-font warning in `globals.css`. This was intentionally not changed.
- Vite continues to warn that the main built chunk is larger than 700 kB after minification. This appears unrelated to the HiPo Staff task.
- Backend pytest reports one existing Starlette/httpx deprecation warning. Backend checks otherwise pass, and backend source was untouched.
- Manual visual smoke in the Cursor MCP browser could not be performed because the browser tool could not create a controlled tab. Equivalent real-browser Playwright smoke passed against the running dev server.

```

## FILE: apps/web/src/styles/globals.css (staff-directory excerpt)

```
  width: 18px;
}

.handoff-overlay__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8f8f6;
  padding: 10px;
}

.handoff-overlay__status span,
.handoff-overlay__status small {
  color: var(--muted-text);
  font-size: 9px;
}

.staff-directory {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  height: 100%;
  gap: 14px;
  background: #f7f7f4;
  padding: 18px;
}

.staff-directory__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
}

.staff-directory__header h1 {
  margin: 0;
  font-family: var(--font-tova);
  font-size: 22px;
  letter-spacing: 0.03em;
}

.staff-directory__header p {
  margin: 0;
  color: var(--muted-text);
}

.staff-directory__header > strong {
  flex: 0 0 auto;
  color: #3f403c;
  font-size: 12px;
  font-weight: 650;
}

.staff-directory__eyebrow {
  margin: 0 0 3px !important;
  color: var(--soft-text) !important;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.staff-directory__search {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 420px;
}

.staff-directory__search svg {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--soft-text);
  pointer-events: none;
}

.staff-directory__search input {
  background: var(--panel);
  padding-left: 30px;
}

.staff-directory__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  align-content: start;
  min-height: 0;
  overflow: auto;
  gap: 18px 14px;
  padding: 8px 2px 18px;
}

.staff-directory__state {
  display: grid;
  min-height: 180px;
  place-items: center;
  margin: 0;
  color: var(--muted-text);
  font-size: 12px;
}

.staff-badge-card {
  position: relative;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  min-height: 238px;
  appearance: none;
  border: 1px solid #e3e3de;
  border-radius: 11px;
  background: #fffefa;
  padding: 18px 12px 10px;
  color: #22231f;
  font: inherit;
  text-align: left;
  box-shadow: 0 1px 2px color-mix(in srgb, #000 5%, transparent);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.staff-badge-card::before {
  content: "";
  position: absolute;
  top: 6px;
  left: 50%;
  width: 24px;
  height: 4px;
  border-radius: 999px;
  background: #e8e8e3;
  transform: translateX(-50%);
}

.staff-badge-card:hover,
.staff-badge-card:focus-visible {
  border-color: #d2d2cc;
  box-shadow: 0 8px 22px color-mix(in srgb, #000 12%, transparent);
  transform: translateY(-2px);
}

.staff-badge-card:active {
  transform: translateY(0);
}

.staff-badge-card__clip {
  position: absolute;
  top: -11px;
  left: 50%;
  width: 10px;
  height: 18px;
  border: 2px solid #252623;
  border-bottom: 0;
  border-radius: 5px 5px 0 0;
  transform: translateX(-50%);
}

.staff-badge-card__name-strip {
  overflow: hidden;
  border-radius: 5px;
  background: #151613;
  color: white;
  padding: 4px 7px;
  font-size: 10px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.staff-badge-card__portrait {
  display: grid;
  justify-items: start;
  padding: 18px 0 12px;
}

.staff-badge-card__portrait .pixel-avatar {
  width: 58px;
  height: 58px;
  border-radius: 7px;
  background: #fbfbf8;
}

.staff-badge-card__copy {
  display: grid;
  align-content: start;
  min-height: 0;
  gap: 7px;
}

.staff-badge-card__copy strong {
  font-size: 13px;
  line-height: 1.2;
}

.staff-badge-card__copy span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted-text);
  font-size: 10px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.staff-badge-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid var(--line);
  margin-top: 12px;
  padding-top: 8px;
}

.staff-badge-card__footer strong {
  font-family: var(--font-tova);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.staff-badge-card__footer span {
  border-radius: 999px;
  background: #1f201d;
  color: white;
  padding: 3px 6px;
  font-size: 9px;
  font-weight: 650;
}

.team-floor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.team-floor__boot {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 3px;
  border-bottom: 1px solid var(--line);
  background: #f7f7f4;
  padding: 8px 12px;
}

.team-floor__boot strong {
  font-size: 11px;
  line-height: 1.35;
}

.team-floor__boot p {
  margin: 0;
  color: var(--muted-text);
  font-size: 10px;
}

.team-floor__header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
  border-bottom: 1px solid var(--line);
  padding: 0 12px;
}

.team-floor__header > span:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.team-floor__header small {
  color: var(--muted-text);
  font-size: 9px;
```
