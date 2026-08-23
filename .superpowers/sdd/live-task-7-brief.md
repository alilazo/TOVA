### Task 7: Handoff dismissal, honest empty panels, and dead simulation deletion

**Files:**
- Modify: `apps/web/src/components/handoff/HandoffOverlay.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/components/shell/WorkspaceSidebar.tsx`
- Delete: `apps/web/src/features/mission/use-demo-runtime.ts`
- Delete: `apps/web/src/features/mission/demo-events.ts`
- Delete: `apps/web/src/features/repository/repository-fixtures.ts`
- Delete: `scripts/seed_demo.py`
- Modify: `apps/api/app/providers/base.py`
- Delete after migration: `apps/web/src/features/staff/staff-fixtures.ts`
- Modify: tests referencing deleted fixtures

**Interfaces:**

`HandoffOverlay` prop changes from `onSkip` to `onDismiss`. Dismissal is local UI state and does not emit a backend control.

- [ ] **Step 1: Update interaction tests first**

Assert the dialog has `Dismiss` and no `Skip handoff`. Add a source audit test or verification command ensuring production paths do not contain simulation terms.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
pnpm --filter @tova/web exec vitest run tests/mission-interactions.test.tsx
```

- [ ] **Step 3: Implement local handoff dismissal**

In App:

```ts
const [dismissedHandoffId, setDismissedHandoffId] = useState<string | null>(null)
const visibleHandoff =
  liveRuntime.projection.activeHandoff?.id === dismissedHandoffId
    ? null
    : liveRuntime.projection.activeHandoff
```

Pass `visibleHandoff` and `onDismiss={() => setDismissedHandoffId(visibleHandoff?.id ?? null)}`. A new handoff ID appears normally.

- [ ] **Step 4: Replace sidebar fixtures with truthful states**

Search panel: show the search input and `"Search results will appear here."` until real results exist.

Missions panel: show `"No mission history is available in this session."` unless backed by real mission data.

Staff panel: show roster-derived counts passed from App, not hard-coded counts.

Settings panel: show selected LM Studio state/provider, not simulated runtime.

- [ ] **Step 5: Delete dead production simulation files**

Delete the listed files and remove `FakeModelProvider` while retaining `ModelProvider` protocol in `providers/base.py`.

- [ ] **Step 6: Audit production sources**

```powershell
rg -i "simulation|simulated|restart demo|playback speed|virtual repository|project_orion|evt_demo" apps/api/app apps/web/src scripts
```

Expected: no production simulation matches. Legitimate words such as CSS animation are outside the query.

- [ ] **Step 7: Run frontend/backend focused suites**

```powershell
pnpm --filter @tova/web test
uv run --directory apps/api pytest tests/test_contracts.py tests/test_model_profile_api.py tests/test_mission_project_binding.py tests/test_staff_api.py -v
```

Expected: all pass.

## Context from prior tasks

- App already queries staff once and has truthful runtime state.
- Work Logs are now live-event projections, so `staff-fixtures.ts` and all static roster/log content can be deleted.
- `use-demo-runtime.ts` is unused; it was retained only to keep earlier intermediate tasks compiling.

## Global constraints

- No production simulation, replay, fake-provider, demo-event, virtual repository, seeded demo, or static staff fixture path remains.
- Handoff dismissal is local UI state and emits no backend command.
- Empty panels must state what real data is currently absent; never show fabricated results or counts.
- Staff counts derive from the `/api/staff` roster.
- Settings reflect truthful LM Studio runtime state/provider.
- Keep `ModelProvider` protocol and remove only fake production implementation.
- Write behavior tests before implementation and capture RED/GREEN evidence.
- No Git repository exists; do not attempt commits.
