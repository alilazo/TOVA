/// <reference types="node" />

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(process.cwd(), "../..")
const productionRoots = [
  resolve(repositoryRoot, "apps/api/app"),
  resolve(repositoryRoot, "apps/web/src"),
  resolve(repositoryRoot, "scripts"),
]
const deletedProductionFiles = [
  "apps/web/src/features/mission/use-demo-runtime.ts",
  "apps/web/src/features/mission/demo-events.ts",
  "apps/web/src/features/repository/repository-fixtures.ts",
  "apps/web/src/features/staff/staff-fixtures.ts",
  "scripts/seed_demo.py",
]
const forbiddenTerms = [
  /simulation/i,
  /simulated/i,
  /restart demo/i,
  /playback speed/i,
  /virtual repository/i,
  /project_orion/i,
  /evt_demo/i,
  /FakeModelProvider/,
  /demo|fake|fixture/i,
]

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = resolve(root, name)
    if (statSync(path).isDirectory()) {
      return name === "__pycache__" ? [] : sourceFiles(path)
    }
    return [path]
  })
}

function auditRoots(roots: string[]): string[] {
  return roots.flatMap(sourceFiles).flatMap((path) => {
    const source = readFileSync(path, "utf8")
    const relativePath = path.slice(repositoryRoot.length + 1)
    const auditedText = `${relativePath}\n${source}`
    return forbiddenTerms
      .filter((term) => term.test(auditedText))
      .map((term) => `${relativePath}: ${term.source}`)
  })
}

describe("production source audit", () => {
  it("contains no dead production simulation files", () => {
    const remaining = deletedProductionFiles.filter((path) => existsSync(resolve(repositoryRoot, path)))
    expect(remaining).toEqual([])
  })

  it("contains no production simulation or fake-provider terms", () => {
    expect(auditRoots(productionRoots)).toEqual([])
  })

  it("audits generic demo, fake, and fixture terms in all file types and paths", () => {
    const root = mkdtempSync(resolve(tmpdir(), "tova-source-audit-"))
    try {
      writeFileSync(resolve(root, "notes.txt"), "production fixture content")
      writeFileSync(resolve(root, "fake-provider.config"), "clean production content")

      const matches = auditRoots([root])
      expect(matches.some((match) => match.includes("notes.txt"))).toBe(true)
      expect(matches.some((match) => match.includes("fake-provider.config"))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
