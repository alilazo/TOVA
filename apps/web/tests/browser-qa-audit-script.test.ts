import { execFile } from "node:child_process"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { afterEach, describe, expect, it } from "vitest"

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
)
const scriptPath = path.join(repoRoot, "apps/web/scripts/browser-qa-audit.mjs")
let server: Server | null = null

describe("browser QA audit script", () => {
  afterEach(async () => {
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
    server = null
  })

  it("captures screenshot and reports visual risks from a local page", async () => {
    const url = await serveHtml(`
      <!doctype html>
      <html>
        <head>
          <style>
            body { font-family: sans-serif; }
            #primary, #secondary {
              position: absolute;
              left: 20px;
              top: 20px;
              width: 160px;
              height: 44px;
            }
            #secondary { left: 80px; }
          </style>
        </head>
        <body>
          <h1>Hello TOVA</h1>
          <button id="primary">Primary action</button>
          <button id="secondary">Secondary action</button>
          <script>console.error("fixture console error")</script>
        </body>
      </html>
    `)
    const outputDir = await mkdtemp(path.join(tmpdir(), "tova-browser-audit-"))

    try {
      const { stdout } = await execFileAsync(process.execPath, [
        scriptPath,
        "--url",
        url,
        "--output-dir",
        outputDir,
        "--criteria-json",
        JSON.stringify(["Buttons should not overlap"]),
        "--selectors-json",
        JSON.stringify(["#primary"]),
        "--viewport-json",
        JSON.stringify({ width: 800, height: 600 }),
      ])

      const result = JSON.parse(stdout) as {
        verdict: string
        visible_text: string
        screenshot_path: string
        console_errors: string[]
        layout_findings: string[]
      }

      expect(result.verdict).toBe("needs_improvement")
      expect(result.visible_text).toContain("Hello TOVA")
      expect(result.console_errors).toContain("fixture console error")
      expect(result.layout_findings.some((finding) => finding.includes("overlap"))).toBe(true)
      await stat(path.join(outputDir, result.screenshot_path))
    } finally {
      await rm(outputDir, { recursive: true, force: true })
    }
  }, 30_000)
})

async function serveHtml(html: string): Promise<string> {
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" })
    response.end(html)
  })
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (typeof address !== "object" || address === null) {
    throw new Error("Server address unavailable")
  }
  return `http://127.0.0.1:${address.port}`
}
