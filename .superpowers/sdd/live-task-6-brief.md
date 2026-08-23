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

## Context from Task 5

The temporary `apps/web/src/features/staff/work-log-data.ts` contains identity-neutral static role summaries and must now be deleted. Staff identity passed to the drawer comes from `/api/staff`.

## Global constraints

- Work Logs are projected exclusively from persisted live mission events.
- Never fabricate observations, decisions, actions, outputs, errors, or progress.
- Use only safe typed event payload fields.
- Deduplicate arrays while preserving first-seen event order.
- No static Work Log fixtures or fallback summaries remain in production.
- Remove probabilistic phase/progress from the production projection.
- Keep event contracts versioned and frontend/backend synchronized.
- Write behavior tests before implementation and capture RED/GREEN evidence.
- No Git repository exists; do not attempt commits.
