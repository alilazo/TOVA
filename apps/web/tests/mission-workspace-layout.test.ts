/// <reference types="node" />

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const css = readFileSync(resolve(process.cwd(), "src/styles/globals.css"), "utf8")

describe("mission workspace layout", () => {
  it("pins Team Floor and Live Activity without a center controls row", () => {
    expect(css).toMatch(/\.mission-workspace\s*\{[^}]*grid-template-areas:/s)
    expect(css).toMatch(/\.mission-runtime-error\s*\{[^}]*grid-area:\s*error/s)
    expect(css).toMatch(/\.workspace-panel-switch\s*\{[^}]*grid-area:\s*main/s)
    expect(css).toMatch(
      /\.workspace-panel-switch\s*\{[^}]*display:\s*flex/s,
    )
    expect(css).toMatch(
      /\.workspace-panel-switch\s*>\s*\*\s*\{[^}]*flex:\s*1\s+1\s+auto/s,
    )
    expect(css).toMatch(/\.activity-feed\s*\{[^}]*grid-area:\s*activity/s)
    expect(css).not.toMatch(/\.mission-composer\s*\{[^}]*grid-area:\s*controls/s)
  })

  it("hosts mission composer and controls in the Engineering Team column", () => {
    expect(css).toMatch(/\.engineering-team\s+\.mission-composer\s*\{/s)
    expect(css).toMatch(/\.engineering-team\s+\.mission-controls__summary strong/)
    expect(css).toMatch(/\.mission-controls\s*\{[^}]*flex-direction:\s*column/s)
  })
})
