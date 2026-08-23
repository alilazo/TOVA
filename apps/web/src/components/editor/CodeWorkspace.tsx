import { lazy, Suspense, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Braces, Check, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ProjectPathDialog } from "@/components/repository/ProjectPathDialog"
import { RecentProjectsList } from "@/components/repository/RecentProjectsList"
import {
  languageForPath,
  openSampleProject,
  readProjectFile,
  writeProjectFile,
  type ProjectRecord,
} from "@/features/projects/project-api"
import { cn } from "@/lib/utils"
import {
  isTerminalMissionStatus,
  type MissionStatus,
  type StaffProfile,
} from "@/types/domain"

import { PixelAvatar } from "../staff/PixelAvatar"

const MonacoEditor = lazy(() => import("@monaco-editor/react"))

interface CodeWorkspaceProps {
  staff: StaffProfile[]
  projectId: string | null
  activeFile: string | null
  openFiles: string[]
  editorOwnerId: string | null
  missionStatus?: MissionStatus | null
  onSelectFile: (path: string) => void
  onCloseFile: (path: string) => void
  onProjectOpened?: (project: ProjectRecord) => void
}

export function CodeWorkspace({
  staff,
  projectId,
  activeFile,
  openFiles,
  editorOwnerId,
  missionStatus = null,
  onSelectFile,
  onCloseFile,
  onProjectOpened,
}: CodeWorkspaceProps) {
  const client = useQueryClient()
  const [dialogMode, setDialogMode] = useState<"open" | "create" | null>(null)
  const [draftByPath, setDraftByPath] = useState<Record<string, string>>({})
  const [dirtyPaths, setDirtyPaths] = useState<Record<string, boolean>>({})
  const [draftProjectId, setDraftProjectId] = useState(projectId)
  if (draftProjectId !== projectId) {
    setDraftProjectId(projectId)
    setDraftByPath({})
    setDirtyPaths({})
  }
  const fileQuery = useQuery({
    queryKey: ["project-file", projectId, activeFile],
    queryFn: () => readProjectFile(projectId!, activeFile!),
    enabled: Boolean(projectId && activeFile),
  })
  const draft = activeFile
    ? (draftByPath[activeFile] ?? fileQuery.data?.content ?? "")
    : ""
  const dirty = activeFile ? Boolean(dirtyPaths[activeFile]) : false
  const save = useMutation({
    mutationFn: () => writeProjectFile(projectId!, activeFile!, draft),
    onSuccess: async () => {
      if (!activeFile) return
      setDirtyPaths((current) => ({ ...current, [activeFile]: false }))
      await client.invalidateQueries({ queryKey: ["project-file", projectId, activeFile] })
      await client.invalidateQueries({ queryKey: ["project-entries", projectId] })
    },
  })
  const openSample = useMutation({
    mutationFn: openSampleProject,
    onSuccess: async (project) => {
      await client.invalidateQueries({ queryKey: ["active-project"] })
      await client.invalidateQueries({ queryKey: ["project-entries", project.id] })
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
      onProjectOpened?.(project)
    },
  })

  const liveEditing = Boolean(
    editorOwnerId && (!missionStatus || !isTerminalMissionStatus(missionStatus)),
  )
  const owner = liveEditing
    ? staff.find((profile) => profile.id === editorOwnerId)
    : undefined
  const language = activeFile ? languageForPath(activeFile) : "plaintext"

  if (!projectId) {
    return (
      <section className="code-workspace code-workspace--empty" aria-label="Code workspace">
        <div className="code-workspace__empty-state">
          <p>Open a project to browse and edit files.</p>
          <div className="code-workspace__empty-actions">
            <Button size="sm" onClick={() => openSample.mutate()} disabled={openSample.isPending}>
              Open sample project
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialogMode("open")}>
              Open project
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialogMode("create")}>
              New project
            </Button>
          </div>
          <RecentProjectsList
            onOpened={(project) => {
              onProjectOpened?.(project)
            }}
          />
        </div>
        <ProjectPathDialog
          open={dialogMode !== null}
          mode={dialogMode ?? "open"}
          onOpenChange={(open) => {
            if (!open) setDialogMode(null)
          }}
          onOpened={(project) => {
            onProjectOpened?.(project)
          }}
        />
      </section>
    )
  }

  if (!activeFile || openFiles.length === 0) {
    return (
      <section className="code-workspace code-workspace--empty" aria-label="Code workspace">
        <p>Select a file from the explorer.</p>
      </section>
    )
  }

  return (
    <section className="code-workspace" aria-label="Code workspace">
      <div className="editor-tabs" role="tablist" aria-label="Open files">
        {openFiles.map((path) => {
          const name = path.split(/[\\/]/).at(-1) ?? path
          return (
            <div
              key={path}
              className={cn("editor-tab", path === activeFile && "is-active")}
              role="tab"
              aria-selected={path === activeFile}
            >
              <button type="button" onClick={() => onSelectFile(path)}>
                <Braces aria-hidden="true" />
                {name}
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Close ${name}`}
                onClick={() => onCloseFile(path)}
              >
                <X />
              </Button>
            </div>
          )
        })}
      </div>
      {owner && (
        <div className="agent-cursor-badge">
          <PixelAvatar avatar={owner.avatar} name={owner.displayName} size="sm" />
          <span><strong>{owner.displayName}</strong> is editing {activeFile}</span>
        </div>
      )}
      <div className="code-workspace__editor">
        {fileQuery.isLoading && draftByPath[activeFile] === undefined ? (
          <div className="editor-loading" role="status">Loading file…</div>
        ) : fileQuery.error && draftByPath[activeFile] === undefined ? (
          <p role="alert">{fileQuery.error.message}</p>
        ) : (
          <Suspense fallback={<div className="editor-loading" role="status">Loading editor…</div>}>
            <MonacoEditor
              path={activeFile}
              language={language}
              value={draft}
              theme="vs"
              onChange={(value) => {
                const next = value ?? ""
                setDraftByPath((current) => ({ ...current, [activeFile]: next }))
                setDirtyPaths((current) => ({ ...current, [activeFile]: true }))
              }}
              options={{
                minimap: { enabled: false },
                fontFamily: "'JetBrains Mono', 'Cascadia Code', monospace",
                fontSize: 12.5,
                lineHeight: 20,
                padding: { top: 14 },
                scrollBeyondLastLine: false,
                renderLineHighlight: "gutter",
                overviewRulerBorder: false,
                foldingHighlight: false,
                guides: { indentation: false },
                wordWrap: "on",
                readOnly: false,
                automaticLayout: true,
              }}
            />
          </Suspense>
        )}
      </div>
      <footer className="editor-status">
        <span>
          {dirty ? (
            <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          ) : (
            <><Check aria-hidden="true" /> Saved</>
          )}
        </span>
        <span>UTF-8</span>
        <span>{language}</span>
      </footer>
    </section>
  )
}
