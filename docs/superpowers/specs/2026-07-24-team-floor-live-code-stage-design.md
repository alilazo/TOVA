# Team Floor Live Code Stage Design

Date: 2026-07-24

## Goal

Make Team Floor a professional mission theater: keep the workforce strip, and add a live read-only coding pane that auto-follows the latest agent file write with progressive (typewriter-style) content reveal—so operators can see code being built without leaving the floor.

## Locked decisions

- Layout: split view — workforce strip/stage + embedded coding pane
- Content reveal: progressive typewriter / AI-editor feel after each write
- Focus: always follow the most recent write across the team
- Approach: emit `staff.file.*` with `file_path`, refetch via project file API, client-side typewriter (no content on the websocket)
- Tone: professional product motion only — not a game (no scores, XP, particles, cartoon office, glass, decorative game chrome)

## Architecture

```mermaid
flowchart LR
  Tool[repository.write / apply_patch] --> Emit[staff.file.created|updated]
  Emit --> WS[WebSocket events]
  WS --> Reducer[mission-event-reducer]
  Reducer --> Active[activeFile + editorOwnerId]
  Active --> Fetch[GET project files]
  Fetch --> Typewriter[progressive reveal]
  Typewriter --> Pane[Team Floor Monaco read-only]
  Emit --> Invalidate[invalidate explorer entries]
```

1. Live agent tools write real files through `ProjectWorkspace`.
2. On successful write/patch (and open/read where useful), backend emits versioned `staff.file.*` with `file_path` and human-readable `title`.
3. Frontend reducer updates `activeFile` and `editorOwnerId` (existing contract).
4. Team Floor coding pane fetches file content and reveals it progressively.
5. A newer write for another path aborts the current reveal and switches focus.
6. Explorer query invalidation keeps the tree in sync while the operator stays on Team Floor.

## UI

- **Workforce strip:** existing workflow nodes, active staff, current action, artifacts.
- **Coding pane:** read-only Monaco; path chip + staff badge (“{name} is writing…”).
- **Idle:** compact empty state when no mission or no writes yet (“Waiting for the first file write”).
- **Errors:** compact pane error on missing project or failed fetch.
- Explorer remains the browse/edit surface; Team Floor is watch-only for code.

## Motion

Restrained, product-native presence cues only:

- Typing caret / pulse during reveal
- Quiet transition when focus jumps to a new write (path + staff badge)
- Subtle emphasis on the staff who just wrote in the workflow strip
- Activity titles prefer payload `title` (e.g. “Wrote src/app.ts”), not raw event types

## Testing

- Backend: successful `repository.write` / patch emits `staff.file.*` with `file_path`
- Frontend: reducer sets `activeFile` / `editorOwnerId`; typewriter helper reveals progressively and aborts on a newer write
- Component or e2e: Team Floor shows coding pane and follows a simulated file event

## Out of scope

- Mid-generation LLM token streaming into the editor
- Multi-pane concurrent writers
- Editing inside Team Floor Monaco
- Game mechanics or decorative “gamification”
- Pushing full file bodies or large diffs over the websocket
