# Task 3 review package
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

## app-panel-transition.test.tsx

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { WorkspacePanelSwitch } from "@/components/shell/WorkspacePanelSwitch"

describe("WorkspacePanelSwitch", () => {
  it("renders the active panel content with motion wrapper", () => {
    render(
      <WorkspacePanelSwitch panelKey="team-floor">
        <div>Team Floor panel</div>
      </WorkspacePanelSwitch>,
    )
    expect(screen.getByText("Team Floor panel")).toBeInTheDocument()
    expect(document.querySelector(".workspace-panel-switch")).not.toBeNull()
  })
})

## App.tsx WorkspacePanelSwitch usage


  apps\web\src\app\App.tsx:3:
> apps\web\src\app\App.tsx:4:import { ActivityFeed } from "@/components/activity/ActivityFeed"
  apps\web\src\app\App.tsx:5:import { CommandApprovalDialog } from "@/components/approvals/CommandApprovalDialog"
> apps\web\src\app\App.tsx:6:import { CodeWorkspace } from "@/components/editor/CodeWorkspace"
  apps\web\src\app\App.tsx:7:import { HandoffOverlay } from "@/components/handoff/HandoffOverlay"
  apps\web\src\app\App.tsx:8:import { MissionComposer } from "@/components/mission/MissionComposer"
  apps\web\src\app\App.tsx:9:import { MissionControlBar } from "@/components/mission/MissionControlBar"
  apps\web\src\app\App.tsx:11:import { AppShell } from "@/components/shell/AppShell"
> apps\web\src\app\App.tsx:12:import { WorkspacePanelSwitch } from "@/components/shell/WorkspacePanelSwitch"
  apps\web\src\app\App.tsx:13:import { WorkspaceSidebar } from "@/components/shell/WorkspaceSidebar"
  apps\web\src\app\App.tsx:14:import { EngineeringTeamPanel } from "@/components/staff/EngineeringTeamPanel"
> apps\web\src\app\App.tsx:15:import { TeamFloor } from "@/components/team-floor/TeamFloor"
  apps\web\src\app\App.tsx:16:import { WorkLogDrawer } from "@/components/work-log/WorkLogDrawer"
  apps\web\src\app\App.tsx:17:import { useLiveRuntime } from "@/features/mission/use-live-runtime"
  apps\web\src\app\App.tsx:18:import { getRuntimeStatus } from "@/features/models/model-api"
  apps\web\src\app\App.tsx:118:      )}
> apps\web\src\app\App.tsx:119:      <WorkspacePanelSwitch
  apps\web\src\app\App.tsx:120:        panelKey={activePanel === "team-floor" ? "team-floor" : "workspace"}
  apps\web\src\app\App.tsx:121:      >
  apps\web\src\app\App.tsx:122:        {activePanel === "team-floor" ? (
> apps\web\src\app\App.tsx:123:          <TeamFloor
  apps\web\src\app\App.tsx:124:            staff={roster}
  apps\web\src\app\App.tsx:125:            currentStaffId={liveRuntime.projection.currentStaffId}
  apps\web\src\app\App.tsx:126:            statuses={liveRuntime.projection.staffStatuses}
  apps\web\src\app\App.tsx:148:        ) : (
> apps\web\src\app\App.tsx:149:          <CodeWorkspace
  apps\web\src\app\App.tsx:150:            staff={roster}
  apps\web\src\app\App.tsx:151:            projectId={project.data?.id ?? null}
  apps\web\src\app\App.tsx:152:            activeFile={activeFile}
  apps\web\src\app\App.tsx:160:        )}
> apps\web\src\app\App.tsx:161:      </WorkspacePanelSwitch>
  apps\web\src\app\App.tsx:162:      {hasProject && (
> apps\web\src\app\App.tsx:163:        <ActivityFeed
  apps\web\src\app\App.tsx:164:          staff={roster}
  apps\web\src\app\App.tsx:165:          hasStarted={liveRuntime.hasStarted}
  apps\web\src\app\App.tsx:166:          missionStatus={liveRuntime.projection.status}




## CSS workspace-panel-switch


> apps\web\src\styles\globals.css:514:.workspace-panel-switch {
  apps\web\src\styles\globals.css:515:  display: contents;
  apps\web\src\styles\globals.css:516:}
  apps\web\src\styles\globals.css:517:
  apps\web\src\styles\globals.css:518:.mission-workspace {
  apps\web\src\styles\globals.css:519:  display: grid;
  apps\web\src\styles\globals.css:520:  grid-template-rows: auto minmax(280px, 1fr) minmax(145px, 29%);



