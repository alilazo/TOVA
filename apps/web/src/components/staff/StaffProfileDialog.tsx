import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import ReactMarkdown from "react-markdown"

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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { markdownBodyForPreview } from "@/features/staff/staff-markdown"
import {
  getStaffDocument,
  saveStaffDocument,
} from "@/features/staff/staff-api"
import type { StaffProfile } from "@/types/domain"
import { cn } from "@/lib/utils"

import { AvatarEditorButton } from "./AvatarEditorButton"
import { LineNumberedEditor } from "./LineNumberedEditor"
import { PixelAvatar } from "./PixelAvatar"
import { StaffMetadataPreview } from "./StaffMetadataPreview"

type EditorMode = "preview" | "edit" | "metadata"

interface StaffProfileDialogProps {
  staff: StaffProfile | null
  open: boolean
  available: boolean
  onAvailableChange: (available: boolean) => void
  onOpenChange: (open: boolean) => void
}

const MODE_OPTIONS: Array<{ id: EditorMode; label: string }> = [
  { id: "preview", label: "Preview" },
  { id: "edit", label: "Edit" },
  { id: "metadata", label: "Metadata" },
]

export function StaffProfileDialog({
  staff,
  open,
  available,
  onAvailableChange,
  onOpenChange,
}: StaffProfileDialogProps) {
  const client = useQueryClient()
  const [draft, setDraft] = useState("")
  const [baseline, setBaseline] = useState("")
  const [mode, setMode] = useState<EditorMode>("preview")
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const documentQuery = useQuery({
    queryKey: ["staff-document", staff?.id],
    queryFn: () => getStaffDocument(staff!.id),
    enabled: open && Boolean(staff?.id),
    retry: 1,
  })

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setDraft("")
        setBaseline("")
        setMode("preview")
        setConfirmDiscard(false)
      })
      return
    }
    if (!documentQuery.data) return
    queueMicrotask(() => {
      setDraft(documentQuery.data.markdown)
      setBaseline(documentQuery.data.markdown)
      setMode("preview")
    })
  }, [documentQuery.data, open, staff?.id])

  const save = useMutation({
    mutationFn: () => saveStaffDocument(staff!.id, draft),
    onSuccess: async (saved) => {
      setBaseline(saved.markdown)
      setDraft(saved.markdown)
      await client.invalidateQueries({ queryKey: ["staff"] })
      await client.invalidateQueries({ queryKey: ["staff-document", staff?.id] })
      onOpenChange(false)
    },
  })

  const loading = documentQuery.isPending || documentQuery.isFetching
  const markdownReady = Boolean(documentQuery.data) && !documentQuery.isError
  const isDirty = markdownReady && draft !== baseline

  const requestClose = () => {
    if (isDirty) {
      setConfirmDiscard(true)
      return
    }
    onOpenChange(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      requestClose()
      return
    }
    onOpenChange(next)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="staff-profile-dialog" showCloseButton={false}>
          {staff && (
            <>
              <DialogHeader>
                <div className="staff-profile-dialog__identity">
                  <span className="staff-profile-dialog__avatar">
                    <PixelAvatar avatar={staff.avatar} name={staff.displayName} size="lg" />
                    <AvatarEditorButton staff={staff} />
                  </span>
                  <span className="staff-profile-dialog__copy">
                    <DialogTitle>{staff.displayName}</DialogTitle>
                    <p>{staff.role}</p>
                    <DialogDescription>{staff.description}</DialogDescription>
                  </span>
                  <label className="staff-profile-dialog__availability">
                    <span>Available</span>
                    <Switch
                      checked={available}
                      aria-label={`${staff.displayName} availability`}
                      onCheckedChange={onAvailableChange}
                    />
                  </label>
                </div>
              </DialogHeader>

              {loading && !markdownReady ? (
                <p role="status">Loading profile…</p>
              ) : documentQuery.isError ? (
                <div className="staff-profile-dialog__error" role="alert">
                  <p>{documentQuery.error.message}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void documentQuery.refetch()}
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="staff-profile-dialog__body">
                  <div
                    className="staff-profile-dialog__mode"
                    role="radiogroup"
                    aria-label="Profile document view"
                  >
                    {MODE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={mode === option.id}
                        className={cn(mode === option.id && "is-active")}
                        onClick={() => setMode(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {mode === "preview" ? (
                    <div className="staff-profile-dialog__preview">
                      <ReactMarkdown>{markdownBodyForPreview(draft)}</ReactMarkdown>
                    </div>
                  ) : mode === "metadata" ? (
                    <StaffMetadataPreview markdown={draft} />
                  ) : (
                    <LineNumberedEditor
                      id="staff-profile-markdown"
                      aria-label="Staff profile markdown"
                      className="staff-profile-dialog__editor-shell"
                      value={draft}
                      onChange={setDraft}
                    />
                  )}
                </div>
              )}

              {save.isError && <p role="alert">{save.error.message}</p>}

              <DialogFooter>
                <Button variant="outline" onClick={requestClose}>
                  Close
                </Button>
                <Button
                  disabled={!staff || !markdownReady || save.isPending || !draft.trim()}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved edits to this staff profile. Discard them and close?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false)
                onOpenChange(false)
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
