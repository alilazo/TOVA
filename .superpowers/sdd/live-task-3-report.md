# Task 3 Report: Serve safe Markdown-backed staff profiles

## Status

Implemented the public `GET /api/staff` endpoint. It loads the seven
Markdown-backed staff profiles and serializes them through an explicit
`StaffProfileView` allowlist.

## Implementation

- Added `StaffProfileView` with exactly the 17 public metadata fields.
- Added explicit validation of those fields on `StaffProfileDocument`, while
  retaining internal fields needed by the profile repository and orchestration.
- Added `StaffProfileDocument.to_view()`, which dumps only fields declared on
  `StaffProfileView`.
- Added the `/api/staff` router, rooted at `HiPo-Staff/staff`.
- Converted `StaffProfileError` failures into HTTP 500 responses with the
  fixed public detail: `Staff profiles are unavailable`.
- Wired the router into the FastAPI application.
- Added behavior coverage for safe metadata and for hiding repository error
  details. Updated the existing valid test profile fixture to include newly
  required frontmatter fields.

## Changed files

- `apps/api/app/schemas/staff.py`
- `apps/api/app/api/staff.py`
- `apps/api/app/main.py`
- `apps/api/tests/test_staff_api.py`
- `apps/api/tests/test_staff_profiles.py`

## RED evidence

Command:

```powershell
uv run --directory apps/api pytest tests/test_staff_api.py -v
```

Output:

```text
============================= test session starts =============================
platform win32 -- Python 3.13.13, pytest-9.1.1, pluggy-1.6.0 -- F:\Programming Projects\TOVA\apps\api\.venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: F:\Programming Projects\TOVA\apps\api
configfile: pyproject.toml
plugins: anyio-4.14.2, asyncio-1.4.0
asyncio: mode=Mode.AUTO, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collecting ... collected 2 items

tests/test_staff_api.py::test_staff_api_returns_safe_markdown_metadata FAILED [ 50%]
tests/test_staff_api.py::test_staff_api_hides_profile_load_failure_details FAILED [100%]

================================== FAILURES ===================================
E       assert 404 == 200
E        +  where 404 = <Response [404 Not Found]>.status_code
E       ImportError: cannot import name 'staff' from 'app.api' (unknown location)
============================== 2 failed in 0.58s ==============================
```

The missing endpoint produced the required 404 RED signal. The failure-path
test also failed because its router module did not yet exist.

## GREEN evidence

Command:

```powershell
uv run --directory apps/api pytest tests/test_staff_api.py tests/test_staff_profiles.py -v
```

Output:

```text
============================= test session starts =============================
platform win32 -- Python 3.13.13, pytest-9.1.1, pluggy-1.6.0 -- F:\Programming Projects\TOVA\apps\api\.venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: F:\Programming Projects\TOVA\apps\api
configfile: pyproject.toml
plugins: anyio-4.14.2, asyncio-1.4.0
asyncio: mode=Mode.AUTO, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collecting ... collected 4 items

tests/test_staff_api.py::test_staff_api_returns_safe_markdown_metadata PASSED [ 25%]
tests/test_staff_api.py::test_staff_api_hides_profile_load_failure_details PASSED [ 50%]
tests/test_staff_profiles.py::test_loads_all_seven_profiles_and_compiles_safe_prompt PASSED [ 75%]
tests/test_staff_profiles.py::test_rejects_missing_sections_and_duplicate_ids PASSED [100%]

============================== 4 passed in 0.50s ==============================
```

## Verification

- `uv run --directory apps/api ruff check app tests`: `All checks passed!`
- `uv run --directory apps/api mypy app`: `Success: no issues found in 40 source files`
- `uv run python scripts/verify.py`: exit code 0.
  - Frontend lint, typecheck, tests (38), and production build passed.
  - API Ruff and mypy passed.
  - API pytest passed: `41 passed, 1 warning in 0.98s`.
  - The warning is pre-existing third-party Starlette TestClient deprecation
    guidance and is unrelated to this endpoint.

## Self-review

- The response model is an allowlist: `sections`, `permissions`, source path,
  model temperatures, context limits, prompt text, and credential-bearing
  fields are neither in the view model nor in serialized responses.
- The safe-response test asserts the complete response key set, preventing
  accidental additions to the public contract.
- The failure-path test injects a `StaffProfileError` containing fabricated
  Markdown content and a filename, then confirms neither reaches the response.
- Profile loading remains bounded to the existing staff root through the
  repository's path validation.

## Concerns

No task blockers. The endpoint serves static local profile metadata on each
request; if profile count or document size grows materially, caching can be
considered in a future task without changing the public contract.

## Git

No Git commands, commits, or branches were created.
