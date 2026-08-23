import { mkdir } from "node:fs/promises"
import path from "node:path"

import { chromium } from "@playwright/test"

const MAX_TEXT = 4000
const DEFAULT_VIEWPORT = { width: 1440, height: 900 }

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const url = required(args, "url")
  const outputDir = required(args, "output-dir")
  const acceptanceCriteria = parseJsonArray(args["criteria-json"])
  const selectorsToCheck = parseJsonArray(args["selectors-json"])
  const viewport = parseViewport(args["viewport-json"])

  await mkdir(outputDir, { recursive: true })
  const screenshotPath = path.join(outputDir, "screenshot.png")
  const consoleErrors = []
  const failedRequests = []

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport })
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text().slice(0, 500))
      }
    })
    page.on("requestfailed", (request) => {
      failedRequests.push(`${request.method()} ${request.url()}`.slice(0, 500))
    })

    let blockedError = ""
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 })
      await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined)
    } catch (error) {
      blockedError = error instanceof Error ? error.message : String(error)
    }

    if (blockedError) {
      console.log(JSON.stringify({
        url,
        title: "",
        verdict: "blocked",
        summary: "Browser audit could not load the local URL",
        screenshot_path: "",
        visible_text: "",
        console_errors: consoleErrors,
        failed_requests: failedRequests,
        layout_findings: [blockedError.slice(0, 500)],
      }))
      return
    }

    await page.screenshot({ path: screenshotPath, fullPage: true })
    const [title, visibleText, layoutFindings] = await Promise.all([
      page.title(),
      page.locator("body").innerText({ timeout: 5_000 }).catch(() => ""),
      page.evaluate(collectLayoutFindings, selectorsToCheck),
    ])
    const verdict = layoutFindings.length || consoleErrors.length || failedRequests.length
      ? "needs_improvement"
      : "pass"

    console.log(JSON.stringify({
      url: page.url(),
      title,
      verdict,
      summary: summaryFor(verdict, layoutFindings, consoleErrors, failedRequests, acceptanceCriteria),
      screenshot_path: "screenshot.png",
      visible_text: visibleText.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT),
      console_errors: consoleErrors,
      failed_requests: failedRequests,
      layout_findings: layoutFindings,
      viewport,
    }))
  } finally {
    await browser.close()
  }
}

function parseArgs(rawArgs) {
  const parsed = {}
  for (let index = 0; index < rawArgs.length; index += 2) {
    const key = rawArgs[index]
    const value = rawArgs[index + 1]
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<empty>"}`)
    }
    parsed[key.slice(2)] = value
  }
  return parsed
}

function required(args, key) {
  const value = args[key]
  if (!value) throw new Error(`Missing --${key}`)
  return value
}

function parseJsonArray(value) {
  if (!value) return []
  const parsed = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.map((item) => String(item).slice(0, 300)) : []
}

function parseViewport(value) {
  if (!value) return DEFAULT_VIEWPORT
  const parsed = JSON.parse(value)
  const width = Number(parsed.width)
  const height = Number(parsed.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return DEFAULT_VIEWPORT
  return {
    width: Math.min(Math.max(Math.round(width), 320), 3840),
    height: Math.min(Math.max(Math.round(height), 240), 2160),
  }
}

function collectLayoutFindings(selectorsToCheck) {
  function labelForElement(element) {
    const id = element.id ? `#${element.id}` : ""
    const text = (element.innerText || element.getAttribute("aria-label") || element.tagName)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
    return `${element.tagName.toLowerCase()}${id}${text ? ` "${text}"` : ""}`
  }

  function rectForElement(element) {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }
  }

  function overlapAreaFor(left, right) {
    const width = Math.min(left.right, right.right) - Math.max(left.left, right.left)
    const height = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
    return width > 0 && height > 0 ? width * height : 0
  }

  const findings = []
  const candidates = Array.from(
    document.querySelectorAll("button, a, input, select, textarea, [role='button']"),
  ).map((element) => ({
    label: labelForElement(element),
    rect: rectForElement(element),
  })).filter((item) => item.rect.width > 0 || item.rect.height > 0)

  for (const candidate of candidates) {
    if (candidate.rect.width === 0 || candidate.rect.height === 0) {
      findings.push(`${candidate.label} has zero-size clickable bounds`)
    }
    if (
      candidate.rect.right < 0 ||
      candidate.rect.bottom < 0 ||
      candidate.rect.left > window.innerWidth ||
      candidate.rect.top > window.innerHeight
    ) {
      findings.push(`${candidate.label} is outside the viewport`)
    }
  }

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex]
      const right = candidates[rightIndex]
      if (overlapAreaFor(left.rect, right.rect) > 24) {
        findings.push(`${left.label} overlaps ${right.label}`)
      }
    }
  }

  for (const selector of selectorsToCheck) {
    const element = document.querySelector(selector)
    if (!element) {
      findings.push(`Selector ${selector} was not found`)
      continue
    }
    const rect = rectForElement(element)
    if (rect.width === 0 || rect.height === 0) {
      findings.push(`Selector ${selector} has no visible bounds`)
    }
  }

  return Array.from(new Set(findings)).slice(0, 50)
}

function summaryFor(verdict, layoutFindings, consoleErrors, failedRequests, acceptanceCriteria) {
  if (verdict === "pass") {
    return acceptanceCriteria.length
      ? `Page passed browser audit for ${acceptanceCriteria.length} acceptance criteria`
      : "Page passed browser audit"
  }
  const issueCount = layoutFindings.length + consoleErrors.length + failedRequests.length
  return `Page needs improvement; browser audit found ${issueCount} issue(s)`
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
