import { useState } from "react"
import {
  ChevronsDownUp,
  FilePlus2,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ProjectExplorerToolbarProps {
  pending: boolean
  onCreateFile: (trigger: HTMLElement) => void
  onCreateFolder: (trigger: HTMLElement) => void
  onRefresh: () => void
  onCollapseAll: () => void
  onCopyProjectPath: () => void
  onOpenProject: () => void
  onNewProject: () => void
}

export function ProjectExplorerToolbar({
  pending,
  onCreateFile,
  onCreateFolder,
  onRefresh,
  onCollapseAll,
  onCopyProjectPath,
  onOpenProject,
  onNewProject,
}: ProjectExplorerToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const openDialogAfterMenu = (action: () => void) => {
    setMenuOpen(false)
    window.setTimeout(action, 0)
  }

  return (
    <span className="project-explorer__header-actions">
      <span className="project-explorer__toolbar" aria-label="Explorer actions">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="New File"
          title="New File"
          disabled={pending}
          onClick={(event) => onCreateFile(event.currentTarget)}
        >
          <FilePlus2 data-icon="inline-start" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="New Folder"
          title="New Folder"
          disabled={pending}
          onClick={(event) => onCreateFolder(event.currentTarget)}
        >
          <FolderPlus data-icon="inline-start" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Refresh Explorer"
          title="Refresh Explorer"
          disabled={pending}
          onClick={onRefresh}
        >
          <RefreshCw data-icon="inline-start" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Collapse All"
          title="Collapse All"
          disabled={pending}
          onClick={onCollapseAll}
        >
          <ChevronsDownUp data-icon="inline-start" />
        </Button>
      </span>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Project menu">
            <MoreHorizontal data-icon="inline-start" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={onCopyProjectPath}>
            Copy File Path
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onSelect={() => openDialogAfterMenu(onOpenProject)}
          >
            Open project…
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending}
            onSelect={() => openDialogAfterMenu(onNewProject)}
          >
            New project…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
