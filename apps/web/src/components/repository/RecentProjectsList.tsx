import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import {
  listRecentProjects,
  openProject,
  type ProjectRecord,
} from "@/features/projects/project-api"

const DEFAULT_VISIBLE = 5

interface RecentProjectsListProps {
  onOpened: (project: ProjectRecord) => void
}

function truncatePath(path: string, maxLength = 48): string {
  if (path.length <= maxLength) return path
  const head = Math.max(12, Math.floor(maxLength * 0.35))
  const tail = maxLength - head - 1
  return `${path.slice(0, head)}…${path.slice(-tail)}`
}

function openErrorMessage(error: Error): string {
  const message = error.message.toLowerCase()
  if (
    message.includes("existing directory")
    || message.includes("not found")
  ) {
    return "That folder is no longer available"
  }
  return error.message
}

export function RecentProjectsList({ onOpened }: RecentProjectsListProps) {
  const client = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [alertText, setAlertText] = useState<string | null>(null)

  const recents = useQuery({
    queryKey: ["recent-projects"],
    queryFn: listRecentProjects,
  })

  const openRecent = useMutation({
    mutationFn: (root: string) => openProject(root),
    onSuccess: async (project) => {
      setAlertText(null)
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
      await client.invalidateQueries({ queryKey: ["active-project"] })
      onOpened(project)
    },
    onError: async (error: Error) => {
      setAlertText(openErrorMessage(error))
      await client.invalidateQueries({ queryKey: ["recent-projects"] })
    },
  })

  if (recents.isLoading) {
    return null
  }

  const items = recents.data ?? []
  if (items.length === 0 && !alertText) {
    return null
  }

  const visibleItems = expanded ? items : items.slice(0, DEFAULT_VISIBLE)
  const canExpand = items.length > DEFAULT_VISIBLE

  return (
    <section className="recent-projects">
      <p className="recent-projects__label">Recent</p>
      {alertText && <p role="alert">{alertText}</p>}
      <ul className="recent-projects__list">
        {visibleItems.map((item) => (
          <li key={item.root}>
            <button
              type="button"
              className="recent-projects__row"
              disabled={openRecent.isPending}
              onClick={() => openRecent.mutate(item.root)}
            >
              <span className="recent-projects__name">{item.name}</span>
              <span className="recent-projects__path">{truncatePath(item.root)}</span>
            </button>
          </li>
        ))}
      </ul>
      {canExpand && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="recent-projects__toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "View more"}
        </Button>
      )}
    </section>
  )
}
