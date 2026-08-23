### Task 4: Remove playback semantics and align frontend runtime health

**Files:**
- Modify: `apps/web/src/features/models/model-api.ts`
- Modify: `apps/web/src/components/system/ModelRuntimeDialog.tsx`
- Modify: `apps/web/src/components/system/ConnectionBadge.tsx`
- Modify: `apps/web/src/components/shell/TopBar.tsx`
- Modify: `apps/web/src/components/mission/MissionControlBar.tsx`
- Modify: `apps/web/src/components/mission/MissionComposer.tsx`
- Modify: `apps/web/src/stores/ui-store.ts`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/tests/mission-interactions.test.tsx`
- Create: `apps/web/tests/runtime-status.test.ts`

**Interfaces:**

```ts
export type RuntimeState = "unconfigured" | "connected" | "unavailable"

export interface RuntimeStatus {
  state: RuntimeState
  provider: "lm-studio"
  selectedProfileId: string | null
  selectedModel: string | null
  errorCode: string | null
  error: string | null
}
```

`MissionControlBar` receives `playing`, `paused`, `completed`, `onPause`, `onResume`, and `onCancel`. It has no speed or restart props.

- [ ] **Step 1: Write failing runtime mapping and controls tests**

Test `getRuntimeStatus` response mapping for all three states. Update component tests to assert:

```ts
expect(screen.queryByRole("combobox", { name: "Playback speed" })).not.toBeInTheDocument()
expect(screen.queryByLabelText("Restart demo")).not.toBeInTheDocument()
expect(screen.getByRole("button", { name: "Cancel mission" })).toBeInTheDocument()
```

- [ ] **Step 2: Run focused frontend tests and confirm RED**

```powershell
pnpm --filter @tova/web exec vitest run tests/runtime-status.test.ts tests/mission-interactions.test.tsx
```

- [ ] **Step 3: Replace model API types**

Map snake-case API fields to the `RuntimeStatus` interface. `connected` is derived only from `state === "connected"`; do not derive it from HTTP query success.

- [ ] **Step 4: Update runtime UI**

- TopBar connected indicator: selected model only when state is Connected.
- Unconfigured label: `"Configure local model"`.
- Unavailable label: selected model plus `" unavailable"` or the safe backend error.
- Model dialog: show the three states; remove `"deterministic simulation"`.
- Composer: enable Start only for Connected with project/profile/model.

- [ ] **Step 5: Replace playback controls**

Use:

```tsx
<section className="mission-controls" aria-label="Mission controls">
  {/* existing mission title */}
  <div>
    {!completed && (
      <Button onClick={paused || !playing ? onResume : onPause}>
        {paused || !playing ? "Resume" : "Pause"}
      </Button>
    )}
    <Button variant="outline" onClick={onCancel} disabled={completed}>
      Cancel mission
    </Button>
  </div>
</section>
```

Remove playback fields/actions from Zustand and App.

- [ ] **Step 6: Run tests, typecheck, and lint**

```powershell
pnpm --filter @tova/web test
pnpm --filter @tova/web typecheck
pnpm --filter @tova/web lint
```

Expected: all pass.

## Context from backend tasks

`GET /api/runtime/status` now returns `state`, `provider`, optional `selected_profile_id`, optional `selected_model`, optional `error_code`, optional `error`, and `version`. Mission create records no longer include `runtime_mode`; `model_profile_id` and `model` are required. Synchronize frontend mission API types and create requests where needed to keep contracts aligned.

## Global constraints

- Production UI must contain no playback speed, replay, restart demo, deterministic simulation, or fake-provider semantics.
- Runtime connectivity is true only when the backend state is exactly `connected`.
- Mission Start requires a project and a selected, connected local profile/model.
- TanStack Query owns server state; Zustand owns ephemeral interface state.
- Keep UI neutral, compact, professional, and accessible.
- Write behavior tests before implementation and capture RED/GREEN evidence.
- No Git repository exists; do not attempt commits.
