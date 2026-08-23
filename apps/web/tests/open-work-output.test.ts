import { beforeEach, describe, expect, it } from "vitest"

import { useUiStore } from "@/stores/ui-store"

describe("open work output navigation", () => {
  beforeEach(() => {
    useUiStore.setState({
      activePanel: "team-floor",
      activeFile: null,
      openFiles: [],
    })
  })

  it("opens the file and switches to explorer", () => {
    const { openFile, setActivePanel } = useUiStore.getState()
    openFile("style.css")
    setActivePanel("explorer")

    const state = useUiStore.getState()
    expect(state.activeFile).toBe("style.css")
    expect(state.openFiles).toContain("style.css")
    expect(state.activePanel).toBe("explorer")
  })
})
