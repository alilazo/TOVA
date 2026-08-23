import { useQuery } from "@tanstack/react-query"
import { useState } from "react"

import { Input } from "@/components/ui/input"
import { searchProjectReferences } from "@/features/projects/project-api"

interface ProjectSearchPanelProps {
  projectId: string | null
  onOpenFile: (path: string) => void
}

export function ProjectSearchPanel({
  projectId,
  onOpenFile,
}: ProjectSearchPanelProps) {
  const [query, setQuery] = useState("")
  const trimmed = query.trim()
  const results = useQuery({
    queryKey: ["project-references", projectId, trimmed],
    queryFn: () => searchProjectReferences(projectId ?? "", trimmed),
    enabled: Boolean(projectId && trimmed),
  })
  const matches = results.data ?? []

  return (
    <div className="project-search-panel">
      <Input
        aria-label="Search repository"
        placeholder="Search files and symbols"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {!trimmed ? (
        <p className="workspace-sidebar__hint">Type to search the open project.</p>
      ) : results.isPending ? (
        <p role="status">Searching…</p>
      ) : results.isError ? (
        <p role="alert">Search failed. Check Settings → Diagnostics, then retry.</p>
      ) : matches.length === 0 ? (
        <p role="status">No matching files.</p>
      ) : (
        <ul>
          {matches.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                className="workspace-sidebar__mission"
                onClick={() => onOpenFile(entry.path)}
              >
                {entry.path}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
