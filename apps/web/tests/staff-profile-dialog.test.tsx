import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
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

import { StaffProfileDialog } from "@/components/staff/StaffProfileDialog"

import { staffProfiles } from "./fixtures/staff"

const maya = staffProfiles.find((staff) => staff.id === "staff_maya")!
const markdown = "---\nid: staff_maya\n---\n# Identity\n\nMaya researches carefully.\n"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

function renderDialog(
  props: Partial<ComponentProps<typeof StaffProfileDialog>> = {},
) {
  return renderWithClient(
    <StaffProfileDialog
      staff={maya}
      open
      available
      onAvailableChange={() => undefined}
      onOpenChange={() => undefined}
      {...props}
    />,
  )
}

describe("StaffProfileDialog markdown editor", () => {
  beforeEach(() => {
    getStaffDocument.mockReset()
    saveStaffDocument.mockReset()
    getStaffDocument.mockResolvedValue({
      id: "staff_maya",
      slug: "maya-researcher",
      markdown,
    })
    saveStaffDocument.mockResolvedValue({
      id: "staff_maya",
      slug: "maya-researcher",
      markdown,
    })
  })

  it("opens in preview mode with rendered markdown", async () => {
    renderDialog()

    expect(await screen.findByRole("heading", { name: "Identity", level: 1 }))
      .toBeInTheDocument()
    expect(screen.getByText("Maya researches carefully.")).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: /staff profile markdown/i }))
      .not.toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Preview" })).toHaveAttribute(
      "aria-checked",
      "true",
    )
  })

  it("exposes an availability toggle in the profile header", async () => {
    const onAvailableChange = vi.fn()
    renderDialog({ available: true, onAvailableChange })
    await screen.findByRole("heading", { name: "Identity", level: 1 })

    const toggle = screen.getByRole("switch", { name: "Maya availability" })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    expect(onAvailableChange).toHaveBeenCalledWith(false)
  })

  it("switches to edit mode for raw markdown with line numbers", async () => {
    renderDialog()
    await screen.findByRole("heading", { name: "Identity", level: 1 })

    fireEvent.click(screen.getByRole("radio", { name: "Edit" }))

    const editor = screen.getByRole("textbox", { name: /staff profile markdown/i })
    expect(editor).toHaveValue(markdown)
    expect(screen.queryByRole("heading", { name: "Identity", level: 1 }))
      .not.toBeInTheDocument()

    const gutter = screen.getByTestId("staff-markdown-line-numbers")
    const lineCount = markdown.split("\n").length
    expect(gutter).toHaveTextContent(String(lineCount))
    expect(gutter.querySelectorAll("[data-line]")).toHaveLength(lineCount)
  })

  it("shows metadata fields in the Metadata tab", async () => {
    renderDialog()
    await screen.findByRole("heading", { name: "Identity", level: 1 })

    fireEvent.click(screen.getByRole("radio", { name: "Metadata" }))

    expect(screen.getByRole("radio", { name: "Metadata" })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(screen.queryByRole("heading", { name: "Identity", level: 1 }))
      .not.toBeInTheDocument()
    expect(screen.getByText("id")).toBeInTheDocument()
    expect(screen.getByText("staff_maya")).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: /staff profile markdown/i }))
      .not.toBeInTheDocument()
  })

  it("asks before closing with unsaved edits", async () => {
    const onOpenChange = vi.fn()
    renderDialog({ onOpenChange })
    await screen.findByRole("heading", { name: "Identity", level: 1 })

    fireEvent.click(screen.getByRole("radio", { name: "Edit" }))
    fireEvent.change(screen.getByRole("textbox", { name: /staff profile markdown/i }), {
      target: { value: `${markdown}\nEdited line\n` },
    })
    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/unsaved changes/i)

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    fireEvent.click(screen.getByRole("button", { name: "Discard" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("saves the draft markdown and closes", async () => {
    const onOpenChange = vi.fn()
    const edited = `${markdown}\n## Notes\nUpdated\n`
    renderDialog({ onOpenChange })
    await screen.findByRole("heading", { name: "Identity", level: 1 })

    fireEvent.click(screen.getByRole("radio", { name: "Edit" }))
    fireEvent.change(screen.getByRole("textbox", { name: /staff profile markdown/i }), {
      target: { value: edited },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(saveStaffDocument).toHaveBeenCalledWith("staff_maya", edited)
    })
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it("closes without prompting when nothing changed", async () => {
    const onOpenChange = vi.fn()
    renderDialog({ onOpenChange })
    await screen.findByRole("heading", { name: "Identity", level: 1 })

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
