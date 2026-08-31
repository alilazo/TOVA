import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { openProject, type ProjectRecord } from "@/features/projects/project-api"

interface ProjectPathDialogProps {
  open: boolean
  mode: "open" | "create"
  onOpenChange: (open: boolean) => void
  onOpened: (project: ProjectRecord) => void
}

export function ProjectPathDialog({
  open,
  mode,
  onOpenChange,
  onOpened,
}: ProjectPathDialogProps) {
  const client = useQueryClient()
  const [path, setPath] = useState("")
  const mutation = useMutation({
    mutationFn: () => openProject(path.trim(), mode === "create"),
    onSuccess: async (project) => {
      onOpened(project)
      await client.invalidateQueries({ queryKey: ["project-entries", project.id] })
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
      onOpenChange(false)
      setPath("")
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New project" : "Open project"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Enter an absolute folder path. TOVA will create it if it does not exist."
              : "Enter the absolute path to an existing project folder on this machine."}
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="project-path">Folder path</label>
        <Input
          id="project-path"
          value={path}
          onChange={(event) => setPath(event.target.value)}
          placeholder="F:\\Projects\\my-app"
        />
        {mutation.error && (
          <p role="alert">
            {mutation.error.message} Choose a folder you own, or create a new project path.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!path.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Working…"
              : mode === "create"
                ? "Create and open"
                : "Open"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
