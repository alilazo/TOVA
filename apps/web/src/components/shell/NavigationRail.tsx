import {
  Bot,
  FolderTree,
  Search,
  Settings,
  Target,
  UsersRound,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { NavigationPanel } from "@/stores/ui-store"

const items = [
  { id: "explorer", label: "Explorer", icon: FolderTree, requiresProject: false },
  { id: "search", label: "Search", icon: Search, requiresProject: true },
  { id: "team-floor", label: "Team Floor", icon: UsersRound, requiresProject: true },
  { id: "missions", label: "Missions", icon: Target, requiresProject: false },
  { id: "staff", label: "HiPo Staff", icon: Bot, requiresProject: false },
  { id: "settings", label: "Settings", icon: Settings, requiresProject: false },
] satisfies Array<{
  id: NavigationPanel
  label: string
  icon: typeof FolderTree
  requiresProject: boolean
}>

interface NavigationRailProps {
  active: NavigationPanel
  onChange: (panel: NavigationPanel) => void
  projectOpen: boolean
}

export function NavigationRail({
  active,
  onChange,
  projectOpen,
}: NavigationRailProps) {
  return (
    <nav className="navigation-rail" aria-label="Primary navigation">
      <div className="navigation-rail__items">
        {items.map(({ id, label, icon: Icon, requiresProject }) => {
          const disabled = requiresProject && !projectOpen
          const hint = disabled ? "Open a project first" : label
          const button = (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "navigation-rail__button",
                active === id && "is-active",
                disabled && "is-disabled",
              )}
              aria-label={label}
              title={hint}
              aria-current={active === id ? "page" : undefined}
              disabled={disabled}
              onClick={() => onChange(id)}
            >
              <Icon />
            </Button>
          )
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                {disabled ? <span>{button}</span> : button}
              </TooltipTrigger>
              <TooltipContent side="right">{hint}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </nav>
  )
}
