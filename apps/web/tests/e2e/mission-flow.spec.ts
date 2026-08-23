import { expect, test } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"

const apiBaseUrl = process.env.VITE_TOVA_API_URL ?? "http://127.0.0.1:8000"
const allowedRoot =
  process.env.TOVA_ALLOWED_PROJECT_ROOTS?.split(";").find(Boolean)
  ?? process.env.TEMP
  ?? "C:\\Temp"

interface StaffProfileResponse {
  display_name: string
}

const corsHeaders = { "Access-Control-Allow-Origin": "http://127.0.0.1:5173" }

function freshProjectPath(label: string) {
  const projectName = `tova-e2e-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return {
    projectName,
    projectRoot: join(allowedRoot, projectName),
  }
}

async function useRuntimeState(
  page: import("@playwright/test").Page,
  state: "unconfigured" | "unavailable",
) {
  await page.route("**/api/runtime/status", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        state,
        provider: "lm-studio",
        version: "0.1.0",
        error_code: state === "unavailable" ? "connection_failed" : undefined,
        error: state === "unavailable"
          ? "Unavailable — start your local model server"
          : undefined,
      }),
    })
  })
  await page.route("**/api/model-profiles/discover", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        detail: { code: "connection_failed", message: "Local model server unreachable" },
      }),
    })
  })
}

async function dismissRuntimeSetupIfOpen(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog", { name: "Connect local model" })
  try {
    await dialog.waitFor({ state: "visible", timeout: 5_000 })
  } catch {
    return
  }
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
}

async function useGuidedConnectMocks(page: import("@playwright/test").Page) {
  let connected = false
  const profile = {
    id: "profile_e2e",
    provider: "lm-studio",
    base_url: "http://127.0.0.1:1234/v1",
    models: [{ id: "laguna-xs-2.1" }],
  }

  await page.route("**/api/runtime/status", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify(
        connected
          ? {
              state: "connected",
              provider: "lm-studio",
              version: "0.1.0",
              selected_profile_id: profile.id,
              selected_model: "laguna-xs-2.1",
            }
          : {
              state: "unconfigured",
              provider: "lm-studio",
              version: "0.1.0",
            },
      ),
    })
  })

  await page.route("**/api/model-profiles/discover", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ profile, models: profile.models }),
    })
  })

  await page.route("**/api/runtime/model-selection", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.continue()
      return
    }
    connected = true
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        profile_id: profile.id,
        model: "laguna-xs-2.1",
      }),
    })
  })

  await page.route("**/api/model-profiles", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.continue()
      return
    }
    if (route.request().method() !== "GET") {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify(connected ? [profile] : []),
    })
  })
}

async function openProjectDialog(page: import("@playwright/test").Page) {
  const projectMenu = page.getByRole("button", { name: "Project menu" })
  if (await projectMenu.isVisible()) {
    await projectMenu.click()
    await page.getByRole("menuitem", { name: /Open project/ }).click()
    return
  }
  await page
    .getByRole("region", { name: "Code workspace" })
    .getByRole("button", { name: "Open project" })
    .click()
}

test("uses live APIs for projects and staff without fabricated mission activity", async ({ page }) => {
  const existing = freshProjectPath("open")
  const created = freshProjectPath("new")
  await mkdir(existing.projectRoot, { recursive: true })
  await useRuntimeState(page, "unavailable")

  const staffResponsePromise = page.waitForResponse(
    (response) => response.url() === `${apiBaseUrl}/api/staff` && response.status() === 200,
  )
  await page.goto("/")
  await dismissRuntimeSetupIfOpen(page)
  const staffResponse = await staffResponsePromise
  const staff = await staffResponse.json() as StaffProfileResponse[]
  expect(staff.length).toBeGreaterThan(0)

  await expect(page.getByText(/simulation|simulated|playback speed|restart demo/i)).toHaveCount(0)
  await expect(page.getByRole("button", { name: /playback|restart demo/i })).toHaveCount(0)

  const team = page.getByRole("complementary", { name: "Engineering Team" })
  await expect(team.getByText(`${staff.length} team members`)).toBeVisible()
  for (const profile of staff) {
    await expect(team.getByText(profile.display_name, { exact: true })).toBeVisible()
  }

  await openProjectDialog(page)
  await page.getByLabel("Folder path").fill(existing.projectRoot)
  await page.getByRole("button", { name: "Open", exact: true }).click()

  await expect(page.getByRole("dialog", { name: "Open project" })).toBeHidden({ timeout: 15_000 })
  await expect(page.getByText(existing.projectName).first()).toBeVisible()
  await expect(page.getByText("Empty folder — start a mission to fill it.")).toBeVisible()

  await page.getByRole("button", { name: "Project menu" }).click()
  await page.getByRole("menuitem", { name: /New project/ }).click()
  await page.getByLabel("Folder path").fill(created.projectRoot)
  await page.getByRole("button", { name: "Create and open" }).click()

  await expect(page.getByRole("dialog", { name: "New project" })).toBeHidden({ timeout: 15_000 })
  await expect(page.getByText(created.projectName).first()).toBeVisible()
  await expect(page.getByText("Empty folder — start a mission to fill it.")).toBeVisible()
  await page.getByLabel("Mission request").fill("This cannot start without an available runtime.")
  await expect(page.getByRole("button", { name: "Connect local model" })).toBeEnabled()

  await page.getByRole("button", { name: `View ${staff[0].display_name} Work Log` }).click()
  const workLog = page.getByRole("dialog", { name: "Work Log" })
  await expect(workLog).toBeVisible()
  await expect(workLog.getByText("No live activity recorded.")).toHaveCount(4)
  await expect(workLog.getByText("No live entries recorded.")).toHaveCount(4)
  await expect(workLog.getByRole("listitem")).toHaveCount(0)
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Team Floor" }).click()
  await expect(page.getByRole("region", { name: "Team Floor" })).toBeVisible()
  await expect(page.getByText("No mission is running")).toBeVisible()
  await expect(page.getByRole("region", { name: "Live code stage" })).toBeVisible()
  await expect(page.getByText("Waiting for the first file write")).toBeVisible()
})

for (const state of ["unconfigured", "unavailable"] as const) {
  test(`${state} runtime shows connect CTA instead of Send to Team`, async ({ page, request }) => {
    const project = freshProjectPath(state)
    const response = await request.post(`${apiBaseUrl}/api/projects`, {
      data: { path: project.projectRoot, create: true },
    })
    expect(response.ok()).toBe(true)
    await useRuntimeState(page, state)

    await page.goto("/")
    await dismissRuntimeSetupIfOpen(page)
    await expect(page.getByRole("button", { name: "Local model runtime" })).toBeVisible()
    await expect(page.getByText(
      state === "unconfigured" ? "Configure" : "Unavailable",
      { exact: true },
    )).toBeVisible()
    await page.getByLabel("Mission request").fill("Attempt a live mission.")
    await expect(page.getByRole("button", { name: "Connect local model" })).toBeEnabled()
    await expect(page.getByRole("button", { name: "Send to Team" })).toHaveCount(0)
    await page.getByRole("button", { name: "Connect local model" }).click()
    await expect(page.getByRole("dialog", { name: "Connect local model" })).toBeVisible()
  })
}

test("guided connect auto-applies a model and enables Send to Team", async ({ page, request }) => {
  const project = freshProjectPath("guided-connect")
  const response = await request.post(`${apiBaseUrl}/api/projects`, {
    data: { path: project.projectRoot, create: true },
  })
  expect(response.ok()).toBe(true)
  await useGuidedConnectMocks(page)

  await page.goto("/")
  await expect(page.getByRole("dialog", { name: "Connect local model" })).toBeVisible()
  await expect(page.getByText("Install and open LM Studio")).toBeVisible()
  await expect(page.getByRole("button", { name: "Local model runtime" })).toContainText(
    "Connected",
    { timeout: 15_000 },
  )
  await expect(page.getByRole("dialog")).toHaveCount(0)

  await page.getByLabel("Mission request").fill("Ship a guided connect mission.")
  await expect(page.getByRole("button", { name: "Send to Team" })).toBeEnabled()
})

test("keyboard-only path reaches Send to Team after guided connect", async ({ page, request }) => {
  const project = freshProjectPath("keyboard-connect")
  const response = await request.post(`${apiBaseUrl}/api/projects`, {
    data: { path: project.projectRoot, create: true },
  })
  expect(response.ok()).toBe(true)
  await useGuidedConnectMocks(page)

  await page.goto("/")
  await expect(page.getByRole("dialog", { name: "Connect local model" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Local model runtime" })).toContainText(
    "Connected",
    { timeout: 15_000 },
  )
  await expect(page.getByRole("dialog")).toHaveCount(0)

  await page.getByLabel("Mission request").focus()
  await page.keyboard.type("Ship a keyboard-only mission.")
  const send = page.getByRole("button", { name: "Send to Team" })
  await expect(send).toBeEnabled()
  await send.focus()
  await expect(send).toBeFocused()
})

test("Settings diagnostics, HiPo Staff, and Search are distinct destinations", async ({ page, request }) => {
  const project = freshProjectPath("nav-views")
  const created = await request.post(`${apiBaseUrl}/api/projects`, {
    data: { path: project.projectRoot, create: true },
  })
  expect(created.ok()).toBe(true)
  await useRuntimeState(page, "unavailable")
  await page.goto("/")
  await dismissRuntimeSetupIfOpen(page)

  await page.getByRole("button", { name: "Settings" }).click()
  await expect(page.getByRole("region", { name: "Settings" })).toBeVisible()
  await page.getByRole("button", { name: "Diagnostics" }).click()
  await expect(page.getByRole("heading", { name: "Diagnostics" })).toBeVisible()
  await expect(page.getByText("/api/runtime/status")).toBeVisible()

  await page.getByRole("button", { name: "HiPo Staff" }).click()
  await expect(page.getByRole("heading", { name: "HiPo Staff" })).toBeVisible()

  await page.getByRole("button", { name: "Search" }).click()
  await expect(page.getByLabel("Search repository")).toBeVisible()
  await page.getByLabel("Search repository").fill("readme")
  await expect(page.getByText(/Type to search|Searching|No matching files|readme/i)).toBeVisible()
})

test("empty mission request stays on Describe task", async ({ page, request }) => {
  const project = freshProjectPath("empty-objective")
  const response = await request.post(`${apiBaseUrl}/api/projects`, {
    data: { path: project.projectRoot, create: true },
  })
  expect(response.ok()).toBe(true)
  await useGuidedConnectMocks(page)

  await page.goto("/")
  await expect(page.getByRole("button", { name: "Local model runtime" })).toContainText(
    "Connected",
    { timeout: 15_000 },
  )
  await expect(page.getByRole("dialog")).toHaveCount(0)

  await page.getByLabel("Mission request").fill("   ")
  await expect(page.getByRole("button", { name: "Describe task" })).toBeDisabled()
})

test("primary shell stays usable at a narrow desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 })
  await useRuntimeState(page, "unavailable")
  await page.goto("/")
  await dismissRuntimeSetupIfOpen(page)

  await expect(page.getByLabel("Mission request")).toBeVisible()
  await page.getByRole("button", { name: "Settings" }).click()
  await expect(page.getByRole("region", { name: "Settings" })).toBeVisible()
  await page.getByRole("button", { name: "HiPo Staff" }).click()
  await expect(page.getByRole("heading", { name: "HiPo Staff" })).toBeVisible()
})

