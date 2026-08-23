# TOVA Product Specification

## Product

TOVA (Team-Orchestrated Visual Agents) is a local-first development environment where a user assembles and supervises a visible software-engineering team. It presents agent work as inspectable operational activity: actions, files, tools, evidence, decisions, artifacts, handoffs, tests, and outcomes. It never presents hidden reasoning.

## Current product outcome

The implemented product is a desktop-first React application backed by a live FastAPI runtime. It provides:

- Opening or creating real projects from local filesystem paths.
- LM Studio model discovery, explicit model selection, and connection testing.
- Seven visible HiPo-Staff members loaded from Markdown.
- A mission composer, stage strip, code workspace, activity feed, Team Floor, Work Log, and handoff overlay.
- Start, pause, resume, and cancel mission controls.
- Interface state reconstructed from ordered, versioned mission events.

The runtime state is exactly **Unconfigured**, **Connected**, or **Unavailable**. A selected, reachable LM Studio model is required before mission creation and revalidated before execution.

## Primary workflow

1. The user submits a mission.
2. The backend verifies that the submitted project path is open and contained, and that the selected model is reachable.
3. Alex analyzes the request and creates a bounded team plan from the Markdown staff profiles.
4. The live runtime emits file, artifact, command, test, decision, and handoff events.
5. The workspace follows the active employee and relevant file.
6. The Work Log explains current operations without hidden chain-of-thought.
7. The Maya-to-Ethan handoff is shown as a short, skippable transition.
8. The user can pause, resume, or cancel execution; completed work is summarized by the coordinator.

## Information architecture

- **Navigation rail:** Explorer, Search, Team Floor, Missions, HiPo Staff, Settings.
- **Explorer:** local project-path selection and contained file tree.
- **Workspace:** mission stage strip, file tabs, Monaco editor, and activity feed.
- **Engineering Team:** compact roster cards with status, assignment, and expandable details.
- **Mission composer:** objective, selected model, submission, and start.
- **Team Floor:** active employee, work output, workflow queue, completed timeline, and handoff links.
- **Work Log:** current action, objective, inputs, tool activity, observations, decision summary, output, and next action.

## Visual direction

The visual system is approximately 90% neutral: warm white background, white work surfaces, fine gray borders, 8–12 px radii, compact controls, and sparse status color. Typography is Inter with a monospace face for code and identifiers. Motion communicates state changes and handoffs, respects reduced motion, and avoids decorative game effects.

The supplied reference image is the visual source of truth. At project initialization the file was not present at `docs/reference/tova-dashboard.png`; final pixel comparison remains dependent on restoring that asset.

## Accessibility

All controls are keyboard reachable, icon-only controls have accessible labels and tooltips, status is communicated with text as well as color, overlays manage focus, live mission changes use polite announcements, and motion is disabled or shortened under `prefers-reduced-motion`.

## Security boundary

Projects are real local directories. Optional configured root allowlists constrain which projects can be opened. Repository tools accept only project-relative paths, normalize resolved paths, reject traversal and sensitive or excluded paths, and enforce read/write limits. Commands require an explicit approval, use a project-contained working directory and sanitized environment, and enforce timeout and output limits. Model-server credentials remain backend-only.

HiPo-Staff metadata is loaded from Markdown under `HiPo-Staff/staff`. Public staff responses are allowlisted and exclude permissions, instruction sections, and source paths.

## Acceptance criteria

- A real path-based project can be opened and its contained files viewed in Monaco.
- Seven Markdown-backed staff profiles are exposed through the public allowlisted view.
- Runtime status reports only Unconfigured, Connected, or Unavailable.
- Mission persistence is rejected unless the selected LM Studio model is reachable; start revalidates the same selection.
- A mission can be started, paused, resumed, and cancelled.
- Team assembly, Work Log, activity updates, Team Floor, and handoff overlay are interactive.
- Work Logs derive only from ordered mission events.
- Reconnect can reconstruct a mission from events after the last received sequence.
- Commands cannot execute without approval or outside the project-contained working directory.
- Unit tests cover the reducer and core visual components.
- Type checking, linting, tests, and production build pass.
