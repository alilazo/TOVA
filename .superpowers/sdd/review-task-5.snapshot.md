# Review package: Task 5 (no git)

## Files

## FILE: apps/web/src/styles/globals.css (excerpt recent-projects + empty-state)

```
  height: 100%;
  margin: 0;
  place-items: center;
  padding: 18px;
  color: var(--muted-text);
  text-align: center;
}

.project-explorer__empty,
.project-explorer__empty-state,
.code-workspace--empty {
  display: grid;
  place-content: center;
  gap: 8px;
  padding: 18px;
  color: var(--muted-text);
  text-align: center;
  min-height: 0;
  height: 100%;
}

.project-explorer__empty-state strong,
.code-workspace--empty p,
.code-workspace__empty-state p {
  color: #3f403c;
}

.project-explorer__empty-actions,
.code-workspace__empty-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.project-explorer__empty-state {
  display: grid;
  gap: 12px;
  justify-items: center;
}

.code-workspace__empty-state {
  display: grid;
  gap: 12px;
  justify-items: center;
}

.recent-projects {
  display: grid;
  gap: 6px;
  width: min(320px, 100%);
  margin-top: 4px;
  text-align: left;
}

.recent-projects__label {
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--soft-text);
}

.recent-projects__list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.recent-projects__row {
  display: grid;
  gap: 1px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  text-align: left;
}

.recent-projects__row:hover:not(:disabled) {
  background: color-mix(in oklab, var(--panel) 70%, #e8e8e4);
  border-color: var(--line);
}

.recent-projects__name {
  font-size: 12px;
  font-weight: 600;
  color: #2f302d;
}

.recent-projects__path {
  overflow: hidden;
  color: var(--soft-text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-projects__toggle {
  justify-self: start;
  height: auto;
  min-height: 0;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--muted-text);
  font-size: 11px;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.recent-projects__toggle:hover {
  background: transparent;
  color: var(--muted-text);
}

.recent-projects [role="alert"] {
  margin: 0;
  color: var(--red);
  font-size: 11px;
}

.project-explorer__empty {
  padding: 10px 12px;
  font-size: 10px;
}

.project-selector small {
  display: block;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.team-floor__empty {
  display: grid;
  place-content: center;
```

## FILE: .superpowers/sdd/task-5-report.md

```
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

Result: **PASS** â€” 11/11 passed (0.85s)

**Frontend:**

```bash
pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx tests/project-explorer.test.tsx tests/code-workspace.test.tsx
```

Result: **PASS** â€” 3 files, 11/11 tests passed (4.29s)

### Full verify

```bash
pnpm verify
uv run python scripts/verify.py
```

Result: **FAIL** â€” ESLint `@typescript-eslint/no-unsafe-return` in test mock vi.fn wrappers (`recent-projects-list.test.tsx`, `project-explorer.test.tsx`, `code-workspace.test.tsx`). Pre-existing from Tasks 3â€“4; not introduced by CSS-only Task 5.

### Manual smoke

- Web dev server at `http://127.0.0.1:5173` responds **200**.
- Browser automation unavailable in this session; visual layout not manually confirmed. Recommend quick check with a project open history when convenient.

## Changes

### Modified: `apps/web/src/styles/globals.css`

- Added `.project-explorer__empty-state` grid centering (matches code workspace pattern).
- Added full `.recent-projects` block after empty-action rules.
- Selectors adapted from brief: `__item`â†’`__row`, `strong`â†’`__name`, `small`â†’`__path`, `__more`â†’`__toggle`, `__error`â†’`[role="alert"]`.
- List reset (`margin`, `padding`, `list-style`) on `__list`.
- Ghost Button overrides on `__toggle` for underline link appearance.

## Self-Review

- **Brief compliance:** Compact neutral styling; no gradients/cards; fixed 320px max width; hover states match existing TOVA patterns.
- **Scope:** CSS-only per task; no component or test changes.
- **Class-name drift:** Brief used `__item`/`__more`; component uses `__row`/`__toggle` from Task 3 â€” styles target actual markup without renaming component classes.

## Concerns

1. **Full verify blocked** by pre-existing lint in recent-projects test mocks (4 errors); fix belongs outside Task 5 scope unless user wants a follow-up.
2. **Manual smoke incomplete** â€” server up but no browser visual check of styled list in empty states.
3. **Duplicate recents** in explorer + code workspace empty states remains intentional (Task 4); styling applies to both.

## Files Touched

- `apps/web/src/styles/globals.css`

## Commits

None (per instructions).

```
