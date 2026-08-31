import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useQuery } from "@tanstack/react-query"

import { ScrollArea } from "@/components/ui/scroll-area"
import {
  listProjectEntries,
  type ProjectEntry,
  type ProjectRecord,
} from "@/features/projects/project-api"
import {
  absoluteEntryPath,
  entryName,
  entryParent,
  isEntryWithin,
  joinEntryPath,
  normalizeEntryPath,
  remapEntryPath,
} from "@/features/projects/project-entry-paths"
import { useProjectEntryMutations } from "@/features/projects/use-project-entry-mutations"
import { useUiStore } from "@/stores/ui-store"

import { ProjectEntryDeleteDialog } from "./ProjectEntryDeleteDialog"
import { ProjectExplorerToolbar } from "./ProjectExplorerToolbar"
import type { EntryEdit } from "./ProjectEntryNameInput"
import { ProjectPathDialog } from "./ProjectPathDialog"
import {
  ProjectTree,
  type SelectedProjectEntry,
} from "./ProjectTree"

interface ProjectExplorerProps {
  project: ProjectRecord
  activeFile: string | null
  onOpenFile: (path: string) => void
  onProjectOpened: (project: ProjectRecord) => void
}

export async function copyProjectFilePath(path: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable")
  }
  await navigator.clipboard.writeText(path)
}

function moveDestination(sourcePath: string, targetFolder: string): string {
  return joinEntryPath(targetFolder, entryName(sourcePath))
}

function isNoOpMove(
  sourcePath: string,
  targetFolder: string,
  kind: ProjectEntry["kind"],
): boolean {
  if (entryParent(sourcePath) === normalizeEntryPath(targetFolder)) return true
  return kind === "dir" && isEntryWithin(targetFolder, sourcePath)
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest("input, textarea"))
}

function operationError(action: string, path: string, error: unknown): string {
  const detail = error instanceof Error && error.message
    ? error.message
    : "The project entry operation failed"
  return `Could not ${action} ${path}: ${detail}. Correct the name or try again.`
}

function collectVisibleRows(
  entries: ProjectEntry[],
  expanded: Record<string, boolean>,
  entriesByParent: Record<string, ProjectEntry[]>,
): ProjectEntry[] {
  const rows: ProjectEntry[] = []
  const walk = (items: ProjectEntry[]) => {
    for (const item of items) {
      rows.push(item)
      if (item.kind === "dir" && expanded[item.path]) {
        walk(entriesByParent[item.path] ?? [])
      }
    }
  }
  walk(entries)
  return rows
}

function selectionAfterDelete(
  deletedPath: string,
  visibleRows: ProjectEntry[],
): SelectedProjectEntry | null {
  const parent = entryParent(deletedPath)
  const paths = visibleRows.map((row) => row.path)
  const index = paths.indexOf(deletedPath)
  const nextSibling = paths.slice(index + 1).find((path) => entryParent(path) === parent)
  const previousSibling = [...paths.slice(0, Math.max(0, index))]
    .reverse()
    .find((path) => entryParent(path) === parent)
  const targetPath = nextSibling ?? previousSibling ?? (parent === "." ? null : parent)
  if (!targetPath) return null
  const row = visibleRows.find((item) => item.path === targetPath)
  return {
    name: row?.name ?? entryName(targetPath),
    path: targetPath,
    kind: row?.kind ?? "dir",
    parentPath: entryParent(targetPath),
  }
}

export function ProjectExplorer(props: ProjectExplorerProps) {
  return <ProjectExplorerForProject key={props.project.id} {...props} />
}

function ProjectExplorerForProject({
  project,
  activeFile,
  onOpenFile,
  onProjectOpened,
}: ProjectExplorerProps) {
  const [dialogMode, setDialogMode] = useState<"open" | "create" | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ ".": true })
  const [edit, setEdit] = useState<EntryEdit | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteEntry, setDeleteEntry] = useState<ProjectEntry | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const returnPathRef = useRef<string | null>(null)
  const [entriesByParent, setEntriesByParent] = useState<
    Record<string, ProjectEntry[]>
  >({})
  const selectedState = useUiStore((state) => state.selectedProjectEntry)
  const selectProjectEntry = useUiStore((state) => state.selectProjectEntry)
  const cutEntry = useUiStore((state) => state.cutEntry)
  const setCutEntry = useUiStore((state) => state.setCutEntry)
  const seedFileDraft = useUiStore((state) => state.seedFileDraft)
  const dirtyPaths = useUiStore((state) => state.dirtyPaths)
  const dragSourceRef = useRef<ProjectEntry | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const deleteVisibleRowsRef = useRef<ProjectEntry[]>([])
  const {
    createEntry,
    moveEntry,
    deleteEntry: deletePath,
    refreshEntries,
    pending,
  } = useProjectEntryMutations(project.id)
  const rootEntries = useQuery({
    queryKey: ["project-entries", project.id, "."],
    queryFn: () => listProjectEntries(project.id, "."),
  })

  const selected = useMemo<SelectedProjectEntry | null>(() => {
    if (!selectedState || selectedState.projectId !== project.id) return null
    const parentPath = entryParent(selectedState.path)
    const siblings = parentPath === "."
      ? rootEntries.data
      : entriesByParent[parentPath]
    const entry = siblings?.find(
      (candidate) => candidate.path === selectedState.path,
    )
    return {
      name: entry?.name ?? entryName(selectedState.path),
      path: selectedState.path,
      kind: selectedState.kind,
      parentPath,
    }
  }, [entriesByParent, project.id, rootEntries.data, selectedState])

  const handleEntriesLoaded = useCallback((
    parentPath: string,
    entries: ProjectEntry[],
  ) => {
    setEntriesByParent((current) =>
      current[parentPath] === entries
        ? current
        : { ...current, [parentPath]: entries })
  }, [])

  const handleSelect = useCallback((entry: SelectedProjectEntry | null) => {
    selectProjectEntry(entry
      ? { projectId: project.id, path: entry.path, kind: entry.kind }
      : null)
  }, [project.id, selectProjectEntry])

  const captureReturnFocus = useCallback((
    target?: HTMLElement | null,
    path?: string | null,
  ) => {
    returnFocusRef.current = target
      ?? (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null)
    returnPathRef.current = path ?? null
  }, [])

  const restoreReturnFocus = useCallback(() => {
    const element = returnFocusRef.current
    const path = returnPathRef.current
    returnFocusRef.current = null
    returnPathRef.current = null
    requestAnimationFrame(() => {
      if (element?.isConnected) {
        element.focus()
        return
      }
      if (!path) return
      document.querySelector<HTMLElement>(`[data-entry-path="${CSS.escape(path)}"]`)
        ?.focus()
    })
  }, [])

  const handleStartCreate = useCallback((
    parentPath: string,
    kind: ProjectEntry["kind"],
    returnFocus?: HTMLElement | null,
  ) => {
    captureReturnFocus(returnFocus)
    setExpanded((current) => ({ ...current, [parentPath]: true }))
    setEdit({
      mode: kind === "file" ? "create-file" : "create-dir",
      parentPath,
    })
    setEditError(null)
    setStatus(kind === "file" ? "Naming a new file" : "Naming a new folder")
  }, [captureReturnFocus])

  const handleStartRename = useCallback((
    entry: SelectedProjectEntry,
    returnFocus?: HTMLElement | null,
  ) => {
    captureReturnFocus(returnFocus, entry.path)
    handleSelect(entry)
    setEdit({ mode: "rename", parentPath: entry.parentPath, entry })
    setEditError(null)
    setStatus(`Renaming ${entry.path}`)
  }, [captureReturnFocus, handleSelect])

  const handleSubmitEdit = useCallback(async (name: string) => {
    if (!edit) return
    let destination: string
    try {
      destination = joinEntryPath(edit.parentPath, name)
    } catch (error) {
      const message = operationError(
        edit.mode === "rename" ? "rename" : "create",
        name,
        error,
      )
      setEditError(message)
      setStatus(message)
      return
    }
    setEditError(null)

    if (edit.mode === "rename" && edit.entry) {
      setStatus(`Renaming ${edit.entry.path}`)
      try {
        await moveEntry(edit.entry.path, destination)
        setExpanded((current) => Object.fromEntries(
          Object.entries(current).map(([path, value]) => [
            remapEntryPath(path, edit.entry!.path, destination),
            value,
          ]),
        ))
        setEdit(null)
        returnFocusRef.current = null
        returnPathRef.current = null
        setStatus(`Renamed ${edit.entry.path} to ${destination}`)
      } catch (error) {
        const message = operationError("rename", edit.entry.path, error)
        setEditError(message)
        setStatus(message)
      }
      return
    }

    const kind = edit.mode === "create-file" ? "file" : "dir"
    setStatus(`Creating ${destination}`)
    try {
      await createEntry(destination, kind)
      setExpanded((current) => ({
        ...current,
        [edit.parentPath]: true,
        ...(kind === "dir" ? { [destination]: true } : {}),
      }))
      handleSelect({
        name,
        path: destination,
        kind,
        parentPath: edit.parentPath,
      })
      setEdit(null)
      returnFocusRef.current = null
      returnPathRef.current = null
      if (kind === "file") {
        seedFileDraft(destination, "")
        onOpenFile(destination)
      }
      setStatus(`Created ${destination}`)
    } catch (error) {
      const message = operationError("create", destination, error)
      setEditError(message)
      setStatus(message)
    }
  }, [
    createEntry,
    edit,
    handleSelect,
    moveEntry,
    onOpenFile,
    seedFileDraft,
  ])

  const handleCopyPath = useCallback(async (path: string) => {
    const absolutePath = absoluteEntryPath(project.root, path)
    try {
      await copyProjectFilePath(absolutePath)
      setStatus(`Copied ${absolutePath}`)
    } catch {
      setStatus(
        `Could not copy ${absolutePath}. Clipboard access is unavailable; copy the path manually.`,
      )
    }
  }, [project.root])

  const handleRefresh = useCallback(async () => {
    setStatus("Refreshing project files")
    try {
      await refreshEntries()
      setStatus("Project files refreshed")
    } catch (error) {
      const message = operationError("refresh", "project files", error)
      setStatus(message)
    }
  }, [refreshEntries])

  const handleCollapseAll = useCallback(() => {
    setExpanded({ ".": true })
    setStatus("Collapsed all folders")
  }, [])

  const pasteFolder = selected?.kind === "dir"
    ? selected.path
    : (selected?.parentPath ?? ".")
  const creationParent = pasteFolder
  const projectCut = cutEntry?.projectId === project.id ? cutEntry : null

  const clearDrag = useCallback(() => {
    dragSourceRef.current = null
    setDropTarget(null)
  }, [])

  const relocateToFolder = useCallback(async (
    sourcePath: string,
    targetFolder: string,
    kind: ProjectEntry["kind"],
  ) => {
    if (pending || isNoOpMove(sourcePath, targetFolder, kind)) return
    const destination = moveDestination(sourcePath, targetFolder)
    setStatus(`Moving ${sourcePath} to ${destination}`)
    try {
      await moveEntry(sourcePath, destination)
      setExpanded((current) => Object.fromEntries(
        Object.entries(current).map(([path, value]) => [
          remapEntryPath(path, sourcePath, destination),
          value,
        ]),
      ))
      setCutEntry(null)
      setStatus(`Moved ${sourcePath} to ${destination}`)
    } catch (error) {
      setStatus(operationError("move", sourcePath, error))
    }
  }, [moveEntry, pending, setCutEntry])

  const handleCut = useCallback((entry: SelectedProjectEntry) => {
    if (pending) return
    handleSelect(entry)
    setCutEntry({ projectId: project.id, path: entry.path, kind: entry.kind })
    setStatus(`Cut ${entry.path}`)
  }, [handleSelect, pending, project.id, setCutEntry])

  const handlePaste = useCallback((targetFolder: string) => {
    if (!projectCut || pending) return
    void relocateToFolder(projectCut.path, targetFolder, projectCut.kind)
  }, [pending, projectCut, relocateToFolder])

  const handleStartDelete = useCallback((entry: ProjectEntry) => {
    if (pending) return
    handleSelect({
      name: entry.name,
      path: entry.path,
      kind: entry.kind,
      parentPath: entryParent(entry.path),
    })
    deleteVisibleRowsRef.current = collectVisibleRows(
      rootEntries.data ?? [],
      expanded,
      entriesByParent,
    )
    setDeleteError(null)
    setDeleteEntry(entry)
  }, [entriesByParent, expanded, handleSelect, pending, rootEntries.data])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteEntry || pending) return
    const path = deleteEntry.path
    const visibleRows = deleteVisibleRowsRef.current
    const nextSelection = selectionAfterDelete(path, visibleRows)
    setDeleteError(null)
    setStatus(`Deleting ${path}`)
    try {
      await deletePath(path, deleteEntry.kind === "dir")
      const parentPath = entryParent(path)
      setExpanded((current) => ({
        ...Object.fromEntries(
          Object.entries(current).filter(
            ([entryPath]) => !isEntryWithin(entryPath, path),
          ),
        ),
        ".": true,
        ...(parentPath !== "." ? { [parentPath]: true } : {}),
      }))
      handleSelect(nextSelection)
      returnFocusRef.current = null
      returnPathRef.current = nextSelection?.path ?? null
      setDeleteEntry(null)
      setStatus(`Deleted ${path}`)
      restoreReturnFocus()
    } catch (error) {
      const message = operationError("delete", path, error)
      setDeleteError(message)
      setStatus(message)
    }
  }, [
    deleteEntry,
    deletePath,
    handleSelect,
    pending,
    restoreReturnFocus,
  ])

  const hasDirtyFiles = Boolean(
    deleteEntry && Object.entries(dirtyPaths).some(
      ([path, dirty]) => dirty && isEntryWithin(path, deleteEntry.path),
    ),
  )

  const handleDragStartEntry = useCallback((entry: ProjectEntry) => {
    dragSourceRef.current = entry
  }, [])

  const handleDragOverTarget = useCallback((
    targetFolder: string | null,
    event?: { preventDefault: () => void },
  ) => {
    const source = dragSourceRef.current
    if (!source || targetFolder === null || isNoOpMove(source.path, targetFolder, source.kind)) {
      setDropTarget(null)
      return
    }
    event?.preventDefault()
    setDropTarget(targetFolder)
    setStatus(targetFolder === "."
      ? "Drop at project root"
      : `Drop into ${targetFolder}`)
  }, [])

  const handleDropOnTarget = useCallback((
    targetFolder: string,
    event: { preventDefault: () => void },
  ) => {
    const source = dragSourceRef.current
    const valid = source !== null
      && !pending
      && !isNoOpMove(source.path, targetFolder, source.kind)
    clearDrag()
    if (!source || !valid) return
    event.preventDefault()
    void relocateToFolder(source.path, targetFolder, source.kind)
  }, [clearDrag, pending, relocateToFolder])

  const handleExplorerKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (isTypingTarget(event.target)) return
    const ctrl = event.ctrlKey || event.metaKey
    if (ctrl && event.key.toLowerCase() === "x") {
      event.preventDefault()
      if (selected && !pending) handleCut(selected)
      return
    }
    if (ctrl && event.key.toLowerCase() === "v") {
      event.preventDefault()
      handlePaste(pasteFolder)
      return
    }
    if (event.key === "Escape" && projectCut) {
      event.preventDefault()
      setCutEntry(null)
      setStatus("Cut cancelled")
    }
  }, [handleCut, handlePaste, pasteFolder, pending, projectCut, selected, setCutEntry])

  return (
    <aside
      className="project-explorer"
      aria-label="Project explorer"
      onKeyDown={handleExplorerKeyDown}
    >
      <header className="project-explorer__label">
        <span>PROJECT</span>
        <ProjectExplorerToolbar
          pending={pending}
          onCreateFile={(trigger) => handleStartCreate(creationParent, "file", trigger)}
          onCreateFolder={(trigger) => handleStartCreate(creationParent, "dir", trigger)}
          onRefresh={() => void handleRefresh()}
          onCollapseAll={handleCollapseAll}
          onCopyProjectPath={() => void handleCopyPath(".")}
          onOpenProject={() => setDialogMode("open")}
          onNewProject={() => setDialogMode("create")}
        />
      </header>
      <ScrollArea className="project-explorer__scroll">
        {rootEntries.isPending ? (
          <p className="project-explorer__loading">Loading project files…</p>
        ) : rootEntries.isError ? (
          <p role="alert" className="project-explorer__load-error">
            Could not load project files. Refresh Explorer to try again.
          </p>
        ) : (
          <ProjectTree
            projectId={project.id}
            entries={rootEntries.data ?? []}
            activeFile={activeFile}
            selected={selected}
            expanded={expanded}
            setExpanded={setExpanded}
            edit={edit}
            editError={editError}
            pending={pending}
            cutPath={projectCut?.path ?? null}
            dropTarget={dropTarget}
            onSelect={handleSelect}
            onOpenFile={onOpenFile}
            onStartCreate={handleStartCreate}
            onStartRename={handleStartRename}
            onSubmitEdit={(name) => void handleSubmitEdit(name)}
            onCancelEdit={() => {
              setEdit(null)
              setEditError(null)
              setStatus("Naming cancelled")
              restoreReturnFocus()
            }}
            onCopyPath={(path) => void handleCopyPath(path)}
            onRefresh={() => void handleRefresh()}
            onCollapseAll={handleCollapseAll}
            onEntriesLoaded={handleEntriesLoaded}
            onCut={handleCut}
            onPaste={handlePaste}
            onDelete={handleStartDelete}
            onDragStartEntry={handleDragStartEntry}
            onDragEndEntry={clearDrag}
            onDragOverTarget={handleDragOverTarget}
            onDropOnTarget={handleDropOnTarget}
          />
        )}
      </ScrollArea>
      <p className="project-explorer__status" role="status" aria-live="polite">
        {status}
      </p>
      <ProjectPathDialog
        open={dialogMode !== null}
        mode={dialogMode ?? "open"}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null)
        }}
        onOpened={onProjectOpened}
      />
      <ProjectEntryDeleteDialog
        entry={deleteEntry}
        hasDirtyFiles={hasDirtyFiles}
        pending={pending}
        error={deleteError}
        onConfirm={() => void handleConfirmDelete()}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteEntry(null)
            setDeleteError(null)
          }
        }}
      />
    </aside>
  )
}
