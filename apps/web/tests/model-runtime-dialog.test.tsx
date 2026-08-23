import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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

import { ModelRuntimeDialog } from "@/components/system/ModelRuntimeDialog"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe("ModelRuntimeDialog guided setup", () => {
  beforeEach(() => {
    discoverModels.mockReset()
    getRuntimeStatus.mockReset()
    listModelProfiles.mockReset()
    selectModel.mockReset()
    testModel.mockReset()
    listModelProfiles.mockResolvedValue([])
    getRuntimeStatus.mockResolvedValue({
      state: "unconfigured",
      provider: "lm-studio",
      selectedProfileId: null,
      selectedModel: null,
      errorCode: null,
      error: null,
    })
  })

  it("shows LM Studio cold-start steps and auto-applies the preferred model", async () => {
    discoverModels.mockResolvedValue({
      id: "profile_1",
      provider: "lm-studio",
      base_url: "http://127.0.0.1:1234/v1",
      models: [
        { id: "laguna-xs-2.1" },
        { id: "qwen/qwen3.6-35b-a3b" },
      ],
    })
    selectModel.mockResolvedValue({
      profile_id: "profile_1",
      model: "qwen/qwen3.6-35b-a3b",
    })
    const onOpenChange = vi.fn()

    renderWithClient(<ModelRuntimeDialog open onOpenChange={onOpenChange} />)

    expect(screen.getByRole("heading", { name: "Connect local model" })).toBeInTheDocument()
    expect(screen.getByText("Install and open LM Studio")).toBeInTheDocument()
    expect(screen.getByText("Start Local Server")).toBeInTheDocument()
    expect(screen.getByText("Load a model")).toBeInTheDocument()
    expect(screen.queryByLabelText("LM Studio Server URL")).not.toBeInTheDocument()

    await waitFor(() => {
      expect(discoverModels).toHaveBeenCalledWith("http://127.0.0.1:1234")
    })
    await waitFor(() => {
      expect(selectModel).toHaveBeenCalledWith({
        profile_id: "profile_1",
        model: "qwen/qwen3.6-35b-a3b",
      })
    })
    expect(screen.queryByRole("button", { name: "Make me ready" })).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("auto-applies the first model when preferred is missing among multiple", async () => {
    discoverModels.mockResolvedValue({
      id: "profile_1",
      provider: "lm-studio",
      base_url: "http://127.0.0.1:1234/v1",
      models: [{ id: "laguna-xs-2.1" }, { id: "openai/gpt-oss-20b" }],
    })
    selectModel.mockResolvedValue({
      profile_id: "profile_1",
      model: "laguna-xs-2.1",
    })
    const onOpenChange = vi.fn()

    renderWithClient(<ModelRuntimeDialog open onOpenChange={onOpenChange} />)

    await waitFor(() => {
      expect(selectModel).toHaveBeenCalledWith({
        profile_id: "profile_1",
        model: "laguna-xs-2.1",
      })
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("auto-applies a sole model without a Make me ready click", async () => {
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
    const onOpenChange = vi.fn()

    renderWithClient(<ModelRuntimeDialog open onOpenChange={onOpenChange} />)

    await waitFor(() => {
      expect(selectModel).toHaveBeenCalledWith({
        profile_id: "profile_1",
        model: "laguna-xs-2.1",
      })
    })
    expect(screen.queryByRole("button", { name: "Make me ready" })).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("keeps Connect local server retry and LM Studio install link after discover failure", async () => {
    discoverModels.mockRejectedValueOnce(new Error("Local model server unreachable"))
    discoverModels.mockResolvedValueOnce({
      id: "profile_1",
      provider: "lm-studio",
      base_url: "http://127.0.0.1:1234/v1",
      models: [{ id: "laguna-xs-2.1" }],
    })
    selectModel.mockResolvedValue({
      profile_id: "profile_1",
      model: "laguna-xs-2.1",
    })

    renderWithClient(<ModelRuntimeDialog open onOpenChange={() => undefined} />)

    expect(await screen.findByText("Local model server unreachable")).toBeInTheDocument()
    const installLink = screen.getByRole("link", { name: "Get LM Studio" })
    expect(installLink).toHaveAttribute("href", "https://lmstudio.ai")
    expect(installLink).toHaveAttribute("target", "_blank")
    fireEvent.click(screen.getByRole("button", { name: "Connect local server" }))

    await waitFor(() => {
      expect(selectModel).toHaveBeenCalledWith({
        profile_id: "profile_1",
        model: "laguna-xs-2.1",
      })
    })
  })

  it("does not auto-apply when discover returns no models", async () => {
    discoverModels.mockResolvedValue({
      id: "profile_1",
      provider: "lm-studio",
      base_url: "http://127.0.0.1:1234/v1",
      models: [],
    })

    renderWithClient(<ModelRuntimeDialog open onOpenChange={() => undefined} />)

    expect(
      await screen.findByText("No models found. Load a model in LM Studio, then retry."),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Get LM Studio" })).toBeInTheDocument()
    expect(selectModel).not.toHaveBeenCalled()
  })

  it("reveals advanced URL controls with LM Studio compatibility note", async () => {
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

    renderWithClient(<ModelRuntimeDialog open onOpenChange={() => undefined} />)
    await waitFor(() => {
      expect(selectModel).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByRole("button", { name: "Advanced" }))
    expect(screen.getByLabelText("LM Studio Server URL")).toHaveValue("http://127.0.0.1:1234")
    expect(
      screen.getByText("Compatible with LM Studio Local Server on the default port."),
    ).toBeInTheDocument()
  })

  it("renders a green Connected label when runtime is connected", async () => {
    getRuntimeStatus.mockResolvedValue({
      state: "connected",
      provider: "lm-studio",
      selectedProfileId: "profile_1",
      selectedModel: "qwen/qwen3.6-35b-a3b",
      errorCode: null,
      error: null,
    })
    listModelProfiles.mockResolvedValue([
      {
        id: "profile_1",
        provider: "lm-studio",
        base_url: "http://127.0.0.1:1234/v1",
        models: [{ id: "qwen/qwen3.6-35b-a3b" }],
      },
    ])
    const onOpenChange = vi.fn()

    renderWithClient(<ModelRuntimeDialog open onOpenChange={onOpenChange} />)

    expect(await screen.findByText("Connected")).toBeInTheDocument()
    const badge = document.querySelector(".runtime-dialog__status-badge")
    expect(badge).toHaveTextContent("Connected")
    expect(badge?.closest(".runtime-dialog__status")).toHaveTextContent("qwen/qwen3.6-35b-a3b")
    expect(discoverModels).not.toHaveBeenCalled()
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Use this model" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(selectModel).not.toHaveBeenCalled()
  })

  it("lets a connected user change model then apply with Use this model", async () => {
    getRuntimeStatus.mockResolvedValue({
      state: "connected",
      provider: "lm-studio",
      selectedProfileId: "profile_1",
      selectedModel: "qwen/qwen3.6-35b-a3b",
      errorCode: null,
      error: null,
    })
    listModelProfiles.mockResolvedValue([
      {
        id: "profile_1",
        provider: "lm-studio",
        base_url: "http://127.0.0.1:1234/v1",
        models: [{ id: "qwen/qwen3.6-35b-a3b" }, { id: "laguna-xs-2.1" }],
      },
    ])
    discoverModels.mockResolvedValue({
      id: "profile_2",
      provider: "lm-studio",
      base_url: "http://127.0.0.1:1234/v1",
      models: [{ id: "qwen/qwen3.6-35b-a3b" }, { id: "laguna-xs-2.1" }],
    })
    selectModel.mockResolvedValue({
      profile_id: "profile_2",
      model: "laguna-xs-2.1",
    })

    renderWithClient(<ModelRuntimeDialog open onOpenChange={() => undefined} />)
    await screen.findByText("Connected")

    fireEvent.click(screen.getByRole("button", { name: "Change model" }))
    await screen.findByText("Found 2 local models")
    expect(selectModel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("combobox", { name: "Model" }))
    fireEvent.click(await screen.findByRole("option", { name: "laguna-xs-2.1" }))
    fireEvent.click(screen.getByRole("button", { name: "Use this model" }))

    await waitFor(() => {
      expect(selectModel).toHaveBeenCalledWith({
        profile_id: "profile_2",
        model: "laguna-xs-2.1",
      })
    })
  })

  it("shows waiting copy when the local server is up without a loaded model", async () => {
    getRuntimeStatus.mockResolvedValue({
      state: "unconfigured",
      provider: "lm-studio",
      selectedProfileId: null,
      selectedModel: null,
      errorCode: null,
      error: "Local model server is running — load a model",
    })
    discoverModels.mockResolvedValue({
      id: "profile_1",
      provider: "lm-studio",
      base_url: "http://127.0.0.1:1234/v1",
      models: [],
    })

    renderWithClient(<ModelRuntimeDialog open onOpenChange={() => undefined} />)

    expect(
      await screen.findByText("Local model server is running — load a model"),
    ).toBeInTheDocument()
    expect(selectModel).not.toHaveBeenCalled()
  })
})
