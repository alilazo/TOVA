import {
  Fragment,
  useRef,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { ProjectEntry } from "@/features/projects/project-api"
import { cn } from "@/lib/utils"

import { ProjectEntryNameEditor } from "./ProjectEntryNameInput"
import type { ProjectTreeEntryRowProps } from "./ProjectTree"

interface ProjectEntryMenuProps {
  children: ReactNode
  entry?: ProjectEntry
  pending: boolean
  onMenuOpen?: () => void
  onOpen?: () => void
  onCreateFile?: () => void
  onCreateFolder?: () => void
  onRename?: () => void
  onCut?: () => void
  onPaste?: () => void
  onCopyPath: () => void
  onRefresh?: () => void
  onCollapseAll?: () => void
  onDelete?: () => void
}

interface MenuAction {
  label: string
  shortcut?: string
  action?: () => void
  variant?: "default" | "destructive"
  startsEdit?: boolean
}

function MenuItem({
  children,
  pending,
  onSelect,
  variant,
  startsEdit,
  onBeginEdit,
}: {
  children: ReactNode
  pending: boolean
  onSelect?: () => void
  variant?: "default" | "destructive"
  startsEdit?: boolean
  onBeginEdit: () => void
}) {
  return (
    <ContextMenuItem
      disabled={pending || !onSelect}
      variant={variant}
      onSelect={() => {
        if (startsEdit) onBeginEdit()
        onSelect?.()
      }}
    >
      {children}
    </ContextMenuItem>
  )
}

export function ProjectEntryMenu({
  children,
  entry,
  pending,
  onMenuOpen,
  onOpen,
  onCreateFile,
  onCreateFolder,
  onRename,
  onCut,
  onPaste,
  onCopyPath,
  onRefresh,
  onCollapseAll,
  onDelete,
}: ProjectEntryMenuProps) {
  const suppressCloseFocus = useRef(false)
  const groups: MenuAction[][] = !entry
    ? [
        [
          { label: "New File", action: onCreateFile, startsEdit: true },
          { label: "New Folder", action: onCreateFolder, startsEdit: true },
          { label: "Paste", shortcut: "Ctrl+V", action: onPaste },
        ],
        [
          { label: "Copy Project Path", action: onCopyPath },
          { label: "Refresh", action: onRefresh },
          { label: "Collapse All", action: onCollapseAll },
        ],
      ]
    : entry.kind === "file"
      ? [
          [{ label: "Open", action: onOpen }],
          [
            { label: "Rename", shortcut: "F2", action: onRename, startsEdit: true },
            { label: "Cut", shortcut: "Ctrl+X", action: onCut },
            { label: "Copy Path", action: onCopyPath },
          ],
          [{ label: "Delete", action: onDelete, variant: "destructive" }],
        ]
      : [
          [
            { label: "New File", action: onCreateFile, startsEdit: true },
            { label: "New Folder", action: onCreateFolder, startsEdit: true },
          ],
          [
            { label: "Rename", shortcut: "F2", action: onRename, startsEdit: true },
            { label: "Cut", shortcut: "Ctrl+X", action: onCut },
            { label: "Paste", shortcut: "Ctrl+V", action: onPaste },
            { label: "Copy Path", action: onCopyPath },
            { label: "Refresh", action: onRefresh },
          ],
          [{ label: "Delete", action: onDelete, variant: "destructive" }],
        ]

  return (
    <ContextMenu onOpenChange={(open) => open && onMenuOpen?.()}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="project-entry-menu"
        onCloseAutoFocus={(event) => {
          if (!suppressCloseFocus.current) return
          event.preventDefault()
          suppressCloseFocus.current = false
        }}
      >
        {groups.map((group, groupIndex) => (
          <Fragment key={groupIndex}>
            {groupIndex > 0 && <ContextMenuSeparator />}
            <ContextMenuGroup>
              {group.map((item) => (
                <MenuItem
                  key={item.label}
                  pending={pending}
                  onSelect={item.action}
                  variant={item.variant}
                  startsEdit={item.startsEdit}
                  onBeginEdit={() => {
                    suppressCloseFocus.current = true
                  }}
                >
                  {item.label}
                  {item.shortcut && (
                    <ContextMenuShortcut>{item.shortcut}</ContextMenuShortcut>
                  )}
                </MenuItem>
              ))}
            </ContextMenuGroup>
          </Fragment>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function openContextMenu(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: element.getBoundingClientRect().left + 12,
    clientY: element.getBoundingClientRect().top + 12,
  }))
}

export function ProjectTreeEntryRow({
  entry,
  parentPath,
  depth,
  siblingEntries,
  activeFile,
  selected,
  expanded,
  setExpanded,
  edit,
  editError,
  pending,
  onSelect,
  onOpenFile,
  onStartCreate,
  onStartRename,
  onSubmitEdit,
  onCancelEdit,
  onCopyPath,
  onRefresh,
  children,
  cutPath,
  dropTarget,
  onCut,
  onPaste,
  onDelete,
  onDragStartEntry,
  onDragEndEntry,
  onDragOverTarget,
  onDropOnTarget,
}: ProjectTreeEntryRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const isFolder = entry.kind === "dir"
  const isOpen = isFolder && expanded[entry.path] === true
  const isSelected = selected?.path === entry.path
  const isCut = cutPath === entry.path
  const isDropTarget = dropTarget === entry.path
  const selectedEntry = { ...entry, parentPath }

  if (edit?.mode === "rename" && edit.entry?.path === entry.path) {
    return (
      <ProjectEntryNameEditor
        depth={depth}
        entries={siblingEntries}
        edit={edit}
        pending={pending}
        error={editError}
        onSubmit={onSubmitEdit}
        onCancel={onCancelEdit}
      />
    )
  }

  const activate = () => {
    onSelect(selectedEntry)
    if (isFolder) {
      setExpanded((current) => ({ ...current, [entry.path]: !isOpen }))
    } else {
      onOpenFile(entry.path)
    }
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === "F2" && !pending) {
      event.preventDefault()
      onStartRename(selectedEntry, event.currentTarget)
    } else if (event.key === "Enter") {
      event.preventDefault()
      activate()
    } else if (event.key === "F10" && event.shiftKey) {
      event.preventDefault()
      openContextMenu(event.currentTarget)
    } else if (event.key === "Delete" && !pending) {
      event.preventDefault()
      onDelete(entry)
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "x") {
      event.preventDefault()
      event.stopPropagation()
      if (!pending) onCut(selectedEntry)
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault()
      event.stopPropagation()
      onPaste(isFolder ? entry.path : parentPath)
    }
  }
  const Icon = isFolder
    ? (isOpen ? FolderOpen : Folder)
    : (entry.name.endsWith(".md") ? FileText : FileCode2)

  return (
    <ProjectEntryMenu
      entry={entry}
      pending={pending}
      onMenuOpen={() => onSelect(selectedEntry)}
      onOpen={isFolder ? undefined : () => onOpenFile(entry.path)}
      onCreateFile={isFolder
        ? () => onStartCreate(entry.path, "file", rowRef.current)
        : undefined}
      onCreateFolder={isFolder
        ? () => onStartCreate(entry.path, "dir", rowRef.current)
        : undefined}
      onRename={() => onStartRename(selectedEntry, rowRef.current)}
      onCut={() => onCut(selectedEntry)}
      onPaste={isFolder && cutPath ? () => onPaste(entry.path) : undefined}
      onDelete={() => onDelete(entry)}
      onCopyPath={() => onCopyPath(entry.path)}
      onRefresh={isFolder ? onRefresh : undefined}
    >
      <div
        ref={rowRef}
        role="treeitem"
        tabIndex={0}
        draggable={!pending}
        aria-label={entry.name}
        aria-expanded={isFolder ? isOpen : undefined}
        aria-selected={isSelected}
        data-entry-path={entry.path}
        className="file-tree__item"
        onClick={(event) => {
          event.stopPropagation()
          const target = event.target as HTMLElement
          if (target.closest(".file-tree__actions")) return
          const group = target.closest("[role='group']")
          if (group && event.currentTarget.contains(group)) return
          activate()
        }}
        onKeyDown={handleKeyDown}
        onContextMenu={(event) => event.stopPropagation()}
        onDragStart={(event: DragEvent<HTMLDivElement>) => {
          event.stopPropagation()
          if (pending) {
            event.preventDefault()
            return
          }
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move"
            event.dataTransfer.setData("application/x-tova-entry", entry.path)
          }
          onDragStartEntry(entry)
        }}
        onDragEnd={(event: DragEvent<HTMLDivElement>) => {
          event.stopPropagation()
          onDragEndEntry()
        }}
        onDragOver={isFolder
          ? (event: DragEvent<HTMLDivElement>) => {
            event.stopPropagation()
            onDragOverTarget(entry.path, event)
          }
          : undefined}
        onDrop={isFolder
          ? (event: DragEvent<HTMLDivElement>) => {
            event.stopPropagation()
            onDropOnTarget(entry.path, event)
          }
          : undefined}
        onDragLeave={isFolder
          ? (event: DragEvent<HTMLDivElement>) => {
            const related = event.relatedTarget
            if (related instanceof Node && event.currentTarget.contains(related)) {
              return
            }
            onDragOverTarget(null)
          }
          : undefined}
      >
        <div
          className={cn(
            "file-tree__entry",
            isFolder ? "file-tree__folder" : "file-tree__file",
            activeFile === entry.path && "is-active",
            isSelected && "is-selected",
            isCut && "is-cut",
            isDropTarget && "is-drop-target",
          )}
          style={{ "--tree-depth": depth } as CSSProperties}
        >
          {isFolder && (isOpen ? <ChevronDown /> : <ChevronRight />)}
          <Icon aria-hidden="true" />
          <span>{entry.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="file-tree__actions"
            aria-label={`Actions for ${entry.name}`}
            disabled={pending}
            onClick={(event) => {
              event.stopPropagation()
              rowRef.current?.focus()
              if (rowRef.current) openContextMenu(rowRef.current)
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()
              rowRef.current?.focus()
              if (rowRef.current) openContextMenu(rowRef.current)
            }}
          >
            <MoreHorizontal data-icon="inline-start" />
          </Button>
        </div>
        {children}
      </div>
    </ProjectEntryMenu>
  )
}
