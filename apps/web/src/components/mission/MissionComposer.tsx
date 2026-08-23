import { useRef, useState } from "react"
import { Play, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { RuntimeState } from "@/features/models/model-api"
import type { ProjectEntry } from "@/features/projects/project-api"
import { useUiStore } from "@/stores/ui-store"

export interface MissionRequest {
  request: string
  requestType: string
  priority: string
  staffOverride: string
  teamId: "hipo"
  modelProfile: string
  model: string
}

interface MissionComposerProps {
  onStart: (request: MissionRequest) => void
  projectName?: string | null
  initialRequest?: string
  projectReferences?: ProjectEntry[]
  onProjectReferenceQueryChange?: (query: string | null) => void
  liveRuntime?: {
    state: RuntimeState
    profileId: string
    model: string
  }
  mode?: "new" | "followup"
}

const DEFAULT_COMPOSER_HEIGHT = 176
const MIN_COMPOSER_HEIGHT = 128
const MAX_COMPOSER_HEIGHT = 480
const MAX_REFERENCE_SUGGESTIONS = 8

interface SlashReference {
  start: number
  end: number
  query: string
}

function slashReferenceAt(value: string, cursorPosition: number): SlashReference | null {
  const beforeCursor = value.slice(0, cursorPosition)
  const match = /(^|\s)\/([\w./-]*)$/.exec(beforeCursor)
  if (!match) return null
  const slashIndex = beforeCursor.lastIndexOf("/")
  return {
    start: slashIndex,
    end: cursorPosition,
    query: match[2] ?? "",
  }
}

function needsModelConnection(liveRuntime?: MissionComposerProps["liveRuntime"]) {
  return liveRuntime?.state !== "connected"
    || !liveRuntime.profileId
    || !liveRuntime.model
}

function submitButtonLabel({
  isFollowUp,
  liveRuntime,
  projectName,
  request,
}: {
  isFollowUp: boolean
  liveRuntime?: MissionComposerProps["liveRuntime"]
  projectName?: string | null
  request: string
}) {
  if (!projectName) return "Open project first"
  if (needsModelConnection(liveRuntime)) return "Connect local model"
  if (!request.trim()) return "Describe task"
  return isFollowUp ? "Send follow-up" : "Send to Team"
}

export function MissionComposer({
  onStart,
  projectName,
  initialRequest,
  projectReferences = [],
  onProjectReferenceQueryChange,
  liveRuntime,
  mode = "new",
}: MissionComposerProps) {
  const setRuntimeDialogOpen = useUiStore((state) => state.setRuntimeDialogOpen)
  const [request, setRequest] = useState(initialRequest ?? "")
  const [teamId, setTeamId] = useState("hipo")
  const [composerHeight, setComposerHeight] = useState(DEFAULT_COMPOSER_HEIGHT)
  const [slashReference, setSlashReference] = useState<SlashReference | null>(null)
  const [activeReferenceIndex, setActiveReferenceIndex] = useState(0)
  const [attachedReferences, setAttachedReferences] = useState<ProjectEntry[]>([])
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const canStart = Boolean(
    request.trim()
    && projectName
    && liveRuntime?.state === "connected"
    && liveRuntime.profileId
    && liveRuntime.model,
  )
  const isFollowUp = mode === "followup"
  const label = isFollowUp ? "Team chat message" : "Mission request"
  const buttonLabel = submitButtonLabel({
    isFollowUp,
    liveRuntime,
    projectName,
    request,
  })
  const showConnectCta = Boolean(projectName && needsModelConnection(liveRuntime))
  const placeholder = isFollowUp
    ? "Ask the team for a fix, edit, or next step in this chat..."
    : "Describe a feature, bug, refactor, or complete software project…"
  const referenceOptions = slashReference
    ? projectReferences
      .filter((entry) => {
        const query = slashReference.query.toLowerCase()
        if (!query) return true
        const target = query.includes("/")
          ? entry.path.toLowerCase()
          : entry.name.toLowerCase()
        return target.startsWith(query)
      })
      .slice(0, MAX_REFERENCE_SUGGESTIONS)
    : []
  const showReferenceOptions = Boolean(projectName && slashReference && referenceOptions.length)

  function updateSlashReference(value: string, cursorPosition: number) {
    const next = slashReferenceAt(value, cursorPosition)
    setSlashReference(next)
    setActiveReferenceIndex(0)
    onProjectReferenceQueryChange?.(next?.query ?? null)
  }

  function pruneAttachedReferences(value: string) {
    setAttachedReferences((current) =>
      current.filter((entry) => value.includes(`/${entry.path}`)),
    )
  }

  function insertProjectReference(entry: ProjectEntry) {
    if (!slashReference) return
    const mention = `/${entry.path}${entry.kind === "dir" ? "/" : ""} `
    const next = `${request.slice(0, slashReference.start)}${mention}${request.slice(slashReference.end)}`
    setRequest(next)
    setAttachedReferences((current) => {
      if (current.some((item) => item.path === entry.path)) return current
      return [...current, entry]
    })
    setSlashReference(null)
    onProjectReferenceQueryChange?.(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
  }

  return (
    <form
      className="mission-composer"
      aria-label="Mission composer"
      onSubmit={(formEvent) => {
        formEvent.preventDefault()
        if (!canStart || !liveRuntime) return
        onStart({
          request: request.trim(),
          requestType: "feature",
          priority: "normal",
          staffOverride: "coordinator-choice",
          teamId: teamId as "hipo",
          modelProfile: liveRuntime.profileId,
          model: liveRuntime.model,
        })
        setRequest("")
        setSlashReference(null)
        setAttachedReferences([])
        onProjectReferenceQueryChange?.(null)
      }}
    >
      <div
        className="mission-composer__resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize mission composer"
        aria-valuemin={MIN_COMPOSER_HEIGHT}
        aria-valuemax={MAX_COMPOSER_HEIGHT}
        aria-valuenow={composerHeight}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault()
          dragRef.current = {
            startY: event.clientY,
            startHeight: composerHeight,
          }
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return
          const delta = dragRef.current.startY - event.clientY
          const next = Math.min(
            MAX_COMPOSER_HEIGHT,
            Math.max(MIN_COMPOSER_HEIGHT, dragRef.current.startHeight + delta),
          )
          setComposerHeight(next)
        }}
        onPointerUp={(event) => {
          dragRef.current = null
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture?.(event.pointerId)
          }
        }}
        onPointerCancel={() => {
          dragRef.current = null
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault()
            setComposerHeight((height) => Math.min(MAX_COMPOSER_HEIGHT, height + 16))
          }
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setComposerHeight((height) => Math.max(MIN_COMPOSER_HEIGHT, height - 16))
          }
        }}
      >
        <span />
      </div>
      <label className="sr-only" htmlFor="mission-request">{label}</label>
      <div className="mission-composer__input-shell">
        <Textarea
          ref={textareaRef}
          id="mission-request"
          aria-label={label}
          value={request}
          className={attachedReferences.length ? "mission-composer__textarea--with-references" : undefined}
          onChange={(event) => {
            const next = event.target.value
            setRequest(next)
            pruneAttachedReferences(next)
            updateSlashReference(next, event.target.selectionStart ?? next.length)
          }}
          onClick={(event) => {
            updateSlashReference(
              event.currentTarget.value,
              event.currentTarget.selectionStart ?? event.currentTarget.value.length,
            )
          }}
          onKeyUp={(event) => {
            if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
              return
            }
            updateSlashReference(
              event.currentTarget.value,
              event.currentTarget.selectionStart ?? event.currentTarget.value.length,
            )
          }}
          onKeyDown={(event) => {
            if (!showReferenceOptions) return
            if (event.key === "Escape") {
              event.preventDefault()
              setSlashReference(null)
              onProjectReferenceQueryChange?.(null)
              return
            }
            if (event.key === "ArrowDown") {
              event.preventDefault()
              setActiveReferenceIndex((index) => (index + 1) % referenceOptions.length)
              return
            }
            if (event.key === "ArrowUp") {
              event.preventDefault()
              setActiveReferenceIndex(
                (index) => (index - 1 + referenceOptions.length) % referenceOptions.length,
              )
              return
            }
            if (event.key === "Enter") {
              event.preventDefault()
              insertProjectReference(
                referenceOptions[Math.min(activeReferenceIndex, referenceOptions.length - 1)],
              )
            }
          }}
          placeholder={placeholder}
          disabled={!projectName}
          style={{ height: composerHeight }}
        />
        {attachedReferences.length ? (
          <div
            className="mission-composer__reference-chips"
            aria-label="Attached file references"
          >
            {attachedReferences.map((entry) => (
              <span
                key={`${entry.kind}:${entry.path}`}
                className="mission-composer__reference-chip"
              >
                <span>/{entry.path}</span>
                <small>{entry.kind === "dir" ? "folder" : "file"}</small>
              </span>
            ))}
          </div>
        ) : null}
        {showReferenceOptions ? (
          <div
            className="mission-composer__references"
            role="listbox"
            aria-label="Project references"
          >
            {referenceOptions.map((entry, index) => (
              <button
                key={`${entry.kind}:${entry.path}`}
                type="button"
                role="option"
                aria-label={`${entry.path} ${entry.kind === "dir" ? "folder" : "file"}`}
                aria-selected={index === activeReferenceIndex}
                className="mission-composer__reference-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertProjectReference(entry)}
              >
                <span>{entry.path}</span>
                <small>{entry.kind === "dir" ? "folder" : "file"}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        className={[
          "mission-composer__controls",
          showConnectCta ? "mission-composer__controls--blocked" : "",
        ].filter(Boolean).join(" ")}
      >
        <span className="mission-composer__team">
          <Sparkles aria-hidden="true" />
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger aria-label="HiPo Team" size="sm">
              <span>HiPo Team</span>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="hipo">HiPo</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </span>
        {showConnectCta ? (
          <div className="mission-composer__ready">
            <p className="mission-composer__ready-hint">
              <strong>Model required</strong>
              <span>Connect a local model to enable sending.</span>
            </p>
            <Button
              type="button"
              size="sm"
              className="mission-composer__submit"
              onClick={() => setRuntimeDialogOpen(true)}
            >
              <Play data-icon="inline-start" />
              Connect local model
            </Button>
          </div>
        ) : (
          <Button
            type="submit"
            size="sm"
            className="mission-composer__submit"
            disabled={!canStart}
          >
            <Play data-icon="inline-start" />
            {buttonLabel}
          </Button>
        )}
      </div>
    </form>
  )
}
