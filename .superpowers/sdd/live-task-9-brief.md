### Task 9: Full verification and live LM Studio smoke

**Files:**
- Modify: `apps/web/tests/e2e/mission-flow.spec.ts` for live-only UI assertions that do not require LM Studio.
- Add focused tests discovered missing during verification only when they encode a requirement in this plan.

- [ ] **Step 1: Run the frontend verifier**

```powershell
pnpm verify
```

Expected: lint, typecheck, Vitest, and build pass.

- [ ] **Step 2: Run complete workspace verification**

```powershell
uv run python scripts/verify.py
```

Expected: frontend checks plus Ruff, mypy, and all backend pytest tests pass.

- [ ] **Step 3: Run Playwright**

```powershell
pnpm --filter @tova/web test:e2e
```

Verify:

- no playback or simulation UI,
- Unconfigured/Unavailable disables Start,
- staff roster comes from API,
- empty Work Log has no fabricated entries,
- open/new project still works.

- [ ] **Step 4: Run a fresh real LM Studio mission**

Preconditions:

- LM Studio is reachable at the configured URL.
- A discovered model is selected.
- A new blank temporary project is open.

Mission request:

```text
Create a small typed application with a README and tests. Use observable repository tools, request approval before commands, and finish only after verification.
```

Collect fresh API/browser evidence that:

1. runtime state is Connected with the selected model,
2. `model.request.*` events occur for coordinator and staff,
3. real `staff.assigned` events populate the team,
4. file events create/update files in the opened project,
5. Team Floor editor and Work Log reflect those events,
6. command approval blocks execution until confirmed,
7. terminal mission state is Finished, Waiting for confirmation, Blocked, Error, or Cancelled accurately.

- [ ] **Step 5: Final production audit**

```powershell
rg -i "simulation|simulated|restart demo|playback speed|virtual repository|project_orion|evt_demo" apps/api/app apps/web/src scripts
rg "staff-fixtures|use-demo-runtime|demo-events|repository-fixtures" apps/web/src
```

Expected: no matches.

## Global constraints

- Do not claim live LM Studio behavior without fresh API/browser evidence.
- Automated E2E must not depend on LM Studio being installed or available.
- E2E assertions cover no playback/simulation UI, disabled Start while unconfigured/unavailable, API roster, honest empty Work Log, and project open/create.
- Live smoke must use a fresh blank temporary project and the exact mission request above.
- Command execution must remain approval-gated.
- Final audits must report no production simulation/demo/fixture paths.
- No Git repository exists; do not attempt commits.
