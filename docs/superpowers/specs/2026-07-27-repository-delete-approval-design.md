# Repository Delete with Approval Gate

Date: 2026-07-27  
Status: Approved — plan ready at `docs/superpowers/plans/2026-07-27-repository-delete-approval.md`

## Goal

Let write-capable engineers and Ava delete project files when needed, but only after an explicit user approval modal that names the staff member and the file path (same trust model as command approvals).

## Problem

TOVA has no `repository.delete` tool. Agents with write access can only overwrite or patch, so “remove `hello.html`” often becomes an empty write that leaves the file in place.

## Decisions (approved)

- Confirmation style: **blocking modal**, same pattern as command approvals (Accept / Reject).
- Who may request delete: Ethan, Lina, Noah, and Ava.
- Ava: **`filesystem_delete` only** (no new write/patch rights).
- Engineers with write: also get `filesystem_delete`.

## Non-goals

- Recursive directory delete
- Approval for emptying a file via `repository.write` (separate concern)
- Giving Ava `filesystem_write`
- Auto-approving deletes
- Shell-only deletes as the primary path

## Behavior

### 1. New tool: `repository.delete`

- Input: `{ path: string }` (project-relative)
- Effect: unlink a single file under the allowed project root (same sandbox rules as write/read)
- Not available without `filesystem_delete: true`
- Must not delete directories in v1

### 2. Permission: `filesystem_delete`

Staff profile YAML:

| Staff | `filesystem_delete` |
|-------|---------------------|
| Ethan, Lina, Noah | `true` |
| Ava | `true` |
| Alex, Maya, Dr. Rao | `false` |

`AgentRunner` allows `repository.delete` only when this flag is true.

### 3. Approval gate

Every `repository.delete` call:

1. Creates a **pending approval** (extend the existing approval registry so requests are not command-only).
2. Emits an activity-visible signal that a delete is awaiting confirmation.
3. Blocks the agent tool turn until Accept or Reject (same async wait pattern as `command.request`).
4. On **Accept**: delete the file, mark approval executed, emit `staff.file.deleted`.
5. On **Reject**: do not delete; tool result reports rejection; mission continues.

Approval payload (conceptual):

- `kind: "file_delete"`
- `staff_id`, `staff_display_name` (or resolve name in UI from roster)
- `path`
- `purpose` (short operational reason from the model)

### 4. UI

Extend the existing approval dialog (or shared destructive-approval dialog used for both commands and deletes):

- Title for delete: **File delete approval required**
- Body copy: **`{DisplayName} wants to delete `{path}``**
- Optional purpose line
- Actions: **Reject** / **Approve and delete**

Show on Team Floor / mission overlays the same way command approvals already appear (mission-scoped pending approval query).

### 5. Events & explorer

- Add versioned event `staff.file.deleted` with `file_path` (and title/summary suitable for activity).
- Frontend reducer: remove/update explorer entries, activity item, clear `activeFile` / open tabs if the deleted path was open.
- Invalidate project entries query after successful delete (API event and/or client invalidation).

## Implementation sketch

| Area | Change |
|------|--------|
| `HiPo-Staff/staff/*.md` | Add `filesystem_delete` |
| `tool_definitions.py` / `registry.py` / `repository.py` | Define + implement `repository.delete` |
| `agent_runner.py` | Gate tool; request approval; wait; execute/reject |
| `schemas/approvals.py` + services/API | Discriminated approval request (`command` \| `file_delete`) |
| `schemas/events.py` + web `events.ts` + reducer | `staff.file.deleted` |
| `CommandApprovalDialog` (rename/generalize) | Render delete vs command copy |
| Tests | Permission matrix, approval accept/reject, event + UI |

## Success criteria

1. Prompted delete of `hello.html` with an allowed staff member shows a modal naming them and the path before unlink.
2. Accept removes the file from disk and explorer; Reject leaves it untouched.
3. Ava can request delete without gaining write; Alex/Maya/Dr. Rao cannot.
4. Emptying a file via write still works without this modal (unchanged), but models are instructed to use `repository.delete` when the objective is to remove a file.
5. Contracts stay versioned and synced between API and web.

## Spec self-review

- No TBDs for required product decisions
- Scope matches approved approach A (first-class delete + shared approval modal)
- Does not expand Ava to full write
- Explicitly excludes recursive directory delete
