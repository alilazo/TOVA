import { create } from "zustand"

import { RUNTIME_SETUP_DISMISS_MS } from "@/features/models/runtime-setup"
import {
  assertProjectRelativePath,
  isEntryWithin,
  normalizeEntryPath,
  remapEntryPath,
} from "@/features/projects/project-entry-paths"

export type NavigationPanel =
  | "explorer"
  | "search"
  | "team-floor"
  | "missions"
  | "staff"
  | "settings"

export interface ProjectEntrySelection {
  projectId: string
  path: string
  kind: "file" | "dir"
}

export type CutProjectEntry = ProjectEntrySelection

function remapRecordKeys<T>(
  record: Record<string, T>,
  source: string,
  destination: string,
): Record<string, T> {
  if (normalizeEntryPath(source) === normalizeEntryPath(destination)) {
    return record
  }

  const remapped: Record<string, T> = {}
  const entries = Object.entries(record)

  for (const [path, value] of entries) {
    if (!isEntryWithin(path, source)) remapped[path] = value
  }
  for (const [path, value] of entries) {
    if (isEntryWithin(path, source)) {
      remapped[remapEntryPath(path, source, destination)] = value
    }
  }

  return remapped
}

function removeRecordTree<T>(
  record: Record<string, T>,
  path: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !isEntryWithin(key, path)),
  )
}

function isEntryForProject(
  entry: ProjectEntrySelection,
  projectId: string | undefined,
): boolean {
  return projectId === undefined || entry.projectId === projectId
}

function normalizeProjectEntry<T extends ProjectEntrySelection>(entry: T): T {
  return {
    ...entry,
    path: assertProjectRelativePath(entry.path, entry.kind === "dir"),
  }
}

interface UiState {
  activePanel: NavigationPanel
  selectedStaffId: string
  workLogOpen: boolean
  runtimeDialogOpen: boolean
  runtimeSetupDismissedUntil: number | null
  activeFile: string | null
  openFiles: string[]
  draftByPath: Record<string, string>
  dirtyPaths: Record<string, boolean>
  selectedProjectEntry: ProjectEntrySelection | null
  cutEntry: CutProjectEntry | null
  setActivePanel: (panel: NavigationPanel) => void
  selectStaff: (staffId: string) => void
  setWorkLogOpen: (open: boolean) => void
  setRuntimeDialogOpen: (open: boolean) => void
  clearRuntimeSetupDismissed: () => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  seedFileDraft: (path: string, content: string) => void
  setFileDraft: (path: string, content: string) => void
  markFileSaved: (path: string) => void
  selectProjectEntry: (entry: ProjectEntrySelection | null) => void
  setCutEntry: (entry: CutProjectEntry | null) => void
  relocatePath: (
    source: string,
    destination: string,
    projectId?: string,
  ) => void
  removePathTree: (path: string, projectId?: string) => void
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
  draftByPath: {},
  dirtyPaths: {},
  selectedProjectEntry: null,
  cutEntry: null,
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
  openFile: (path) => {
    const activeFile = assertProjectRelativePath(path)
    set((state) => ({
      activeFile,
      openFiles: state.openFiles.includes(activeFile)
        ? state.openFiles
        : [...state.openFiles, activeFile],
    }))
  },
  closeFile: (path) => {
    const normalizedPath = assertProjectRelativePath(path)
    set((state) => {
      const openFiles = state.openFiles.filter((file) => file !== normalizedPath)
      return {
        openFiles,
        activeFile: state.activeFile === normalizedPath
          ? (openFiles.at(-1) ?? null)
          : state.activeFile,
      }
    })
  },
  seedFileDraft: (path, content) => {
    const normalizedPath = assertProjectRelativePath(path)
    set((state) => ({
      draftByPath: { ...state.draftByPath, [normalizedPath]: content },
      dirtyPaths: { ...state.dirtyPaths, [normalizedPath]: false },
    }))
  },
  setFileDraft: (path, content) => {
    const normalizedPath = assertProjectRelativePath(path)
    set((state) => ({
      draftByPath: { ...state.draftByPath, [normalizedPath]: content },
      dirtyPaths: { ...state.dirtyPaths, [normalizedPath]: true },
    }))
  },
  markFileSaved: (path) => {
    const normalizedPath = assertProjectRelativePath(path)
    set((state) => ({
      dirtyPaths: { ...state.dirtyPaths, [normalizedPath]: false },
    }))
  },
  selectProjectEntry: (selectedProjectEntry) =>
    set({
      selectedProjectEntry: selectedProjectEntry
        ? normalizeProjectEntry(selectedProjectEntry)
        : null,
    }),
  setCutEntry: (cutEntry) =>
    set({ cutEntry: cutEntry ? normalizeProjectEntry(cutEntry) : null }),
  relocatePath: (source, destination, projectId) => {
    const normalizedSource = normalizeEntryPath(source)
    const normalizedDestination = normalizeEntryPath(destination)
    if (normalizedSource === normalizedDestination) return

    set((state) => ({
      activeFile: state.activeFile
        ? remapEntryPath(
            state.activeFile,
            normalizedSource,
            normalizedDestination,
          )
        : null,
      openFiles: [
        ...new Set(state.openFiles.map((path) =>
          remapEntryPath(path, normalizedSource, normalizedDestination))),
      ],
      draftByPath: remapRecordKeys(
        state.draftByPath,
        normalizedSource,
        normalizedDestination,
      ),
      dirtyPaths: remapRecordKeys(
        state.dirtyPaths,
        normalizedSource,
        normalizedDestination,
      ),
      selectedProjectEntry:
        state.selectedProjectEntry
        && isEntryForProject(state.selectedProjectEntry, projectId)
          ? {
              ...state.selectedProjectEntry,
              path: remapEntryPath(
                state.selectedProjectEntry.path,
                normalizedSource,
                normalizedDestination,
              ),
            }
          : state.selectedProjectEntry,
      cutEntry:
        state.cutEntry && isEntryForProject(state.cutEntry, projectId)
          ? {
              ...state.cutEntry,
              path: remapEntryPath(
                state.cutEntry.path,
                normalizedSource,
                normalizedDestination,
              ),
            }
          : state.cutEntry,
    }))
  },
  removePathTree: (path, projectId) => {
    const normalizedPath = normalizeEntryPath(path)
    set((state) => {
      const openFiles = state.openFiles.filter(
        (item) => !isEntryWithin(item, normalizedPath),
      )
      return {
        openFiles,
        activeFile:
          state.activeFile && isEntryWithin(state.activeFile, normalizedPath)
            ? (openFiles.at(-1) ?? null)
            : state.activeFile,
        draftByPath: removeRecordTree(state.draftByPath, normalizedPath),
        dirtyPaths: removeRecordTree(state.dirtyPaths, normalizedPath),
        selectedProjectEntry:
          state.selectedProjectEntry
          && isEntryForProject(state.selectedProjectEntry, projectId)
          && isEntryWithin(state.selectedProjectEntry.path, normalizedPath)
            ? null
            : state.selectedProjectEntry,
        cutEntry:
          state.cutEntry
          && isEntryForProject(state.cutEntry, projectId)
          && isEntryWithin(state.cutEntry.path, normalizedPath)
            ? null
            : state.cutEntry,
      }
    })
  },
  clearFiles: () =>
    set({
      activeFile: null,
      openFiles: [],
      draftByPath: {},
      dirtyPaths: {},
      selectedProjectEntry: null,
      cutEntry: null,
    }),
}))
