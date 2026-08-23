# Task 5 Review
## FILE: apps/web/src/components/team-floor/TeamFloor.tsx
```
import { ArrowRight, CheckCircle2, FileStack, GitBranch } from "lucide-react"
import { motion } from "framer-motion"

import { staffProfiles } from "@/features/staff/staff-fixtures"
import { formatStatus } from "@/lib/utils"
import type { ActivityItem, Artifact, StaffStatus } from "@/types/domain"

import { PixelAvatar } from "../staff/PixelAvatar"
import { StatusBadge } from "../staff/StatusBadge"
import { TeamFloorLiveEditor } from "./TeamFloorLiveEditor"

interface TeamFloorProps {
  currentStaffId: string | null
  statuses: Record<string, StaffStatus>
  selectedStaffIds: string[]
  artifacts: Artifact[]
  activity: ActivityItem[]
  onSelectStaff: (staffId: string) => void
  projectId: string | null
  activeFile: string | null
  fileRevision: number
  editorOwnerId: string | null
}

export function TeamFloor({
  currentStaffId,
  statuses,
  selectedStaffIds,
  artifacts,
  activity,
  onSelectStaff,
  projectId,
  activeFile,
  fileRevision,
  editorOwnerId,
}: TeamFloorProps) {
  const team = staffProfiles.filter((staff) => selectedStaffIds.includes(staff.id))
  const highlightStaffId = activeFile && editorOwnerId ? editorOwnerId : currentStaffId
  const active = team.find((staff) => staff.id === currentStaffId) ?? team[0] ?? null
  const highlightIndex = highlightStaffId
    ? team.findIndex((staff) => staff.id === highlightStaffId)
    : -1
  const missionComplete =
    team.length > 0 && team.every((staff) => statuses[staff.id] === "completed")
  const completedCount = team.filter((staff) => statuses[staff.id] === "completed").length
  const upcomingCount = missionComplete
    ? 0
    : Math.max(team.length - completedCount - (active ? 1 : 0), 0)
  const latestAction = active
    ? [...activity].reverse().find((item) => item.staffId === active.id)?.title
      ?? "Waiting for the next observable action."
    : null
  const outputs = [
    ...artifacts.filter((artifact) => artifact.staffId === active?.id).map((artifact) => artifact.name),
    ...artifacts.slice(-2).map((artifact) => artifact.name),
  ].filter((value, index, list) => list.indexOf(value) === index)

  return (
    <section className="team-floor" aria-label="Team Floor">
      <header className="team-floor__header">
        <span>
          <strong>Team Floor</strong>
          <small>Visible mission execution workspace</small>
        </span>
        <span className="team-floor__phase"><GitBranch /> Active workflow</span>
      </header>
      <div className="team-floor__workflow" aria-label="Mission workflow">
        {team.map((staff, index) => (
          <div key={staff.id} className="team-floor__node-wrap">
            <button
              type="button"
              className={index === highlightIndex ? "team-floor__node is-active" : "team-floor__node"}
              onClick={() => onSelectStaff(staff.id)}
            >
              <PixelAvatar avatar={staff.avatar} name={staff.displayName} size="sm" />
              <span>{staff.displayName}</span>
              {(missionComplete || statuses[staff.id] === "completed") && (
                <CheckCircle2 aria-label="Completed" />
              )}
            </button>
            {index < team.length - 1 && <ArrowRight aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="team-floor__body">
        <div className="team-floor__workforce">
          {active ? (
            <motion.div
              key={active.id}
              className="active-staff-stage"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="active-staff-stage__identity">
                <PixelAvatar avatar={active.avatar} name={active.displayName} size="lg" />
                <span>
                  <small>ACTIVE EMPLOYEE</small>
                  <h2>{active.displayName}</h2>
                  <p>{active.role}</p>
                  <StatusBadge status={statuses[active.id] ?? "working"} />
                </span>
              </div>
              <div className="active-staff-stage__action">
                <small>CURRENT ACTION</small>
                <strong>{latestAction}</strong>
                <p>{active.description}</p>
              </div>
              <div className="active-staff-stage__output">
                <small>CURRENT WORK OUTPUT</small>
                {outputs.length > 0 ? outputs.map((item) => (
                  <span key={item}><FileStack />{item}</span>
                )) : (
                  <span>No artifacts yet</span>
                )}
              </div>
            </motion.div>
          ) : (
            <div className="team-floor__empty">
              <strong>No mission is running</strong>
              <p>Start a mission to assemble the team and display its workflow.</p>
            </div>
          )}
        </div>
        <TeamFloorLiveEditor
          projectId={projectId}
          activeFile={activeFile}
          fileRevision={fileRevision}
          editorOwnerId={editorOwnerId}
        />
      </div>
      <footer className="team-floor__timeline">
        <span>Completed <strong>{completedCount}</strong></span>
        <span>Current <strong>{active?.displayName ?? "None"}</strong></span>
        <span>Upcoming <strong>{upcomingCount}</strong></span>
        <span>State <strong>{formatStatus(statuses[active?.id ?? ""] ?? "available")}</strong></span>
      </footer>
    </section>
  )
}

```
## FILE: apps/web/src/app/App.tsx
```
import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { ActivityFeed } from "@/components/activity/ActivityFeed"
import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
import { CodeWorkspace } from "@/components/editor/CodeWorkspace"
import { HandoffOverlay } from "@/components/handoff/HandoffOverlay"
import { MissionComposer } from "@/components/mission/MissionComposer"
import { MissionControlBar } from "@/components/mission/MissionControlBar"
import { MissionStageStrip } from "@/components/mission/MissionStageStrip"
import { ProjectExplorer } from "@/components/repository/ProjectExplorer"
import { AppShell } from "@/components/shell/AppShell"
import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar"
import { EngineeringTeamPanel } from "@/components/staff/EngineeringTeamPanel"
import { TeamFloor } from "@/components/team-floor/TeamFloor"
import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
import { useLiveRuntime } from "@/features/mission/use-live-runtime"
import { getRuntimeStatus } from "@/features/models/model-api"
import { getActiveProject } from "@/features/projects/project-api"
import { staffProfiles, workLogs } from "@/features/staff/staff-fixtures"
import { useUiStore } from "@/stores/ui-store"

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
  const speed = useUiStore((state) => state.playbackSpeed)
  const setSpeed = useUiStore((state) => state.setPlaybackSpeed)
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

  const selectedStaff =
    staffProfiles.find((staff) => staff.id === selectedStaffId) ?? staffProfiles[0]

  const sidebar = activePanel === "explorer" ? (
    <ProjectExplorer
      project={project.data ?? null}
      activeFile={activeFile}
      onOpenFile={openFile}
      onProjectOpened={(next) => {
        clearFiles()
        void client.setQueryData(["active-project"], next)
      }}
    />
  ) : (
    <WorkspaceSidebar panel={activePanel} />
  )

  const workspace = (
    <div className="mission-workspace">
      {!liveRuntime.hasStarted ? (
        <MissionComposer
          projectName={project.data?.name}
          liveRuntime={{
            connected: runtimeStatus.data?.runtime === "live"
              && (runtimeStatus.data?.connected ?? false),
            profileId: runtimeStatus.data?.profile_id ?? "",
            model: runtimeStatus.data?.model ?? "",
          }}
          onStart={(request) => {
            if (!project.data) return
            void liveRuntime.start({
              request: request.request,
              projectId: project.data.id,
              modelProfileId: request.modelProfile,
              model: request.model,
            })
          }}
        />
      ) : (
        <MissionControlBar
          title={liveRuntime.mission?.objective ?? "Live mission"}
          playing={liveRuntime.playing}
          paused={liveRuntime.paused}
          completed={liveRuntime.projection.status === "completed"}
          speed={speed}
          onPause={liveRuntime.pause}
          onResume={liveRuntime.resume}
          onRestart={liveRuntime.cancel}
          onSpeedChange={setSpeed}
        />
      )}
      {liveRuntime.error && (
        <p className="mission-runtime-error" role="alert">{liveRuntime.error}</p>
      )}
      <MissionStageStrip
        phase={liveRuntime.projection.phase}
        progress={liveRuntime.projection.progress}
        teamCount={liveRuntime.projection.selectedStaffIds.length}
        coordinatorName="Alex"
      />
      {activePanel === "team-floor" ? (
        <TeamFloor
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
        />
      ) : (
        <CodeWorkspace
          projectId={project.data?.id ?? null}
          activeFile={activeFile}
          openFiles={openFiles}
          editorOwnerId={liveRuntime.projection.editorOwnerId}
          onSelectFile={openFile}
          onCloseFile={closeFile}
        />
      )}
      <ActivityFeed
        events={liveRuntime.projection.activity.length > 0
          ? liveRuntime.projection.activity
          : [
              {
                id: "welcome",
                timestamp: new Date().toISOString(),
                staffId: "staff_alex",
                title: project.data
                  ? "Alex is ready to receive a software mission"
                  : "Open a project to begin",
                status: "available",
                eventType: "activity.created",
              },
            ]}
      />
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
          staff={staffProfiles}
          selectedStaffIds={
            liveRuntime.projection.selectedStaffIds.length > 0
              ? liveRuntime.projection.selectedStaffIds
              : staffProfiles.map((staff) => staff.id)
          }
          statuses={liveRuntime.projection.staffStatuses}
          selectedStaffId={selectedStaffId}
          onSelectStaff={selectStaff}
        />
      )}
      overlays={(
        <>
          <WorkLogDrawer
            open={workLogOpen}
            staff={selectedStaff}
            log={workLogs[selectedStaff.id]}
            onOpenChange={setWorkLogOpen}
          />
          <HandoffOverlay
            handoff={liveRuntime.projection.activeHandoff}
            staff={staffProfiles}
            onSkip={() => undefined}
          />
          <CommandApprovalDialog missionId={liveRuntime.mission?.id} />
        </>
      )}
    />
  )
}

```

