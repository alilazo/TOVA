# Task 4 Report: Remove playback semantics and align frontend runtime health

## Status

Implemented. No Git operations or commits were performed.

## Summary

- Replaced the simulated/live frontend runtime contract with the backend's truthful `unconfigured | connected | unavailable` state and mapped all snake-case response fields to the required camel-case `RuntimeStatus`.
- Made runtime connectivity depend only on `state === "connected"`.
- Updated the top bar, runtime dialog, and mission composer to present and enforce truthful runtime health.
- Removed playback speed and restart controls, added explicit mission cancellation, and removed playback state/actions from Zustand and `App`.
- Synchronized mission records and create inputs with required model profile/model fields and removed `runtime_mode`.
- Preserved staff fixtures and Work Log code unchanged.

## Files changed

- `apps/web/src/features/models/model-api.ts`
  - Added `RuntimeState` and the required `RuntimeStatus`.
  - Mapped `selected_profile_id`, `selected_model`, `error_code`, and `error`.
- `apps/web/src/components/system/ModelRuntimeDialog.tsx`
  - Added labels for unconfigured, connected, and unavailable states.
  - Removed deterministic-simulation and “live runtime” wording.
- `apps/web/src/components/system/ConnectionBadge.tsx`
  - Replaced the boolean connection prop with `RuntimeState`.
- `apps/web/src/components/shell/TopBar.tsx`
  - Uses the backend state as the sole connection source.
  - Shows the selected model only when connected.
  - Shows configuration or unavailable/error labels otherwise.
- `apps/web/src/components/mission/MissionControlBar.tsx`
  - Removed restart and speed props/UI.
  - Added `onCancel` and an accessible `Cancel mission` button.
- `apps/web/src/components/mission/MissionComposer.tsx`
  - Requires state `connected`, project, profile, model, and request before Start is enabled.
- `apps/web/src/stores/ui-store.ts`
  - Removed playback speed state and setter.
- `apps/web/src/app/App.tsx`
  - Removed playback store wiring.
  - Wired runtime state/camel-case status fields and mission cancellation.
- `apps/web/src/features/mission/mission-api.ts`
  - Removed `runtime_mode`.
  - Made model profile/model required and non-null.
- `apps/web/src/features/mission/use-demo-runtime.ts`
  - Removed the deleted playback-speed store dependency and retained a fixed internal event delay for this unused legacy hook.
- `apps/web/tests/mission-interactions.test.tsx`
  - Updated connected runtime input and asserted the absence of playback/restart UI plus presence of cancellation.
- `apps/web/tests/runtime-status.test.ts`
  - Added response-mapping coverage for all three runtime states.

## TDD evidence

### Focused RED

Command:

```text
pnpm --filter @tova/web exec vitest run tests/runtime-status.test.ts tests/mission-interactions.test.tsx
```

Exact output:

```text
 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web

 ❯ tests/runtime-status.test.ts (3 tests | 3 failed) 16ms
     × maps the 'unconfigured' runtime state 11ms
     × maps the 'connected' runtime state 2ms
     × maps the 'unavailable' runtime state 1ms
 ❯ tests/mission-interactions.test.tsx (5 tests | 2 failed) 533ms
     × submits a typed mission request when project and model are ready 298ms
     × offers mission controls without playback semantics 37ms

 Test Files  2 failed (2)
      Tests  5 failed | 3 passed (8)
   Start at  20:46:46
   Duration  3.82s (transform 171ms, setup 709ms, import 1.25s, tests 549ms, environment 2.91s)

undefined
F:\Programming Projects\TOVA\apps\web:
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run tests/runtime-status.test.ts tests/mission-interactions.test.tsx
```

Failure details captured in RED:

```text
 FAIL  tests/mission-interactions.test.tsx > Mission interactions > submits a typed mission request when project and model are ready
AssertionError: expected '' to be 'Add project creation and team orchest…' // Object.is equality

- Expected
+ Received

- Add project creation and team orchestration

 ❯ tests/mission-interactions.test.tsx:30:23
     28|     fireEvent.click(screen.getByRole("button", { name: "Start mission"…
     29|
     30|     expect(submitted).toBe("Add project creation and team orchestratio…
       |                       ^
     31|   })
     32|

 FAIL  tests/mission-interactions.test.tsx > Mission interactions > offers mission controls without playback semantics
Error: expect(element).not.toBeInTheDocument()

expected document not to contain element, found <button
  aria-autocomplete="none"
  aria-expanded="false"
  aria-label="Playback speed"
  data-size="sm"
  data-slot="select-trigger"
  data-state="closed"
  dir="ltr"
  role="combobox"
  type="button"
>…</button> instead
 ❯ tests/mission-interactions.test.tsx:60:76
     58|     )
     59|
     60|     expect(screen.queryByRole("combobox", { name: "Playback speed" }))…
       |                                                                            ^
     61|     expect(screen.queryByLabelText("Restart demo")).not.toBeInTheDocum…
     62|     expect(screen.getByRole("button", { name: "Cancel mission" })).toB…

 FAIL  tests/runtime-status.test.ts > getRuntimeStatus > maps the 'unconfigured' runtime state
AssertionError: expected { runtime: undefined, …(3) } to deeply equal { state: 'unconfigured', …(5) }

- Expected
+ Received

  {
-   "error": null,
-   "errorCode": null,
-   "provider": "lm-studio",
-   "selectedModel": null,
-   "selectedProfileId": null,
-   "state": "unconfigured",
+   "connected": false,
+   "model": null,
+   "profile_id": null,
+   "runtime": undefined,
  }

 ❯ tests/runtime-status.test.ts:75:37
     73|     respondWith(response)
     74|
     75|     await expect(getRuntimeStatus()).resolves.toEqual(expected)
       |                                     ^
     76|   })
     77| })

 FAIL  tests/runtime-status.test.ts > getRuntimeStatus > maps the 'connected' runtime state
AssertionError: expected { runtime: undefined, …(3) } to deeply equal { state: 'connected', …(5) }

- Expected
+ Received

  {
-   "error": null,
-   "errorCode": null,
-   "provider": "lm-studio",
-   "selectedModel": "qwen/qwen3.6-35b-a3b",
-   "selectedProfileId": "profile_1",
-   "state": "connected",
+   "connected": false,
+   "model": "qwen/qwen3.6-35b-a3b",
+   "profile_id": "profile_1",
+   "runtime": undefined,
  }

 ❯ tests/runtime-status.test.ts:75:37
     73|     respondWith(response)
     74|
     75|     await expect(getRuntimeStatus()).resolves.toEqual(expected)
       |                                     ^
     76|   })
     77| })

 FAIL  tests/runtime-status.test.ts > getRuntimeStatus > maps the 'unavailable' runtime state
AssertionError: expected { runtime: undefined, …(3) } to deeply equal { state: 'unavailable', …(5) }

- Expected
+ Received

  {
-   "error": "LM Studio is not reachable",
-   "errorCode": "disconnected",
-   "provider": "lm-studio",
-   "selectedModel": "qwen/qwen3.6-35b-a3b",
-   "selectedProfileId": "profile_1",
-   "state": "unavailable",
+   "connected": false,
+   "model": "qwen/qwen3.6-35b-a3b",
+   "profile_id": "profile_1",
+   "runtime": undefined,
  }

 ❯ tests/runtime-status.test.ts:75:37
     73|     respondWith(response)
     74|
     75|     await expect(getRuntimeStatus()).resolves.toEqual(expected)
       |                                     ^
     76|   })
     77| })
```

### Focused GREEN

Command:

```text
pnpm --filter @tova/web exec vitest run tests/runtime-status.test.ts tests/mission-interactions.test.tsx
```

Exact output:

```text
 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web


 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  20:48:04
   Duration  3.62s (transform 193ms, setup 668ms, import 1.18s, tests 484ms, environment 2.83s)
```

## Verification

The first full lint run correctly found two `require-await` violations in the new fetch test helper:

```text
$ eslint . --max-warnings 0

F:\Programming Projects\TOVA\apps\web\tests\runtime-status.test.ts
  6:41  error  Async arrow function has no 'await' expression  @typescript-eslint/require-await
  8:5   error  Async method 'json' has no 'await' expression   @typescript-eslint/require-await

✖ 2 problems (2 errors, 0 warnings)
```

The helper was corrected to return `Promise.resolve(...)`, then all required checks were rerun.

### Required frontend checks

`pnpm --filter @tova/web test`:

```text
$ vitest run

 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web


 Test Files  8 passed (8)
      Tests  42 passed (42)
   Start at  20:48:55
   Duration  5.65s (transform 897ms, setup 4.90s, import 6.20s, tests 1.84s, environment 19.14s)
```

`pnpm --filter @tova/web typecheck`:

```text
$ tsc -b --pretty false
```

Exit code: `0`.

`pnpm --filter @tova/web lint`:

```text
$ eslint . --max-warnings 0
```

Exit code: `0`.

### Frontend pipeline

`pnpm verify` exited `0`:

```text
$ pnpm lint && pnpm typecheck && pnpm test && pnpm build
$ pnpm --filter @tova/web lint
$ eslint . --max-warnings 0
$ pnpm --filter @tova/web typecheck
$ tsc -b --pretty false
$ pnpm --filter @tova/web test
$ vitest run

 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web


 Test Files  8 passed (8)
      Tests  42 passed (42)
   Start at  20:49:37
   Duration  4.62s (transform 770ms, setup 3.66s, import 5.49s, tests 1.71s, environment 14.69s)

$ pnpm --filter @tova/web build
$ tsc -b && vite build
vite v8.1.5 building client environment for production...
transforming...✓ 2475 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.58 kB │ gzip:   0.35 kB
dist/assets/index-CIAq5ZCA.css   59.97 kB │ gzip:  11.57 kB
dist/assets/dist-BLSGSntH.js     14.16 kB │ gzip:   4.81 kB
dist/assets/index-DiNkrg5_.js   691.71 kB │ gzip: 212.51 kB

✓ built in 530ms
```

### Complete workspace verification

`uv run python scripts/verify.py` exited `0`.

```text
Frontend: lint, typecheck, 42 tests, and production build passed.
Backend: ruff passed; mypy found no issues in 40 source files; pytest passed 41 tests.
```

The backend test run emitted one existing Starlette deprecation warning about `httpx`/`starlette.testclient`.

### Source checks

The source search for `Playback speed`, `Restart demo`, `deterministic simulation`, `runtime_mode`, `playbackSpeed`, and `setPlaybackSpeed` returned no matches.

IDE diagnostics reported no errors in the changed files.

## Self-review

- Confirmed `RuntimeStatus` matches the brief exactly.
- Confirmed query success is never treated as runtime connectivity.
- Confirmed the connected indicator only displays a selected model for state `connected`.
- Confirmed unconfigured and unavailable labels have safe fallbacks.
- Confirmed Start requires request, project, connected state, profile, and model.
- Confirmed completed missions hide Pause/Resume and disable cancellation.
- Confirmed no speed/restart props remain in `MissionControlBar`, Zustand, or `App`.
- Confirmed mission create fields are required and `runtime_mode` is absent.
- Confirmed staff fixtures and Work Log were not modified.

## Concerns

- No known Task 4 correctness concerns.
- The unused legacy `use-demo-runtime.ts` module remains in the repository; only its deleted playback-speed store dependency was removed. It is not wired into the production UI.
- The complete workspace verification has one upstream Starlette deprecation warning; it is unrelated to this task.

## Review follow-up: terminal mission controls

### Summary

- Added the canonical terminal mission statuses `completed`, `failed`, and `cancelled`.
- Mission controls now receive a canonical `MissionStatus` and derive terminal behavior from the shared status helper.
- `App` prioritizes a terminal mission-record status over the event projection, so a cancellation locks controls immediately even if its websocket event has not arrived.
- Terminal missions show no Pause/Resume control and expose a disabled Cancel button.
- Running missions still pause and cancel; paused missions still resume and can be cancelled.

### Files changed

- `apps/web/src/types/domain.ts`
- `apps/web/src/components/mission/MissionControlBar.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/tests/mission-interactions.test.tsx`
- `.superpowers/sdd/live-task-4-report.md`

### Focused RED

Command:

```text
pnpm --filter @tova/web exec vitest run tests/mission-interactions.test.tsx
```

Exact output:

```text
 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web

 ❯ tests/mission-interactions.test.tsx (9 tests | 3 failed) 537ms
     × locks controls for terminal status completed 14ms
     × locks controls for terminal status failed 11ms
     × locks controls for terminal status cancelled 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/mission-interactions.test.tsx > Mission interactions > locks controls for terminal status completed
 FAIL  tests/mission-interactions.test.tsx > Mission interactions > locks controls for terminal status failed
 FAIL  tests/mission-interactions.test.tsx > Mission interactions > locks controls for terminal status cancelled
Error: expect(element).not.toBeInTheDocument()

expected document not to contain element, found <button
  class="inline-flex shrink-0 items-center justify-center text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 bg-primary text-primary-foreground hover:bg-primary/90 h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5"
  data-size="sm"
  data-slot="button"
  data-variant="default"
>
  <svg
    aria-hidden="true"
    class="lucide lucide-play"
    data-icon="inline-start"
    fill="none"
    height="24"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="2"
    viewBox="0 0 24 24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"
    />
  </svg>
  Resume
</button> instead
 ❯ tests/mission-interactions.test.tsx:108:76
    106|     )
    107|
    108|     expect(screen.queryByRole("button", { name: /^(Pause|Resume)$/ }))…
       |                                                                            ^
    109|     const cancel = screen.getByRole("button", { name: "Cancel mission"…
    110|     expect(cancel).toBeDisabled()

 Test Files  1 failed (1)
      Tests  3 failed | 6 passed (9)
   Start at  20:53:49
   Duration  3.65s (transform 153ms, setup 343ms, import 1.16s, tests 537ms, environment 1.37s)

undefined
F:\Programming Projects\TOVA\apps\web:
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 1: vitest run tests/mission-interactions.test.tsx
```

The failure was expected: all three terminal statuses rendered Resume because the old component only understood a `completed` boolean.

### Focused GREEN

Command:

```text
pnpm --filter @tova/web exec vitest run tests/mission-interactions.test.tsx
```

Exact output:

```text
 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web


 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  20:54:42
   Duration  3.61s (transform 159ms, setup 333ms, import 1.16s, tests 522ms, environment 1.36s)
```

### Frontend verification

`pnpm --filter @tova/web test`:

```text
$ vitest run

 RUN  v4.1.10 F:/Programming Projects/TOVA/apps/web


 Test Files  8 passed (8)
      Tests  46 passed (46)
   Start at  20:54:53
   Duration  5.75s (transform 747ms, setup 4.88s, import 6.19s, tests 1.93s, environment 19.17s)
```

`pnpm --filter @tova/web typecheck`:

```text
$ tsc -b --pretty false
```

Exit code: `0`.

`pnpm --filter @tova/web lint`:

```text
$ eslint . --max-warnings 0
```

Exit code: `0`.

### Self-review and concerns

- The canonical frontend status union defines exactly three terminal states: `completed`, `failed`, and `cancelled`; no other defined status is terminal.
- The mission record is checked first for terminal state so cancellation is reflected synchronously after the control request returns.
- Projection status remains authoritative for nonterminal workflow phases.
- Disabled buttons do not invoke cancellation callbacks.
- No Git operations were performed.
- No known concerns remain for this review issue.
