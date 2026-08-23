import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SettingsScreen } from "@/components/settings/SettingsScreen"

vi.mock("@/components/system/LocalModelSetupPanel", () => ({
  LocalModelSetupPanel: () => <div data-testid="local-model-setup" />,
}))

vi.mock("@/features/models/model-api", () => ({
  getRuntimeStatus: vi.fn().mockResolvedValue({
    state: "unavailable",
    error: "Unavailable — start your local model server",
    selectedModel: null,
  }),
}))

describe("SettingsScreen diagnostics", () => {
  it("shows a diagnostics panel with recovery actions", async () => {
    const user = userEvent.setup()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <SettingsScreen />
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Diagnostics" }))
    expect(await screen.findByRole("heading", { name: "Diagnostics" })).toBeInTheDocument()
    expect(screen.getByText(/Start LM Studio Local Server/i)).toBeInTheDocument()
    expect(screen.getByText(/\/api\/runtime\/status/i)).toBeInTheDocument()
  })
})
