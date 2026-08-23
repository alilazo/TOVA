import { useEffect, useRef, useState } from "react"
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
import { StaffDirectoryScreen } from "@/components/staff/StaffDirectoryScreen"
import { ModelRuntimeDialog } from "@/components/system/ModelRuntimeDialog"
import { SettingsScreen } from "@/components/settings/SettingsScreen"
import { TeamFloor } from "@/components/team-floor/TeamFloor"
import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
import { listMissionSessions } from "@/features/mission/mission-api"
import { recoveryActionForError } from "@/features/mission/recovery"
import { sessionToRestore } from "@/features/mission/restore-session"
import { useLiveRuntime } from "@/features/mission/use-live-runtime"
import { getRuntimeStatus } from "@/features/models/model-api"
import { shouldAutoOpenRuntimeSetup } from "@/features/models/runtime-setup"
import {
  getActiveProject,
  listRecentProjects,
  openSampleProject,
  searchProjectReferences,
  type ProjectRecord,
} from "@/features/projects/project-api"
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
  const runtimeDialogOpen = useUiStore((state) => state.runtimeDialogOpen)
  const setRuntimeDialogOpen = useUiStore((state) => state.setRuntimeDialogOpen)
  const runtimeSetupDismissedUntil = useUiStore((state) => state.runtimeSetupDismissedUntil)
  const clearRuntimeSetupDismissed = useUiStore((state) => state.clearRuntimeSetupDismissed)
  const activeFile = useUiStore((state) => state.activeFile)
  const openFiles = useUiStore((state) => state.openFiles)
  const openFile = useUiStore((state) => state.openFile)
  const closeFile = useUiStore((state) => state.closeFile)
  const clearFiles = useUiStore((state) => state.clearFiles)
  const liveRuntime = useLiveRuntime()
  const [projectReferenceQuery, setProjectReferenceQuery] = useState<string | null>(null)
  const [starterObjective, setStarterObjective] = useState<string | null>(null)
  const sampleOpenStarted = useRef(false)
  const sessionRestoreStarted = useRef(false)
  const runtimeStatus = useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    retry: 1,
    refetchInterval: 5_000,
  })
  const project = useQuery({
    queryKey: ["active-project"],
    queryFn: getActiveProject,
    retry: 1,
  })
  const recents = useQuery({
    queryKey: ["recent-projects"],
    queryFn: listRecentProjects,
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
  const projectReferences = useQuery({
    queryKey: ["project-references", project.data?.id, projectReferenceQuery],
    queryFn: () => searchProjectReferences(project.data!.id, projectReferenceQuery ?? ""),
    enabled: Boolean(project.data && projectReferenceQuery !== null),
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

  useEffect(() => {
    const state = runtimeStatus.data?.state
    if (state === "connected") {
      clearRuntimeSetupDismissed()
      return
    }
    if (
      shouldAutoOpenRuntimeSetup({
        state,
        dialogOpen: runtimeDialogOpen,
        dismissedUntil: runtimeSetupDismissedUntil,
      })
    ) {
      setRuntimeDialogOpen(true)
    }
  }, [
    clearRuntimeSetupDismissed,
    runtimeDialogOpen,
    runtimeSetupDismissedUntil,
    runtimeStatus.data?.state,
    setRuntimeDialogOpen,
  ])

  useEffect(() => {
    if (project.isPending || recents.isPending) return
    if (project.data) return
    if ((recents.data?.length ?? 0) > 0) return
    if (sampleOpenStarted.current) return
    sampleOpenStarted.current = true
    void openSampleProject()
      .then((opened) => {
        clearFiles()
        setProjectReferenceQuery(null)
        setStarterObjective(opened.starterObjective ?? null)
        client.setQueryData(["active-project"], opened)
        void client.invalidateQueries({ queryKey: ["mission-sessions", opened.id] })
        void client.invalidateQueries({ queryKey: ["recent-projects"] })
      })
      .catch(() => {
        sampleOpenStarted.current = false
      })
  }, [
    clearFiles,
    client,
    project.data,
    project.isPending,
    recents.data,
    recents.isPending,
  ])

  useEffect(() => {
    if (sessionRestoreStarted.current) return
    if (liveRuntime.session) {
      sessionRestoreStarted.current = true
      return
    }
    const next = sessionToRestore(missionSessions.data ?? [], null)
    if (!next) return
    sessionRestoreStarted.current = true
    setActivePanel("team-floor")
    void liveRuntime.selectSession(next)
  }, [
    liveRuntime,
    liveRuntime.session,
    missionSessions.data,
    setActivePanel,
  ])

  const selectedStaff =
    roster.find((profile) => profile.id === selectedStaffId) ?? roster[0] ?? null

  const onProjectOpened = (next: ProjectRecord) => {
    clearFiles()
    setProjectReferenceQuery(null)
    setStarterObjective(next.starterObjective ?? null)
    void client.setQueryData(["active-project"], next)
    void client.invalidateQueries({ queryKey: ["mission-sessions", next.id] })
    void client.invalidateQueries({ queryKey: ["recent-projects"] })
  }

  const sidebar = activePanel === "settings" || activePanel === "staff"
    ? null
    : activePanel === "explorer"
      ? (project.data ? (
        <ProjectExplorer
          project={project.data}
          activeFile={activeFile}
          onOpenFile={openFile}
          onProjectOpened={onProjectOpened}
        />
      ) : null)
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
          projectId={project.data?.id ?? null}
          onOpenFile={(path) => {
            openFile(path)
            setActivePanel("explorer")
          }}
          onSelectMissionSession={(sessionId) => {
            const selected = missionSessions.data?.find((item) => item.id === sessionId)
            if (!selected) return
            setActivePanel("team-floor")
            void liveRuntime.selectSession(selected)
          }}
        />
      )

  const hasProject = Boolean(project.data)
  useEffect(() => {
    if (hasProject) return
    if (activePanel === "search" || activePanel === "team-floor") {
      setActivePanel("explorer")
    }
  }, [activePanel, hasProject, setActivePanel])

  const missionControlStatus = isTerminalMissionStatus(liveRuntime.mission?.status)
    ? liveRuntime.mission.status
    : liveRuntime.projection.status

  const soloWorkspace = !hasProject
    || activePanel === "settings"
    || activePanel === "staff"
  const workspaceClass = [
    "mission-workspace",
    soloWorkspace ? "mission-workspace--no-project" : "",
  ].filter(Boolean).join(" ")
  const workspacePanelKey = activePanel === "team-floor"
    ? "team-floor"
    : activePanel === "staff"
      ? "staff"
      : activePanel === "settings"
        ? "settings"
        : "workspace"

  const workspace = (
    <div className={workspaceClass}>
      {liveRuntime.error && (
        <p className="mission-runtime-error" role="alert">
          {liveRuntime.error}
          {recoveryActionForError(liveRuntime.error)
            ? ` ${recoveryActionForError(liveRuntime.error)}`
            : ""}
        </p>
      )}
      <WorkspacePanelSwitch
        panelKey={workspacePanelKey}
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
        ) : activePanel === "staff" ? (
          <StaffDirectoryScreen
            staff={roster}
            isLoading={staff.isPending}
            error={staff.error}
          />
        ) : activePanel === "settings" ? (
          <SettingsScreen />
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
      {hasProject && activePanel !== "settings" && activePanel !== "staff" && (
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
      projectOpen={hasProject}
      hideTeamPanel={activePanel === "staff" || activePanel === "settings"}
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
                  key={`followup-${project.data?.id ?? "none"}`}
                  mode="followup"
                  projectName={project.data?.name}
                  initialRequest={starterObjective ?? undefined}
                  projectReferences={projectReferences.data ?? []}
                  onProjectReferenceQueryChange={setProjectReferenceQuery}
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
                      teamId: request.teamId,
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
              key={`new-${project.data?.id ?? "none"}-${starterObjective ?? ""}`}
              mode={liveRuntime.session ? "followup" : "new"}
              projectName={project.data?.name}
              initialRequest={starterObjective ?? undefined}
              projectReferences={projectReferences.data ?? []}
              onProjectReferenceQueryChange={setProjectReferenceQuery}
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
                  teamId: request.teamId,
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
          <ModelRuntimeDialog
            open={runtimeDialogOpen}
            onOpenChange={setRuntimeDialogOpen}
          />
        </>
      )}
    />
  )
}
