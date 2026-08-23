# Task 2: Validate the live model before mission persistence

## Summary

- Made `model_profile_id` and `model` mandatory for mission creation and mission records.
- The mission API now checks that the submitted selection is the active local selection and performs a live connection test before calling `MissionRegistry.create`.
- Removed `runtime_mode`; the runtime launcher always resolves and launches the live selected model.

## Files changed

- `apps/api/app/schemas/missions.py`
- `apps/api/app/services/missions.py`
- `apps/api/app/api/missions.py`
- `apps/api/app/main.py`
- `apps/api/tests/test_mission_project_binding.py`
- `apps/api/tests/test_mission_transport.py`
- `apps/api/tests/test_agent_runtime.py`

## TDD evidence

### RED

Command:

```powershell
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py -v
```

Result: exit code 1; 2 failed and 4 passed. The new tests failed as intended because a request without a model returned `200` instead of `422`, and an unavailable model returned `200` instead of `503`.

### GREEN

Command:

```powershell
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py tests/test_agent_runtime.py -v
```

Result: exit code 0; 9 passed. The suite emitted one existing Starlette `TestClient` deprecation warning.

## Verification

Focused mission/runtime verification passed as above.

Complete workspace verification:

```powershell
uv run python scripts/verify.py
```

Result: exit code 0. Web lint, typecheck, tests (38 passed), and build passed; API Ruff passed, mypy reported no issues in 39 source files, and API pytest reported 37 passed. API pytest emitted the same Starlette `TestClient` deprecation warning.

## Self-review

- Model validation occurs before `registry.create`, so failed selections cannot create a mission record or `mission.created` event.
- Invalid profile identifiers map to `422 invalid_model_selection`; selection mismatches map to `422 selection_mismatch`; provider health failures map to typed `503` responses.
- `ProviderError` is caught before `RuntimeError` because it subclasses `RuntimeError`; this preserves the required `503` unavailable-model behavior.
- Events remain persisted before broadcast in `MissionRegistry.emit`.

## Concerns

- The complete verification suite has an existing Starlette `TestClient` deprecation warning.
- The task's listed API files were the only scope changed; the existing web client type still contains `runtime_mode` and nullable model fields, so it should be updated in the corresponding frontend task to keep client types synchronized.

## Start-time reachability regression fix

### Summary

- The `/missions/{mission_id}/start` endpoint now re-validates the mission's selected local model before changing mission status or scheduling its runtime.
- A failed health check returns the same typed `503` provider failure used at creation; the mission stays `created`, no `mission.started` event is persisted or broadcast, and the runtime launcher is not called.
- `launch_live_runtime` also calls `require_selected_available` rather than `resolve`, preserving the live-model invariant at the execution boundary.

### Files changed

- `apps/api/app/api/missions.py`
- `apps/api/app/main.py`
- `apps/api/tests/test_mission_transport.py`

### TDD evidence

#### RED

```powershell
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py tests/test_agent_runtime.py -v
```

Result: exit code 1; 1 failed and 9 passed. `test_mission_start_rechecks_model_reachability_before_launch` failed as expected because `/start` returned `200` rather than typed `503` after the provider became unavailable.

#### GREEN

```powershell
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py tests/test_agent_runtime.py -v
```

Result: exit code 0; 10 passed. The focused suite emitted the existing Starlette `TestClient` deprecation warning.

### Verification and self-review

- The regression test uses a real `ModelProfileRegistry` backed by an `httpx.MockTransport`: discovery and creation health checks succeed, then the start-time health check raises a connection error.
- The test asserts typed `disconnected` detail, no runtime launch, `created` status, and exactly the persisted `mission.created` event. Event persistence-before-broadcast behavior is unchanged.

## Execution-boundary validation failure fix

### Summary

- If the launcher's second model health check fails after `/start` has transitioned the mission to `running`, the launcher now uses the existing failure transition: it sets `MissionStatus.FAILED` and persists then broadcasts `mission.failed`.
- This replaces the unsynchronized `mission.blocked` event and prevents stranded running missions. Runtime analysis does not begin.

### Files changed

- `apps/api/app/main.py`
- `apps/api/tests/test_mission_transport.py`

### TDD evidence

#### RED

```powershell
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py tests/test_agent_runtime.py -v
```

Result: exit code 1; 1 failed and 10 passed. `test_launcher_fails_mission_when_second_health_check_fails` reproduced the defect: after a successful creation and `/start`, the second reachability check failed but the mission status remained `running`.

#### GREEN

```powershell
uv run --directory apps/api ruff check app/main.py tests/test_mission_transport.py
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py tests/test_agent_runtime.py -v
```

Result: exit code 0. Ruff reported `All checks passed!`; focused mission/runtime tests reported 11 passed. The test suite emitted the existing Starlette `TestClient` deprecation warning.

### Verification and self-review

- The regression test makes discovery, creation validation, and `/start` validation succeed, then makes the launcher's execution-boundary validation fail.
- It asserts terminal `failed` status and the canonical event sequence `mission.created`, `mission.started`, `mission.failed`; no analysis event is emitted, proving runtime execution did not proceed.
- The failure transition uses the existing `MissionRuntime` status/event contract and `MissionRegistry.emit`, which persists events before broadcasting.
