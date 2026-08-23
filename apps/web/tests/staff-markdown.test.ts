import { describe, expect, it } from "vitest"

import {
  formatMetadataValue,
  markdownBodyForPreview,
  parseStaffMetadata,
  splitStaffMarkdown,
} from "@/features/staff/staff-markdown"

const sample = `---
id: staff_maya
role: Researcher
tools:
  - repository.read
  - repository.search
permissions:
  filesystem_read: true
  filesystem_write: false
can_delegate: false
---

# Identity

Maya researches carefully.
`

describe("staff markdown helpers", () => {
  it("splits frontmatter from body", () => {
    const parts = splitStaffMarkdown(sample)
    expect(parts.frontmatter).toContain("id: staff_maya")
    expect(parts.body).toBe("# Identity\n\nMaya researches carefully.\n")
    expect(markdownBodyForPreview(sample)).toBe(
      "# Identity\n\nMaya researches carefully.\n",
    )
  })

  it("parses nested metadata fields for preview", () => {
    const fields = parseStaffMetadata(splitStaffMarkdown(sample).frontmatter)
    expect(fields).toEqual(
      expect.arrayContaining([
        { key: "id", value: "staff_maya" },
        { key: "role", value: "Researcher" },
        {
          key: "tools",
          value: ["repository.read", "repository.search"],
        },
        {
          key: "permissions",
          value: {
            filesystem_read: true,
            filesystem_write: false,
          },
        },
        { key: "can_delegate", value: false },
      ]),
    )
    expect(formatMetadataValue(["repository.read", "repository.search"])).toBe(
      "repository.read, repository.search",
    )
  })
})
