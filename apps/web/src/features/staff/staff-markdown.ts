export interface StaffMarkdownParts {
  frontmatter: string
  body: string
}

export type StaffMetadataValue =
  | string
  | number
  | boolean
  | StaffMetadataValue[]
  | { [key: string]: StaffMetadataValue }

export interface StaffMetadataField {
  key: string
  value: StaffMetadataValue
}

export function splitStaffMarkdown(source: string): StaffMarkdownParts {
  if (!source.startsWith("---\n")) {
    return { frontmatter: "", body: source }
  }
  const end = source.indexOf("\n---\n", 4)
  if (end === -1) {
    return { frontmatter: "", body: source }
  }
  return {
    frontmatter: source.slice(4, end),
    body: source.slice(end + 5).replace(/^\n/, ""),
  }
}

export function markdownBodyForPreview(source: string): string {
  return splitStaffMarkdown(source).body.trimStart()
}

function parseScalar(raw: string): string | number | boolean {
  const value = raw.trim()
  if (value === "true") return true
  if (value === "false") return false
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

export function parseStaffMetadata(frontmatter: string): StaffMetadataField[] {
  const lines = frontmatter.split(/\r?\n/)
  const fields: StaffMetadataField[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    const match = /^(?<key>[A-Za-z0-9_]+):\s*(?<rest>.*)$/.exec(line)
    if (!match?.groups) {
      index += 1
      continue
    }

    const key = match.groups.key
    const rest = match.groups.rest.trim()
    index += 1

    if (rest !== "") {
      fields.push({ key, value: parseScalar(rest) })
      continue
    }

    const listValue: StaffMetadataValue[] = []
    const objectValue: Record<string, StaffMetadataValue> = {}
    let objectMode = false

    while (index < lines.length) {
      const nestedLine = lines[index]
      if (!nestedLine.startsWith("  ") && nestedLine.trim() !== "") break

      if (!nestedLine.trim()) {
        index += 1
        continue
      }

      const listMatch = /^\s+-\s+(.*)$/.exec(nestedLine)
      if (listMatch) {
        listValue.push(parseScalar(listMatch[1] ?? ""))
        index += 1
        continue
      }

      const mapMatch = /^\s+([A-Za-z0-9_]+):\s*(.*)$/.exec(nestedLine)
      if (mapMatch) {
        const nestedKey = mapMatch[1]
        if (!nestedKey) break
        objectMode = true
        objectValue[nestedKey] = parseScalar(mapMatch[2] ?? "")
        index += 1
        continue
      }

      break
    }

    fields.push({
      key,
      value: objectMode ? objectValue : listValue,
    })
  }

  return fields
}

export function formatMetadataValue(value: StaffMetadataValue): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatMetadataValue(item)).join(", ")
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, nested]) => `${key}: ${formatMetadataValue(nested)}`)
      .join(" · ")
  }
  return String(value)
}
