### Task 1: Truthful live runtime health

**Files:**
- Modify: `apps/api/app/api/model_profiles.py`
- Modify: `apps/api/app/services/model_profiles.py`
- Modify: `apps/api/tests/test_contracts.py`
- Modify: `apps/api/tests/test_model_profile_api.py`

**Interfaces:**

```python
class RuntimeStatus(BaseModel):
    state: Literal["unconfigured", "connected", "unavailable"]
    provider: Literal["lm-studio"]
    version: str
    selected_profile_id: str | None = None
    selected_model: str | None = None
    error_code: str | None = None
    error: str | None = None

async def ModelProfileRegistry.runtime_health() -> RuntimeHealth: ...
async def ModelProfileRegistry.require_selected_available(
    profile_id: str,
    model: str,
) -> tuple[OpenAICompatibleProvider, str]: ...
```

`RuntimeHealth` is a service-layer Pydantic model or typed dataclass with the same state/model/error fields except API version.

- [ ] **Step 1: Replace the simulated contract test with an unconfigured test**

```python
@pytest.mark.asyncio
async def test_runtime_status_reports_unconfigured_without_selection() -> None:
    registry = ModelProfileRegistry()
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "state": "unconfigured",
        "provider": "lm-studio",
        "version": "0.1.0",
    }
```

- [ ] **Step 2: Add connected and unavailable API tests**

Use `registry_with_transport` with one handler returning `{"data": [{"id": "qwen-local"}]}` and another raising `httpx.ConnectError`. Discover/select first, then assert:

```python
assert connected.json()["state"] == "connected"
assert connected.json()["selected_model"] == "qwen-local"
assert unavailable.json()["state"] == "unavailable"
assert unavailable.json()["error_code"] == "disconnected"
```

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```powershell
uv run --directory apps/api pytest tests/test_contracts.py tests/test_model_profile_api.py -v
```

Expected: failures reference the old `simulated` response and missing `state`.

- [ ] **Step 4: Implement the service health model**

In `services/model_profiles.py`, add:

```python
class RuntimeHealth(BaseModel):
    state: Literal["unconfigured", "connected", "unavailable"]
    selected_profile_id: str | None = None
    selected_model: str | None = None
    error_code: str | None = None
    error: str | None = None

async def runtime_health(self) -> RuntimeHealth:
    selection = self.selection
    if selection is None:
        return RuntimeHealth(state="unconfigured")
    result = await self.test(selection.profile_id, selection.model)
    if result.connected:
        return RuntimeHealth(
            state="connected",
            selected_profile_id=selection.profile_id,
            selected_model=selection.model,
        )
    return RuntimeHealth(
        state="unavailable",
        selected_profile_id=selection.profile_id,
        selected_model=selection.model,
        error_code=result.error_code,
        error=result.error,
    )

async def require_selected_available(
    self,
    profile_id: str,
    model: str,
) -> tuple[OpenAICompatibleProvider, str]:
    if self.selection != ModelSelection(profile_id=profile_id, model=model):
        raise RuntimeError("Mission model must match the selected local model")
    provider, selected_model = self.resolve(profile_id, model)
    health = await provider.test_connection(selected_model)
    if not health.connected:
        raise ProviderError(
            ProviderErrorCode(health.error_code or "model_unavailable"),
            health.error or "Selected local model is unavailable",
        )
    return provider, selected_model
```

- [ ] **Step 5: Replace the API response**

`GET /api/runtime/status` calls `await registry.runtime_health()` and returns `provider="lm-studio"` with `response_model_exclude_none=True`. Remove `runtime="simulated"` and `fake-openai-compatible`.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run the Step 3 command. Expected: all selected tests pass with no warnings introduced.

## Global constraints

- There is no simulated production runtime and no fallback fake provider.
- Mission creation and execution require a selected, reachable local model.
- Test fakes and mocks remain isolated to test code.
- Never expose credentials or provider tokens.
- Write behavior tests before implementation and capture RED/GREEN evidence.
- No Git repository exists; do not attempt commits.
