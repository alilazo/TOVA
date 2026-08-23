# Real Local Project Workspace Implementation Plan

Date: 2026-07-24

## Locked decisions

- Path-based Open / New Project (absolute path dialogs; no Electron yet)
- New Project creates an empty directory if missing, then opens it
- Live LM Studio only — remove Simulation from the UI
- Remove Orion Platform branding; show the chosen folder name/path
- Agents and UI share one project root via `ProjectWorkspace`

## Tasks

1. Project registry + open/create + entries/files HTTP API + allowed-roots enforcement (TDD)
2. Missions require `project_id` + live runtime only (TDD)
3. Frontend Open/New dialogs, real explorer/Monaco/TopBar; remove Orion fixtures from app path
4. Remove simulation UI; composer uses active project; Team Floor empty until live assembly
5. Update e2e expectations; run full verify with a blank temp folder

## API surface

- `POST /api/projects` `{ path, create?: boolean }` → `{ id, name, root }`
- `GET /api/projects/active` and `GET /api/projects/{id}`
- `GET /api/projects/{id}/entries?path=.`
- `GET /api/projects/{id}/files?path=`
- `PUT /api/projects/{id}/files` `{ path, content }`

## Verification

- Backend: create project at temp path, list empty entries, write/read file, start live mission with that `project_id`
- Frontend: Open/New Project replaces Orion; tree/editor show real folder; Start mission disabled without project/model
- `pnpm verify` + `uv run python scripts/verify.py`
