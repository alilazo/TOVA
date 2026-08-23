### Task 5: Styling + verification

**Files:**
- Modify: `apps/web/src/styles/globals.css`

- [ ] **Step 1: Add compact styles**

Add after empty-action rules:

```css
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
}

.recent-projects__item {
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

.recent-projects__item:hover {
  background: color-mix(in oklab, var(--panel) 70%, #e8e8e4);
  border-color: var(--line);
}

.recent-projects__item strong {
  font-size: 12px;
  font-weight: 600;
  color: #2f302d;
}

.recent-projects__item small {
  overflow: hidden;
  color: var(--soft-text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-projects__more {
  justify-self: start;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--muted-text);
  font-size: 11px;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.recent-projects__error {
  margin: 0;
  color: var(--red);
  font-size: 11px;
}
```

Tune explorer empty state so the recent block sits cleanly under the buttons (`justify-items: center` on empty-state wrappers if needed; list itself left-aligned within fixed width).

- [ ] **Step 2: Run focused verification**

```bash
uv run --directory apps/api pytest tests/test_recent_projects.py tests/test_projects_api.py -v
pnpm --filter @tova/web exec vitest run tests/recent-projects-list.test.tsx tests/project-explorer.test.tsx tests/code-workspace.test.tsx
```

Expected: all PASS

- [ ] **Step 3: Manual smoke (with running environments)**

1. Open web at `http://127.0.0.1:5173`
2. Open a project via dialog; close/restart API if needed and confirm recent appears (or open second project then clear active by restarting API without re-open â€” active is in-memory, recents persist)
3. Confirm â‰¤5 rows, View more with >5, one-click open works in both explorer and code workspace empty states

- [ ] **Step 4: Full verify if time permits**

```bash
pnpm verify
uv run python scripts/verify.py
```

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Backend file under app data dir + `TOVA_DATA_DIR` | Task 1â€“2 |
| Cap 20 / record on open | Task 1â€“2 |
| `GET /api/projects/recent` | Task 2 |
| Self-heal on failed missing open | Task 2 |
| Shared list, 5 + View more / Show less | Task 3 |
| Both empty states | Task 4 |
| Mount explorer with no project | Task 4 |
| Invalidate after dialog open | Task 4 |
| Clean compact styling | Task 5 |
| Hide when empty | Task 3 |
| Error copy | Task 3 |

## Placeholder scan

No TBD/TODO placeholders. Commit steps omitted per user preference (commit only when asked).
