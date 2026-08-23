import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PixelAvatar } from "@/components/staff/PixelAvatar"

describe("PixelAvatar", () => {
  it("paints filled cells for known staff faces", () => {
    const { container: alex } = render(<PixelAvatar avatar="alex" name="Alex" size="lg" />)
    const { container: lina } = render(<PixelAvatar avatar="lina" name="Lina" size="md" />)
    const { container: rao } = render(<PixelAvatar avatar="pixel/rao" name="Dr. Rao" size="lg" />)

    expect(alex.querySelectorAll(".pixel-avatar__cell").length).toBe(64)
    expect(alex.querySelectorAll(".pixel-avatar__cell.is-filled").length).toBeGreaterThan(0)
    expect(lina.querySelectorAll(".pixel-avatar__cell.is-filled").length).toBeGreaterThan(0)
    expect(rao.querySelectorAll(".pixel-avatar__cell.is-filled").length).toBeGreaterThan(0)
  })

  it("renders stock image avatars", () => {
    const { container } = render(
      <PixelAvatar
        avatar="stock/black-white-pixel-art-guy-with-hair-and-glasses-64x64.png"
        name="Alex"
        size="lg"
      />,
    )
    const root = container.querySelector(".pixel-avatar")
    const image = container.querySelector("img.pixel-avatar__image")
    expect(root).toHaveClass("pixel-avatar--image")
    expect(image).not.toBeNull()
    expect(image).toHaveAttribute(
      "src",
      expect.stringContaining("/api/staff-assets/stock/black-white-pixel-art-guy-with-hair-and-glasses-64x64.png"),
    )
  })
})
