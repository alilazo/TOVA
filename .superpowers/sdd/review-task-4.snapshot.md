# Review package: Task 4 (no git)

## Files

## FILE: apps/web/src/app/App.tsx

```
import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { ActivityFeed } from "@/components/activity/ActivityFeed"
import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
import { CodeWorkspace } from "@/components/editor/CodeWorkspace"
import { HandoffOverlay } from "@/components/handoff/HandoffOverlay"
import { MissionComposer } from "@/components/mission/MissionComposer"
import { MissionControlBar } from "@/components/mission/MissionControlBar"
import { ProjectExplorer } from "@/components/repository/ProjectExplorer"
import { AppShell } from "@/components/shell/AppShell"
import { WorkspacePanelSwitch } from "@/components/shell/WorkspacePanelSwitch"
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar"
import { EngineeringTeamPanel } from "@/components/staff/EngineeringTeamPanel"
import { TeamFloor } from "@/components/team-floor/TeamFloor"
import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
import { listMissionSessions } from "@/features/mission/mission-api"
import { useLiveRuntime } from "@/features/mission/use-live-runtime"
import { getRuntimeStatus } from "@/features/models/model-api"
import { getActiveProject, type ProjectRecord } from "@/features/projects/project-api"
import { getStaffProfiles } from "@/features/staff/staff-api"
import { useUiStore } from "@/stores/ui-store"
import { isTerminalMissionStatus } from "@/types/domain"

export function App() {
  const client = useQueryClient()
  const activePanel = useUiStore((state) => state.activePanel)
  const setActivePanel = useUiStore((state) => state.setActivePanel)
  const selectedStaffId = useUiStore((state) => state.selectedStaffId)
  const selectStaff = useUiStore((state) => state.selectStaff)
  const workLogOpen = useUiStore((state) => state.workLogOpen)
  const setWorkLogOpen = useUiStore((state) => state.setWorkLogOpen)
  const activeFile = useUiStore((state) => state.activeFile)
  const openFiles = useUiStore((state) => state.openFiles)
  const openFile = useUiStore((state) => state.openFile)
  const closeFile = useUiStore((state) => state.closeFile)
  const clearFiles = useUiStore((state) => state.clearFiles)
  const liveRuntime = useLiveRuntime()
  const runtimeStatus = useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    retry: 1,
  })
  const project = useQuery({
    queryKey: ["active-project"],
    queryFn: getActiveProject,
    retry: 1,
  })
  const staff = useQuery({
    queryKey: ["staff"],
    queryFn: getStaffProfiles,
    staleTime: 60_000,
  })
  const missionSessions = useQuery({
    queryKey: ["mission-sessions", project.data?.id],
    queryFn: () => listMissionSessions(project.data!.id),
    enabled: Boolean(project.data),
  })
  const roster = staff.data ?? []
  const [dismissedHandoffId, setDismissedHandoffId] = useState<string | null>(null)
  const visibleHandoff =
    liveRuntime.projection.activeHandoff?.id === dismissedHandoffId
      ? null
      : liveRuntime.projection.activeHandoff

  useEffect(() => {
    const path = liveRuntime.projection.activeFile
    if (!path) return
    openFile(path)
    void client.invalidateQueries({ queryKey: ["project-entries", project.data?.id] })
    void client.invalidateQueries({
      queryKey: ["project-file", project.data?.id, path],
    })
  }, [
    client,
    liveRuntime.projection.activeFile,
    liveRuntime.projection.fileRevision,
    openFile,
    project.data?.id,
  ])

  useEffect(() => {
    const deleted = liveRuntime.projection.lastDeletedFile
    if (!deleted) return
    closeFile(deleted)
    void client.invalidateQueries({ queryKey: ["project-entries", project.data?.id] })
    void client.removeQueries({ queryKey: ["project-file", project.data?.id, deleted] })
  }, [
    client,
    closeFile,
    liveRuntime.projection.lastDeletedFile,
    liveRuntime.projection.fileRevision,
    project.data?.id,
  ])

  const selectedStaff =
    roster.find((profile) => profile.id === selectedStaffId) ?? roster[0] ?? null

  const onProjectOpened = (next: ProjectRecord) => {
    clearFiles()
    void client.setQueryData(["active-project"], next)
    void client.invalidateQueries({ queryKey: ["mission-sessions", next.id] })
  }

  const sidebar = activePanel === "explorer"
    ? (
      <ProjectExplorer
        project={project.data ?? null}
        activeFile={activeFile}
        onOpenFile={openFile}
        onProjectOpened={onProjectOpened}
      />
    )
    : (
      <WorkspaceSidebar
        panel={activePanel}
        staff={roster}
        staffLoading={staff.isPending}
        staffError={staff.error}
        runtimeStatus={runtimeStatus.data}
        mission={liveRuntime.mission}
        missionSessions={missionSessions.data ?? []}
        selectedMissionSessionId={liveRuntime.session?.id ?? null}
        onSelectMissionSession={(sessionId) => {
          const selected = missionSessions.data?.find((item) => item.id === sessionId)
          if (!selected) return
          setActivePanel("team-floor")
          void liveRuntime.selectSession(selected)
        }}
      />
    )

  const hasProject = Boolean(project.data)
  const missionControlStatus = isTerminalMissionStatus(liveRuntime.mission?.status)
    ? liveRuntime.mission.status
    : liveRuntime.projection.status

  const workspaceClass = [
    "mission-workspace",
    !hasProject ? "mission-workspace--no-project" : "",
  ].filter(Boolean).join(" ")

  const workspace = (
    <div className={workspaceClass}>
      {liveRuntime.error && (
        <p className="mission-runtime-error" role="alert">{liveRuntime.error}</p>
      )}
      <WorkspacePanelSwitch
        panelKey={activePanel === "team-floor" ? "team-floor" : "workspace"}
      >
        {activePanel === "team-floor" ? (
          <TeamFloor
            staff={roster}
            currentStaffId={liveRuntime.projection.currentStaffId}
            statuses={liveRuntime.projection.staffStatuses}
            selectedStaffIds={liveRuntime.projection.selectedStaffIds}
            artifacts={liveRuntime.projection.artifacts}
            activity={liveRuntime.projection.activity}
            onSelectStaff={selectStaff}
            projectId={project.data?.id ?? null}
            activeFile={liveRuntime.projection.activeFile || null}
            fileRevision={liveRuntime.projection.fileRevision}
            editorOwnerId={liveRuntime.projection.editorOwnerId}
            hasStarted={liveRuntime.hasStarted}
            missionStatus={liveRuntime.projection.status}
            objective={liveRuntime.projection.objective}
            assemblyRoles={liveRuntime.projection.assemblyRoles}
            planReview={liveRuntime.projection.planReview}
            missionId={liveRuntime.mission?.id ?? null}
            startedAt={liveRuntime.projection.startedAt}
            endedAt={liveRuntime.projection.endedAt}
            onOpenWorkOutput={(path) => {
              openFile(path)
              setActivePanel("explorer")
            }}
          />
        ) : (
          <CodeWorkspace
            staff={roster}
            projectId={project.data?.id ?? null}
            activeFile={activeFile}
            openFiles={openFiles}
            editorOwnerId={liveRuntime.projection.editorOwnerId}
            missionStatus={liveRuntime.projection.status}
            onSelectFile={openFile}
            onCloseFile={closeFile}
            onProjectOpened={onProjectOpened}
          />
        )}
      </WorkspacePanelSwitch>
      {hasProject && (
        <ActivityFeed
          staff={roster}
          hasStarted={liveRuntime.hasStarted}
          missionStatus={liveRuntime.projection.status}
          events={liveRuntime.projection.activity}
        />
      )}
    </div>
  )

  return (
    <AppShell
      activePanel={activePanel}
      onPanelChange={setActivePanel}
      sidebar={sidebar}
      workspace={workspace}
      teamPanel={(
        <EngineeringTeamPanel
          staff={roster}
          onSelectStaff={selectStaff}
          isLoading={staff.isPending}
          error={staff.error}
          missionControls={liveRuntime.hasStarted ? (
            <>
              <MissionControlBar
                title={liveRuntime.mission?.objective ?? "Live mission"}
                playing={liveRuntime.playing}
                paused={liveRuntime.paused}
                status={missionControlStatus}
                onPause={liveRuntime.pause}
                onResume={liveRuntime.resume}
                onCancel={liveRuntime.cancel}
                onDismiss={liveRuntime.dismiss}
              />
              {isTerminalMissionStatus(missionControlStatus) && (
                <MissionComposer
                  mode="followup"
                  projectName={project.data?.name}
                  liveRuntime={{
                    state: runtimeStatus.data?.state ?? "unavailable",
                    profileId: runtimeStatus.data?.selectedProfileId ?? "",
                    model: runtimeStatus.data?.selectedModel ?? "",
                  }}
                  onStart={(request) => {
                    if (!project.data) return
                    setActivePanel("team-floor")
                    void liveRuntime.sendFollowUp({
                      request: request.request,
                      projectId: project.data.id,
                      modelProfileId: request.modelProfile,
                      model: request.model,
                    }).then(() => {
                      void client.invalidateQueries({
                        queryKey: ["mission-sessions", project.data?.id],
                      })
                    })
                  }}
                />
              )}
            </>
          ) : (
            <MissionComposer
              mode={liveRuntime.session ? "followup" : "new"}
              projectName={project.data?.name}
              liveRuntime={{
                state: runtimeStatus.data?.state ?? "unavailable",
                profileId: runtimeStatus.data?.selectedProfileId ?? "",
                model: runtimeStatus.data?.selectedModel ?? "",
              }}
              onStart={(request) => {
                if (!project.data) return
                setActivePanel("team-floor")
                const action = liveRuntime.session
                  ? liveRuntime.sendFollowUp
                  : liveRuntime.start
                void action({
                  request: request.request,
                  projectId: project.data.id,
                  modelProfileId: request.modelProfile,
                  model: request.model,
                }).then(() => {
                  void client.invalidateQueries({
                    queryKey: ["mission-sessions", project.data?.id],
                  })
                })
              }}
            />
          )}
        />
      )}
      overlays={(
        <>
          {selectedStaff && (
            <WorkLogDrawer
              open={workLogOpen}
              staff={selectedStaff}
              log={liveRuntime.projection.workLogs[selectedStaff.id]}
              onOpenChange={setWorkLogOpen}
            />
          )}
          <HandoffOverlay
            handoff={visibleHandoff}
            staff={roster}
            onDismiss={() => setDismissedHandoffId(visibleHandoff?.id ?? null)}
          />
          <CommandApprovalDialog missionId={liveRuntime.mission?.id} />
        </>
      )}
    />
  )
}

```

## FILE: apps/web/src/components/repository/ProjectExplorer.tsx

```
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
import { RecentProjectsList } from "./RecentProjectsList"

interface ProjectExplorerProps {
  project: ProjectRecord | null
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
    queryKey: ["project-entries", project?.id, "."],
    queryFn: () => listProjectEntries(project!.id, "."),
    enabled: Boolean(project),
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
              disabled={!project}
              onSelect={() => {
                if (!project) return
                void copyProjectFilePath(project.root)
              }}
            >
              Copy File Path
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogMode("open")}>
              Open projectâ€¦
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDialogMode("create")}>
              New projectâ€¦
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      {project ? (
        <>
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
                <p className="project-explorer__empty">Empty folder â€” start a mission to fill it.</p>
              )}
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="project-explorer__empty-state">
          <strong>No project open</strong>
          <p>Open an existing folder or create a new one to begin.</p>
          <div className="project-explorer__empty-actions">
            <Button size="sm" variant="outline" onClick={() => setDialogMode("open")}>
              Open project
            </Button>
            <Button size="sm" onClick={() => setDialogMode("create")}>
              New project
            </Button>
          </div>
          <RecentProjectsList onOpened={onProjectOpened} />
        </div>
      )}
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

```

## FILE: apps/web/src/components/editor/CodeWorkspace.tsx

```
import { lazy, Suspense, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Braces, Check, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ProjectPathDialog } from "@/components/repository/ProjectPathDialog"
import { RecentProjectsList } from "@/components/repository/RecentProjectsList"
import {
  languageForPath,
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
            <Button size="sm" variant="outline" onClick={() => setDialogMode("open")}>
              Open project
            </Button>
            <Button size="sm" onClick={() => setDialogMode("create")}>
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
          <div className="editor-loading" role="status">Loading fileâ€¦</div>
        ) : fileQuery.error && draftByPath[activeFile] === undefined ? (
          <p role="alert">{fileQuery.error.message}</p>
        ) : (
          <Suspense fallback={<div className="editor-loading" role="status">Loading editorâ€¦</div>}>
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

```

## FILE: apps/web/src/components/repository/ProjectPathDialog.tsx

```
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
      await client.invalidateQueries({ queryKey: ["active-project"] })
      await client.invalidateQueries({ queryKey: ["project-entries", project.id] })
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
      onOpened(project)
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
        {mutation.error && <p role="alert">{mutation.error.message}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!path.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Workingâ€¦"
              : mode === "create"
                ? "Create and open"
                : "Open"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

```

## FILE: apps/web/tests/project-explorer.test.tsx

```
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const listRecentProjects = vi.fn()

vi.mock("@/features/projects/project-api", () => ({
  listProjectEntries: vi.fn().mockResolvedValue([]),
  listRecentProjects: (...args: unknown[]) => listRecentProjects(...args),
  openProject: vi.fn(),
}))

import {
  copyProjectFilePath,
  ProjectExplorer,
} from "@/components/repository/ProjectExplorer"

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe("ProjectExplorer", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    listRecentProjects.mockReset()
  })

  it("does not repeat the active project name or path in the explorer", () => {
    renderWithClient(
      <ProjectExplorer
        project={{
          id: "project_1",
          name: "TOVA test",
          root: "F:\\Programming Projects\\TOVA test",
        }}
        activeFile={null}
        onOpenFile={() => undefined}
        onProjectOpened={() => undefined}
      />,
    )

    expect(screen.getByText("PROJECT")).toBeInTheDocument()
    expect(screen.queryByLabelText("Active project")).not.toBeInTheDocument()
    expect(screen.queryByText("TOVA test")).not.toBeInTheDocument()
    expect(
      screen.queryByText("F:\\Programming Projects\\TOVA test"),
    ).not.toBeInTheDocument()
  })

  it("shows Copy File Path in the Project menu when a project is open", async () => {
    const user = userEvent.setup()
    renderWithClient(
      <ProjectExplorer
        project={{
          id: "project_1",
          name: "TOVA test",
          root: "F:\\Programming Projects\\TOVA test",
        }}
        activeFile={null}
        onOpenFile={() => undefined}
        onProjectOpened={() => undefined}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Project menu" }))
    const item = await screen.findByRole("menuitem", { name: "Copy File Path" })
    expect(item).not.toHaveAttribute("data-disabled")
  })

  it("shows empty-state actions and recent projects when no project is open", async () => {
    listRecentProjects.mockResolvedValue([
      {
        id: "project_recent",
        name: "Recent App",
        root: "F:\\Projects\\recent-app",
        lastOpenedAt: "2026-07-30T12:00:00.000Z",
      },
    ])
    renderWithClient(
      <ProjectExplorer
        project={null}
        activeFile={null}
        onOpenFile={() => undefined}
        onProjectOpened={() => undefined}
      />,
    )

    expect(screen.getByRole("button", { name: "Open project" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument()
    expect(await screen.findByText("Recent App")).toBeInTheDocument()
  })

  it("copies a path through copyProjectFilePath", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })

    await copyProjectFilePath("F:\\Programming Projects\\TOVA test")
    expect(writeText).toHaveBeenCalledWith("F:\\Programming Projects\\TOVA test")
  })
})

```

## FILE: apps/web/tests/code-workspace.test.tsx

```
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@monaco-editor/react", () => ({
  default: () => <div data-testid="monaco-editor" />,
}))

const listRecentProjects = vi.fn()

vi.mock("@/features/projects/project-api", () => ({
  languageForPath: () => "typescript",
  listRecentProjects: (...args: unknown[]) => listRecentProjects(...args),
  readProjectFile: vi.fn().mockResolvedValue({
    path: "src/App.tsx",
    content: "export {}",
  }),
  writeProjectFile: vi.fn(),
}))

import { CodeWorkspace } from "@/components/editor/CodeWorkspace"

import { staffProfiles } from "./fixtures/staff"

describe("CodeWorkspace", () => {
  it("shows recent projects in the empty state when no project is open", async () => {
    listRecentProjects.mockResolvedValue([
      {
        id: "project_recent",
        name: "Recent App",
        root: "F:\\Projects\\recent-app",
        lastOpenedAt: "2026-07-30T12:00:00.000Z",
      },
    ])
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[]}
          projectId={null}
          activeFile={null}
          openFiles={[]}
          editorOwnerId={null}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByRole("button", { name: "Open project" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument()
    expect(await screen.findByText("Recent App")).toBeInTheDocument()
  })

  it("resolves the editor owner from the supplied roster", async () => {
    const owner = {
      ...staffProfiles[4],
      id: "staff_custom_editor",
      displayName: "Custom Editor",
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[owner]}
          projectId="project_1"
          activeFile="src/App.tsx"
          openFiles={["src/App.tsx"]}
          editorOwnerId={owner.id}
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole("img", {
      name: "Custom Editor pixel portrait",
    })).toBeInTheDocument()
    expect(screen.getByText(/is editing/)).toBeInTheDocument()
  })

  it("hides the live editing badge when the mission is finished", async () => {
    const owner = staffProfiles[0]
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={client}>
        <CodeWorkspace
          staff={[owner]}
          projectId="project_1"
          activeFile="index.html"
          openFiles={["index.html", "script.js"]}
          editorOwnerId={owner.id}
          missionStatus="completed"
          onSelectFile={() => undefined}
          onCloseFile={() => undefined}
        />
      </QueryClientProvider>,
    )

    await screen.findByTestId("monaco-editor")
    expect(screen.queryByText(/is editing/)).not.toBeInTheDocument()
  })
})

```

## FILE: .superpowers/sdd/task-4-report.md

```
# Task 4 Report: Integrate empty states + mount explorer without project

## Status

**DONE**

## Summary

Wired `RecentProjectsList` into `ProjectExplorer` and `CodeWorkspace` empty states; mounted `ProjectExplorer` in `App` even when no project is open; invalidated `recent-projects` from `ProjectPathDialog` on success.

## TDD Evidence

### RED â€” Step 2

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/project-explorer.test.tsx tests/code-workspace.test.tsx
```

Result: **FAIL** (exit code 1) â€” 2 failed | 5 passed. New empty-state tests could not find "Recent App" (list not wired yet).

### GREEN â€” Step 4

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/project-explorer.test.tsx tests/code-workspace.test.tsx tests/recent-projects-list.test.tsx
```

Result: **PASS** (exit code 0) â€” 3 files, 11 tests passed.

## Changes

### Modified: `apps/web/src/app/App.tsx`

- Explorer sidebar always renders `ProjectExplorer` with `project={project.data ?? null}` instead of `null` when no project.

### Modified: `apps/web/src/components/repository/ProjectExplorer.tsx`

- Imported `RecentProjectsList`.
- Render `<RecentProjectsList onOpened={onProjectOpened} />` after `.project-explorer__empty-actions` in the no-project empty state.

### Modified: `apps/web/src/components/editor/CodeWorkspace.tsx`

- Imported `RecentProjectsList`.
- Render `<RecentProjectsList onOpened={â€¦} />` after `.code-workspace__empty-actions` in the no-project empty state.

### Modified: `apps/web/src/components/repository/ProjectPathDialog.tsx`

- Added `await client.invalidateQueries({ queryKey: ["recent-projects"] })` in mutation `onSuccess`.

### Modified: `apps/web/tests/project-explorer.test.tsx`

- Mock `listRecentProjects`; assert Open/New project buttons and recent name when `project={null}`.

### Modified: `apps/web/tests/code-workspace.test.tsx`

- Mock `listRecentProjects`; assert recent name in empty state when `projectId={null}`.

## Self-Review

- **Brief compliance:** All four wiring steps implemented; tests extended per spec; no CSS added (Task 5).
- **Existing flows:** Open/New project dialogs unchanged; `onProjectOpened` still clears files and sets active project.
- **Scope:** Minimal diff â€” only imports + one JSX block per empty state + App sidebar branch + one invalidate line.

## Concerns

1. **No CSS yet** â€” recent list in empty states uses unstyled markup until Task 5.
2. **No App-level integration test** â€” brief scoped unit tests only; explorer-without-project in App is untested directly (mocked in `app-staff-source.test.tsx`).
3. **Duplicate recent lists** â€” both explorer sidebar and code workspace empty states show recents when no project; intentional per brief but may feel redundant if both panels visible.

## Files Touched

- `apps/web/src/app/App.tsx`
- `apps/web/src/components/repository/ProjectExplorer.tsx`
- `apps/web/src/components/editor/CodeWorkspace.tsx`
- `apps/web/src/components/repository/ProjectPathDialog.tsx`
- `apps/web/tests/project-explorer.test.tsx`
- `apps/web/tests/code-workspace.test.tsx`

## Commits

None (per instructions).

```
