### Task 3: Staff Directory Styling and Motion Polish

**Files:**
- Modify: `apps/web/src/styles/globals.css`
- Modify: `apps/web/tests/staff-directory-screen.test.tsx` only if class assertions are needed

**Interfaces:**
- Consumes: markup classes from `StaffDirectoryScreen`
- Produces:
  - `.staff-directory`
  - `.staff-directory__header`
  - `.staff-directory__search`
  - `.staff-directory__grid`
  - `.staff-badge-card` and children

- [ ] **Step 1: Add minimal class assertion test**

Append to `staff-directory-screen.test.tsx`:

```tsx
it("uses badge-card structure for the directory wall", () => {
  const { container } = renderWithClient(<StaffDirectoryScreen staff={staffProfiles} />)
  expect(container.querySelector(".staff-directory")).not.toBeNull()
  expect(container.querySelectorAll(".staff-badge-card")).toHaveLength(staffProfiles.length)
  expect(container.querySelector(".staff-badge-card__clip")).not.toBeNull()
  expect(container.querySelector(".staff-badge-card__name-strip")).not.toBeNull()
})
```

- [ ] **Step 2: Run test to verify it passes before CSS**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx
```

Expected: PASS if Task 1 markup is in place. If this fails, adjust markup before styling.

- [ ] **Step 3: Add CSS**

Add near existing staff/team styles in `apps/web/src/styles/globals.css`:

```css
.staff-directory {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  height: 100%;
  padding: 18px;
  gap: 14px;
  background:
    linear-gradient(#f7f7f4 0 0) padding-box;
}

.staff-directory__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
}

.staff-directory__header h1 {
  margin: 0;
  font-family: var(--font-tova);
  font-size: 22px;
  letter-spacing: 0.03em;
}

.staff-directory__header p {
  margin: 0;
  color: var(--muted-text);
}

.staff-directory__header > strong {
  flex: 0 0 auto;
  color: #3f403c;
  font-size: 12px;
  font-weight: 650;
}

.staff-directory__eyebrow {
  margin: 0 0 3px !important;
  color: var(--soft-text) !important;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.staff-directory__search {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 420px;
}

.staff-directory__search svg {
  position: absolute;
  left: 10px;
  width: 14px;
  height: 14px;
  color: var(--soft-text);
  pointer-events: none;
}

.staff-directory__search input {
  padding-left: 30px;
  background: #fff;
}

.staff-directory__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  align-content: start;
  min-height: 0;
  overflow: auto;
  gap: 18px 14px;
  padding: 8px 2px 18px;
}

.staff-directory__state {
  display: grid;
  min-height: 180px;
  place-items: center;
  margin: 0;
  color: var(--muted-text);
  font-size: 12px;
}

.staff-badge-card {
  position: relative;
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  min-height: 238px;
  padding: 18px 12px 10px;
  border: 1px solid #e3e3de;
  border-radius: 11px;
  background: #fffefa;
  color: #22231f;
  text-align: left;
  box-shadow: 0 1px 2px color-mix(in srgb, #000 5%, transparent);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.staff-badge-card::before {
  content: "";
  position: absolute;
  top: 6px;
  left: 50%;
  width: 24px;
  height: 4px;
  border-radius: 999px;
  background: #e8e8e3;
  transform: translateX(-50%);
}

.staff-badge-card:hover,
.staff-badge-card:focus-visible {
  border-color: #d2d2cc;
  box-shadow: 0 8px 22px color-mix(in srgb, #000 12%, transparent);
  transform: translateY(-2px);
}

.staff-badge-card:active {
  transform: translateY(0);
}

.staff-badge-card__clip {
  position: absolute;
  top: -11px;
  left: 50%;
  width: 10px;
  height: 18px;
  border: 2px solid #252623;
  border-bottom: 0;
  border-radius: 5px 5px 0 0;
  transform: translateX(-50%);
}

.staff-badge-card__name-strip {
  overflow: hidden;
  border-radius: 5px;
  background: #151613;
  color: white;
  padding: 4px 7px;
  font-size: 10px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.staff-badge-card__portrait {
  display: grid;
  justify-items: start;
  padding: 18px 0 12px;
}

.staff-badge-card__portrait .pixel-avatar {
  width: 58px;
  height: 58px;
  border-radius: 7px;
  background: #fbfbf8;
}

.staff-badge-card__copy {
  display: grid;
  align-content: start;
  gap: 7px;
  min-height: 0;
}

.staff-badge-card__copy strong {
  font-size: 13px;
  line-height: 1.2;
}

.staff-badge-card__copy span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--muted-text);
  font-size: 10px;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.staff-badge-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid var(--line);
  margin-top: 12px;
  padding-top: 8px;
}

.staff-badge-card__footer strong {
  font-family: var(--font-tova);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.staff-badge-card__footer span {
  border-radius: 999px;
  background: #1f201d;
  color: white;
  padding: 3px 6px;
  font-size: 9px;
  font-weight: 650;
}

@media (max-width: 900px) {
  .staff-directory {
    padding: 14px;
  }

  .staff-directory__header {
    align-items: flex-start;
    flex-direction: column;
  }
}
```

- [ ] **Step 4: Run focused visual tests**

Run:

```bash
pnpm --filter @tova/web exec vitest run tests/staff-directory-screen.test.tsx tests/app-staff-directory.test.tsx
```

Expected: PASS.

---
