# LM Studio Full-Agent Runtime Design

## Goal

Connect TOVA to LM Studio so the user can discover and test local models, select a model per mission, and run the visible HiPo-Staff team through a backend model-driven tool loop. The first provider targets LM Studio's OpenAI-compatible API while preserving a provider boundary suitable for Ollama and other compatible servers.

## Confirmed decisions

- The first provider is LM Studio.
- The integration uses OpenAI-compatible `/v1/models` and `/v1/chat/completions` endpoints through `httpx`.
- The selected local model drives coordinator planning and staff execution rather than only generating display text.
- Agents work against a real, explicitly selected project root.
- Filesystem access is restricted to the canonical project root.
- Every command requires an explicit user approval before execution.
- Commands execute as a structured executable and argument vector without shell interpolation.
- Automated tests use fake transports and do not require LM Studio.
- The existing deterministic runtime remains available as an offline demo mode.

## Provider architecture

`OpenAICompatibleProvider` is the reusable implementation. `LMStudioProvider` supplies LM Studio defaults and capability labeling without changing the request protocol.

Provider operations:

```python
async def list_models() -> list[DiscoveredModel]
async def test_connection(model: str | None) -> ConnectionTestResult
async def complete(request: ChatCompletionRequest) -> ChatCompletionResult
async def complete_structured(
    request: ChatCompletionRequest,
    output_type: type[StructuredOutput],
) -> StructuredOutput
```

The default base URL is `http://127.0.0.1:1234/v1`. Base URLs must use HTTP or HTTPS. Loopback and private-network hosts are accepted for local-first use; public hosts require an explicit server setting. API tokens are server-side only and are never returned to the browser or written into events.

The provider sends:

- System and user messages.
- The model identifier returned by `/v1/models`.
- Temperature, maximum tokens, timeout, and optional deterministic seed.
- JSON Schema through `response_format` for coordinator plans and other typed outputs.
- OpenAI-compatible tool definitions and tool result messages.

Provider errors are mapped to stable TOVA errors: disconnected, authentication failed, model unavailable, model not loaded, timeout, context exceeded, malformed response, invalid structured output, and generation cancelled.

## Model management API

The backend adds:

```text
GET  /api/model-profiles
POST /api/model-profiles/discover
POST /api/model-profiles/test
PUT  /api/runtime/model-selection
GET  /api/runtime/status
```

Discovery accepts a base URL and returns redacted model metadata. Testing may list models and optionally run a minimal completion against a selected model. The frontend shows connection state, latency, discovered IDs, currently selected model, and the last non-secret error.

For the first slice, profiles and selection are retained in process memory and initialized from environment variables. Durable model-profile persistence is part of the database phase.

## Mission execution

Starting a live mission creates an in-memory mission record, event stream, cancellation token, approval registry, and isolated project workspace reference.

Execution sequence:

1. Validate the selected project root and model profile.
2. Load and validate the seven Markdown HiPo-Staff profiles.
3. Ask Alex for a schema-constrained `MissionPlan`.
4. Validate role names, dependencies, sequence numbers, handoffs, and completion criteria.
5. Create assignments and emit team-assembly events.
6. Run ready assignments. Parallel assignments use an asyncio task group with a configurable concurrency limit.
7. Give each staff agent its profile instructions, assignment, approved prior artifacts, repository summary, and bounded tool definitions.
8. Continue the model/tool loop until the agent returns a typed completion, reaches the iteration limit, is cancelled, or fails.
9. Emit tool, file, decision-summary, artifact, handoff, test, review, and mission events.
10. Alex receives terminal assignment outcomes and produces the final mission summary.

The runtime never stores or broadcasts hidden reasoning. Model-facing prompts ask only for actions, evidence, concise decision summaries, assumptions, confidence, blockers, and outputs.

## Agent tool loop

Each response may contain zero or more tool calls. Calls are validated against typed Pydantic schemas before execution.

Initial tools:

- `repository.list`
- `repository.search`
- `repository.read`
- `repository.write`
- `repository.apply_patch`
- `command.request`
- `artifact.create`
- `handoff.prepare`

The loop is capped by configurable iteration, wall-clock, token, output-size, and repeated-call limits. Unknown tools and malformed arguments are returned to the model as structured tool errors and recorded as operational events.

## Filesystem boundary

The project root is resolved once and compared through canonical paths. Every requested path:

1. Must be relative.
2. Is resolved below the canonical root.
3. Is rejected if it traverses outside the root or targets a disallowed special file.
4. Is size-limited for reads and writes.
5. Uses UTF-8 text for the first implementation.

Writes and patches use atomic temporary-file replacement where practical. Before/after content hashes and a bounded diff preview are emitted; full sensitive file contents are not placed in events.

Default excluded paths include `.git`, `.env*`, credential files, private keys, dependency caches, build output, and TOVA's own runtime data. The user can extend exclusions but cannot disable canonical-root enforcement.

## Command approval and execution

Agents cannot execute commands directly. `command.request` creates an approval record and emits `approval.requested` containing:

- Requesting staff member.
- Executable and argument list.
- Project-relative working directory.
- Concise purpose.
- Timeout.
- Expected outputs.

The mission pauses that operation until the frontend calls:

```text
POST /api/approvals/{approval_id}/accept
POST /api/approvals/{approval_id}/reject
```

The approval UI offers **Run once** or **Reject**. There is no always-allow option in this slice.

Accepted commands:

- Run with `asyncio.create_subprocess_exec`, never `shell=True`.
- Use the canonical project root or a validated child as the working directory.
- Receive a minimal inherited environment with known secret variables removed.
- Have wall-clock timeout, output-byte limit, cancellation, and process-tree termination.
- Stream sanitized output events.
- Record exit code and duration.

This permits arbitrary executables after explicit approval while preventing shell operators, command substitution, and silent execution.

## Events and frontend transport

The live runtime uses the existing versioned event envelope. Events are appended to an in-memory event store before WebSocket broadcast.

New or emphasized events:

- `model.connection.changed`
- `model.request.started`
- `model.request.completed`
- `model.request.failed`
- `approval.requested`
- `approval.accepted`
- `approval.rejected`
- Existing mission, staff, file, command, artifact, handoff, and test events.

HTTP and WebSocket routes:

```text
POST /api/projects/{project_id}/missions
POST /api/missions/{mission_id}/start
POST /api/missions/{mission_id}/pause
POST /api/missions/{mission_id}/resume
POST /api/missions/{mission_id}/cancel
GET  /api/missions/{mission_id}
GET  /api/missions/{mission_id}/events
WS   /api/ws/missions/{mission_id}?after_sequence=N
```

The frontend uses TanStack Query for model, mission, approval, and event-history requests. Zustand remains limited to model-selector UI state and other ephemeral controls. The existing mission reducer consumes both demo and live events.

## Frontend experience

The runtime status control opens a compact model panel with:

- Provider: LM Studio.
- Editable base URL, defaulting to `http://127.0.0.1:1234/v1`.
- Refresh models action.
- Discovered model selector.
- Test model action with latency and status.
- Active-model indicator.
- Clear messages for server disabled, model unavailable, timeout, and malformed output.

The mission composer adds runtime mode and model selection. Live missions collapse into the existing mission strip. Approval requests open an attention-required dialog with command details and Run once/Reject actions. Routine model and tool activity stays in the activity feed.

## Failure and recovery

- Connection failure leaves the deterministic demo available.
- A failed coordinator response does not start staff assignments.
- Invalid plans are retried once with validation errors, then fail explicitly.
- A staff generation failure marks only that assignment failed until Alex decides whether the mission is blocked.
- Model cancellation stops pending requests and command approvals.
- WebSocket reconnect requests missed events after the last sequence.
- Process restart loses in-memory live missions in this slice; durable replay remains database-phase work and is labeled clearly.

## Testing

Backend tests:

- Model discovery, completion, streaming parsing, JSON Schema output, redaction, timeout, and error mapping.
- Coordinator-plan validation and one repair attempt.
- Tool-call validation, iteration limits, repeated-call limits, and cancellation.
- Project-root containment, traversal rejection, exclusions, atomic writes, and bounded diffs.
- Command approval lifecycle, no execution before approval, rejection, timeout, output limits, and environment filtering.
- Event append-before-broadcast and sequence replay.
- WebSocket serialization and reconnect.

Frontend tests:

- Model discovery and selection.
- Connection-test success and failures.
- Live/demo runtime selection.
- Command approval dialog and actions.
- Live event reduction and reconnect.

End-to-end tests use a fake provider to run coordinator, staff tool call, approval, file update, handoff, test result, and completion. An optional manually invoked integration test targets a running LM Studio instance and never runs in CI.

## Explicit non-goals

- Unattended command execution.
- Filesystem access outside the selected project root.
- Shell interpolation or `shell=True`.
- Durable missions and profiles before the database phase.
- Ollama-specific model management in this slice.
- Claiming that the process boundary is a complete security sandbox.
