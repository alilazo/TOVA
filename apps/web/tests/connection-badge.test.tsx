import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ConnectionBadge } from "@/components/system/ConnectionBadge"

describe("ConnectionBadge", () => {
  it("exposes status and model as a button that opens runtime settings", () => {
    const onClick = vi.fn()
    render(
      <ConnectionBadge
        state="connected"
        model="qwen/qwen3.6-35b-a3b"
        onClick={onClick}
      />,
    )

    const button = screen.getByRole("button", { name: "Local model runtime" })
    expect(button).toHaveTextContent("Connected")
    expect(button).toHaveTextContent("qwen/qwen3.6-35b-a3b")
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
