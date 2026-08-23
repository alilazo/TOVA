# TOVA Architecture

## System shape

TOVA is a pnpm and uv monorepo with a React/Vite client, FastAPI service, shared event contracts, human-editable HiPo-Staff profiles, and provider/tool adapter boundaries.

```text
React UI
  ├─ TanStack Query: projects, missions, staff, artifacts
  ├─ Zustand: selection, drawers, tabs, filters, overlays
  └─ event reducers: reconstructed mission and Work Log projections
            ↕ HTTP + WebSocket
FastAPI
  ├─ API services and Pydantic schemas
  ├─ live asyncio orchestration runtime
  ├─ process-local mission registry and event store
  ├─ Markdown staff profile loader
  ├─ LM Studio provider (OpenAI-compatible boundary)
  └─ contained repository and approved-command tools
```

## Frontend boundaries

- `app/` owns providers and route composition.
- `features/mission/` owns mission APIs, WebSocket consumption, reduction, Work Log projection, and controls.
- `features/models/` owns LM Studio discovery, selection, testing, and the three-state runtime contract.
- `features/staff/` owns staff API access and roster behavior.
- `features/projects/` and `components/repository/` own project-path and live file access.
- `components/` contains reusable product surfaces and small shadcn-derived primitives.
- `stores/` contains interface-only state. Server entities are not duplicated there.
- `types/` mirrors versioned shared contracts until generated package publishing is added.

TanStack Query owns server state. Zustand is limited to ephemeral interface state. Mission and Work Log reducers consume only validated `EventEnvelope` values and support replay from sequence zero.

## Backend boundaries

- API routers validate transport input and call services.
- Services own use-case transactions.
- The event store appends events before publishing them.
- A mission broadcaster fans out persisted events and supports `after_sequence`.
- The live orchestrator coordinates Markdown-backed staff against the selected LM Studio model.
- Mission creation requires the selected model to be reachable; mission start revalidates it.
- Repository tools operate against a real project root with path containment.
- Command execution blocks on explicit approval and uses a sanitized process boundary.
- OpenAI-compatible provider errors are typed and credential-safe.

## Persistence

IDs are opaque strings, timestamps are UTC, and events have a strictly increasing sequence per mission. The current event store is process-local: it retains events for HTTP and WebSocket reconnect replay while the API process remains alive, but does not provide restart durability.

## Event flow

1. An HTTP mission command changes state through an application service.
2. The service appends a versioned event to the event store.
3. The appended event is broadcast.
4. The frontend validates and reduces it into a mission projection.
5. On initial mission start, the client fetches existing events before opening the WebSocket. On reconnect, it opens the WebSocket directly with `after_sequence` set to its last accepted sequence.

## Security decisions

- Projects are opened by real local path and may be constrained by `TOVA_ALLOWED_PROJECT_ROOTS`.
- Repository paths must be relative to the project; normalization, traversal checks, exclusions, and size limits enforce containment.
- Commands use structured executable/argument fields and cannot run until an approval is accepted.
- Approved commands run in a contained working directory without stdin, with a sanitized environment, timeout, and output cap.
- Provider credentials remain server-side and are redacted from events.
- Markdown frontmatter and all event payloads are schema validated.

## Architectural decisions

1. **Event-derived mission UI:** reconnect recovery and one source of visible mission truth outweigh the modest reducer complexity.
2. **No task broker in MVP:** asyncio tasks behind a queue protocol keep local setup small while preserving an upgrade path.
3. **Markdown staff source of truth:** profiles are versionable and human editable; parsed records are cached projections.
4. **Real contained workspaces:** tools operate on the selected project without granting unrestricted host filesystem access.
5. **Explicit command approval:** every command pauses at a user-visible approval boundary.
6. **Feature-oriented frontend:** domain logic stays out of presentation components and components remain small.

## Risks and mitigations

- **Reference mismatch:** the image is currently missing; retain compact, neutral proportions and perform visual correction once restored.
- **Event drift:** keep one versioned protocol and contract tests across Python and TypeScript.
- **Monaco test cost:** isolate editor behavior behind a small adapter and mock only Monaco in unit tests.
- **Animation state races:** derive overlays from handoff events and use sequence-aware dismissal.
- **Process restart data loss:** the current process-local event store supports reconnect replay, not restart recovery.
- **Command risk:** require approval, constrain the working directory, sanitize environment variables, and limit runtime and output.
