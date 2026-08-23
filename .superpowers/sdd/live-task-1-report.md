# Task 1: Truthful live runtime health — Report

## Implementation summary

Replaced the fake simulated runtime response with a live health contract. Runtime status now reports:

- `unconfigured` when no local model selection exists;
- `connected` after a selected model passes an LM Studio health check; and
- `unavailable` with provider error details when the selected local model cannot be reached.

Added `ModelProfileRegistry.runtime_health()` and the preserved Task 2 interface `require_selected_available(profile_id, model)`. The latter requires an exact match to the current selection and rechecks provider availability before returning the provider and model.

## Files changed

- `apps/api/app/api/model_profiles.py`
- `apps/api/app/services/model_profiles.py`
- `apps/api/tests/test_contracts.py`
- `apps/api/tests/test_model_profile_api.py`

## TDD evidence

### RED

Command:

```powershell
uv run --directory apps/api pytest tests/test_contracts.py tests/test_model_profile_api.py -v
```

Result: `3 failed, 6 passed in 0.66s`.

Relevant failures:

- The unconfigured assertion received the previous `status: connected`, `runtime: simulated`, and `provider: fake-openai-compatible` response.
- Connected and unavailable tests raised `KeyError: 'state'`, confirming the new health contract had not yet been implemented.

### GREEN

Command:

```powershell
uv run --directory apps/api pytest tests/test_contracts.py tests/test_model_profile_api.py -v
```

Result: `9 passed in 0.46s`.

### Complete verification

Command:

```powershell
uv run python scripts/verify.py
```

Result: exit code `0`; web lint, typecheck, 38 web tests, and production build passed; API Ruff and mypy passed; API test suite reported `36 passed` with one pre-existing Starlette/httpx deprecation warning.

## Self-review

- API schema restricts state and provider values and omits absent optional fields.
- The status endpoint calls the registry health check instead of returning a simulated or fallback provider.
- Unavailable health retains selected profile/model and provider error details.
- Tests use transport-local fakes only and do not expose tokens.
- Edited files have no IDE linter diagnostics.

## Concerns

None.
