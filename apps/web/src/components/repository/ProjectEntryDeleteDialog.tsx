import { useRef } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { ProjectEntry } from "@/features/projects/project-api"

export interface ProjectEntryDeleteDialogProps {
  entry: ProjectEntry | null
  hasDirtyFiles: boolean
  pending: boolean
  error: string | null
  onConfirm: () => void
  onOpenChange: (open: boolean) => void
}

export function ProjectEntryDeleteDialog({
  entry,
  hasDirtyFiles,
  pending,
  error,
  onConfirm,
  onOpenChange,
}: ProjectEntryDeleteDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const isFolder = entry?.kind === "dir"

  return (
    <AlertDialog
      open={entry !== null}
      onOpenChange={(open) => {
        if (pending) return
        onOpenChange(open)
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        {entry && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {entry.path}?</AlertDialogTitle>
              <AlertDialogDescription>
                {isFolder
                  ? `${entry.path} and all descendants will be permanently removed.`
                  : `Permanently delete ${entry.path}.`}
                {hasDirtyFiles ? " Unsaved changes will be discarded." : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p role="alert">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel ref={cancelRef} disabled={pending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault()
                  onConfirm()
                }}
              >
                {pending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
