### Task 2: Validate the live model before mission persistence

**Files:**
- Modify: `apps/api/app/schemas/missions.py`
- Modify: `apps/api/app/services/missions.py`
- Modify: `apps/api/app/api/missions.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/tests/test_mission_project_binding.py`
- Modify: `apps/api/tests/test_mission_transport.py`
- Modify: `apps/api/tests/test_agent_runtime.py`

**Interfaces:**

```python
class MissionCreateRequest(BaseModel):
    objective: str
    model_profile_id: str
    model: str

class MissionRecord(BaseModel):
    id: str
    project_id: str
    objective: str
    project_root: str
    model_profile_id: str
    model: str
    status: MissionStatus
```

`runtime_mode` is removed.

- [ ] **Step 1: Add failing mission validation tests**

Set up a real `ModelProfileRegistry` with `MockTransport`, discover and select `qwen-local`, and assert:

```python
missing = await client.post(
    f"/api/projects/{project.id}/missions",
    json={"objective": "Build something"},
)
assert missing.status_code == 422

created = await client.post(
    f"/api/projects/{project.id}/missions",
    json={
        "objective": "Build something",
        "model_profile_id": profile_id,
        "model": "qwen-local",
    },
)
assert created.status_code == 200
assert "runtime_mode" not in created.json()
```

Add an unavailable transport case and assert `503` with a typed detail containing `code` and `message`. Confirm no mission record/event was created.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py -v
```

Expected: required model validation and missing `runtime_mode` assertions fail.

- [ ] **Step 3: Make model fields required and remove runtime mode**

Apply the interfaces above. Update test factories to always pass:

```python
MissionCreateRequest(
    objective="Create result",
    model_profile_id="profile_test",
    model="fake-test-model",
)
```

Tests that instantiate `MissionRegistry` directly may use deterministic test identifiers without a provider because API validation is outside the registry.

- [ ] **Step 4: Validate model health in the mission API**

Add `Models = Annotated[ModelProfileRegistry, Depends(get_model_registry)]` and:

```python
try:
    await models.require_selected_available(
        request.model_profile_id,
        request.model,
    )
except KeyError as exc:
    raise HTTPException(
        status_code=422,
        detail={"code": "invalid_model_selection", "message": str(exc)},
    ) from exc
except RuntimeError as exc:
    raise HTTPException(
        status_code=422,
        detail={"code": "selection_mismatch", "message": str(exc)},
    ) from exc
except ProviderError as exc:
    raise HTTPException(
        status_code=503,
        detail={
            "code": exc.code.value,
            "message": str(exc),
        },
    ) from exc
```

Only call `registry.create(...)` after this succeeds.

- [ ] **Step 5: Make the launcher unconditionally live**

Remove:

```python
if mission.runtime_mode != "live":
    return
```

Resolve the required mission profile/model directly.

- [ ] **Step 6: Run backend mission/runtime tests**

```powershell
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py tests/test_agent_runtime.py -v
```

Expected: all pass.

## Context from Task 1

`ModelProfileRegistry.require_selected_available(profile_id, model)` now exists. It requires an exact match with the selected profile/model and performs a live provider connection test. It raises `KeyError`, `RuntimeError`, or `ProviderError` as described above.

## Global constraints

- There is no simulated production runtime and no fallback fake provider.
- Mission creation and execution require a selected, reachable local model.
- Model validation must happen before mission persistence and event creation.
- Test fakes and mocks remain isolated to test code.
- Persist events before broadcasting.
- Never expose credentials or provider tokens.
- Write behavior tests before implementation and capture RED/GREEN evidence.
- No Git repository exists; do not attempt commits.
