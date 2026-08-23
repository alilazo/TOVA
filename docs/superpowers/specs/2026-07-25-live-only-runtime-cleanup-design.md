# Live-Only Runtime Cleanup Design

Date: 2026-07-25

## Goal

Make TOVA an unambiguously live, local-LLM development environment. Remove every production simulation path, fake operational narrative, and non-functional playback control. Missions must use the selected LM Studio model, real local project files, Markdown-backed HiPo staff profiles, and persisted live events.

## Product invariants

- There is no simulated production runtime and no fallback fake provider.
- Mission creation and execution require a selected, reachable local model.
- `HiPo-Staff/staff/*.md` is the staff source of truth.
- Mission events are the source of truth for operational state.
- Event replay remains for reconnect and recovery; it is not playback or simulation.
- Test fakes and mocks remain isolated to test code.
- TOVA remains neutral, compact, and professional.

## Runtime states

The runtime exposes only these operator-facing states:

- **Unconfigured**: no model profile and model are selected.
- **Connected**: the selected LM Studio endpoint is reachable and the selected model is available.
- **Unavailable**: a selection exists, but the endpoint or selected model cannot currently be reached.

The backend runtime-status endpoint performs a lightweight provider health check. The frontend uses this status consistently in the TopBar, model dialog, and mission composer.

There is no `simulated` state, `fake-openai-compatible` provider, or silent fallback.

## Mission lifecycle

1. The user discovers LM Studio models and selects a model.
2. The user opens a real local project.
3. The frontend creates a mission with the active `project_id`, selected profile ID, and selected model.
4. The backend validates that the profile/model selection exists and is available before accepting the mission.
5. Starting the mission launches `MissionRuntime` with the selected provider.
6. The coordinator uses that provider to create the plan.
7. Assigned HiPo staff agents use the same selected provider and real `ProjectWorkspace` tools.
8. Events are persisted before broadcast and drive the frontend projection.

Missing or unavailable model selection produces a typed API error. Runtime/provider failures emit persisted `mission.blocked` or `mission.failed` events and never switch to fake behavior.

## Staff source of truth

Add a read-only `/api/staff` endpoint backed by `StaffProfileRepository` and `HiPo-Staff/staff/*.md`. It returns safe profile metadata needed by the UI: identity, display name, role, department, seniority, avatar, description, allowed tools, delegation/approval flags, and tags.

TanStack Query owns the frontend roster. Components that currently import `staff-fixtures.ts` receive queried staff data through props or a focused staff query hook:

- Engineering Team
- Team Floor
- Live code owner badge
- Activity rows
- Handoff overlay
- Work Log drawer

The frontend fixture copy is removed after all consumers migrate.

The Engineering Team panel may show the full available roster before a mission starts. Mission-selected staff and Team Floor remain empty until live team-selection or assignment events arrive.

## Event-derived Work Log

Keep the Work Log drawer, but remove all static narratives. Build each staff member's log from live mission events:

- Current action: latest staff status/action/tool event
- Objective: live assignment objective
- Inputs: assignment dependencies and accepted handoff summaries
- Tool activity: successful and failed tool events
- Observations: research/test/decision event summaries
- Decision summary: latest decision or handoff summary
- Output: live artifacts and file changes
- Next action: latest handoff/assignment/status transition
- Errors/blockers: failed tools, blocked status, and mission/provider failures associated with the staff member

Before relevant events exist, sections show honest empty text such as “No live activity recorded.” They never synthesize mission work.

## Production UI cleanup

Remove:

- Playback speed selector and Zustand playback state
- “Mission playback” and “Restart demo” wording
- Demo runtime hook and seeded demo events
- Orion/virtual repository fixtures and demo seed script
- Simulated runtime fallback and fake production provider
- Static work-log data
- Fake mission-history, search, settings, and activity placeholder content
- “Virtual repository” and “deterministic simulation” copy

Keep:

- Pause, resume, and cancel mission controls
- WebSocket reconnect and persisted event replay
- Command approval confirmation
- Real project explorer/editor
- Professional Team Floor motion

The handoff overlay is informational. Its close action is **Dismiss**, which only closes the local overlay; it does not skip or alter backend orchestration.

Empty panels show truthful empty states. They do not list invented filenames, missions, counts, or actions.

## Dead code deletion

Delete production-only simulation artifacts once references are removed:

- `apps/web/src/features/mission/use-demo-runtime.ts`
- `apps/web/src/features/mission/demo-events.ts`
- `apps/web/src/features/repository/repository-fixtures.ts`
- `scripts/seed_demo.py`
- Unused production `FakeModelProvider`

Retain test-only `FakeProvider`, `httpx.MockTransport`, Vitest mocks, and fake timers.

## Contracts

- Remove `runtime_mode` from mission records because live is the only mode.
- Require `model_profile_id` and `model` on mission creation.
- Replace frontend/backend runtime unions containing `simulated` with typed unconfigured/connected/unavailable status.
- Keep versioned event envelopes and reconnect replay.
- Remove playback-speed control claims from the WebSocket protocol.
- Add and synchronize the staff response contract between backend and frontend.

## Error handling

- Discovery failure: model dialog shows the provider error; runtime remains Unconfigured or Unavailable.
- Selected model disappears: runtime becomes Unavailable; mission start disables.
- Invalid mission model selection: API rejects creation before a mission record is persisted.
- Provider failure during execution: mission emits and displays a persisted blocked/failed event.
- Staff profile load failure: `/api/staff` returns a clear server error; roster surfaces an error state.
- Work Log projection tolerates unknown/new event types and preserves already projected data.

No credentials, provider tokens, private reasoning, or unrestricted filesystem data appear in APIs, logs, events, or tests.

## Verification

### Backend

- Runtime status returns Unconfigured with no selection.
- Runtime status returns Connected for a reachable selected model.
- Runtime status returns Unavailable when the selected endpoint/model is unavailable.
- Mission creation rejects missing or invalid model selection.
- Mission launcher resolves and uses the mission's selected LM Studio provider/model.
- `/api/staff` reflects Markdown profiles without private fields.
- Runtime failures persist events before broadcast.
- No production fake provider or simulated runtime remains.

### Frontend

- No playback speed or demo restart UI remains.
- TopBar, model dialog, and composer show consistent live runtime health.
- Staff consumers use `/api/staff`, not fixtures.
- Work Logs are reduced exclusively from mission events.
- Mission-selected team is empty until live selection events.
- Placeholder panels display honest empty states.
- No production imports reference demo/fixture runtime files.

### End to end

- Run frontend verification and complete Python workspace verification.
- Run Playwright for model/project/mission state behavior that does not require external LM Studio.
- With LM Studio available, run a fresh real mission that proves:
  - coordinator planning uses the selected model,
  - staff assignments are emitted,
  - repository reads/writes affect the opened project,
  - Team Floor and Work Logs update from live events,
  - command approvals are enforced,
  - mission reaches Finished, Waiting for confirmation, Error, Blocked, or Cancelled truthfully.

Do not claim the live smoke passed without fresh command and browser evidence.

## Documentation

Rewrite current documentation to describe the live-only product:

- `README.md`
- `docs/PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/EVENT_PROTOCOL.md`
- `docs/PLANS.md`
- relevant workspace guidance

Historical design and implementation-plan documents remain records; current documentation must not present simulation as supported behavior.

## Out of scope

- Additional model providers beyond the existing OpenAI-compatible LM Studio integration
- Persistent database storage for model profiles, projects, missions, or events
- Native Electron/Tauri folder selection
- Multi-machine orchestration
- Exposing private chain-of-thought
