### Task 5: Replace frontend staff fixtures with `/api/staff`

**Files:**
- Create: `apps/web/src/features/staff/staff-api.ts`
- Modify: `apps/web/src/types/domain.ts`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/components/activity/ActivityFeed.tsx`
- Modify: `apps/web/src/components/activity/ActivityFeedRow.tsx`
- Modify: `apps/web/src/components/editor/CodeWorkspace.tsx`
- Modify: `apps/web/src/components/team-floor/TeamFloor.tsx`
- Modify: `apps/web/src/components/team-floor/TeamFloorLiveEditor.tsx`
- Modify: `apps/web/src/components/handoff/HandoffOverlay.tsx`
- Modify: staff component tests
- Create: `apps/web/tests/staff-api.test.ts`

**Interfaces:**

```ts
export function getStaffProfiles(): Promise<StaffProfile[]>
```

The mapping converts API snake case to the existing domain camel case and normalizes avatar values such as `pixel/alex` to `alex` for `PixelAvatar`.

Each staff-dependent component receives `staff: StaffProfile[]` or a single resolved `staff` profile through props. No component imports a global roster.

- [ ] **Step 1: Write failing API mapping tests**

Mock `apiRequest` and assert all identity, role, permission, tool, and tag fields map correctly. Assert `avatar: "pixel/alex"` becomes `"alex"`.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm --filter @tova/web exec vitest run tests/staff-api.test.ts
```

- [ ] **Step 3: Implement `getStaffProfiles`**

```ts
export function getStaffProfiles() {
  return apiRequest<StaffProfileResponse[]>("/api/staff").then((rows) =>
    rows.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      slug: row.slug,
      name: row.name,
      displayName: row.display_name,
      role: row.role,
      roleKey: row.role_key,
      department: row.department,
      seniority: row.seniority,
      avatar: row.avatar.replace(/^pixel\//, ""),
      description: row.description,
      status: row.status as StaffStatus,
      modelProfile: row.model_profile,
      tools: row.tools,
      canDelegate: row.can_delegate,
      canApprove: row.can_approve,
      tags: row.tags,
    })),
  )
}
```

- [ ] **Step 4: Query once in App**

Use TanStack Query:

```ts
const staff = useQuery({
  queryKey: ["staff"],
  queryFn: getStaffProfiles,
  staleTime: 60_000,
})
const roster = staff.data ?? []
```

Pass `roster` to every consumer. Show loading/error states in Engineering Team rather than falling back to fixtures.

- [ ] **Step 5: Remove direct fixture imports**

Update component props and tests. Verify:

```powershell
rg "staff-fixtures" apps/web/src
```

Expected: no production matches.

- [ ] **Step 6: Run frontend tests and checks**

```powershell
pnpm --filter @tova/web test
pnpm --filter @tova/web typecheck
pnpm --filter @tova/web lint
```

Expected: all pass.

## Context from Task 3

`GET /api/staff` returns exactly the safe view fields named in Task 3. It is the sole production roster source. There are seven profiles. Do not add a fixture fallback.

## Global constraints

- `/api/staff` is the sole production staff metadata source.
- No production component imports static staff fixtures.
- Query staff once in App via TanStack Query and pass data through props.
- Engineering Team must show truthful loading/error states, never fixture fallback.
- Zustand remains limited to ephemeral interface state.
- Keep UI neutral, compact, professional, and accessible.
- Write behavior tests before implementation and capture RED/GREEN evidence.
- No Git repository exists; do not attempt commits.
