import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react"

import { Input } from "@/components/ui/input"
import type { ProjectEntry } from "@/features/projects/project-api"

export interface EntryEdit {
  mode: "create-file" | "create-dir" | "rename"
  parentPath: string
  entry?: ProjectEntry
}

interface ProjectEntryNameInputProps {
  edit: EntryEdit
  existingNames: string[]
  pending: boolean
  error: string | null
  onSubmit: (name: string) => void
  onCancel: () => void
}

function editLabel(edit: EntryEdit): string {
  if (edit.mode === "create-file") return "New file name"
  if (edit.mode === "create-dir") return "New folder name"
  return `Rename ${edit.entry?.name ?? "entry"}`
}

function validateName(
  name: string,
  edit: EntryEdit,
  existingNames: string[],
): string | null {
  const trimmed = name.trim()
  if (!trimmed) return "Name is required. Enter a file or folder name."
  if (edit.mode === "rename" && trimmed === edit.entry?.name) {
    return "Name is unchanged. Enter a different name."
  }
  if (trimmed === "." || trimmed === "..") {
    return "That name is reserved. Choose a different file or folder name."
  }
  if (/[/\\<>:"|?*]/.test(trimmed)) {
    return "That name contains an unsupported character. Remove / \\ < > : \" | ? or *."
  }
  if (existingNames.some((existing) =>
    existing.toLocaleLowerCase() === trimmed.toLocaleLowerCase()
    && existing !== edit.entry?.name)) {
    return "That name already exists. Choose a different name."
  }
  return null
}

export function ProjectEntryNameInput({
  edit,
  existingNames,
  pending,
  error,
  onSubmit,
  onCancel,
}: ProjectEntryNameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  const [name, setName] = useState(edit.entry?.name ?? "")
  const [validationError, setValidationError] = useState<string | null>(null)
  const visibleError = validationError ?? error

  useEffect(() => {
    const focusTimer = window.setTimeout(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      if (edit.mode === "rename") input.select()
    }, 0)
    return () => window.clearTimeout(focusTimer)
  }, [edit.mode])

  useEffect(() => {
    if (!pending && visibleError) inputRef.current?.focus()
  }, [pending, visibleError])

  return (
    <span className="project-entry-name">
      <Input
        ref={inputRef}
        value={name}
        aria-label={editLabel(edit)}
        aria-describedby={visibleError ? errorId : undefined}
        aria-invalid={visibleError ? true : undefined}
        className="project-entry-name__input"
        disabled={pending}
        onChange={(event) => {
          setName(event.target.value)
          setValidationError(null)
        }}
        onBlur={() => {
          if (!pending && !visibleError) onCancel()
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
            return
          }
          if (event.key !== "Enter" || pending) return
          event.preventDefault()
          const nextError = validateName(name, edit, existingNames)
          setValidationError(nextError)
          if (nextError) return
          onSubmit(name.trim())
        }}
      />
      {visibleError && (
        <small id={errorId} role="alert" className="project-entry-name__error">
          {visibleError}
        </small>
      )}
    </span>
  )
}

interface ProjectEntryNameEditorProps {
  depth: number
  edit: EntryEdit
  entries: ProjectEntry[]
  pending: boolean
  error: string | null
  onSubmit: (name: string) => void
  onCancel: () => void
}

export function ProjectEntryNameEditor({
  depth,
  edit,
  entries,
  pending,
  error,
  onSubmit,
  onCancel,
}: ProjectEntryNameEditorProps) {
  return (
    <div
      role="treeitem"
      aria-label={editLabel(edit)}
      className="file-tree__edit"
      style={{ "--tree-depth": depth } as CSSProperties}
    >
      <ProjectEntryNameInput
        edit={edit}
        existingNames={entries.map((entry) => entry.name)}
        pending={pending}
        error={error}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </div>
  )
}
