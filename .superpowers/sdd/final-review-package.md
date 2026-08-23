# Final review package — Send-to-Team transition & work output
Plan: docs/superpowers/plans/2026-07-27-send-to-team-transition-work-output.md
Spec: docs/superpowers/specs/2026-07-27-send-to-team-transition-work-output-design.md

## Minors carried from task reviews
- Task 2: store-only navigation test (no App render test)
- Task 2: chip open skips invalidateQueries (same as other openFile paths)

## Changed files (list)
- apps/web/src/components/team-floor/TeamFloor.tsx
- apps/web/src/components/shell/WorkspacePanelSwitch.tsx
- apps/web/src/app/App.tsx
- apps/web/src/styles/globals.css
- apps/web/tests/team-floor.test.tsx
- apps/web/tests/open-work-output.test.ts
- apps/web/tests/app-panel-transition.test.tsx
- apps/web/tests/mission-workspace-layout.test.ts

## WorkspacePanelSwitch.tsx

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"

interface WorkspacePanelSwitchProps {
  panelKey: "team-floor" | "workspace"
  children: ReactNode
}

export function WorkspacePanelSwitch({
  panelKey,
  children,
}: WorkspacePanelSwitchProps) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={panelKey}
        className="workspace-panel-switch"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

## App.tsx key sections


  apps\web\src\app\App.tsx:2:import { useQuery, useQueryClient } from "@tanstack/react-query"
  apps\web\src\app\App.tsx:3:
> apps\web\src\app\App.tsx:4:import { ActivityFeed } from "@/components/activity/ActivityFeed"
  apps\web\src\app\App.tsx:5:import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
  apps\web\src\app\App.tsx:6:import { CodeWorkspace } from "@/components/editor/CodeWorkspace"
  apps\web\src\app\App.tsx:7:import { HandoffOverlay } from "@/components/handoff/HandoffOverlay"
  apps\web\src\app\App.tsx:8:import { MissionComposer } from "@/components/mission/MissionComposer"
  apps\web\src\app\App.tsx:9:import { MissionControlBar } from "@/components/mission/MissionControlBar"
  apps\web\src\app\App.tsx:10:import { ProjectExplorer } from "@/components/repository/ProjectExplorer"
  apps\web\src\app\App.tsx:11:import { AppShell } from "@/components/shell/AppShell"
> apps\web\src\app\App.tsx:12:import { WorkspacePanelSwitch } from "@/components/shell/WorkspacePanelSwitch"
  apps\web\src\app\App.tsx:13:import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar"
  apps\web\src\app\App.tsx:14:import { EngineeringTeamPanel } from "@/components/staff/EngineeringTeamPanel"
  apps\web\src\app\App.tsx:15:import { TeamFloor } from "@/components/team-floor/TeamFloor"
  apps\web\src\app\App.tsx:16:import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
  apps\web\src\app\App.tsx:17:import { useLiveRuntime } from "@/features/mission/use-live-runtime"
  apps\web\src\app\App.tsx:18:import { getRuntimeStatus } from "@/features/models/model-api"
  apps\web\src\app\App.tsx:19:import { getActiveProject, type ProjectRecord } from "@/features/projects/project-api"
  apps\web\src\app\App.tsx:20:import { getStaffProfiles } from "@/features/staff/staff-api"
  apps\web\src\app\App.tsx:117:        <p className="mission-runtime-error" role="alert">{liveRuntime.error}</p>
  apps\web\src\app\App.tsx:118:      )}
> apps\web\src\app\App.tsx:119:      <WorkspacePanelSwitch
  apps\web\src\app\App.tsx:120:        panelKey={activePanel === "team-floor" ? "team-floor" : "workspace"}
  apps\web\src\app\App.tsx:121:      >
  apps\web\src\app\App.tsx:122:        {activePanel === "team-floor" ? (
  apps\web\src\app\App.tsx:123:          <TeamFloor
  apps\web\src\app\App.tsx:124:            staff={roster}
  apps\web\src\app\App.tsx:125:            currentStaffId={liveRuntime.projection.currentStaffId}
  apps\web\src\app\App.tsx:126:            statuses={liveRuntime.projection.staffStatuses}
  apps\web\src\app\App.tsx:127:            selectedStaffIds={liveRuntime.projection.selectedStaffIds}
  apps\web\src\app\App.tsx:141:            startedAt={liveRuntime.projection.startedAt}
  apps\web\src\app\App.tsx:142:            endedAt={liveRuntime.projection.endedAt}
> apps\web\src\app\App.tsx:143:            onOpenWorkOutput={(path) => {
  apps\web\src\app\App.tsx:144:              openFile(path)
  apps\web\src\app\App.tsx:145:              setActivePanel("explorer")
  apps\web\src\app\App.tsx:146:            }}
  apps\web\src\app\App.tsx:147:          />
  apps\web\src\app\App.tsx:148:        ) : (
  apps\web\src\app\App.tsx:149:          <CodeWorkspace
  apps\web\src\app\App.tsx:150:            staff={roster}
  apps\web\src\app\App.tsx:151:            projectId={project.data?.id ?? null}
  apps\web\src\app\App.tsx:159:          />
  apps\web\src\app\App.tsx:160:        )}
> apps\web\src\app\App.tsx:161:      </WorkspacePanelSwitch>
  apps\web\src\app\App.tsx:162:      {hasProject && (
> apps\web\src\app\App.tsx:163:        <ActivityFeed
  apps\web\src\app\App.tsx:164:          staff={roster}
  apps\web\src\app\App.tsx:165:          hasStarted={liveRuntime.hasStarted}
  apps\web\src\app\App.tsx:166:          missionStatus={liveRuntime.projection.status}
  apps\web\src\app\App.tsx:167:          events={liveRuntime.projection.activity}
  apps\web\src\app\App.tsx:168:        />
  apps\web\src\app\App.tsx:169:      )}
  apps\web\src\app\App.tsx:170:    </div>
  apps\web\src\app\App.tsx:171:  )




## TeamFloor work output section


> apps\web\src\components\team-floor\TeamFloor.tsx:40:  onOpenWorkOutput?: (path: string) => void
  apps\web\src\components\team-floor\TeamFloor.tsx:41:}
  apps\web\src\components\team-floor\TeamFloor.tsx:42:
> apps\web\src\components\team-floor\TeamFloor.tsx:43:type WorkOutputItem =
  apps\web\src\components\team-floor\TeamFloor.tsx:44:  | { kind: "file"; path: string }
  apps\web\src\components\team-floor\TeamFloor.tsx:45:  | { kind: "text"; label: string }
  apps\web\src\components\team-floor\TeamFloor.tsx:46:
> apps\web\src\components\team-floor\TeamFloor.tsx:67:  onOpenWorkOutput,
  apps\web\src\components\team-floor\TeamFloor.tsx:68:}: TeamFloorProps) {
  apps\web\src\components\team-floor\TeamFloor.tsx:69:  const elapsed = useMissionElapsed(startedAt, endedAt)
  apps\web\src\components\team-floor\TeamFloor.tsx:70:  const team = staff.filter((profile) => 
selectedStaffIds.includes(profile.id))
> apps\web\src\components\team-floor\TeamFloor.tsx:108:  const workOutputs: WorkOutputItem[] = showWorkOutput
  apps\web\src\components\team-floor\TeamFloor.tsx:109:    ? [
  apps\web\src\components\team-floor\TeamFloor.tsx:110:        ...artifacts
  apps\web\src\components\team-floor\TeamFloor.tsx:111:          .filter((artifact) => artifact.staffId === active?.id)
> apps\web\src\components\team-floor\TeamFloor.tsx:112:          .map((artifact): WorkOutputItem =>
  apps\web\src\components\team-floor\TeamFloor.tsx:113:            artifact.type === "file_output"
  apps\web\src\components\team-floor\TeamFloor.tsx:114:              ? { kind: "file", path: artifact.name }
  apps\web\src\components\team-floor\TeamFloor.tsx:115:              : { kind: "text", label: artifact.name },
> apps\web\src\components\team-floor\TeamFloor.tsx:117:        ...artifacts.slice(-2).map((artifact): WorkOutputItem =>
  apps\web\src\components\team-floor\TeamFloor.tsx:118:          artifact.type === "file_output"
  apps\web\src\components\team-floor\TeamFloor.tsx:119:            ? { kind: "file", path: artifact.name }
  apps\web\src\components\team-floor\TeamFloor.tsx:120:            : { kind: "text", label: artifact.name },
> apps\web\src\components\team-floor\TeamFloor.tsx:195:                  <small>CURRENT WORK OUTPUT</small>
> apps\web\src\components\team-floor\TeamFloor.tsx:196:                  {workOutputs.length > 0 ? 
workOutputs.map((item) =>
  apps\web\src\components\team-floor\TeamFloor.tsx:197:                    item.kind === "file" ? (
  apps\web\src\components\team-floor\TeamFloor.tsx:198:                      <button
  apps\web\src\components\team-floor\TeamFloor.tsx:199:                        key={`file:${item.path}`}
> apps\web\src\components\team-floor\TeamFloor.tsx:201:                        
className="active-staff-stage__output-chip"
  apps\web\src\components\team-floor\TeamFloor.tsx:202:                        aria-label={`Open ${item.path} in 
Explorer`}
> apps\web\src\components\team-floor\TeamFloor.tsx:203:                        onClick={() => 
onOpenWorkOutput?.(item.path)}
  apps\web\src\components\team-floor\TeamFloor.tsx:204:                      >
  apps\web\src\components\team-floor\TeamFloor.tsx:205:                        <FileStack />{item.path}
  apps\web\src\components\team-floor\TeamFloor.tsx:206:                      </button>



