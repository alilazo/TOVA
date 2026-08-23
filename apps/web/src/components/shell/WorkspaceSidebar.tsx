import { Bot, Search, Settings, Target, UsersRound } from "lucide-react"

import type { MissionRecord, MissionSessionRecord } from "@/features/mission/mission-api"
import type { RuntimeStatus } from "@/features/models/model-api"
import type { NavigationPanel } from "@/stores/ui-store"
import type { StaffProfile } from "@/types/domain"

import { ProjectSearchPanel } from "../repository/ProjectSearchPanel"

const content: Record<Exclude<NavigationPanel, "explorer">, {
  title: string
  description?: string
  icon: typeof Search
}> = {
  search: {
    title: "Search",
    description: "Search the open project.",
    icon: Search,
  },
  "team-floor": {
    title: "Team Floor",
    icon: UsersRound,
  },
  missions: {
    title: "Missions",
    description: "Inspect mission activity in this session.",
    icon: Target,
  },
  staff: {
    title: "HiPo Staff",
    description: "Markdown-backed staff profiles.",
    icon: Bot,
  },
  settings: {
    title: "Settings",
    description: "Workspace and local model preferences.",
    icon: Settings,
  },
}

interface WorkspaceSidebarProps {
  panel: Exclude<NavigationPanel, "explorer">
  staff: StaffProfile[]
  staffLoading: boolean
  staffError: Error | null
  runtimeStatus: RuntimeStatus | undefined
  mission: MissionRecord | null
  missionSessions?: MissionSessionRecord[]
  selectedMissionSessionId?: string | null
  onSelectMissionSession?: (sessionId: string) => void
  projectId?: string | null
  onOpenFile?: (path: string) => void
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function panelItems({
  panel,
  staff,
  runtimeStatus,
  mission,
}: WorkspaceSidebarProps): string[] {
  if (panel === "search") return []

  if (panel === "missions") {
    return mission
      ? [mission.objective, `Status: ${titleCase(mission.status)}`]
      : ["No mission history is available in this session."]
  }

  if (panel === "team-floor") {
    return mission
      ? [
          mission.objective,
          `Status: ${titleCase(mission.status)}`,
        ]
      : ["No team workflow is active in this session."]
  }

  if (panel === "staff") {
    if (staff.length === 0) return ["No staff profiles are available."]
    const coordinators = staff.filter((profile) => profile.roleKey === "project_coordinator").length
    const specialists = staff.length - coordinators
    return [
      `${staff.length} ${staff.length === 1 ? "profile" : "profiles"} available`,
      `${coordinators} ${coordinators === 1 ? "coordinator" : "coordinators"}`,
      `${specialists} ${specialists === 1 ? "specialist" : "specialists"}`,
    ]
  }

  return [
    "Models",
    "Local model",
    runtimeStatus ? titleCase(runtimeStatus.state) : "Runtime status unavailable",
    runtimeStatus?.selectedModel ?? "No model selected",
  ]
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const { panel, staffLoading, staffError, staff } = props
  const panelContent = content[panel]
  const Icon = panelContent.icon
  const items = panelItems(props)
  const staffState = panel === "staff"
    ? staffLoading
      ? <p role="status">Loading staff profiles…</p>
      : staffError
        ? <p role="alert">Staff profiles are unavailable. Check Settings → Diagnostics.</p>
        : staff.length === 0
          ? <p role="status">No staff profiles are available.</p>
          : null
    : null

  return (
    <aside className="workspace-sidebar">
      <header>
        <Icon aria-hidden="true" />
        <span>
          <strong>{panelContent.title}</strong>
          {panelContent.description ? <small>{panelContent.description}</small> : null}
        </span>
      </header>
      {panel === "search" && (
        <ProjectSearchPanel
          projectId={props.projectId ?? null}
          onOpenFile={props.onOpenFile ?? (() => undefined)}
        />
      )}
      {panel === "missions" && props.missionSessions?.length ? (
        <ul>
          {props.missionSessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                className="workspace-sidebar__mission"
                aria-pressed={session.id === props.selectedMissionSessionId}
                onClick={() => props.onSelectMissionSession?.(session.id)}
              >
                <strong>{session.title}</strong>
                <span>{session.turns.length} {session.turns.length === 1 ? "turn" : "turns"}</span>
                <span>Status: {titleCase(session.status)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : panel === "search" ? null : staffState ?? (
        items.length > 0 ? (
          <ul>
            {items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null
      )}
    </aside>
  )
}
