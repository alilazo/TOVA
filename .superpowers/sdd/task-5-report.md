# Task 5 Report: Styling + verification

## Status

**DONE**

## Summary

Added compact `.recent-projects` styles to `globals.css` (mapped to Task 3 class names: `__row`, `__name`, `__path`, `__toggle`). Tuned empty-state wrappers with `justify-items: center` on both explorer and code workspace so the recent list sits cleanly under action buttons while staying left-aligned within its fixed width.

## Verification

### Focused (required)

**Backend:**

```bash
uv run --directory apps/api pytest tests/test_recent_projects.py tests/test_projects_api.py -v
```

Result: **PASS** — 11/11 passed (0.85s)

**Frontend:**

```bash
pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx tests/project-explorer.test.tsx tests/code-workspace.test.tsx
```

Result: **PASS** — 3 files, 11/11 tests passed (4.29s)

### Full verify

```bash
pnpm verify
uv run python scripts/verify.py
```

Result: **FAIL** — ESLint `@typescript-eslint/no-unsafe-return` in test mock vi.fn wrappers (`recent-projects-list.test.tsx`, `project-explorer.test.tsx`, `code-workspace.test.tsx`). Pre-existing from Tasks 3–4; not introduced by CSS-only Task 5.

### Manual smoke

- Web dev server at `http://127.0.0.1:5173` responds **200**.
- Browser automation unavailable in this session; visual layout not manually confirmed. Recommend quick check with a project open history when convenient.

## Changes

### Modified: `apps/web/src/styles/globals.css`

- Added `.project-explorer__empty-state` grid centering (matches code workspace pattern).
- Added full `.recent-projects` block after empty-action rules.
- Selectors adapted from brief: `__item`→`__row`, `strong`→`__name`, `small`→`__path`, `__more`→`__toggle`, `__error`→`[role="alert"]`.
- List reset (`margin`, `padding`, `list-style`) on `__list`.
- Ghost Button overrides on `__toggle` for underline link appearance.

## Self-Review

- **Brief compliance:** Compact neutral styling; no gradients/cards; fixed 320px max width; hover states match existing TOVA patterns.
- **Scope:** CSS-only per task; no component or test changes.
- **Class-name drift:** Brief used `__item`/`__more`; component uses `__row`/`__toggle` from Task 3 — styles target actual markup without renaming component classes.

## Concerns

1. **Full verify blocked** by pre-existing lint in recent-projects test mocks (4 errors); fix belongs outside Task 5 scope unless user wants a follow-up.
2. **Manual smoke incomplete** — server up but no browser visual check of styled list in empty states.
3. **Duplicate recents** in explorer + code workspace empty states remains intentional (Task 4); styling applies to both.

## Files Touched

- `apps/web/src/styles/globals.css`

## Commits

None (per instructions).

## Lint fix

**Status:** DONE

**Approach:** Typed hoisted `vi.fn<(...args: unknown[]) => Promise<...>>()` mocks using `RecentProjectRecord` / `ProjectRecord` from `project-api`; removed unsafe `any` returns without redundant `as` casts.

**Lint:**

```bash
pnpm --filter @tova/web lint
```

Result: **PASS**

**Tests:**

```bash
pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx tests/project-explorer.test.tsx tests/code-workspace.test.tsx
```

Result: **PASS** — 3 files, 11/11 tests passed

**Files changed:**

- `apps/web/tests/recent-projects-list.test.tsx`
- `apps/web/tests/project-explorer.test.tsx`
- `apps/web/tests/code-workspace.test.tsx`

## Ruff I001 fix

**Status:** DONE — moved `import shutil` before `from datetime` in `apps/api/tests/test_recent_projects.py` (ruff `--fix`).

**Ruff:** `uv run --directory apps/api ruff check tests/test_recent_projects.py` — **PASS**

**Pytest:** `uv run --directory apps/api pytest tests/test_recent_projects.py -v` — **PASS** (5/5)

## Final review fixes

**Status:** DONE

**Fixes:**
1. React list keys: `RecentProjectsList.tsx` — `<li key={item.root}>` (avoids duplicate `.tova` project id collisions across copied folders).
2. mypy valid-type: `projects.py` — module-level `ProjectList = list[ProjectRecord]` before class; `list()` returns `ProjectList`, `recent()` returns imported `RecentProjectList`. `recent_projects.py` already used `RecentProjectList` alias — no change needed.

**Verification:**

| Command | Result |
|---------|--------|
| `uv run --directory apps/api mypy app` | **PASS** — 48 files, no issues |
| `uv run --directory apps/api pytest tests/test_recent_projects.py tests/test_projects_api.py -v` | **PASS** — 11/11 |
| `pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx` | **PASS** — 4/4 |
| `uv run python scripts/verify.py` | **PASS** — lint, typecheck, 129 web tests, build, ruff, mypy, 102 api tests |

**Files changed:**
- `apps/web/src/components/repository/RecentProjectsList.tsx`
- `apps/api/app/services/projects.py`
