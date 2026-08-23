# TOVA Event Protocol

## Envelope

Every persisted and broadcast event uses this versioned shape:

```json
{
  "version": "1.0",
  "event_id": "evt_000042",
  "event_type": "staff.action.started",
  "timestamp": "2026-07-23T18:00:00Z",
  "project_id": "project_123",
  "mission_id": "mission_456",
  "staff_id": "staff_maya",
  "sequence": 42,
  "payload": {}
}
```

`sequence` is strictly increasing within a mission. Events are persisted before broadcast. Unknown additive payload fields are tolerated within a compatible protocol version. Unknown event types fail backend `Literal` or frontend `z.enum` validation and are neither persisted nor reduced.

## Event families

- Mission: `mission.created`, `mission.submitted`, `mission.analysis.started`, `mission.analysis.updated`, `mission.plan.proposed`, `mission.plan.accepted`, `mission.plan.regenerating`, `mission.plan.denied`, `mission.team.assembly.started`, `mission.team.member.selected`, `mission.team.assembly.completed`, `mission.started`, `mission.paused`, `mission.resumed`, `mission.blocked`, `mission.completed`, `mission.failed`, `mission.cancelled`.
- Model: `model.connection.changed`, `model.request.started`, `model.request.completed`, `model.request.failed`.
- Staff: `staff.assigned`, `staff.status.changed`, `staff.action.started`, `staff.action.updated`, `staff.action.completed`, `staff.file.opened`, `staff.file.read`, `staff.file.created`, `staff.file.updated`, `staff.file.saved`, `staff.file.deleted`, `staff.command.started`, `staff.command.output`, `staff.command.completed`, `staff.research.started`, `staff.research.result`, `staff.decision.recorded`, `staff.test.started`, `staff.test.result`.
- Handoff: `handoff.preparing`, `handoff.started`, `handoff.accepted`, `handoff.completed`.
- Approval: `approval.requested`, `approval.accepted`, `approval.rejected`.
- Artifact and activity: `artifact.created`, `artifact.updated`, `activity.created`.

## Common payload fields

Payloads may include:

- `title`, `summary`, `status`, `severity`
- `file_path`, `line_start`, `line_end`
- `tool_name`, `command`, `resource_url`
- `progress_percent`, `phase`
- `from_staff_id`, `to_staff_id`, `handoff_id`
- `artifact_id`, `artifact_type`, `artifact_count`
- `team_id`, `roles`, `changed_paths`, `test_instructions`, `acceptance_criteria`, `artifact_ids`
- `decision_summary`, `observations`, `next_action`

Payloads must not contain provider credentials, hidden reasoning, unrestricted command input, raw command output, or unredacted secrets.

## Reconnect and replay

Committed events after a known sequence are available over HTTP:

```text
GET /api/missions/{mission_id}/events?after_sequence=N
```

The live client connects to:

```text
WS /api/ws/missions/{mission_id}?after_sequence=N
```

The WebSocket server sends all missed appended events in order, then streams new events. It suppresses queued events at or below the last sequence sent. The frontend validates envelopes and advances its sequence cursor only for newer events. Reconnect replay is event-store replay, not generated playback. The current event store writes versioned JSONL under the TOVA data directory so HTTP and WebSocket replay survive an API process restart. Running missions are reconstructed as paused. If the client cannot recover a mission after restart, the UI shows an explicit recovery message instead of failing silently.

Pause waits between agent iterations; an in-flight model HTTP request is not aborted. Command execution is approval-gated and project-root contained; TOVA does not provide an OS network jail.

## Projection rules

- Mission status and progress change only from mission events.
- `mission.plan.proposed` creates an approval gate. `mission.started`, team assembly, and staff assignment events are emitted only after `mission.plan.accepted`. `mission.plan.denied` clears pending plan review state and ends the mission as cancelled.
- `mission.team.member.selected` records each selected execution staff member before `staff.assigned`.
- Staff status changes from assignment and status events.
- `staff.file.opened` updates the active file and editor owner.
- Live repository tools emit `staff.file.opened|created|updated` with `file_path` and a human-readable `title` (no file body).
- Activity rows are produced from operational events with a human-readable title.
- `artifact.created` appends a typed artifact.
- `handoff.started` creates the active overlay and may include changed paths, test instructions, and acceptance criteria; accepted/completed events advance it.
- Replay from an empty projection must produce the same visible state as live reduction.

## Mission controls and heartbeat

The supported control set is **pause**, **resume**, **cancel**, and **heartbeat**. Pause, resume, and cancel are currently sent through schema-validated HTTP endpoints:

```text
POST /api/missions/{mission_id}/pause
POST /api/missions/{mission_id}/resume
POST /api/missions/{mission_id}/cancel
```

The mission WebSocket is a server-to-client event stream. Heartbeat is transport-level WebSocket ping/pong rather than an application mission-state mutation. Cancellation records a terminal `mission.cancelled` event. Pause, resume, and cancel take effect between agent iterations; they do not abort an in-flight model HTTP request.
