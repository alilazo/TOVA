# Task 4 Report: Verification and Impeccable Detector

Date: 2026-07-30

## Status

PASS with one scoped frontend fix.

Task 4 verification completed from `F:\Programming Projects\TOVA`. No git commits were created. Backend source was untouched.

## Fixes Made

- Fixed the HiPo Staff badge hover lift in `apps/web/src/components/staff/StaffDirectoryScreen.tsx`.
  - Root cause: `motion.button` left an inline transform after the first-open drop animation, so the CSS `transform: translateY(-2px)` hover rule was ignored while the hover shadow still applied.
  - Fix: moved the hover/focus lift into Framer Motion via `whileHover` and `whileFocus`, while preserving reduced-motion handling and the first-open drop animation.
- Added regression coverage in `apps/web/tests/staff-directory-screen.test.tsx`.
  - New test confirms badge hover/focus lift is passed through motion props.

## Command Evidence

### Initial focused tests

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx tests/app-staff-directory.test.tsx tests/app-panel-transition.test.tsx tests/navigation-rail.test.tsx tests/core-components.test.tsx tests/staff-profile-dialog.test.tsx
```

Result:

```text
Test Files  6 passed (6)
Tests       34 passed (34)
```

### Initial frontend verification

Command:

```bash
pnpm verify
```

Result:

```text
lint, typecheck, test, and build passed.
Test Files  30 passed (30)
Tests       141 passed (141)
Build passed.
```

Note: Vite reported the existing large chunk warning:

```text
(!) Some chunks are larger than 700 kB after minification.
```

### Initial full workspace verification

Command:

```bash
uv run python scripts/verify.py
```

Result:

```text
pnpm verify passed.
ruff check passed.
mypy passed: Success: no issues found in 48 source files.
pytest passed: 102 passed, 1 warning.
```

Backend warning observed:

```text
StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
```

### Initial Impeccable detector

Command:

```bash
node C:\Users\lazoa\.agents\skills\impeccable\scripts\detect.mjs --json apps/web/src/components/staff/StaffDirectoryScreen.tsx apps/web/src/styles/globals.css apps/web/src/app/App.tsx
```

Result:

```json
[
  {
    "antipattern": "overused-font",
    "name": "Overused font",
    "severity": "warning",
    "category": "slop",
    "file": "F:\\Programming Projects\\TOVA\\apps\\web\\src\\styles\\globals.css",
    "line": 80,
    "snippet": "font-family: Inter"
  }
]
```

Action: reported as the known unrelated body-font warning. Typography was not changed.

### Hover regression red test

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result before fix:

```text
Test Files  1 failed (1)
Tests       1 failed | 6 passed (7)

Expected the element to have attribute:
  data-while-hover-y="-2"
Received:
  data-while-hover-y=""
```

### Hover regression green test

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result after fix:

```text
Test Files  1 passed (1)
Tests       7 passed (7)
```

### Manual smoke status

Manual visual smoke through `cursor-ide-browser` could not be completed because the MCP browser tool failed to create a controlled tab:

```text
No browser tab available. Please navigate to a page first.
```

Fallback real-browser smoke was completed with Playwright against the already-running Vite dev server at `http://127.0.0.1:5173`.

Result:

```json
{
  "status": "PASS",
  "url": "http://127.0.0.1:5173/",
  "staffDirectoryVisible": true,
  "engineeringTeamVisible": false,
  "badgeCount": 7,
  "nameSearch": {
    "query": "Alex",
    "results": 1
  },
  "roleSearch": {
    "query": "Project Coordinator",
    "results": 1
  },
  "dialogOpened": true,
  "hover": {
    "before": {
      "transform": "matrix(1, -0.000346279, 0.000346279, 1, 0, -0.55553)",
      "boxShadow": "color(srgb 0 0 0 / 0.05) 0px 1px 2px 0px"
    },
    "after": {
      "transform": "matrix(1, 0, 0, 1, 0, -1.17942)",
      "boxShadow": "color(srgb 0 0 0 / 0.12) 0px 8px 22px 0px"
    }
  }
}
```

Smoke coverage:

- Opened `http://127.0.0.1:5173`.
- Clicked `HiPo Staff`.
- Confirmed the main screen switched to `.staff-directory`.
- Confirmed `.engineering-team` was not visible.
- Searched by name (`Alex`) and role (`Project Coordinator`).
- Clicked a badge and confirmed the dialog opened.
- Confirmed hover transform and shadow changed after the fix.

### Final focused tests

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx tests/app-staff-directory.test.tsx tests/app-panel-transition.test.tsx tests/navigation-rail.test.tsx tests/core-components.test.tsx tests/staff-profile-dialog.test.tsx
```

Result:

```text
Test Files  6 passed (6)
Tests       35 passed (35)
```

### Final frontend verification

Command:

```bash
pnpm verify
```

Result:

```text
lint, typecheck, test, and build passed.
Test Files  30 passed (30)
Tests       142 passed (142)
Build passed.
```

Note: Vite still reports the existing large chunk warning:

```text
(!) Some chunks are larger than 700 kB after minification.
```

### Final full workspace verification

Command:

```bash
uv run python scripts/verify.py
```

Result:

```text
pnpm verify passed.
ruff check passed.
mypy passed: Success: no issues found in 48 source files.
pytest passed: 102 passed, 1 warning.
```

Backend warning observed:

```text
StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
```

### Final Impeccable detector

Command:

```bash
node C:\Users\lazoa\.agents\skills\impeccable\scripts\detect.mjs --json apps/web/src/components/staff/StaffDirectoryScreen.tsx apps/web/src/styles/globals.css apps/web/src/app/App.tsx
```

Result:

```json
[
  {
    "antipattern": "overused-font",
    "name": "Overused font",
    "severity": "warning",
    "category": "slop",
    "file": "F:\\Programming Projects\\TOVA\\apps\\web\\src\\styles\\globals.css",
    "line": 80,
    "snippet": "font-family: Inter"
  }
]
```

Action: left unchanged per Task 4 constraint because this is the known unrelated body-font warning.

## Concerns and Follow-Ups

- The Impeccable detector exits non-zero because of the known `Inter` body-font warning in `globals.css`. This was intentionally not changed.
- Vite continues to warn that the main built chunk is larger than 700 kB after minification. This appears unrelated to the HiPo Staff task.
- Backend pytest reports one existing Starlette/httpx deprecation warning. Backend checks otherwise pass, and backend source was untouched.
- Manual visual smoke in the Cursor MCP browser could not be performed because the browser tool could not create a controlled tab. Equivalent real-browser Playwright smoke passed against the running dev server.

## Task 4 Review Follow-Up: Reduced Motion Hover

Fixed the review finding where `.staff-badge-card` still had a CSS transform hover/active path after Framer Motion took ownership of badge lift. The CSS hover/focus state now preserves the border and shadow affordance without `transform`, and the badge transition no longer lists `transform`.

Added regression coverage in `apps/web/tests/staff-directory-screen.test.tsx` for reduced-motion badge behavior:

- Reduced motion leaves `whileHover` and `whileFocus` without a `y` lift.
- The staff badge CSS no longer provides a transform transition, hover/focus transform, or active transform fallback.
- Border and shadow hover/focus affordance remain asserted.

### Reduced-motion regression red test

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result before CSS fix:

```text
Test Files  1 failed (1)
Tests       1 failed | 7 passed (8)

AssertionError: expected staff badge CSS not to match /\btransform\s+\d+ms\b/
Received transition included:
  transform 160ms ease;
```

### Requested verification after fix

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Result:

```text
Test Files  1 passed (1)
Tests       8 passed (8)
```

Command:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx tests/app-staff-directory.test.tsx
```

Result:

```text
Test Files  2 passed (2)
Tests       10 passed (10)
```

Diagnostics: Cursor lints reported no errors for `apps/web/tests/staff-directory-screen.test.tsx` or `apps/web/src/styles/globals.css`.
