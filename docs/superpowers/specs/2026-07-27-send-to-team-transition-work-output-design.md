# Send-to-Team Transition & Work Output Navigation

Date: 2026-07-27  
Status: Approved for planning (pending user spec review)

## Goal

Make Send to Team feel intentional by animating into Team Floor, and let engineers’ CURRENT WORK OUTPUT file chips open the matching file in Explorer.

## Non-goals

- Composer “fly into tab” / particle / game-like motion
- Changing mission start timing or API flow
- Making non-file artifacts clickable
- Animating the left navigation rail icon itself

## Behavior

### 1. Panel crossfade

When `activePanel` switches between `team-floor` and `explorer` (including Send to Team, which already calls `setActivePanel("team-floor")`):

- Crossfade the main workspace panel with a short opacity transition and ~6–8px vertical drift
- Duration ~220ms, easeOut
- Use existing framer-motion + `AnimatePresence` around the Team Floor / Code Workspace swap in `App.tsx`
- If `useReducedMotion()` is true, swap instantly with no motion

Other panels (`search`, `missions`, `staff`, `settings`) that currently share the Code Workspace branch keep today’s mount behavior unless they already remount the same workspace; animation applies to the Team Floor ↔ Code Workspace boundary.

### 2. Clickable CURRENT WORK OUTPUT

In `TeamFloor` CURRENT WORK OUTPUT:

- Each `file_output` artifact renders as a focusable button showing the file path (e.g. `index.html`, `style.css`)
- Click / Enter / Space: `openFile(path)` then `setActivePanel("explorer")`
- Path source: `artifact.name` for `type === "file_output"` (existing reducer contract)
- Non-file artifacts remain non-clickable text (or are omitted from the clickable set)
- Coordinator (Alex) still does not show CURRENT WORK OUTPUT

## Implementation sketch

| Area | Change |
|------|--------|
| `App.tsx` | Wrap workspace ternary in `AnimatePresence` + keyed `motion.div`; pass `onOpenWorkOutput` into `TeamFloor` |
| `TeamFloor.tsx` | Build outputs from file artifacts; render buttons; call `onOpenWorkOutput(path)` |
| `globals.css` | Button styling for work-output chips consistent with current chip look (neutral, compact) |
| Tests | Panel transition still lands on Team Floor after send; work-output button opens explorer path |

## Success criteria

1. Send to Team switches to Team Floor with a restrained crossfade (or instant under reduced motion).
2. Clicking a file chip in CURRENT WORK OUTPUT opens that file in Explorer and selects it in the editor.
3. No CoT / decorative motion; UI stays compact and neutral.
4. Existing Team Floor / plan-review / mission tests stay green; add focused unit tests for the new behaviors.

## Spec self-review

- No placeholders or TBDs left for required decisions
- Scope matches the approved approach (AnimatePresence crossfade + file chip → explorer)
- Does not conflict with plan-review gate or Alex work-output hiding
