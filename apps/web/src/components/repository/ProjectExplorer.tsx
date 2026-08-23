import { useState, type Dispatch, type SetStateAction } from "react"
import { useQuery } from "@tanstack/react-query"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { listProjectEntries, type ProjectRecord } from "@/features/projects/project-api"
import { cn } from "@/lib/utils"

import { ProjectPathDialog } from "./ProjectPathDialog"

interface ProjectExplorerProps {
  project: ProjectRecord
  activeFile: string | null
  onOpenFile: (path: string) => void
  onProjectOpened: (project: ProjectRecord) => void
}

export async function copyProjectFilePath(path: string): Promise<void> {
  await navigator.clipboard.writeText(path)
}

export function ProjectExplorer({
  project,
  activeFile,
  onOpenFile,
  onProjectOpened,
}: ProjectExplorerProps) {
  const [dialogMode, setDialogMode] = useState<"open" | "create" | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ ".": true })
  const rootEntries = useQuery({
    queryKey: ["project-entries", project.id, "."],
    queryFn: () => listProjectEntries(project.id, "."),
  })

  return (
    <aside className="project-explorer" aria-label="Project explorer">
      <header className="project-explorer__label">
        <span>PROJECT</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Project menu">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onSelect={() => {
                void copyProjectFilePath(project.root)
              }}
            >
              Copy File Path
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogMode("open")}>
              Open project…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogMode("create")}>
              New project…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <ScrollArea className="project-explorer__scroll">
        <div className="file-tree">
          {(rootEntries.data ?? []).map((entry) => (
            entry.kind === "dir" ? (
              <DirectoryNode
                key={entry.path}
                projectId={project.id}
                path={entry.path}
                name={entry.name}
                expanded={expanded}
                setExpanded={setExpanded}
                activeFile={activeFile}
                onOpenFile={onOpenFile}
              />
            ) : (
              <FileButton
                key={entry.path}
                path={entry.path}
                name={entry.name}
                active={activeFile === entry.path}
                onOpen={onOpenFile}
              />
            )
          ))}
          {rootEntries.isSuccess && (rootEntries.data?.length ?? 0) === 0 && (
            <p className="project-explorer__empty">Empty folder — start a mission to fill it.</p>
          )}
        </div>
      </ScrollArea>
      <ProjectPathDialog
        open={dialogMode !== null}
        mode={dialogMode ?? "open"}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null)
        }}
        onOpened={onProjectOpened}
      />
    </aside>
  )
}

function DirectoryNode({
  projectId,
  path,
  name,
  expanded,
  setExpanded,
  activeFile,
  onOpenFile,
}: {
  projectId: string
  path: string
  name: string
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  activeFile: string | null
  onOpenFile: (path: string) => void
}) {
  const isOpen = expanded[path] === true
  const children = useQuery({
    queryKey: ["project-entries", projectId, path],
    queryFn: () => listProjectEntries(projectId, path),
    enabled: isOpen,
  })

  return (
    <section className="file-tree__group">
      <button
        type="button"
        className="file-tree__folder"
        onClick={() => setExpanded((current) => ({ ...current, [path]: !isOpen }))}
      >
        {isOpen ? <ChevronDown /> : <ChevronRight />}
        {isOpen ? <FolderOpen /> : <Folder />}
        <span>{name}</span>
      </button>
      {isOpen && (children.data ?? []).map((entry) => (
        entry.kind === "dir" ? (
          <DirectoryNode
            key={entry.path}
            projectId={projectId}
            path={entry.path}
            name={entry.name}
            expanded={expanded}
            setExpanded={setExpanded}
            activeFile={activeFile}
            onOpenFile={onOpenFile}
          />
        ) : (
          <FileButton
            key={entry.path}
            path={entry.path}
            name={entry.name}
            active={activeFile === entry.path}
            onOpen={onOpenFile}
          />
        )
      ))}
    </section>
  )
}

function FileButton({
  path,
  name,
  active,
  onOpen,
}: {
  path: string
  name: string
  active: boolean
  onOpen: (path: string) => void
}) {
  const Icon = name.endsWith(".md") ? FileText : FileCode2
  return (
    <button
      type="button"
      className={cn("file-tree__file", active && "is-active")}
      onClick={() => onOpen(path)}
    >
      <Icon aria-hidden="true" />
      <span>{name}</span>
    </button>
  )
}
