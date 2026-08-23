import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { shouldAutoOpenRuntimeSetup } from "@/features/models/runtime-setup"
import { useUiStore } from "@/stores/ui-store"

describe("runtime setup auto-open", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-01T22:00:00.000Z"))
    useUiStore.setState({
      runtimeDialogOpen: false,
      runtimeSetupDismissedUntil: null,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts a cooldown when the runtime dialog is closed", () => {
    useUiStore.getState().setRuntimeDialogOpen(true)
    useUiStore.getState().setRuntimeDialogOpen(false)
    expect(useUiStore.getState().runtimeSetupDismissedUntil).toBe(
      Date.now() + 90_000,
    )
    expect(useUiStore.getState().runtimeDialogOpen).toBe(false)
  })

  it("clears dismiss cooldown when runtime becomes connected", () => {
    useUiStore.setState({ runtimeSetupDismissedUntil: Date.now() + 90_000 })
    useUiStore.getState().clearRuntimeSetupDismissed()
    expect(useUiStore.getState().runtimeSetupDismissedUntil).toBeNull()
  })

  it("opens when unconfigured and not in cooldown", () => {
    expect(
      shouldAutoOpenRuntimeSetup({
        state: "unconfigured",
        dialogOpen: false,
        dismissedUntil: null,
      }),
    ).toBe(true)
  })

  it("does not reopen during dismiss cooldown", () => {
    expect(
      shouldAutoOpenRuntimeSetup({
        state: "unconfigured",
        dialogOpen: false,
        dismissedUntil: Date.now() + 90_000,
      }),
    ).toBe(false)
  })

  it("reopens after dismiss cooldown expires", () => {
    const dismissedUntil = Date.now() + 90_000
    expect(
      shouldAutoOpenRuntimeSetup({
        state: "unconfigured",
        dialogOpen: false,
        dismissedUntil,
      }),
    ).toBe(false)

    vi.advanceTimersByTime(90_000)
    expect(
      shouldAutoOpenRuntimeSetup({
        state: "unconfigured",
        dialogOpen: false,
        dismissedUntil,
      }),
    ).toBe(true)
  })

  it("does not open when already connected", () => {
    expect(
      shouldAutoOpenRuntimeSetup({
        state: "connected",
        dialogOpen: false,
        dismissedUntil: null,
      }),
    ).toBe(false)
  })
})
