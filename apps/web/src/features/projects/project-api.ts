import { apiRequest } from "@/lib/api"

export interface ProjectRecord {
  id: string
  name: string
  root: string
  starterObjective?: string
}

export interface ProjectEntry {
  name: string
  path: string
  kind: "file" | "dir"
}

export interface ProjectFile {
  path: string
  content: string
}

export interface RecentProjectRecord {
  id: string
  name: string
  root: string
  lastOpenedAt: string
}

export function openProject(path: string, create = false) {
  return apiRequest<ProjectRecord>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ path, create }),
  })
}

export function openSampleProject() {
  return apiRequest<{
    id: string
    name: string
    root: string
    starter_objective: string
  }>("/api/projects/sample", {
    method: "POST",
  }).then((response) => ({
    id: response.id,
    name: response.name,
    root: response.root,
    starterObjective: response.starter_objective,
  }))
}

export function getActiveProject() {
  return apiRequest<ProjectRecord | null>("/api/projects/active")
}

export function listRecentProjects() {
  return apiRequest<RecentProjectRecord[]>("/api/projects/recent")
}

export function listProjectEntries(projectId: string, path = ".") {
  const query = new URLSearchParams({ path })
  return apiRequest<ProjectEntry[]>(`/api/projects/${projectId}/entries?${query}`)
}

export function createProjectEntry(
  projectId: string,
  path: string,
  kind: ProjectEntry["kind"],
) {
  return apiRequest<ProjectEntry>(`/api/projects/${projectId}/entries`, {
    method: "POST",
    body: JSON.stringify({ path, kind }),
  })
}

export function moveProjectEntry(
  projectId: string,
  sourcePath: string,
  destinationPath: string,
) {
  return apiRequest<ProjectEntry>(`/api/projects/${projectId}/entries`, {
    method: "PATCH",
    body: JSON.stringify({
      source_path: sourcePath,
      destination_path: destinationPath,
    }),
  })
}

export function deleteProjectEntry(
  projectId: string,
  path: string,
  recursive: boolean,
) {
  return apiRequest<ProjectEntry>(`/api/projects/${projectId}/entries`, {
    method: "DELETE",
    body: JSON.stringify({ path, recursive }),
  })
}

export function searchProjectReferences(projectId: string, queryValue: string) {
  const query = new URLSearchParams({ query: queryValue })
  return apiRequest<ProjectEntry[]>(`/api/projects/${projectId}/references?${query}`)
}

export function readProjectFile(projectId: string, path: string) {
  const query = new URLSearchParams({ path })
  return apiRequest<ProjectFile>(`/api/projects/${projectId}/files?${query}`)
}

export function writeProjectFile(projectId: string, path: string, content: string) {
  return apiRequest<ProjectFile>(`/api/projects/${projectId}/files`, {
    method: "PUT",
    body: JSON.stringify({ path, content }),
  })
}

export function languageForPath(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript"
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript"
  if (path.endsWith(".py")) return "python"
  if (path.endsWith(".json")) return "json"
  if (path.endsWith(".css")) return "css"
  if (path.endsWith(".html")) return "html"
  if (path.endsWith(".md")) return "markdown"
  return "plaintext"
}
