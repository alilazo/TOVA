# TOVA Live Runtime Delivery Status

> **For agentic workers:** execute each task test-first and verify each independently.

**Goal:** Maintain the implemented live-only TOVA runtime and its synchronized contracts.

**Architecture:** A React/Vite client reduces persisted versioned events into mission and Work Log projections. TanStack Query owns server state while Zustand owns ephemeral interface state. FastAPI runs live LM Studio-backed missions over contained local projects.

**Tech stack:** pnpm workspace, React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Lucide, Framer Motion, Monaco, TanStack Query, Zustand, React Router, Zod, Vitest, Testing Library, Playwright, Python, FastAPI, Pydantic, uv.

## Global constraints

- Keep the interface neutral, compact, and code-editor oriented.
- Preserve `TOVA` and `HiPo-Staff` exactly.
- Show operational summaries, never hidden reasoning.
- Use seven visible staff: one coordinator and six supporting specialists.
- Require a selected, reachable LM Studio model before mission creation and revalidate it before start.
- Keep runtime states exactly Unconfigured, Connected, and Unavailable.
- Use real path-based projects with project-root containment.
- Require explicit approval for every command execution.
- Keep server state out of Zustand.
- Append versioned events before broadcast and derive Work Logs only from those events.
- Support pause, resume, cancel, heartbeat, and reconnect event replay.

## Delivered contract

- [x] Load the seven HiPo-Staff profiles from Markdown and expose only allowlisted public fields.
- [x] Open and create real local project paths with optional root allowlists.
- [x] Contain repository reads, searches, writes, and patches to the active project.
- [x] Discover LM Studio models, select one, test availability, and expose the three-state runtime status.
- [x] Reject mission creation without the selected reachable model and revalidate before start.
- [x] Run coordinator and staff assignments against the live provider.
- [x] Gate staff execution behind Alex's accepted plan, with edit/regenerate and deny transitions.
- [x] Enforce role-aware tools: Alex coordinates, Lina can inspect/edit/delete through safe project boundaries, and Ava can read, test, and report QA evidence without implementation writes.
- [x] Persist each event to the runtime event store before broadcasting it.
- [x] Reconstruct mission UI and Work Logs from ordered version 1.0 events.
- [x] Support pause, resume, cancel, and reconnect replay.
- [x] Gate structured command execution on explicit approvals and enforce working-directory, environment, timeout, and output bounds.
- [x] Keep canonical documentation synchronized with the live-only source contract.

## Verification gate

- [x] `pnpm verify`
- [x] `uv run python scripts/verify.py`
- [x] Canonical documentation source-claim audit
