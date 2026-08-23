# LM Studio Full-Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect TOVA to LM Studio for model discovery, structured coordinator planning, model-driven staff tool loops, real project-root file operations, approved command execution, and live frontend events.

**Architecture:** FastAPI owns provider access, project tools, approvals, mission orchestration, event history, and WebSocket broadcasting. The React app uses TanStack Query for model/runtime state and consumes the same event reducer used by the demo runtime. LM Studio is implemented through a reusable OpenAI-compatible `httpx` provider so Ollama can be added later.

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, httpx, asyncio, React, TypeScript, TanStack Query, Zustand, Zod, WebSockets, Vitest, pytest, Playwright.

## Global Constraints

- Default LM Studio base URL: `http://127.0.0.1:1234/v1`.
- Never return API tokens to the frontend or include them in events.
- Never expose hidden chain-of-thought; emit actions, evidence, decision summaries, assumptions, blockers, outputs, and next actions.
- Restrict all filesystem operations to a canonical selected project root.
- Every command requires one explicit approval and runs through `create_subprocess_exec`, never `shell=True`.
- The deterministic demo runtime remains usable when LM Studio is unavailable.
- Automated tests must not require a live local model.
- Persist/append events before broadcasting them.

---

### Task 1: Provider contracts and LM Studio transport

**Files:**
- Create: `apps/api/app/schemas/models.py`
- Create: `apps/api/app/providers/openai_compatible.py`
- Create: `apps/api/app/providers/lm_studio.py`
- Create: `apps/api/tests/test_lm_studio_provider.py`
- Modify: `apps/api/app/providers/base.py`
- Modify: `apps/api/app/core/config.py`

**Interfaces:**
- Produces: `DiscoveredModel`, `ModelConnectionTest`, `ChatMessage`, `ToolDefinition`, `ToolCall`, `ChatCompletionResult`.
- Produces: `OpenAICompatibleProvider.list_models()`, `.test_connection()`, `.complete()`, and `.generate_structured()`.
- Consumes: `httpx.AsyncClient`, provider base URL, optional API token, timeout.

- [ ] Write provider tests using `httpx.MockTransport` for `/models`, normal completion, tool calls, JSON Schema output, timeout, malformed response, and secret redaction.
- [ ] Run `uv run pytest tests/test_lm_studio_provider.py -v` and confirm import/behavior failures.
- [ ] Extend `ModelProvider` with model discovery and chat completion contracts.
- [ ] Implement OpenAI-compatible request/response parsing and stable provider errors.
- [ ] Implement `LMStudioProvider` defaults and capability label.
- [ ] Add environment settings for base URL, model, optional token, public-host opt-in, timeout, and context limits.
- [ ] Run provider tests, Ruff, and mypy.

### Task 2: Model management API

**Files:**
- Create: `apps/api/app/api/model_profiles.py`
- Create: `apps/api/app/services/model_profiles.py`
- Create: `apps/api/tests/test_model_profile_api.py`
- Modify: `apps/api/app/main.py`

**Interfaces:**
- Produces: `GET /api/model-profiles`, `POST /api/model-profiles/discover`, `POST /api/model-profiles/test`, `PUT /api/runtime/model-selection`.
- Produces: process-local `ModelProfileRegistry`.
- Consumes: provider factory and validated base URL.

- [ ] Write API tests for discovery, selection, test success, disconnected server, invalid URL, public-host rejection, and redacted responses.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement typed request/response models and registry service.
- [ ] Implement URL policy allowing loopback/private hosts by default.
- [ ] Add routes and update runtime status to report selected provider/model.
- [ ] Run focused tests and backend checks.

### Task 3: Real project-root repository tools

**Files:**
- Create: `apps/api/app/tools/schemas.py`
- Create: `apps/api/app/tools/repository.py`
- Create: `apps/api/app/tools/registry.py`
- Create: `apps/api/tests/test_repository_tools.py`

**Interfaces:**
- Produces: `ProjectWorkspace.resolve(relative_path)`, `.list()`, `.search()`, `.read()`, `.write()`, `.apply_patch()`.
- Produces: typed tool definitions and `ToolExecutionResult`.
- Consumes: canonical root, exclusion rules, read/write byte limits.

- [ ] Write tests for normal reads/search/writes, traversal, absolute paths, symlink escape, exclusions, oversized files, atomic writes, and bounded diff summaries.
- [ ] Confirm focused tests fail.
- [ ] Implement canonical containment and exclusions.
- [ ] Implement UTF-8 list/search/read/write tools and a deterministic patch format.
- [ ] Implement registry dispatch and event-safe result summaries.
- [ ] Run focused tests and backend checks.

### Task 4: Approval-gated command execution

**Files:**
- Create: `apps/api/app/schemas/approvals.py`
- Create: `apps/api/app/services/approvals.py`
- Create: `apps/api/app/tools/commands.py`
- Create: `apps/api/app/api/approvals.py`
- Create: `apps/api/tests/test_command_approvals.py`

**Interfaces:**
- Produces: `ApprovalRegistry.request()`, `.accept()`, `.reject()`, `.wait_for_decision()`.
- Produces: `ApprovedCommandRunner.run(CommandRequest)`.
- Produces: approval HTTP routes.
- Consumes: structured executable/args/cwd/purpose/timeout, project workspace, event sink.

- [ ] Write tests proving commands never run before approval, run once after acceptance, reject cleanly, cannot escape cwd, time out, cap output, redact environment, and support cancellation.
- [ ] Confirm focused tests fail.
- [ ] Implement in-memory approvals with asyncio futures.
- [ ] Implement subprocess execution with `create_subprocess_exec`, sanitized environment, timeout, capped output, and Windows-safe process termination.
- [ ] Implement accept/reject/list routes.
- [ ] Run focused tests and backend checks.

### Task 5: Staff parser and prompt compiler

**Files:**
- Create: `apps/api/app/schemas/staff.py`
- Create: `apps/api/app/services/staff_profiles.py`
- Create: `apps/api/app/orchestration/prompts.py`
- Create: `apps/api/tests/test_staff_profiles.py`

**Interfaces:**
- Produces: `StaffProfileDocument`, `StaffProfileRepository.load_all()`, `compile_staff_system_prompt()`.
- Consumes: `HiPo-Staff/staff` root and required headings.

- [ ] Write parser tests for all seven profiles, malformed frontmatter, missing sections, duplicate IDs, invalid paths, and safe prompt wording.
- [ ] Confirm focused tests fail.
- [ ] Implement YAML/frontmatter validation and required-section extraction.
- [ ] Implement role-specific system prompts that forbid hidden-reasoning disclosure and include tool/permission boundaries.
- [ ] Run focused tests and backend checks.

### Task 6: Event store, mission state, and WebSocket transport

**Files:**
- Create: `apps/api/app/events/memory.py`
- Create: `apps/api/app/events/broadcaster.py`
- Create: `apps/api/app/schemas/missions.py`
- Create: `apps/api/app/services/missions.py`
- Create: `apps/api/app/api/missions.py`
- Create: `apps/api/app/api/websockets.py`
- Create: `apps/api/tests/test_mission_transport.py`
- Modify: `apps/api/app/schemas/events.py`
- Modify: `apps/api/app/main.py`

**Interfaces:**
- Produces: in-memory mission registry, append-only ordered event store, broadcaster, mission control routes, and reconnecting WebSocket.
- Consumes: validated mission request, selected model profile, project root, `after_sequence`.

- [ ] Write tests for mission creation, strict sequence ordering, append-before-broadcast, replay, WebSocket serialization, pause/resume/cancel, and reconnect.
- [ ] Confirm focused tests fail.
- [ ] Implement event store and broadcaster.
- [ ] Implement mission state service and HTTP routes.
- [ ] Implement WebSocket replay followed by live streaming.
- [ ] Run focused tests and backend checks.

### Task 7: Model-driven agent and coordinator runtime

**Files:**
- Create: `apps/api/app/orchestration/agent_runner.py`
- Create: `apps/api/app/orchestration/coordinator.py`
- Create: `apps/api/app/orchestration/runtime.py`
- Create: `apps/api/app/orchestration/tool_definitions.py`
- Create: `apps/api/tests/test_agent_runtime.py`

**Interfaces:**
- Produces: `AgentRunner.run_assignment()`, `Coordinator.create_plan()`, `MissionRuntime.run()`.
- Consumes: provider, staff profiles, workspace tools, approval service, event store, broadcaster, cancellation token.

- [ ] Write fake-provider tests for structured plan generation, validation repair, file tool calls, approval-gated command calls, artifacts, handoffs, parallel-ready assignments, iteration limits, repeated calls, cancellation, failure, and final summary.
- [ ] Confirm focused tests fail.
- [ ] Implement tool-call loop with validated arguments and tool-result messages.
- [ ] Implement coordinator plan request, validation, and one repair attempt.
- [ ] Implement dependency-aware mission scheduling and bounded parallelism.
- [ ] Emit safe operational events for every meaningful transition.
- [ ] Attach runtime start/pause/resume/cancel to mission service.
- [ ] Run focused and full backend checks.

### Task 8: Frontend model discovery and runtime selection

**Files:**
- Create: `apps/web/src/types/models.ts`
- Create: `apps/web/src/features/models/model-api.ts`
- Create: `apps/web/src/features/models/use-models.ts`
- Create: `apps/web/src/components/models/ModelRuntimePanel.tsx`
- Create: `apps/web/tests/model-runtime-panel.test.tsx`
- Modify: `apps/web/src/components/shell/TopBar.tsx`
- Modify: `apps/web/src/components/mission/MissionComposer.tsx`
- Modify: `apps/web/src/app/App.tsx`

**Interfaces:**
- Produces: model discovery/test/selection hooks and UI.
- Consumes: model management API.

- [ ] Write tests for discovery, model cycling, test success/failure, disconnected state, and mission request model selection.
- [ ] Confirm tests fail.
- [ ] Implement Zod-validated API client and TanStack Query hooks.
- [ ] Implement compact LM Studio runtime panel and active-model indicator.
- [ ] Add demo/live runtime and model selectors to mission composer.
- [ ] Run focused tests, lint, and type checking.

### Task 9: Frontend live mission events and approvals

**Files:**
- Create: `apps/web/src/features/mission/live-mission-api.ts`
- Create: `apps/web/src/features/mission/use-live-mission.ts`
- Create: `apps/web/src/components/approvals/CommandApprovalDialog.tsx`
- Create: `apps/web/tests/live-mission.test.tsx`
- Create: `apps/web/tests/command-approval-dialog.test.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/types/events.ts`

**Interfaces:**
- Produces: live mission creation/control, history bootstrap, reconnecting WebSocket, and approval actions.
- Consumes: existing mission reducer and backend event envelope.

- [ ] Write tests for mission start, event replay, duplicate suppression, reconnect, approval display, accept/reject, and fallback to demo.
- [ ] Confirm tests fail.
- [ ] Implement live mission API and WebSocket hook.
- [ ] Implement approval dialog with command, cwd, purpose, staff, timeout, Run once, and Reject.
- [ ] Integrate live projections into existing workspace without duplicating server state in Zustand.
- [ ] Run focused and full frontend checks.

### Task 10: Documentation and end-to-end verification

**Files:**
- Create: `apps/api/tests/integration/test_lm_studio_live.py`
- Modify: `apps/web/tests/e2e/mission-flow.spec.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SECURITY.md`
- Modify: `scripts/verify.py`

**Interfaces:**
- Produces: optional live LM Studio smoke test guarded by `TOVA_RUN_LM_STUDIO_TEST=1`.
- Produces: fake-provider full-agent E2E flow.

- [ ] Add fake-provider E2E coverage for model selection, mission planning, file tool, command approval, handoff, tests, and completion.
- [ ] Add optional live discovery/completion smoke test that skips by default.
- [ ] Document LM Studio server enablement, base URL, model discovery, Qwen selection, command approvals, limitations, and troubleshooting.
- [ ] Run `uv run python scripts/verify.py`.
- [ ] Run Playwright E2E.
- [ ] If LM Studio is available, run the optional live smoke test and report the exact discovered model ID; otherwise report it as not executed.
