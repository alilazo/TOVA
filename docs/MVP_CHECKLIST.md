# TOVA MVP Release Checklist

> Release-gate checklist for the next local-first TOVA MVP.  
> Source of truth: `docs/PLANS.md`, the product specs in `docs/`, and the current application behavior.

Verified 2026-08-21: `uv run python scripts/verify.py` (194 frontend tests, 159 backend tests, ruff, mypy, production build), `pnpm --filter @tova/web test:e2e` (8 passed), live `GET /api/runtime/status` returned **connected** against LM Studio `qwen/qwen3.6-35b-a3b`.

## Release goal

A new user can install TOVA, connect a local model, open or create a contained project, send a mission, observe real team progress, recover from common runtime interruptions, and verify the result without needing hidden configuration or unsafe access.

## Definition of done

- [x] A clean-machine setup can be completed from the documented instructions.
- [x] A first-time user can reach **Connected** and **ready to send** without understanding model profiles or endpoint URLs.
- [x] A mission can complete successfully against a reachable local model.
- [x] Alex proposes a plan and team before any staff execution starts.
- [x] Lina can safely inspect and modify contained project files while Ava remains QA-only.
- [x] A mission can be paused, resumed, cancelled, and recovered after a client reconnect.
- [x] Command execution remains explicitly approved and project-root contained.
- [x] Persisted versioned events remain the source of mission progress and Work Logs.
- [x] Frontend, backend, security, documentation, and release verification gates pass.

## P0 — Release blockers

### 1. Installation and first launch

- [x] Verify a stranger can install from `TOVA-Setup.exe` without Node, pnpm, or Python:
  - Install LM Studio separately, start Local Server, and load a model.
  - Start TOVA from the Start Menu shortcut; the UI opens in the browser at `http://127.0.0.1:8000/`.
  - Last project and last mission restore on the Team Floor after relaunch.
- [x] Verify the documented contributor requirements on a clean Windows development machine:
  - Node.js 20.19+
  - pnpm 11.17+
  - Python 3.12+
  - uv 0.11+
- [x] Verify `pnpm install` completes without manual dependency fixes.
- [x] Verify `uv sync --project apps/api` completes without manual dependency fixes.
- [x] Verify `pnpm dev` starts both the web client and API.
- [x] Verify the first launch shows a useful empty-project state instead of a broken or fabricated mission.
- [x] Verify the API health/runtime status endpoint gives an actionable response when the model server is unavailable.
- [x] Verify recovery copy for: no local server, no loaded model, and reconnect after the API restarts.

### 2. Model onboarding

- [x] Auto-open setup when the runtime is unconfigured or unavailable.
- [x] Explain the LM Studio cold-start path in the primary setup flow.
- [x] Auto-discover the default local endpoint.
- [x] Auto-select and apply the preferred model, or the first available model.
- [x] Keep endpoint/profile controls behind **Advanced**.
- [x] Verify the complete clean-start flow manually:
  - [x] Launch TOVA with no model connected.
  - [x] Start LM Studio Local Server and load a model.
  - [x] Return to TOVA and confirm it reaches **Connected**.
  - [x] Confirm the composer changes to **Send to Team** after a valid mission request.
- [x] Verify failure recovery:
  - [x] No local server.
  - [x] Server running with no loaded model.
  - [x] Server becomes available after the dialog opens.
  - [x] Model selection fails and can be retried manually.
- [x] Verify the connected user can change models without an accidental selection.

### 3. Project lifecycle

- [x] Open an existing allowed project path.
- [x] Create and open a new project path.
- [x] Reject paths outside the configured allowlist.
- [x] Reject invalid, inaccessible, or non-directory paths with actionable errors.
- [x] Keep project explorer, active file, tabs, and editor state synchronized after project changes.
- [x] Verify no operation can read or write outside the active project root.

### 4. Mission lifecycle

- [x] Require a project before mission submission.
- [x] Require a non-empty mission objective before mission submission.
- [x] Require a selected, reachable model before mission creation.
- [x] Revalidate model availability before mission execution starts.
- [x] Create a mission with a coordinator and the expected supporting staff.
- [x] Require user accept/edit/regenerate/deny on Alex's proposed plan before team assembly.
- [x] Emit explicit selected staff, assigned staff, implementation handoff, and QA evidence events.
- [x] Stream operational events to the UI without exposing hidden reasoning.
- [x] Show clear running, waiting, paused, completed, cancelled, and failed states.
- [x] Preserve the current mission objective and status across panel changes.
- [x] Display generated artifacts and file changes in the workspace.
- [x] Make the next user action clear when the mission is waiting for approval or input.

### 5. Pause, resume, cancel, and reconnect

- [x] Pause a running mission and verify no new work is incorrectly started.
- [x] Resume a paused mission and verify progress continues.
- [x] Cancel a running mission and verify it reaches a terminal state.
- [x] Disconnect the browser during a mission and reconnect it.
- [x] Replay missed events in sequence without duplicate activity or Work Log entries.
- [x] Handle an API restart without corrupting the client projection.
- [x] Show a clear recovery message when replay or reconnection cannot complete.

### 6. Safe command execution

- [x] Require explicit approval for every command execution.
- [x] Display the command, working directory, affected scope, and bounded execution details before approval.
- [x] Enforce project-root working-directory containment.
- [x] Bound command timeout, environment, and output size.
- [x] Prevent unrestricted host filesystem access.
- [x] Prevent unrestricted network access.
- [x] Confirm credentials and tokens never appear in APIs, logs, events, UI, or tests.
- [x] Verify rejected commands produce an operational error without exposing sensitive details.

## P1 — Strongly recommended before release

### Reliability and observability

- [x] Add a single documented diagnostic path for web, API, model server, and project-root failures.
- [x] Ensure every user-visible runtime error includes a recovery action.
- [x] Confirm API logs contain useful phase/status/latency information without credentials or prompt content.
- [x] Verify repeated health checks do not interfere with active generation.
- [x] Verify cancellation reaches the provider and does not leave an orphaned mission state.

### User experience and accessibility

- [x] Verify the primary mission path with keyboard-only navigation.
- [x] Verify dialogs have correct labels, focus behavior, Escape handling, and visible focus states.
- [x] Verify disabled actions explain what is missing rather than appearing mysterious.
- [x] Verify reduced-motion behavior for staff, handoff, and panel transitions.
- [x] Verify the shell remains usable at the supported desktop and narrow viewport sizes.
- [x] Verify Settings, HiPo Staff, Team Floor, Explorer, and Missions each have a distinct useful main view.

### Packaging and documentation

- [x] Document the supported LM Studio setup and default endpoint.
- [x] Document the Advanced endpoint path for non-default local model servers.
- [x] Document project-root allowlists and the security model.
- [x] Document how to run frontend, backend, unit, integration, and e2e verification.
- [x] Document known limitations: process-local runtime state and model-server dependency.
- [x] Confirm README claims match current behavior and do not describe simulation or fabricated activity.
- [x] Add a concise release notes entry describing user-visible MVP behavior.

## Automated verification gate

Run from the repository root:

```bash
pnpm verify
uv run python scripts/verify.py
```

Run the focused frontend and browser checks:

```bash
pnpm --filter @tova/web test
pnpm --filter @tova/web test:e2e
```

Run backend checks individually when diagnosing failures:

```bash
uv run --directory apps/api pytest
uv run --directory apps/api ruff check .
uv run --directory apps/api mypy app
```

The release candidate must have:

- [x] Frontend lint passing.
- [x] Frontend typecheck passing.
- [x] Frontend unit tests passing.
- [x] Frontend production build passing.
- [x] Frontend e2e tests passing.
- [x] Backend tests passing.
- [x] Backend lint passing.
- [x] Backend typecheck passing.
- [x] Workspace verification passing.

## Manual smoke test

- [x] Start TOVA and open the web client.
- [x] Connect a local LM Studio model through the guided flow.
- [x] Open or create a project inside the allowed root.
- [x] Enter a mission objective.
- [x] Confirm **Send to Team** is enabled for the correct reason.
- [x] Submit the mission.
- [x] Observe coordinator planning, staff activity, file work, and status transitions.
- [x] Approve a command and confirm the resulting output is visible.
- [x] Pause, resume, and cancel a mission.
- [x] Reload or reconnect and confirm event-derived state is reconstructed.
- [x] Open Work Logs and verify they contain persisted operational events only.
- [x] Confirm Lina's changed paths and QA instructions hand off to Ava before QA starts.
- [x] Open Settings and change the connected model.
- [x] Open HiPo Staff and inspect a staff profile.

## Explicitly out of scope for this MVP

These items are confirmed exclusions, not remaining work:

- [x] Cloud-hosted model execution.
- [x] Multi-user accounts, remote collaboration, or hosted persistence.
- [x] Unrestricted arbitrary shell, filesystem, or network access.
- [x] Hidden chain-of-thought or internal reasoning display.
- [x] Broad provider marketplace support beyond the current local OpenAI-compatible runtime.
- [x] Advanced mission orchestration unrelated to the current coordinator/staff workflow.
- [x] Decorative game mechanics or a visual redesign that conflicts with the restrained TOVA shell.

## Sign-off

- Release candidate: 0.1.0
- Verification date: 2026-08-21
- Frontend owner: automated verification (`pnpm verify`, e2e)
- Backend owner: automated verification (`pytest`, ruff, mypy)
- Security review: `docs/SECURITY.md` plus command, repository, and credential tests
- Final decision: [x] Ship  [ ] Hold
