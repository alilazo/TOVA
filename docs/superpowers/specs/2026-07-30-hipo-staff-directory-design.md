# HiPo Staff Directory Design

Date: 2026-07-30

## Goal

Turn the `HiPo Staff` tab into a dedicated main workspace for browsing HiPo Staff members as clean ID-style badges. The screen should support search, open the existing staff profile modal on card click, and keep the restrained TOVA interface language.

## Locked decisions

- Approach: **Staff Directory Wall**
- `HiPo Staff` remains available even when no project is open
- When `HiPo Staff` is active, hide the right `EngineeringTeamPanel` to avoid duplicate staff surfaces
- The main workspace switches away from `CodeWorkspace` into a staff directory screen
- The existing right-rail `EngineeringTeamPanel` and `TeamMemberCard` behavior remains unchanged outside this tab
- Clicking a staff badge opens the existing `StaffProfileDialog`
- Search filters staff by display name, role, department, tags, and description
- Badge cards use the existing `PixelAvatar` so stock/custom avatars and pixel fallbacks keep working
- First open in the session plays a restrained badge drop-in animation; subsequent visits use normal workspace motion
- Respect reduced motion: no drop animation; use a simple fade
- Visual language: compact, mostly neutral, ID-badge inspired; no gradients, glass, cartoon office scenes, or decorative game mechanics

## Screen Layout

### Main Area

When `activePanel === "staff"`:

- Main workspace content becomes `StaffDirectoryScreen`
- Right team panel is hidden
- Existing left sidebar may still show the `WorkspaceSidebar` summary for `HiPo Staff`, unless implementation tests show it creates redundant controls. The required non-duplication rule applies to the right Engineering Team rail.

`StaffDirectoryScreen` layout:

- Header row:
  - Title: `HiPo Staff`
  - Supporting copy: short operational phrase, e.g. `Browse the local workforce layer.`
  - Count summary: total profiles and visible filtered count when searching
- Search row:
  - Input label: `Search staff`
  - Placeholder: `Search names, roles, tags…`
- Directory grid:
  - Responsive badge cards
  - Desktop target: 3-4 cards per row depending available width
  - Narrow screens: 1-2 cards per row
- Empty states:
  - Loading: `Loading staff profiles…`
  - Error: `Staff profiles are unavailable.`
  - No profiles: `No staff profiles are available.`
  - No search results: `No staff match that search.`

## Badge Card Design

Each staff badge is a clickable button/card with:

- Subtle lanyard/clip detail at top
- Off-white card body with a restrained black name strip or header strip
- Pixel avatar in a framed portrait area
- Primary text: `staff.role`
- Secondary text: `staff.description`, clamped to a few lines
- Footer row:
  - `HiPo Staff` label
  - Compact role/status chip, e.g. `Available`, `Offline`, or role key

Interaction:

- Hover/focus: slight lift, soft shadow, subtle border darkening
- Active press: settle back down slightly
- Disabled/offline is not required; offline staff can still open the profile
- Keyboard: each badge is reachable as a button with an accessible label like `Open Maya profile`

## Animation

Use `framer-motion`, already present in the app.

- First open in the session:
  - Cards start slightly above their final position
  - Animate down into place with opacity and a short stagger
  - Motion is subtle and quick, like ID badges settling onto a wall
- Subsequent visits:
  - Do not replay the full badge drop
  - Keep normal workspace transition
- Reduced motion:
  - Disable y/rotate/drop motion
  - Keep a simple opacity fade if needed

Session behavior can be component-local or a small UI-store flag. It does not need backend persistence.

## Modal Reuse

The directory screen reuses `StaffProfileDialog` exactly like `EngineeringTeamPanel`:

- Track `profileStaffId`
- Find selected `StaffProfile`
- Pass `available` from staff status plus local availability overrides
- Preserve `onAvailableChange` behavior
- Close by clearing selected staff id

This keeps profile preview/edit/metadata, avatar editing, availability toggle, dirty-close confirmation, and save behavior unchanged.

## Data

Use existing `StaffProfile` fields:

- `displayName`
- `role`
- `roleKey`
- `department`
- `seniority`
- `avatar`
- `description`
- `status`
- `tags`

No backend changes are required.

## App Integration

- `NavigationRail` behavior does not change for `staff`; it stays enabled without a project
- `App.tsx` branches workspace rendering:
  - `activePanel === "team-floor"` -> `TeamFloor`
  - `activePanel === "staff"` -> `StaffDirectoryScreen`
  - otherwise -> `CodeWorkspace`
- `WorkspacePanelSwitch` must support a stable panel key for staff, e.g. `"staff"`
- `AppShell` should hide `teamPanel` while staff is active, via a boolean prop or conditional rendering
- `EngineeringTeamPanel` remains available for normal project/workspace screens

## Testing

Frontend tests should cover:

- `StaffDirectoryScreen` renders staff badge cards with avatar, role, and description
- Search filters by display name, role, department, tags, and description
- No-results copy appears for unmatched search
- Clicking a badge opens `StaffProfileDialog`
- App hides the right `EngineeringTeamPanel` when `activePanel === "staff"`
- Staff tab remains enabled when no project is open
- `WorkspacePanelSwitch` supports the staff screen key
- Existing `EngineeringTeamPanel` and `StaffProfileDialog` behavior remains passing

Verification:

- Focused Vitest for new/changed staff/app tests
- `pnpm verify`
- If backend untouched, full `uv run python scripts/verify.py` is optional but preferred before final completion

## Non-goals

- New backend staff APIs
- Replacing `StaffProfileDialog`
- Changing staff markdown format
- Changing the right Engineering Team rail cards outside staff tab
- Large visual rebrand of TOVA
- Persisting search text or animation state across browser reloads

## Implementation Notes

- No git repository is available in this workspace, so commits are skipped unless git becomes available.
- The checkout may not include every stock avatar asset directory; `PixelAvatar` fallback must remain intact.
