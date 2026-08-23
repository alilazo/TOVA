import { useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getStaffAvatarCatalog,
  selectStaffAvatar,
  uploadStaffAvatar,
} from "@/features/staff/staff-api"
import type { StaffProfile } from "@/types/domain"

import { PixelAvatar, staffAvatarSrc } from "./PixelAvatar"

interface AvatarEditorButtonProps {
  staff: StaffProfile
}

export function AvatarEditorButton({ staff }: AvatarEditorButtonProps) {
  const client = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const catalog = useQuery({
    queryKey: ["staff-avatar-catalog"],
    queryFn: getStaffAvatarCatalog,
    enabled: open,
  })

  const select = useMutation({
    mutationFn: (filename: string) => selectStaffAvatar(staff.id, filename),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["staff"] })
      setOpen(false)
    },
  })

  const upload = useMutation({
    mutationFn: (file: File) => uploadStaffAvatar(staff.id, file),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["staff"] })
      setOpen(false)
    },
  })

  const busy = select.isPending || upload.isPending
  const error = select.error?.message ?? upload.error?.message ?? null

  return (
    <>
      <Button
        type="button"
        size="icon-xs"
        variant="secondary"
        className="avatar-editor__trigger"
        aria-label={`Change ${staff.displayName} avatar`}
        onClick={() => setOpen(true)}
      >
        <Pencil />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="avatar-editor-dialog">
          <DialogHeader>
            <DialogTitle>Choose avatar</DialogTitle>
            <DialogDescription>
              Pick a stock portrait or upload a local image for {staff.displayName}.
            </DialogDescription>
          </DialogHeader>
          <div className="avatar-editor__current">
            <PixelAvatar avatar={staff.avatar} name={staff.displayName} size="lg" />
            <span>
              <strong>Current</strong>
              <small>{staff.avatar}</small>
            </span>
          </div>
          <div className="avatar-editor__actions">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) upload.mutate(file)
                event.target.value = ""
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              Upload image
            </Button>
          </div>
          {catalog.isLoading ? (
            <p role="status">Loading stock images…</p>
          ) : catalog.isError ? (
            <p role="alert">{catalog.error.message}</p>
          ) : (
            <ul className="avatar-editor__stock">
              {catalog.data?.stock.map((filename) => {
                const avatar = `stock/${filename}`
                const selected = staff.avatar === avatar
                return (
                  <li key={filename}>
                    <button
                      type="button"
                      className={selected ? "is-selected" : undefined}
                      disabled={busy}
                      aria-label={`Use ${filename}`}
                      aria-pressed={selected}
                      onClick={() => select.mutate(filename)}
                    >
                      <img
                        src={staffAvatarSrc(avatar) ?? ""}
                        alt=""
                        draggable={false}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {error && <p role="alert">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}
