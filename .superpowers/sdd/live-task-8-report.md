# Task 8 Report — Canonical Documentation and Contracts

## Status

Completed. Canonical documentation now describes the implemented live-only TOVA runtime. No Git commands or commits were used.

## Files changed

- `README.md`
- `docs/PRODUCT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/SECURITY.md`
- `docs/EVENT_PROTOCOL.md`
- `PLANS.md`
- `apps/web/AGENTS.md`
- `.superpowers/sdd/live-task-8-report.md`

`.env.example` was inspected and not changed: it already contains the LM Studio base URL, model, token, public-host policy, timeout, project-root, API, and database defaults needed by the current runtime.

No file under `docs/superpowers/**` was edited.

## Key contract updates

- Replaced fixture-era product descriptions with real path-based local projects and live LM Studio execution.
- Documented the closed runtime state set: Unconfigured, Connected, and Unavailable.
- Documented that the selected model must be reachable before mission creation and is revalidated before mission start.
- Recorded Markdown under `HiPo-Staff/staff` as staff source of truth and the allowlisted public staff response.
- Recorded Work Logs as projections derived only from ordered mission events.
- Limited mission controls to pause, resume, cancel, and transport heartbeat.
- Kept reconnect replay through `after_sequence` and documented append-before-broadcast ordering.
- Documented project-root containment, path exclusions, size limits, command approval, sanitized environments, timeouts, and output caps.
- Updated the event families to include model events and documented the current cancellation representation.
- Removed current support claims for the retired production runtime paths named in the task brief.

## Canonical documentation audit

Command:

```powershell
rg -i "simulation|simulated|seeded mission|orion platform|virtual repository|playback speed|fake provider" README.md docs/PRODUCT_SPEC.md docs/ARCHITECTURE.md docs/SECURITY.md docs/EVENT_PROTOCOL.md PLANS.md apps/web/AGENTS.md
```

Exact output:

```text
```

Exit code: `1`, the expected ripgrep result for no matches.

## Production source audit

Command:

```powershell
pnpm --filter @tova/web exec vitest run tests/production-source-audit.test.ts
```

Result: exit code `0`; 1 test file passed, 3 tests passed.

## Verification

- `pnpm verify` — exit code `0`; ESLint passed, TypeScript passed, 13 frontend test files and 68 tests passed, and the Vite production build passed.
- `uv run python scripts/verify.py` — exit code `0`; repeated frontend verification successfully, Ruff passed, mypy reported no issues in 40 source files, and pytest passed 41 tests.
- IDE documentation diagnostics — no errors.
- Backend pytest emitted one existing `StarletteDeprecationWarning` about `httpx` with `starlette.testclient`; it did not fail verification.

## Self-review

- Checked every Task 8 global constraint against the rewritten canonical documents.
- Verified the runtime-state spelling and model-selection lifecycle against frontend and backend source.
- Verified project containment, command approval, staff allowlisting, event ordering, reconnect replay, mission controls, and Work Log derivation against current source.
- Re-ran the canonical audit after the final documentation edit.
- Confirmed `.env.example` already has complete live-model defaults.
- Confirmed historical `docs/superpowers/**` documents were not touched.

## Concerns

- The current event store is process-local. Reconnect replay survives client disconnection but not API process restart; the docs state this explicitly rather than claiming restart durability.
- Pause, resume, and cancel are HTTP endpoints. The mission WebSocket is currently server-to-client only, and heartbeat is transport ping/pong rather than an application control message; the event protocol now reflects that implemented behavior.
- TOVA is not an arbitrary-code sandbox, and the current API has no user authentication or multi-user authorization. The security document preserves the trusted-local deployment boundary.

## Review correction evidence

Corrected three source-verified claims:

- `README.md`: API startup attempts discovery and automatic selection when `TOVA_LM_STUDIO_MODEL` is configured, as implemented by `apps/api/app/main.py`.
- `docs/EVENT_PROTOCOL.md`: unknown event types fail the backend `EventType` `Literal` and frontend `z.enum` validators; they are not retained.
- `docs/ARCHITECTURE.md`: initial mission setup fetches existing events before opening the socket, while reconnect opens the WebSocket directly with the last `after_sequence`.

No file under `docs/superpowers/**` was edited, and no Git command or commit was used.

### Canonical documentation audit

Command:

```powershell
rg -i "simulation|simulated|seeded mission|orion platform|virtual repository|playback speed|fake provider" README.md docs/PRODUCT_SPEC.md docs/ARCHITECTURE.md docs/SECURITY.md docs/EVENT_PROTOCOL.md PLANS.md apps/web/AGENTS.md
```

Exact output:

```text
```

Exit code: `1`, the expected ripgrep result for no matches.

### Frontend source audit and mission verification

Command:

```powershell
pnpm --filter @tova/web exec vitest run tests/production-source-audit.test.ts tests/mission-interactions.test.tsx
```

Exact summary lines:

```text
Test Files  2 passed (2)
     Tests  14 passed (14)
Duration  4.20s
```

Exit code: `0`.

### Backend runtime and model verification

Command:

```powershell
uv run --directory apps/api pytest tests/test_contracts.py tests/test_model_profile_api.py
```

Exact summary lines:

```text
collected 9 items
tests\test_contracts.py ....                                             [ 44%]
tests\test_model_profile_api.py .....                                    [100%]
============================== 9 passed in 0.55s ==============================
```

Exit code: `0`. IDE diagnostics reported no errors in the three corrected canonical files.
