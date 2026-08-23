# Task 9 Report — Full verification and live LM Studio smoke

## Status

Automated live-only verification completed successfully. Live LM Studio end-to-end smoke is **partially blocked** by LM Studio chat-completion timeouts after mission start.

No Git operations or commits were performed.

## Files changed

- `apps/web/tests/e2e/mission-flow.spec.ts`
  - Rewritten for live-only assertions that do not require LM Studio generation.
  - Covers API staff roster, no playback/simulation UI, open/new project, honest empty Work Log, Team Floor idle state, and disabled Start for unconfigured/unavailable runtime via route stubs.

Helper artifacts (not production):

- `.superpowers/sdd/live-task-9-smoke.py`
- `.superpowers/sdd/live-task-9-smoke.json`

## Step 1 — Frontend verifier

Command: `pnpm verify`

Result: exit `0`

- ESLint passed with zero warnings
- Typecheck passed
- Vitest: 13 files, **68 passed**
- Production build passed (2477 modules)

## Step 2 — Complete workspace verification

Command: `uv run python scripts/verify.py`

Result: exit `0`

- Frontend checks passed again
- Ruff: all checks passed
- mypy: no issues in 40 source files
- pytest: **41 passed**, 1 existing Starlette `TestClient` deprecation warning

## Step 3 — Playwright

Command: `pnpm --filter @tova/web test:e2e`

Result: exit `0`

```text
Running 3 tests using 1 worker
ok 1 uses live APIs for projects and staff without fabricated mission activity (3.9s)
ok 2 unconfigured runtime keeps Start mission disabled (1.0s)
ok 3 unavailable runtime keeps Start mission disabled (934ms)
3 passed (6.9s)
```

Covered without requiring LM Studio generation:

- no playback/simulation UI
- Start disabled for unconfigured/unavailable
- staff roster from `/api/staff`
- empty Work Log shows only honest empty copy
- open/new project still works

## Step 4 — Live LM Studio smoke

### Probe

`GET /api/runtime/status` returned:

```json
{
  "state": "connected",
  "provider": "lm-studio",
  "version": "0.1.0",
  "selected_profile_id": "profile_683b765dd3ca4e48a28dd03af8385fd0",
  "selected_model": "qwen/qwen3.6-35b-a3b"
}
```

`GET /api/staff` returned 7 profiles (first: Alex).

LM Studio `GET /v1/models` succeeded and listed the selected model plus additional local models.

### Fresh mission attempt

Exact objective used:

```text
Create a small typed application with a README and tests. Use observable repository tools, request approval before commands, and finish only after verification.
```

Fresh blank project:

`C:\Users\lazoa\AppData\Local\Temp\tova-live-smoke-1785085162`

Mission: `mission_05c037aeb4bb4e3899ac02516adf9601`

Evidence collected within a 180s bounded poll:

| Check | Result |
|---|---|
| Runtime Connected with selected model | PASS |
| Mission create/start | PASS (`200`, status `running`) |
| `model.request.started` | PASS |
| `staff.assigned` | FAIL / not observed |
| `staff.file.*` | FAIL / not observed |
| Command approvals | FAIL / none requested |
| Terminal status | FAIL / remained `running` then cancelled |

After the window, mission event inventory remained:

- `mission.created`
- `mission.started`
- `mission.analysis.started`
- `model.request.started`

No completion of the first model request occurred.

### LM Studio generation blocker

Direct chat probes timed out:

- `qwen/qwen3.6-35b-a3b` tiny completion: timeout at 60s
- After cancel + switch to `laguna-xs-2.1`, tiny completion: timeout at 45s

Conclusion: LM Studio model listing/health works (Connected), but chat completion generation was not completing during this verification window. That blocked staff assignment, file writes, approval gating observation, Team Floor live writes, and terminal-state evidence.

Mission was cancelled after the hung generation window (`status=cancelled`).

### Browser evidence captured

- Connected runtime UI with selected local model and path-based smoke project
- Engineering Team shows 7 API-backed staff profiles
- Work Log drawer shows only honest empty copy (`No live activity recorded.` / `No live entries recorded.`)
- Team Floor idle: `Start a mission to assemble the team...` and `Waiting for the first file write`
- No playback speed / restart demo / simulation UI observed

Screenshots: `live-smoke-ui.png`, `live-smoke-worklog-empty.png`

## Step 5 — Final production audit

Commands:

```powershell
rg -i "simulation|simulated|restart demo|playback speed|virtual repository|project_orion|evt_demo" apps/api/app apps/web/src scripts
rg "staff-fixtures|use-demo-runtime|demo-events|repository-fixtures" apps/web/src
```

Result: **no matches** in either audit.

## Self-review

- Automated gates required by Task 9 all passed with fresh command evidence.
- E2E no longer depends on LM Studio generation and still asserts the live-only UI contracts.
- Live smoke was attempted with a fresh blank temp project and the exact mission request.
- Incomplete smoke checks are attributed to LM Studio generation timeouts, not to remaining simulation code paths.
- Did not claim full live end-to-end success without the missing staff/file/approval/terminal evidence.

## Concerns / blockers

1. **Live smoke incomplete:** LM Studio accepted model listing and mission start, but did not finish chat completions in time for staff/file/approval/terminal evidence.
2. Existing Starlette `TestClient` deprecation warning remains in backend pytest output and does not fail verification.
3. Browser UI does not attach Live Activity to missions started purely via API; full UI event reflection requires a UI-started mission once LM Studio generation is healthy again.

## Recommended next action

When LM Studio chat completions respond promptly again:

1. Keep a connected selected model.
2. Open a fresh blank temp project.
3. Start the exact mission request from the UI.
4. Approve any command requests.
5. Capture staff assignment, file writes, Team Floor editor, Work Log, and terminal status.
