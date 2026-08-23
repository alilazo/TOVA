# Live-Only Runtime Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove production simulation behavior and make TOVA use only a selected, reachable LM Studio model, real projects, Markdown-backed staff, and persisted live mission events.

**Architecture:** FastAPI exposes truthful runtime health, validates the selected provider before mission creation, and serves safe staff metadata from `HiPo-Staff`. React consumes those APIs through TanStack Query, projects Work Logs from live events, and retains only real pause/resume/cancel controls. Dead demo paths and misleading canonical documentation are removed after consumers migrate.

**Tech Stack:** Python 3.13, FastAPI, Pydantic, httpx, pytest, React 19, strict TypeScript, TanStack Query, Zustand, Vitest, Playwright, LM Studio OpenAI-compatible API.

## Global Constraints

- There is no simulated production runtime and no fallback fake provider.
- Mission creation and execution require a selected, reachable local model.
- `HiPo-Staff/staff/*.md` is the staff source of truth.
- Mission events are the source of truth for operational state.
- Event replay remains for reconnect and recovery; it is not playback or simulation.
- Test fakes and mocks remain isolated to test code.
- TOVA remains neutral, compact, and professional.
- Persist events before broadcasting.
- Never expose credentials, provider tokens, private reasoning, or unrestricted filesystem data.
- Write behavior tests before implementation and run them red-green.
- The workspace currently has no Git metadata; do not create commits unless Git is initialized by the user.

---

## File map

### Backend

- `apps/api/app/api/model_profiles.py` — truthful runtime health contract.
- `apps/api/app/services/model_profiles.py` — selected-profile resolution and lightweight health checks.
- `apps/api/app/schemas/missions.py` — required live model fields; no runtime mode.
- `apps/api/app/services/missions.py` — mission records with no mode discriminator.
- `apps/api/app/api/missions.py` — reject invalid/unavailable models before mission persistence.
- `apps/api/app/main.py` — unconditional live launcher and staff router wiring.
- `apps/api/app/schemas/staff.py` — explicit safe staff metadata.
- `apps/api/app/api/staff.py` — read-only `/api/staff`.
- `apps/api/app/providers/base.py` — provider protocol only; remove production fake.

### Frontend

- `apps/web/src/features/models/model-api.ts` — `unconfigured | connected | unavailable`.
- `apps/web/src/components/system/ModelRuntimeDialog.tsx` — truthful local-model state.
- `apps/web/src/components/system/ConnectionBadge.tsx` and `TopBar.tsx` — distinguish API/runtime health.
- `apps/web/src/components/mission/MissionControlBar.tsx` — pause/resume/cancel only.
- `apps/web/src/stores/ui-store.ts` — remove playback speed.
- `apps/web/src/features/staff/staff-api.ts` — fetch and map `/api/staff`.
- `apps/web/src/app/App.tsx` — query staff, pass roster, remove fixture/work-log/playback wiring.
- Staff-consuming components — accept the queried roster through props.
- `apps/web/src/features/mission/work-log-projection.ts` — pure event-to-WorkLog projection.
- `apps/web/src/features/mission/mission-event-reducer.ts` — store event-derived work logs and remove unused progress projection.
- `apps/web/src/components/work-log/WorkLogDrawer.tsx` — honest empty sections and errors.
- `apps/web/src/components/handoff/HandoffOverlay.tsx` — local Dismiss action.
- `apps/web/src/components/shell/WorkspaceSidebar.tsx` — honest empty states.

### Deletions

- `apps/web/src/features/mission/use-demo-runtime.ts`
- `apps/web/src/features/mission/demo-events.ts`
- `apps/web/src/features/repository/repository-fixtures.ts`
- `scripts/seed_demo.py`

---

### Task 1: Truthful live runtime health

**Files:**
- Modify: `apps/api/app/api/model_profiles.py`
- Modify: `apps/api/app/services/model_profiles.py`
- Modify: `apps/api/tests/test_contracts.py`
- Modify: `apps/api/tests/test_model_profile_api.py`

**Interfaces:**

```python
class RuntimeStatus(BaseModel):
    state: Literal["unconfigured", "connected", "unavailable"]
    provider: Literal["lm-studio"]
    version: str
    selected_profile_id: str | None = None
    selected_model: str | None = None
    error_code: str | None = None
    error: str | None = None

async def ModelProfileRegistry.runtime_health() -> RuntimeHealth: ...
async def ModelProfileRegistry.require_selected_available(
    profile_id: str,
    model: str,
) -> tuple[OpenAICompatibleProvider, str]: ...
```

`RuntimeHealth` is a service-layer Pydantic model or typed dataclass with the same state/model/error fields except API version.

- [ ] **Step 1: Replace the simulated contract test with an unconfigured test**

```python
@pytest.mark.asyncio
async def test_runtime_status_reports_unconfigured_without_selection() -> None:
    registry = ModelProfileRegistry()
    app.dependency_overrides[get_model_registry] = lambda: registry
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/runtime/status")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "state": "unconfigured",
        "provider": "lm-studio",
        "version": "0.1.0",
    }
```

- [ ] **Step 2: Add connected and unavailable API tests**

Use `registry_with_transport` with one handler returning `{"data": [{"id": "qwen-local"}]}` and another raising `httpx.ConnectError`. Discover/select first, then assert:

```python
assert connected.json()["state"] == "connected"
assert connected.json()["selected_model"] == "qwen-local"
assert unavailable.json()["state"] == "unavailable"
assert unavailable.json()["error_code"] == "disconnected"
```

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```powershell
uv run --directory apps/api pytest tests/test_contracts.py tests/test_model_profile_api.py -v
```

Expected: failures reference the old `simulated` response and missing `state`.

- [ ] **Step 4: Implement the service health model**

In `services/model_profiles.py`, add:

```python
class RuntimeHealth(BaseModel):
    state: Literal["unconfigured", "connected", "unavailable"]
    selected_profile_id: str | None = None
    selected_model: str | None = None
    error_code: str | None = None
    error: str | None = None

async def runtime_health(self) -> RuntimeHealth:
    selection = self.selection
    if selection is None:
        return RuntimeHealth(state="unconfigured")
    result = await self.test(selection.profile_id, selection.model)
    if result.connected:
        return RuntimeHealth(
            state="connected",
            selected_profile_id=selection.profile_id,
            selected_model=selection.model,
        )
    return RuntimeHealth(
        state="unavailable",
        selected_profile_id=selection.profile_id,
        selected_model=selection.model,
        error_code=result.error_code,
        error=result.error,
    )

async def require_selected_available(
    self,
    profile_id: str,
    model: str,
) -> tuple[OpenAICompatibleProvider, str]:
    if self.selection != ModelSelection(profile_id=profile_id, model=model):
        raise RuntimeError("Mission model must match the selected local model")
    provider, selected_model = self.resolve(profile_id, model)
    health = await provider.test_connection(selected_model)
    if not health.connected:
        raise ProviderError(
            ProviderErrorCode(health.error_code or "model_unavailable"),
            health.error or "Selected local model is unavailable",
        )
    return provider, selected_model
```

- [ ] **Step 5: Replace the API response**

`GET /api/runtime/status` calls `await registry.runtime_health()` and returns `provider="lm-studio"` with `response_model_exclude_none=True`. Remove `runtime="simulated"` and `fake-openai-compatible`.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run the Step 3 command. Expected: all selected tests pass with no warnings introduced.

---

### Task 2: Validate the live model before mission persistence

**Files:**
- Modify: `apps/api/app/schemas/missions.py`
- Modify: `apps/api/app/services/missions.py`
- Modify: `apps/api/app/api/missions.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/tests/test_mission_project_binding.py`
- Modify: `apps/api/tests/test_mission_transport.py`
- Modify: `apps/api/tests/test_agent_runtime.py`

**Interfaces:**

```python
class MissionCreateRequest(BaseModel):
    objective: str
    model_profile_id: str
    model: str

class MissionRecord(BaseModel):
    id: str
    project_id: str
    objective: str
    project_root: str
    model_profile_id: str
    model: str
    status: MissionStatus
```

`runtime_mode` is removed.

- [ ] **Step 1: Add failing mission validation tests**

Set up a real `ModelProfileRegistry` with `MockTransport`, discover and select `qwen-local`, and assert:

```python
missing = await client.post(
    f"/api/projects/{project.id}/missions",
    json={"objective": "Build something"},
)
assert missing.status_code == 422

created = await client.post(
    f"/api/projects/{project.id}/missions",
    json={
        "objective": "Build something",
        "model_profile_id": profile_id,
        "model": "qwen-local",
    },
)
assert created.status_code == 200
assert "runtime_mode" not in created.json()
```

Add an unavailable transport case and assert `503` with a typed detail containing `code` and `message`. Confirm no mission record/event was created.

- [ ] **Step 2: Run focused tests and confirm RED**

```powershell
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py -v
```

Expected: required model validation and missing `runtime_mode` assertions fail.

- [ ] **Step 3: Make model fields required and remove runtime mode**

Apply the interfaces above. Update test factories to always pass:

```python
MissionCreateRequest(
    objective="Create result",
    model_profile_id="profile_test",
    model="fake-test-model",
)
```

Tests that instantiate `MissionRegistry` directly may use deterministic test identifiers without a provider because API validation is outside the registry.

- [ ] **Step 4: Validate model health in the mission API**

Add `Models = Annotated[ModelProfileRegistry, Depends(get_model_registry)]` and:

```python
try:
    await models.require_selected_available(
        request.model_profile_id,
        request.model,
    )
except KeyError as exc:
    raise HTTPException(
        status_code=422,
        detail={"code": "invalid_model_selection", "message": str(exc)},
    ) from exc
except RuntimeError as exc:
    raise HTTPException(
        status_code=422,
        detail={"code": "selection_mismatch", "message": str(exc)},
    ) from exc
except ProviderError as exc:
    raise HTTPException(
        status_code=503,
        detail={
            "code": exc.code.value,
            "message": str(exc),
        },
    ) from exc
```

Only call `registry.create(...)` after this succeeds.

- [ ] **Step 5: Make the launcher unconditionally live**

Remove:

```python
if mission.runtime_mode != "live":
    return
```

Resolve the required mission profile/model directly.

- [ ] **Step 6: Run backend mission/runtime tests**

```powershell
uv run --directory apps/api pytest tests/test_mission_project_binding.py tests/test_mission_transport.py tests/test_agent_runtime.py -v
```

Expected: all pass.

---

### Task 3: Serve safe Markdown-backed staff profiles

**Files:**
- Modify: `apps/api/app/schemas/staff.py`
- Create: `apps/api/app/api/staff.py`
- Modify: `apps/api/app/main.py`
- Create: `apps/api/tests/test_staff_api.py`

**Interfaces:**

```python
class StaffProfileView(BaseModel):
    id: str
    employee_id: str
    slug: str
    name: str
    display_name: str
    role: str
    role_key: str
    department: str
    seniority: str
    avatar: str
    status: str
    description: str
    model_profile: str
    tools: list[str]
    can_delegate: bool
    can_approve: bool
    tags: list[str]
```

The API does not expose `sections`, `permissions`, `source_path`, temperature, context limits, credentials, or prompt text.

- [ ] **Step 1: Write failing staff API tests**

```python
@pytest.mark.asyncio
async def test_staff_api_returns_safe_markdown_metadata() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/staff")

    assert response.status_code == 200
    staff = response.json()
    assert len(staff) == 7
    alex = next(item for item in staff if item["id"] == "staff_alex")
    assert alex["display_name"] == "Alex"
    assert alex["role_key"] == "project_coordinator"
    assert "sections" not in alex
    assert "permissions" not in alex
    assert "source_path" not in alex
```

- [ ] **Step 2: Run and confirm RED**

```powershell
uv run --directory apps/api pytest tests/test_staff_api.py -v
```

Expected: `404 Not Found`.

- [ ] **Step 3: Define explicit staff fields**

Add the metadata fields to `StaffProfileDocument` so frontmatter is validated rather than hidden in `model_extra`. Add:

```python
def to_view(self) -> StaffProfileView:
    return StaffProfileView.model_validate(
        self.model_dump(include=set(StaffProfileView.model_fields))
    )
```

- [ ] **Step 4: Add and wire the router**

```python
router = APIRouter(prefix="/api")
STAFF_ROOT = Path(__file__).resolve().parents[4] / "HiPo-Staff" / "staff"

@router.get("/staff", response_model=list[StaffProfileView])
async def list_staff() -> list[StaffProfileView]:
    return [
        profile.to_view()
        for profile in StaffProfileRepository(STAFF_ROOT).load_all()
    ]
```

Catch `StaffProfileError` and return HTTP 500 with `"Staff profiles are unavailable"` without leaking file contents.

- [ ] **Step 5: Run staff and existing profile tests**

```powershell
uv run --directory apps/api pytest tests/test_staff_api.py tests/test_staff_profiles.py -v
```

Expected: all pass.

---

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

---

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

---

### Task 6: Project Work Logs exclusively from live events

**Files:**
- Create: `apps/web/src/features/mission/work-log-projection.ts`
- Modify: `apps/web/src/features/mission/mission-event-reducer.ts`
- Modify: `apps/web/src/types/events.ts`
- Modify: `apps/web/src/types/domain.ts`
- Modify: `apps/web/src/components/work-log/WorkLogDrawer.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Create: `apps/web/tests/work-log-projection.test.ts`
- Modify: `apps/web/tests/mission-event-reducer.test.ts`
- Modify: `apps/web/tests/mission-interactions.test.tsx`

**Interfaces:**

```ts
export interface WorkLog {
  currentAction: string | null
  objective: string | null
  inputs: string[]
  toolActivity: string[]
  observations: string[]
  decisionSummary: string | null
  output: string[]
  nextAction: string | null
  errors: string[]
}

export function createEmptyWorkLog(): WorkLog
export function reduceStaffWorkLog(
  current: WorkLog,
  event: EventEnvelope,
): WorkLog
```

`MissionProjection` gains `workLogs: Record<string, WorkLog>` and removes unused `phase` and `progress`.

- [ ] **Step 1: Write failing projection tests**

Build a sequence containing `staff.assigned`, `staff.action.updated`, `staff.file.created`, `artifact.created`, `staff.decision.recorded`, and `model.request.failed`. Assert:

```ts
expect(log.objective).toBe("Implement live runtime")
expect(log.currentAction).toBe("Wrote src/runtime.ts")
expect(log.toolActivity).toContain("repository.write")
expect(log.output).toContain("src/runtime.ts")
expect(log.output).toContain("Runtime report")
expect(log.decisionSummary).toBe("Use live provider only")
expect(log.errors).toContain("staff iteration failed")
```

Also assert a fresh log contains only null/empty values and no fabricated text.

- [ ] **Step 2: Run and confirm RED**

```powershell
pnpm --filter @tova/web exec vitest run tests/work-log-projection.test.ts tests/mission-event-reducer.test.ts
```

- [ ] **Step 3: Implement the pure reducer**

Use event type and safe payload fields only. Deduplicate arrays while preserving event order. Never infer observations or decisions that are absent.

Add typed optional `tool` and `error` fields to `eventPayloadSchema`. For `staff.action.updated`, use `payload.tool` (the backend currently emits `tool`) and `payload.summary`. For file events use `payload.file_path`. For failures use `payload.error ?? payload.summary ?? event.event_type`.

- [ ] **Step 4: Integrate into mission projection**

When `event.staff_id` exists:

```ts
workLogs: {
  ...next.workLogs,
  [event.staff_id]: reduceStaffWorkLog(
    next.workLogs[event.staff_id] ?? createEmptyWorkLog(),
    event,
  ),
},
```

Remove progress constants and phase/progress writes because no production UI consumes probabilistic completion.

- [ ] **Step 5: Make Work Log render honest empty values**

Accept `log?: WorkLog`. Use `"No live activity recorded."` for empty scalar sections and an empty-state paragraph for empty arrays. Add an Errors section only when errors exist.

- [ ] **Step 6: Pass projected logs from App**

```tsx
<WorkLogDrawer
  open={workLogOpen}
  staff={selectedStaff}
  log={liveRuntime.projection.workLogs[selectedStaff.id]}
  onOpenChange={setWorkLogOpen}
/>
```

Do not import `workLogs` fixtures.

- [ ] **Step 7: Run frontend checks**

Run frontend test, typecheck, and lint commands from Task 5. Expected: all pass.

---

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

---

### Task 8: Synchronize canonical documentation and contracts

**Files:**
- Modify: `README.md`
- Modify: `docs/PRODUCT_SPEC.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/EVENT_PROTOCOL.md`
- Modify: `docs/PLANS.md`
- Modify: `apps/web/AGENTS.md`
- Modify: `.env.example` if current live model defaults are incomplete

- [ ] **Step 1: Rewrite canonical product/runtime descriptions**

Document:

- selected LM Studio model is required,
- runtime states are Unconfigured/Connected/Unavailable,
- real path-based projects,
- Markdown-backed staff,
- event-derived Work Logs,
- pause/resume/cancel,
- persisted reconnect replay,
- command approvals and filesystem containment.

Remove current support claims for deterministic simulation, Orion fixtures, virtual repository, seeded mission replay, and playback speed.

- [ ] **Step 2: Update the event protocol**

Keep reconnect replay. Remove the claim that WebSocket controls include playback speed. Supported controls are pause, resume, cancel, and heartbeat.

- [ ] **Step 3: Audit canonical docs**

```powershell
rg -i "simulation|simulated|seeded mission|orion platform|virtual repository|playback speed|fake provider" README.md docs/PRODUCT_SPEC.md docs/ARCHITECTURE.md docs/SECURITY.md docs/EVENT_PROTOCOL.md docs/PLANS.md apps/web/AGENTS.md
```

Expected: no claims that TOVA supports production simulation. Historical files under `docs/superpowers/` are excluded.

---

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

## Spec coverage

| Requirement | Tasks |
|---|---|
| No simulated runtime/fallback | 1, 2, 7 |
| Selected reachable model required | 1, 2, 4 |
| Real LM Studio used end to end | 2, 9 |
| Markdown staff source of truth | 3, 5 |
| Event-derived Work Logs | 6 |
| Pause/resume/cancel only | 4 |
| Replay retained for recovery | 8 |
| Honest empty panels/handoff dismissal | 6, 7 |
| Dead demo code removed | 7 |
| Contracts synchronized | 1–6, 8 |
| Canonical docs live-only | 8 |
| Full automated and live verification | 9 |
