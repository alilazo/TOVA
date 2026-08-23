import { useQuery } from "@tanstack/react-query"
import { CircleUserRound, Moon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConnectionBadge } from "@/components/system/ConnectionBadge"
import { getRuntimeStatus } from "@/features/models/model-api"
import { getActiveProject } from "@/features/projects/project-api"
import { useUiStore } from "@/stores/ui-store"

export function TopBar() {
  const setRuntimeDialogOpen = useUiStore((state) => state.setRuntimeDialogOpen)
  const runtime = useQuery({
    queryKey: ["runtime-status"],
    queryFn: getRuntimeStatus,
    refetchInterval: 5_000,
    retry: 1,
  })
  const project = useQuery({
    queryKey: ["active-project"],
    queryFn: getActiveProject,
    retry: 1,
  })
  const runtimeState = !runtime.data && !runtime.isError
    ? "checking"
    : (runtime.data?.state ?? "unavailable")
  const modelLabel = !runtime.data
    ? runtime.isError
      ? "Status unavailable"
      : "Checking…"
    : runtime.data.selectedModel
      ?? (runtime.data.state === "unconfigured" ? "Select model" : "No model")

  return (
    <header className="top-bar">
      <span className="top-bar__workspace">
        {project.data
          ? <>{project.data.name} <small>/ {project.data.root}</small></>
          : <small>No project open</small>}
      </span>
      <div className="top-bar__wordmark" aria-label="TOVA">
        <span>T</span>
        <strong>TOVA</strong>
      </div>
      <div className="top-bar__actions">
        <ConnectionBadge
          state={runtimeState}
          model={modelLabel}
          onClick={() => setRuntimeDialogOpen(true)}
        />
        <Button variant="ghost" size="icon-xs" aria-label="Toggle theme">
          <Moon />
        </Button>
        <CircleUserRound aria-label="Workspace user" />
      </div>
    </header>
  )
}
