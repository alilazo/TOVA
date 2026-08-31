import { describe, expect, it } from "vitest"

import {
  absoluteEntryPath,
  entryName,
  entryParent,
  isEntryWithin,
  joinEntryPath,
  normalizeEntryPath,
  remapEntryPath,
} from "@/features/projects/project-entry-paths"

describe("project entry paths", () => {
  it("normalizes project-relative separators and root prefixes", () => {
    expect(normalizeEntryPath(".\\src\\\\components/App.tsx")).toBe(
      "src/components/App.tsx",
    )
    expect(normalizeEntryPath(".")).toBe(".")
  })

  it("gets entry parents and names", () => {
    expect(entryParent("src/components/App.tsx")).toBe("src/components")
    expect(entryParent("README.md")).toBe(".")
    expect(entryParent(".")).toBe(".")
    expect(entryName("src\\components\\App.tsx")).toBe("App.tsx")
    expect(entryName(".")).toBe("")
  })

  it("joins names to normalized parent paths", () => {
    expect(joinEntryPath(".", "README.md")).toBe("README.md")
    expect(joinEntryPath(".\\src\\", "components\\App.tsx")).toBe(
      "src/components/App.tsx",
    )
  })

  it("matches exact paths and descendants without matching sibling prefixes", () => {
    expect(isEntryWithin("src", "src")).toBe(true)
    expect(isEntryWithin("src/components/App.tsx", "src")).toBe(true)
    expect(isEntryWithin("source/App.tsx", "src")).toBe(false)
    expect(isEntryWithin("src-other/App.tsx", "src")).toBe(false)
    expect(isEntryWithin("src/App.tsx", ".")).toBe(true)
  })

  it("remaps exact paths and descendants including the project root", () => {
    expect(remapEntryPath("src/components/App.tsx", "src", "app")).toBe(
      "app/components/App.tsx",
    )
    expect(remapEntryPath("source/App.tsx", "src", "app")).toBe(
      "source/App.tsx",
    )
    expect(remapEntryPath("src/App.tsx", "src", "src")).toBe("src/App.tsx")
    expect(remapEntryPath("src/App.tsx", ".", "app")).toBe("app/src/App.tsx")
    expect(remapEntryPath("src/App.tsx", "src", ".")).toBe("App.tsx")
  })

  it("builds native absolute paths and preserves root paths", () => {
    expect(absoluteEntryPath("F:\\Projects\\demo", "src/app.ts")).toBe(
      "F:\\Projects\\demo\\src\\app.ts",
    )
    expect(absoluteEntryPath("/projects/demo/", "src\\app.ts")).toBe(
      "/projects/demo/src/app.ts",
    )
    expect(absoluteEntryPath("F:\\Projects\\demo", ".")).toBe(
      "F:\\Projects\\demo",
    )
  })

  it("rejects traversal before building an absolute entry path", () => {
    expect(() =>
      absoluteEntryPath("F:\\Projects\\demo", "../outside.txt")
    ).toThrow(/project-relative/)
    expect(() =>
      absoluteEntryPath("F:\\Projects\\demo", "src/../../outside.txt")
    ).toThrow(/project-relative/)
  })

  it("rejects absolute and drive-relative entry paths before joining", () => {
    for (const path of [
      "/etc/passwd",
      "\\\\server\\share\\file.txt",
      "C:\\Windows\\system.ini",
      "C:relative.txt",
    ]) {
      expect(() => absoluteEntryPath("F:\\Projects\\demo", path)).toThrow(
        /project-relative/,
      )
    }
  })

  it("rejects empty and root-alias paths while preserving the intentional root", () => {
    for (const path of ["", "/", "\\", "./", ".\\"]) {
      expect(() => normalizeEntryPath(path)).toThrow(/project-relative/)
    }

    expect(normalizeEntryPath(".")).toBe(".")
    expect(absoluteEntryPath("F:\\Projects\\demo", ".")).toBe(
      "F:\\Projects\\demo",
    )
    expect(() => joinEntryPath("src", "../outside.txt")).toThrow(
      /project-relative/,
    )
  })
})
