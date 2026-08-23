# Recent Projects Design

Date: 2026-07-30

## Goal

When no project is open, show recently opened projects below the Open project / New project actions so the user can reopen a folder in one click without using the path dialog.

## Locked decisions

- Placement: **code workspace** empty state only (Project explorer is hidden when no project is open)
- Initially show **5** recent rows; if more than 5 exist, show **View more**
- **View more** expands inline to the full stored list; **Show less** collapses back to 5
- Backend persistence (not browser localStorage): machine-local TOVA app data file
- Cap stored history at **20** entries, newest first
- Record on successful open inside `ProjectRegistry.open` so Open, New, and one-click recent stay consistent
- Clicking a recent row opens via existing `POST /api/projects` with that path (`create: false`)
- Missing / invalid path on open: if that resolved path is in the recent list, **drop the entry** (self-heal). UI surfaces a short error when the user clicked a recent row.
- Hide `ProjectExplorer` when no project is open; show it only after a project is active
- Out of scope for v1: search, pinning, cloud sync, dedicated clear-history UI, delete-from-list control beyond self-heal on failed open

## Persistence

### App data directory

Resolve a machine-local TOVA data directory:

| Platform | Default |
|---|---|
| Windows | `%LOCALAPPDATA%/TOVA` |
| macOS | `~/Library/Application Support/TOVA` |
| Linux | `~/.local/share/tova` |

Override with environment variable `TOVA_DATA_DIR` when set.

File: `{data_dir}/recent-projects.json`

### Record shape

```json
{
  "version": 1,
  "projects": [
    {
      "id": "project_…",
      "name": "my-app",
      "root": "F:\\Programming Projects\\my-app",
      "lastOpenedAt": "2026-07-30T19:00:00.000Z"
    }
  ]
}
```

### Write rules

- On every successful `ProjectRegistry.open`, upsert by resolved `root` (case-normalized on Windows), set `lastOpenedAt` to now, move to front
- Keep at most 20 entries after write
- Persist before returning the open response (best-effort: open must still succeed if recent-file write fails; log and continue)

### Read rules

- `GET /api/projects/recent` returns projects ordered by `lastOpenedAt` descending (≤20)
- Do not require paths to exist on disk for listing (failed open handles cleanup)

## API

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/projects/recent` | List recent projects (≤20) |
| `POST` | `/api/projects` | Unchanged open/create; also records recent on success |
| (internal) | on open failure for a missing/invalid directory | If that path is in the recent list, remove it and persist |

No separate “touch recent” endpoint. No delete endpoint in v1 except internal removal when an open fails because the directory is missing/invalid and the path was stored as recent.

Schemas reuse / mirror `ProjectRecord` fields plus `lastOpenedAt` for the recent list payload, e.g. `RecentProjectRecord`.

## Frontend

### Shared UI

- `RecentProjectsList` used under empty-state actions in `CodeWorkspace` (no `projectId`)
- Compact rows: primary **name**, secondary truncated **root** path
- No card chrome; match existing muted empty-state styling
- Default: first 5 items
- If `length > 5`: **View more** button expands to full list; **Show less** collapses
- Row click → `openProject(root)` → same `onProjectOpened` path as the dialog
- Loading: omit list or show quiet placeholder; empty history: hide the recent section entirely
- On open failure for a recent row: show error; refresh recent list (entry should be gone after backend self-heal)

### App shell

- When explorer panel is active and there is no project, sidebar is `null` (no Project pane)
- When a project is open, render `ProjectExplorer` as before
- Keep existing empty CodeWorkspace CTAs; add recent list below the action row

### Data

- TanStack Query: `["recent-projects"]` → `GET /api/projects/recent`
- Invalidate `["recent-projects"]` after any successful project open (dialog or recent row)

## UX copy

- Section label (optional, quiet): `Recent`
- Expand: `View more`
- Collapse: `Show less`
- Error (missing folder): short message such as `That folder is no longer available`

## Testing

- Backend: record on open; upsert/move-to-front; cap at 20; `GET /recent` order; failed open of missing recent removes entry; `TOVA_DATA_DIR` override for tests
- Frontend: renders ≤5; View more / Show less; clicking opens project; hidden when history empty; appears in code workspace empty state; Project pane hidden with no project
- Prefer behavior tests before implementation (red-green)

## Non-goals

- Replacing the path dialog
- Auto-reopening the last project on API startup
- Syncing recents across machines
