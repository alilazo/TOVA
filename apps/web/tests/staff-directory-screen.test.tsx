import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import { createElement, StrictMode, type ButtonHTMLAttributes, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getStaffDocument, reducedMotion, saveStaffDocument } = vi.hoisted(() => ({
  getStaffDocument: vi.fn(),
  saveStaffDocument: vi.fn(),
  reducedMotion: { current: false },
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
    useReducedMotion: () => reducedMotion.current,
  }
})

import { StaffDirectoryScreen } from "@/components/staff/StaffDirectoryScreen"

import { staffProfiles } from "./fixtures/staff"

const globalsCss = readFileSync(resolve(process.cwd(), "src/styles/globals.css"), "utf8")

function cssRuleBody(selectorPattern: string): string {
  const match = new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(globalsCss)
  expect(match).not.toBeNull()
  return match?.[1] ?? ""
}

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
    reducedMotion.current = false
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
    expect(
      document.querySelector(".staff-directory__title .lucide-bot"),
    ).not.toBeNull()
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

  it("omits badge lift motion paths for reduced motion", () => {
    reducedMotion.current = true

    renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)

    const badge = screen.getByRole("button", { name: "Open Maya profile" })
    expect(badge).toHaveAttribute("data-while-hover-y", "")
    expect(badge).toHaveAttribute("data-while-focus-y", "")

    const badgeRule = cssRuleBody("\\.staff-badge-card")
    const hoverRule = cssRuleBody(
      "\\.staff-badge-card:hover,\\s*\\.staff-badge-card:focus-visible",
    )

    expect(badgeRule).not.toMatch(/\btransform\s+\d+ms\b/)
    expect(hoverRule).toContain("border-color")
    expect(hoverRule).toContain("box-shadow")
    expect(hoverRule).not.toMatch(/\btransform\s*:/)
    expect(globalsCss).not.toMatch(/\.staff-badge-card:active\s*\{[\s\S]*?\btransform\s*:/)
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
