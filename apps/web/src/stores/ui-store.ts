import { create } from "zustand"

import { RUNTIME_SETUP_DISMISS_MS } from "@/features/models/runtime-setup"

export type NavigationPanel =
  | "explorer"
  | "search"
  | "team-floor"
  | "missions"
  | "staff"
  | "settings"

interface UiState {
  activePanel: NavigationPanel
  selectedStaffId: string
  workLogOpen: boolean
  runtimeDialogOpen: boolean
  runtimeSetupDismissedUntil: number | null
  activeFile: string | null
  openFiles: string[]
  setActivePanel: (panel: NavigationPanel) => void
  selectStaff: (staffId: string) => void
  setWorkLogOpen: (open: boolean) => void
  setRuntimeDialogOpen: (open: boolean) => void
  clearRuntimeSetupDismissed: () => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  clearFiles: () => void
}

export const useUiStore = create<UiState>((set) => ({
  activePanel: "explorer",
  selectedStaffId: "staff_alex",
  workLogOpen: false,
  runtimeDialogOpen: false,
  runtimeSetupDismissedUntil: null,
  activeFile: null,
  openFiles: [],
  setActivePanel: (activePanel) => set({ activePanel }),
  selectStaff: (selectedStaffId) =>
    set({ selectedStaffId, workLogOpen: true }),
  setWorkLogOpen: (workLogOpen) => set({ workLogOpen }),
  setRuntimeDialogOpen: (runtimeDialogOpen) =>
    set((state) => ({
      runtimeDialogOpen,
      runtimeSetupDismissedUntil: runtimeDialogOpen
        ? state.runtimeSetupDismissedUntil
        : Date.now() + RUNTIME_SETUP_DISMISS_MS,
    })),
  clearRuntimeSetupDismissed: () => set({ runtimeSetupDismissedUntil: null }),
  openFile: (activeFile) =>
    set((state) => ({
      activeFile,
      openFiles: state.openFiles.includes(activeFile)
        ? state.openFiles
        : [...state.openFiles, activeFile],
    })),
  closeFile: (path) =>
    set((state) => {
      const openFiles = state.openFiles.filter((file) => file !== path)
      return {
        openFiles,
        activeFile: state.activeFile === path
          ? (openFiles.at(-1) ?? null)
          : state.activeFile,
      }
    }),
  clearFiles: () => set({ activeFile: null, openFiles: [] }),
}))
