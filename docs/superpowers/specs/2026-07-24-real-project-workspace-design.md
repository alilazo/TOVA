# Real Local Project Workspace Design

Date: 2026-07-24

## Goal

Replace Orion demo fixtures with a path-based active project workspace so TOVA opens real local folders, shows them in the explorer/editor, and runs live LM Studio missions that develop inside that folder.

## Locked decisions

- Path-based Open / New Project (absolute path dialogs; no Electron yet)
- New Project creates an empty directory if missing, then opens it
- Live LM Studio only — no Simulation UI
- Remove Orion Platform branding; show the chosen folder name/path
- Agents and UI share one project root via `ProjectWorkspace`

## Architecture

1. Frontend opens or creates a project by absolute path through `POST /api/projects`.
2. Backend registers the project in an in-memory registry and returns `{ id, name, root }`.
3. Explorer and Monaco use project file APIs (`entries`, `files`) against that registry.
4. Missions are created against `project_id`; root is resolved from the registry; runtime mode is always `live`.
5. Live agent tools continue to use `ProjectWorkspace` on the same root.

## API

- `POST /api/projects` `{ path, create?: boolean }` → `{ id, name, root }`
- `GET /api/projects/active`
- `GET /api/projects/{id}`
- `GET /api/projects/{id}/entries?path=.`
- `GET /api/projects/{id}/files?path=`
- `PUT /api/projects/{id}/files` `{ path, content }`

## Security

- When `TOVA_ALLOWED_PROJECT_ROOTS` is set, project open/create must resolve under an allowed root.
- All relative file paths stay contained by `ProjectWorkspace` (no `..`, no excluded/sensitive names).
- Create fails if the path exists as a file.

## Frontend experience

- Empty workspace until a project is open.
- Open Project / New Project dialogs from the project menu.
- TopBar and explorer show project name and path (not Orion).
- Mission composer requires an active project and live model; no per-mission project-root field; no Simulation mode.
- Team Floor starts empty and fills from live mission assembly events.

## Out of scope

- Electron/Tauri native folder picker
- Persistent project database
- Git status decorations
- Scaffolding beyond empty directory creation
