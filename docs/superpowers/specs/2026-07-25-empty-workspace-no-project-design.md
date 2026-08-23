# Empty Workspace Without Project Design

Date: 2026-07-25

## Goal

When no project is open, remove Live Activity and let the code workspace fill the remaining height, with a centered Open / New project call to action.

## Locked decisions

- Hide Live Activity entirely when there is no active project
- Expand CodeWorkspace (or Team Floor if that panel is active) to the bottom of the mission workspace
- Empty CodeWorkspace: centered label “Open a project to browse and edit files.” plus Open project / New project buttons
- Reuse existing `ProjectPathDialog` flow; opening a project sets active project like the explorer
- When a project is open, restore Live Activity and the prior split layout
