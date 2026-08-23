import type { ReactNode } from "react"

import type { NavigationPanel } from "@/stores/ui-store"

import { NavigationRail } from "./NavigationRail"
import { TopBar } from "./TopBar"

interface AppShellProps {
  activePanel: NavigationPanel
  onPanelChange: (panel: NavigationPanel) => void
  projectOpen: boolean
  hideTeamPanel?: boolean
  sidebar: ReactNode
  workspace: ReactNode
  teamPanel: ReactNode
  overlays?: ReactNode
}

export function AppShell({
  activePanel,
  onPanelChange,
  projectOpen,
  hideTeamPanel = false,
  sidebar,
  workspace,
  teamPanel,
  overlays,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-shell__body">
        <NavigationRail
          active={activePanel}
          onChange={onPanelChange}
          projectOpen={projectOpen}
        />
        {sidebar}
        <main className="app-shell__workspace">{workspace}</main>
        {!hideTeamPanel && teamPanel}
      </div>
      {overlays}
    </div>
  )
}
