### Task 4: Staff permissions, agent runner routing, prompts

**Files:**
- Modify: `HiPo-Staff/staff/ethan-software-engineer.md`
- Modify: `HiPo-Staff/staff/lina-frontend-developer.md`
- Modify: `HiPo-Staff/staff/noah-backend-developer.md`
- Modify: `HiPo-Staff/staff/ava-qa-tester.md`
- Modify: `HiPo-Staff/staff/alex-project-coordinator.md`
- Modify: `HiPo-Staff/staff/maya-researcher.md`
- Modify: `HiPo-Staff/staff/dr-rao-advisor.md`
- Modify: `apps/api/app/orchestration/agent_runner.py`
- Modify: `apps/api/app/orchestration/prompts.py`
- Test: `apps/api/tests/test_repository_delete_agent.py` (create)

**Interfaces:**
- Consumes: `filesystem_delete` permission; `ApprovedFileDeleteRunner`; `FileDeleteRequest`
- Produces: `_allowed_tools` includes `repository.delete` iff `filesystem_delete is True`; on tool call, blocks until approval; emits `staff.file.deleted` on success

- [ ] **Step 1: Write the failing agent tests**

Create `apps/api/tests/test_repository_delete_agent.py`. Reuse `FakeProvider`, plan helpers, and imports from `tests/test_agent_runtime.py` (import if exported; otherwise copy the minimal helpers used by `test_agent_runner_enforces_profile_write_permissions`).

```python
import asyncio
from pathlib import Path

import pytest

from app.orchestration.agent_runner import AgentRunner
from app.schemas.models import ChatCompletionResult, ToolCall
from app.services.approvals import ApprovalRegistry
from app.services.staff_profiles import StaffProfileRepository
from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace

# Import FakeProvider + one_assignment_plan from test_agent_runtime (or local copies)


@pytest.mark.asyncio
async def test_ava_can_delete_after_approval_maya_cannot(tmp_path: Path) -> None:
    (tmp_path / "hello.html").write_text("hi", encoding="utf-8")
    profiles = StaffProfileRepository(
        Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    ).load_all()
    ava = next(p for p in profiles if p.id == "staff_ava")
    maya = next(p for p in profiles if p.id == "staff_maya")
    assert ava.permissions.get("filesystem_delete") is True
    assert maya.permissions.get("filesystem_delete") is not True

    events: list[str] = []
    registry = ApprovalRegistry()

    async def emit(mission_id, event_type, payload, staff_id=None):
        events.append(event_type)
        return object()

    provider = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="del1",
                        name="repository.delete",
                        arguments={
                            "path": "hello.html",
                            "purpose": "Remove hello.html",
                        },
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Deleted hello.html"}'),
        ],
    )
    workspace = ProjectWorkspace(tmp_path)
    runner = AgentRunner(
        provider=provider,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=registry,
        workspace=workspace,
        emit=emit,
    )
    assignment = one_assignment_plan().assignments[0]

    task = asyncio.create_task(runner.run_assignment("mission-1", ava, assignment))
    pending = []
    for _ in range(50):
        pending = registry.list_pending()
        if pending:
            break
        await asyncio.sleep(0.01)
    assert pending and pending[0].request.kind == "file_delete"
    await registry.accept(pending[0].id)
    await task
    assert not (tmp_path / "hello.html").exists()
    assert "staff.file.deleted" in events

    (tmp_path / "nope.txt").write_text("x", encoding="utf-8")
    provider2 = FakeProvider(
        one_assignment_plan(),
        [
            ChatCompletionResult(
                tool_calls=[
                    ToolCall(
                        id="del2",
                        name="repository.delete",
                        arguments={"path": "nope.txt", "purpose": "no"},
                    )
                ]
            ),
            ChatCompletionResult(content='{"summary":"Denied"}'),
        ],
    )
    runner2 = AgentRunner(
        provider=provider2,
        model="fake",
        tools=RepositoryToolRegistry(workspace),
        approvals=ApprovalRegistry(),
        workspace=workspace,
        emit=emit,
    )
    await runner2.run_assignment("mission-2", maya, assignment)
    assert (tmp_path / "nope.txt").exists()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_delete_agent.py -v
```

Expected: FAIL — permission / routing missing.

- [ ] **Step 3: Update staff YAML**

For Ethan, Lina, Noah, Ava under `permissions:` add:

```yaml
  filesystem_delete: true
```

For Alex, Maya, Dr. Rao add:

```yaml
  filesystem_delete: false
```

For Ava `tools:` list, add:

```yaml
  - repository.delete
```

For Ethan/Lina/Noah `tools:` lists, add `repository.delete` when those lists enumerate repository tools.

- [ ] **Step 4: Wire agent_runner + prompts**

In `_allowed_tools`:

```python
if profile.permissions.get("filesystem_delete") is True:
    allowed.add("repository.delete")
```

Handle `repository.delete` like `command.request` (before generic `tools.execute`), building `FileDeleteRequest` with `staff_display_name=profile.display_name`, running `ApprovedFileDeleteRunner`, then emitting `staff.file.deleted` with `file_path` + `title` on success.

Ensure `repository.delete` is **not** executed through the generic `tools.execute` path without approval.

In `prompts.py`, extend file guidance:

```text
When deliverables are files, use repository.write or repository.apply_patch before claiming done.
When the objective is to remove a file, use repository.delete (user approval required). Do not empty a file to simulate deletion.
```

Also add `"staff.file.deleted"` to `apps/api/app/schemas/events.py` in this task if Task 5 has not landed yet — prefer Task 5 for both sides, but agent emit requires the API Literal to include the new type. Add it here or in Task 5 before running this suite; do not leave API/web out of sync.

- [ ] **Step 5: Run tests**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_delete_agent.py tests/test_agent_runtime.py tests/test_file_delete_approvals.py -v
```

Expected: PASS

- [ ] **Step 6: Commit only if the user asked** — otherwise skip.

---
