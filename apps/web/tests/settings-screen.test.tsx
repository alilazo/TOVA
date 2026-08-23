import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  discoverModels,
  getRuntimeStatus,
  listModelProfiles,
  selectModel,
  testModel,
} = vi.hoisted(() => ({
  discoverModels: vi.fn(),
  getRuntimeStatus: vi.fn(),
  listModelProfiles: vi.fn(),
  selectModel: vi.fn(),
  testModel: vi.fn(),
}))

vi.mock("@/features/models/model-api", () => ({
  discoverModels,
  getRuntimeStatus,
  listModelProfiles,
  selectModel,
  testModel,
}))

import { SettingsScreen } from "@/components/settings/SettingsScreen"

const globalsCss = readFileSync(resolve(process.cwd(), "src/styles/globals.css"), "utf8")

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    discoverModels.mockReset()
    getRuntimeStatus.mockReset()
    listModelProfiles.mockReset()
    selectModel.mockReset()
    testModel.mockReset()
    listModelProfiles.mockResolvedValue([])
    getRuntimeStatus.mockResolvedValue({
      state: "connected",
      provider: "lm-studio",
      selectedProfileId: "profile_1",
      selectedModel: "qwen/qwen3.6-35b-a3b",
      errorCode: null,
      error: null,
    })
  })

  it("renders Cursor-style settings categories with the local model panel", async () => {
    renderWithClient(<SettingsScreen />)

    expect(screen.getByRole("region", { name: "Settings" })).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Settings categories" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Local model" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    expect(screen.getByRole("heading", { name: "Local model" })).toBeInTheDocument()
    expect(await screen.findByText("Connected")).toBeInTheDocument()
    expect(screen.getAllByText("qwen/qwen3.6-35b-a3b").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Change model" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Done" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
  })

  it("auto-applies a model when settings opens unconfigured", async () => {
    getRuntimeStatus.mockResolvedValue({
      state: "unconfigured",
      provider: "lm-studio",
      selectedProfileId: null,
      selectedModel: null,
      errorCode: null,
      error: null,
    })
    discoverModels.mockResolvedValue({
      id: "profile_1",
      provider: "lm-studio",
      base_url: "http://127.0.0.1:1234/v1",
      models: [{ id: "laguna-xs-2.1" }],
    })
    selectModel.mockResolvedValue({
      profile_id: "profile_1",
      model: "laguna-xs-2.1",
    })

    renderWithClient(<SettingsScreen />)

    await waitFor(() => {
      expect(selectModel).toHaveBeenCalledWith({
        profile_id: "profile_1",
        model: "laguna-xs-2.1",
      })
    })
    expect(screen.queryByRole("button", { name: "Make me ready" })).not.toBeInTheDocument()
  })

  it("keeps settings layout styles for the dedicated view", () => {
    expect(globalsCss).toContain(".settings-screen {")
    expect(globalsCss).toContain("grid-template-columns: 200px minmax(0, 1fr)")
    expect(globalsCss).toContain(".settings-screen__nav-item.is-active")
  })

  it("does not auto-discover when already connected", async () => {
    renderWithClient(<SettingsScreen />)
    await screen.findByText("Connected")
    await waitFor(() => {
      expect(discoverModels).not.toHaveBeenCalled()
    })
  })
})
