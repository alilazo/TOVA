# Mission Status in Live Activity Design

Date: 2026-07-25

## Goal

Remove the linear mission progress strip. Show a discrete, operator-facing mission status in the Live Activity header instead, because AI mission progress is dynamic and not a reliable percentage or stage track.

## Locked decisions

- Delete `MissionStageStrip` from the app (no step dots, no progress percent bar)
- Show status in `ActivityFeed` header next to “Live Activity”
- Map existing `MissionStatus` values to operator labels (no parallel status enum)
- Keep event count as secondary text in the header

## Status labels

| MissionStatus | Label |
|---------------|--------|
| *(no mission / not started)* | Idle |
| `draft`, `submitted` | Draft |
| `analyzing`, `assembling_team`, `team_ready`, `running`, `testing`, `reviewing` | Running |
| `paused` | Paused |
| `awaiting_approval` | Waiting for confirmation |
| `blocked` | Blocked |
| `completed` | Finished |
| `failed` | Error |
| `cancelled` | Cancelled |

## UI

- Live Activity header: title **Live Activity**, compact status badge, small event-count line
- Badge is informational only (not a control)
- Restrained styling consistent with existing panel headers — no decorative chrome

## Out of scope

- Changing backend mission status machine
- Replacing Mission Control Bar pause/resume controls
- Percent-complete or multi-step track anywhere else in the UI
