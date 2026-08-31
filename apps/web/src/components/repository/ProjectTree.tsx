import {
  useEffect,
  type Dispatch,
  type DragEvent,
  type ReactNode,
  type SetStateAction,
} from "react"
import { useQuery } from "@tanstack/react-query"

import { listProjectEntries, type ProjectEntry } from "@/features/projects/project-api"
import { entryParent } from "@/features/projects/project-entry-paths"
import { cn } from "@/lib/utils"

import {
  ProjectEntryMenu,
  ProjectTreeEntryRow,
} from "./ProjectEntryMenu"
import {
  ProjectEntryNameEditor,
  type EntryEdit,
} from "./ProjectEntryNameInput"

export interface SelectedProjectEntry extends ProjectEntry {
  parentPath: string
}

export interface ProjectTreeEntryRowProps {
  entry: ProjectEntry
  parentPath: string
  depth: number
  siblingEntries: ProjectEntry[]
  activeFile: string | null
  selected: SelectedProjectEntry | null
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  edit: EntryEdit | null
  editError: string | null
  pending: boolean
  onSelect: (entry: SelectedProjectEntry | null) => void
  onOpenFile: (path: string) => void
  onStartCreate: (
    parentPath: string,
    kind: ProjectEntry["kind"],
    returnFocus?: HTMLElement | null,
  ) => void
  onStartRename: (
    entry: SelectedProjectEntry,
    returnFocus?: HTMLElement | null,
  ) => void
  onSubmitEdit: (name: string) => void
  onCancelEdit: () => void
  onCopyPath: (path: string) => void
  onRefresh: () => void
  children?: ReactNode
  cutPath: string | null
  dropTarget: string | null
  onCut: (entry: SelectedProjectEntry) => void
  onPaste: (targetFolder: string) => void
  onDelete: (entry: ProjectEntry) => void
  onDragStartEntry: (entry: ProjectEntry) => void
  onDragEndEntry: () => void
  onDragOverTarget: (
    targetFolder: string | null,
    event?: { preventDefault: () => void },
  ) => void
  onDropOnTarget: (
    targetFolder: string,
    event: { preventDefault: () => void },
  ) => void
}

interface ProjectTreeProps {
  projectId: string
  entries: ProjectEntry[]
  activeFile: string | null
  selected: SelectedProjectEntry | null
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  edit: EntryEdit | null
  editError: string | null
  pending: boolean
  onSelect: (entry: SelectedProjectEntry | null) => void
  onOpenFile: (path: string) => void
  onStartCreate: (
    parentPath: string,
    kind: ProjectEntry["kind"],
    returnFocus?: HTMLElement | null,
  ) => void
  onStartRename: (
    entry: SelectedProjectEntry,
    returnFocus?: HTMLElement | null,
  ) => void
  onSubmitEdit: (name: string) => void
  onCancelEdit: () => void
  onCopyPath: (path: string) => void
  onRefresh: () => void
  onCollapseAll: () => void
  onEntriesLoaded: (parentPath: string, entries: ProjectEntry[]) => void
  cutPath: string | null
  dropTarget: string | null
  onCut: (entry: SelectedProjectEntry) => void
  onPaste: (targetFolder: string) => void
  onDelete: (entry: ProjectEntry) => void
  onDragStartEntry: (entry: ProjectEntry) => void
  onDragEndEntry: () => void
  onDragOverTarget: (
    targetFolder: string | null,
    event?: { preventDefault: () => void },
  ) => void
  onDropOnTarget: (
    targetFolder: string,
    event: { preventDefault: () => void },
  ) => void
}

export function ProjectTree(props: ProjectTreeProps) {
  const {
    entries,
    edit,
    pending,
    dropTarget,
    onStartCreate,
    onCopyPath,
    onRefresh,
    onCollapseAll,
    onPaste,
    onDragOverTarget,
    onDropOnTarget,
  } = props

  return (
    <ProjectEntryMenu
      pending={pending}
      onCreateFile={() => onStartCreate(".", "file")}
      onCreateFolder={() => onStartCreate(".", "dir")}
      onCopyPath={() => onCopyPath(".")}
      onRefresh={onRefresh}
      onCollapseAll={onCollapseAll}
      onPaste={props.cutPath ? () => onPaste(".") : undefined}
    >
      <div
        role="tree"
        aria-label="Project files"
        className={cn(
          "file-tree",
          dropTarget === "." && "file-tree__entry is-drop-target",
        )}
        onContextMenu={(event) => {
          if (event.target !== event.currentTarget) event.stopPropagation()
        }}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          if (event.target !== event.currentTarget) return
          onDragOverTarget(".", event)
        }}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          if (event.target !== event.currentTarget) return
          onDropOnTarget(".", event)
        }}
        onDragLeave={(event: DragEvent<HTMLDivElement>) => {
          const related = event.relatedTarget
          if (related instanceof Node && event.currentTarget.contains(related)) {
            return
          }
          onDragOverTarget(null)
        }}
      >
        {edit?.parentPath === "." && edit.mode !== "rename" && (
          <ProjectEntryNameEditor
            depth={0}
            entries={entries}
            edit={edit}
            pending={pending}
            error={props.editError}
            onSubmit={props.onSubmitEdit}
            onCancel={props.onCancelEdit}
          />
        )}
        {entries.map((entry) => (
          <ProjectTreeNode
            key={entry.path}
            entry={entry}
            parentPath="."
            depth={0}
            {...props}
            siblingEntries={entries}
          />
        ))}
        {entries.length === 0 && !edit && (
          <p className="project-explorer__empty">
            Empty folder — create a file or folder to begin.
          </p>
        )}
      </div>
    </ProjectEntryMenu>
  )
}

function ProjectTreeNode({
  entry,
  parentPath,
  depth,
  siblingEntries,
  ...props
}: ProjectTreeProps & {
  entry: ProjectEntry
  parentPath: string
  depth: number
  siblingEntries: ProjectEntry[]
}) {
  if (entry.kind === "dir") {
    return (
      <DirectoryNode
        entry={entry}
        parentPath={parentPath}
        depth={depth}
        {...props}
        siblingEntries={siblingEntries}
      />
    )
  }

  return (
    <ProjectTreeEntryRow
      entry={entry}
      parentPath={parentPath}
      depth={depth}
      {...props}
      siblingEntries={siblingEntries}
    />
  )
}

function DirectoryNode({
  entry,
  depth,
  expanded,
  edit,
  projectId,
  onEntriesLoaded,
  siblingEntries,
  ...props
}: ProjectTreeProps & {
  entry: ProjectEntry
  parentPath: string
  depth: number
  siblingEntries: ProjectEntry[]
}) {
  const isOpen = expanded[entry.path] === true
  const children = useQuery({
    queryKey: ["project-entries", projectId, entry.path],
    queryFn: () => listProjectEntries(projectId, entry.path),
    enabled: isOpen,
  })
  const childEntries = children.data ?? []

  useEffect(() => {
    if (children.data) onEntriesLoaded(entry.path, children.data)
  }, [children.data, entry.path, onEntriesLoaded])

  return (
    <ProjectTreeEntryRow
      {...props}
      entry={entry}
      parentPath={entryParent(entry.path)}
      depth={depth}
      expanded={expanded}
      edit={edit}
      siblingEntries={siblingEntries}
    >
      {isOpen && (
        <div role="group" className="file-tree__group">
          {children.isError && (
            <p role="alert" className="project-explorer__load-error">
              Could not load {entry.path}. Refresh Explorer to try again.
            </p>
          )}
          {edit?.parentPath === entry.path && edit.mode !== "rename" && (
            <ProjectEntryNameEditor
              depth={depth + 1}
              entries={childEntries}
              edit={edit}
              pending={props.pending}
              error={props.editError}
              onSubmit={props.onSubmitEdit}
              onCancel={props.onCancelEdit}
            />
          )}
          {childEntries.map((child) => (
            <ProjectTreeNode
              {...props}
              key={child.path}
              entry={child}
              parentPath={entry.path}
              depth={depth + 1}
              expanded={expanded}
              edit={edit}
              projectId={projectId}
              onEntriesLoaded={onEntriesLoaded}
              siblingEntries={childEntries}
            />
          ))}
        </div>
      )}
    </ProjectTreeEntryRow>
  )
}
