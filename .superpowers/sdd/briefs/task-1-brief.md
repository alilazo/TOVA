### Task 1: `ProjectWorkspace.delete` + registry tool

**Files:**
- Modify: `apps/api/app/tools/repository.py`
- Modify: `apps/api/app/tools/registry.py`
- Modify: `apps/api/app/orchestration/tool_definitions.py`
- Test: `apps/api/tests/test_repository_tools.py`

**Interfaces:**
- Consumes: `ProjectWorkspace.resolve`, existing `WorkspaceError`
- Produces: `ProjectWorkspace.delete(relative_path: str) -> dict` with keys `path: str` (posix relative); raises `WorkspaceError` for missing path, directories, or sandbox violations

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/tests/test_repository_tools.py`:

```python
from app.tools.registry import RepositoryToolRegistry


def test_deletes_single_file_and_rejects_directories(tmp_path: Path) -> None:
    (tmp_path / "hello.html").write_text("<p>hi</p>", encoding="utf-8")
    (tmp_path / "subdir").mkdir()
    workspace = ProjectWorkspace(tmp_path)

    result = workspace.delete("hello.html")
    assert result["path"] == "hello.html"
    assert not (tmp_path / "hello.html").exists()

    with pytest.raises(WorkspaceError, match="file"):
        workspace.delete("subdir")


def test_registry_delete_tool_unlinks_file(tmp_path: Path) -> None:
    (tmp_path / "bye.txt").write_text("x", encoding="utf-8")
    registry = RepositoryToolRegistry(ProjectWorkspace(tmp_path))
    outcome = registry.execute("repository.delete", {"path": "bye.txt"})
    assert outcome.ok is True
    assert outcome.data["path"] == "bye.txt"
    assert not (tmp_path / "bye.txt").exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_tools.py -k "delete" -v
```

Expected: FAIL — `ProjectWorkspace` has no `delete` / unknown tool.

- [ ] **Step 3: Implement workspace delete + registry + tool definition**

In `repository.py`, add:

```python
def delete(self, relative_path: str) -> dict[str, str]:
    path = self.resolve(relative_path, must_exist=True)
    if not path.is_file():
        raise WorkspaceError("Delete target must be a file")
    path.unlink()
    return {"path": PurePath(relative_path).as_posix()}
```

In `registry.py` handlers map, add `"repository.delete": self._delete` and:

```python
def _delete(self, arguments: dict[str, Any]) -> ToolExecutionResult:
    path = PathInput.model_validate(arguments).path
    change = self.workspace.delete(path)
    return ToolExecutionResult(
        ok=True,
        summary=f"Deleted {path}",
        data=change,
    )
```

In `tool_definitions.py`, after `repository.apply_patch`, add:

```python
ToolDefinition(
    name="repository.delete",
    description=(
        "Delete one project file after explicit user approval. "
        "Use this to remove a file; do not empty a file to simulate deletion."
    ),
    parameters={
        "type": "object",
        "properties": {
            "path": {"type": "string"},
            "purpose": {"type": "string"},
        },
        "required": ["path", "purpose"],
        "additionalProperties": False,
    },
),
```

Note: registry `_delete` validates `path` only; `purpose` is required by the LLM tool schema and consumed by the approval runner in Task 3–4, not by `ProjectWorkspace.delete`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "F:/Programming Projects/TOVA/apps/api" && uv run pytest tests/test_repository_tools.py -k "delete" -v
```

Expected: PASS

- [ ] **Step 5: Commit only if the user asked** — otherwise skip.

---
