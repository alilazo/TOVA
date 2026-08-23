### Task 7: Workspace verification

**Files:** none new — verify integration

- [ ] **Step 1: Run API suite focused on approvals/tools/agents**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_tools.py tests/test_approval_kinds.py tests/test_file_delete_approvals.py tests/test_repository_delete_agent.py tests/test_command_approvals.py tests/test_agent_runtime.py -v
```

Expected: PASS

- [ ] **Step 2: Run web verify subset**

```bash
pnpm --filter @tova/web exec vitest run tests/mission-event-reducer.test.ts tests/work-log-projection.test.ts tests/command-approval-dialog.test.tsx
```

Expected: PASS

- [ ] **Step 3: Optional full verify if deps installed**

```bash
pnpm verify
```

and/or

```bash
uv run python scripts/verify.py
```

from repo root. Do not claim full-workspace green without this evidence.

- [ ] **Step 4: Manual smoke (when API + web are running)**

1. Open a project with `hello.html`
2. Mission: “Delete hello.html”
3. Confirm modal: **`{Name} wants to delete `hello.html``**
4. Approve → file gone from explorer; Reject → file remains

---
