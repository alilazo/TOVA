### Task 4: Verification and Impeccable Detector

**Files:**
- No production edits expected unless verification fails

**Interfaces:**
- Consumes all prior tasks
- Produces verification evidence and detector output

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx tests/app-staff-directory.test.tsx tests/app-panel-transition.test.tsx tests/navigation-rail.test.tsx tests/core-components.test.tsx tests/staff-profile-dialog.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
pnpm verify
```

Expected: PASS.

- [ ] **Step 3: Run full workspace verification**

Run:

```bash
uv run python scripts/verify.py
```

Expected: PASS. If this fails in untouched backend checks, report the exact failure and run the focused frontend verification as the minimum evidence.

- [ ] **Step 4: Run Impeccable detector on changed UI targets**

Run:

```bash
node C:\Users\lazoa\.agents\skills\impeccable\scripts\detect.mjs --json apps/web/src/components/staff/StaffDirectoryScreen.tsx apps/web/src/styles/globals.css apps/web/src/app/App.tsx
```

Expected: no blocking findings. Fix any findings that conflict with TOVA constraints or the approved design; if the detector asks for a product/design init, report it as a follow-up because this task preserved the incumbent visual system.

- [ ] **Step 5: Manual smoke**

With the dev server running:

1. Open `http://127.0.0.1:5173`
2. Click `HiPo Staff`
3. Confirm the main screen switches to the badge directory
4. Confirm the right Engineering Team rail is hidden
5. Search for a name and role
6. Click a badge and confirm `StaffProfileDialog` opens
7. Confirm hover lift/shadow feels subtle

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Dedicated main workspace | Task 2 |
| Hide right Engineering Team rail | Task 2 |
| Search by name/role/department/tags/description | Task 1 |
| Badge card with PixelAvatar, role, description | Task 1 + Task 3 |
| Click badge opens StaffProfileDialog | Task 1 |
| First-open badge drop animation | Task 1 |
| Reduced motion support | Task 1 |
| Compact neutral ID-badge styling | Task 3 |
| Staff tab available without project | Task 2 |
| Focused and full verification | Task 4 |

## Placeholder Scan

No `TODO`, `TBD`, or undefined implementation placeholders. Commit steps are intentionally omitted because this workspace is not a git repository.
