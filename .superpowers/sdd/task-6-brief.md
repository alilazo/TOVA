### Task 6: Verification

**Files:** none new (run commands)

- [ ] **Step 1: Backend suite**

Run: `uv run --directory apps/api pytest tests/test_agent_runtime.py tests/test_projects_api.py -v`

Expected: PASS

- [ ] **Step 2: Full workspace verify**

Run: `uv run python scripts/verify.py`

Expected: PASS (frontend lint/typecheck/test/build + backend ruff/mypy/pytest)

- [ ] **Step 3: Manual live smoke (when LM Studio available)**

1. Open/create a blank temp project
2. Start a short live mission that writes a file
3. Switch to Team Floor
4. Confirm: path badge appears, content typewriter-reveals, explorer tree invalidates, second write switches focus and aborts prior reveal

- [ ] **Step 4: E2E (optional)**

If adding an assertion without LM Studio, keep existing open-project e2e and add only a static check that Team Floor region contains `Live code stage` / idle copy after navigating to Team Floor â€” no live write required.

Run: `pnpm --filter @tova/web test:e2e`

Expected: PASS

---


