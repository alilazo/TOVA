### Task 1: StaffDirectoryScreen Behavior

**Files:**
- Create: `apps/web/src/components/staff/StaffDirectoryScreen.tsx`
- Create: `apps/web/tests/staff-directory-screen.test.tsx`

**Interfaces:**
- Consumes:
  - `StaffProfile` from `@/types/domain`
  - `PixelAvatar({ avatar, name, size? })`
  - `StaffProfileDialog({ staff, open, available, onAvailableChange, onOpenChange })`
- Produces:
  - `StaffDirectoryScreen({ staff, isLoading?, error? }: StaffDirectoryScreenProps)`
  - `StaffDirectoryScreenProps`:
    ```ts
    interface StaffDirectoryScreenProps {
      staff: StaffProfile[]
      isLoading?: boolean
      error?: Error | null
    }
    ```

- [ ] **Step 1: Write failing behavior tests**

Create `apps/web/tests/staff-directory-screen.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
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

  it("renders staff as ID badge cards with role and description", () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    expect(screen.getByRole("heading", { name: "HiPo Staff" })).toBeInTheDocument()
    expect(screen.getByText("7 staff profiles")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()
    expect(screen.getByText("Researcher")).toBeInTheDocument()
    expect(screen.getByText(staffProfiles.find((staff) => staff.id === "staff_maya")!.description))
      .toBeInTheDocument()
  })

  it("filters by name, role, department, tags, and description", () => {
    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)
    const search = screen.getByRole("searchbox", { name: "Search staff" })

    fireEvent.change(search, { target: { value: "frontend" } })
    expect(screen.getByRole("button", { name: "Open Lina profile" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Open Maya profile" })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: "research" } })
    expect(screen.getByRole("button", { name: "Open Maya profile" })).toBeInTheDocument()

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

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Expected: FAIL because `StaffDirectoryScreen` does not exist.

- [ ] **Step 3: Implement StaffDirectoryScreen**

Create `apps/web/src/components/staff/StaffDirectoryScreen.tsx`:

```tsx
import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"

import { Input } from "@/components/ui/input"
import type { StaffProfile } from "@/types/domain"

import { PixelAvatar } from "./PixelAvatar"
import { StaffProfileDialog } from "./StaffProfileDialog"

interface StaffDirectoryScreenProps {
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
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
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
  const shouldDrop = !openedInSession.current
  openedInSession.current = true

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
          placeholder="Search names, roles, tagsâ€¦"
        />
      </label>

      {isLoading ? (
        <p className="staff-directory__state" role="status">Loading staff profilesâ€¦</p>
      ) : error ? (
        <p className="staff-directory__state" role="alert">Staff profiles are unavailable.</p>
      ) : staff.length === 0 ? (
        <p className="staff-directory__state" role="status">No staff profiles are available.</p>
      ) : visibleStaff.length === 0 ? (
        <p className="staff-directory__state">No staff match that search.</p>
      ) : (
        <div className="staff-directory__grid">
          <AnimatePresence initial={shouldDrop && !reduceMotion}>
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
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ delay: shouldDrop ? Math.min(index * 0.04, 0.28) : 0, duration: 0.24 }}
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
          </AnimatePresence>
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

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Expected: PASS.

---
