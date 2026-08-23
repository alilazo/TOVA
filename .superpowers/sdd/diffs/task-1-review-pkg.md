# Task 1 review package (no git — full file snapshots)
## Files
### apps/api/app/tools/repository.py

`python
from __future__ import annotations

import builtins
import difflib
import hashlib
import os
import tempfile
from pathlib import Path, PurePath

from app.tools.schemas import FileChangeResult, SearchMatch

_EXCLUDED_NAMES = {
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".tova",
    "credentials.json",
    "secrets.json",
}
_EXCLUDED_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}


class WorkspaceError(ValueError):
    pass


def _hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class ProjectWorkspace:
    def __init__(
        self,
        root: str | Path,
        *,
        read_limit_bytes: int = 1_000_000,
        write_limit_bytes: int = 1_000_000,
        diff_preview_bytes: int = 16_000,
        extra_exclusions: set[str] | None = None,
    ) -> None:
        self.root = Path(root).resolve(strict=True)
        if not self.root.is_dir():
            raise WorkspaceError("Project root must be a directory")
        self.read_limit_bytes = read_limit_bytes
        self.write_limit_bytes = write_limit_bytes
        self.diff_preview_bytes = diff_preview_bytes
        self._excluded = _EXCLUDED_NAMES | (extra_exclusions or set())

    def resolve(self, relative_path: str, *, must_exist: bool = False) -> Path:
        pure = PurePath(relative_path)
        if not relative_path or pure.is_absolute() or ".." in pure.parts:
            raise WorkspaceError("Path must be project-relative")
        lowered = [part.lower() for part in pure.parts]
        if any(
            part in self._excluded
            or part.startswith(".env")
            or part.endswith(tuple(_EXCLUDED_SUFFIXES))
            for part in lowered
        ):
            raise WorkspaceError("Sensitive or excluded path")
        candidate = self.root.joinpath(*pure.parts).resolve(strict=False)
        try:
            candidate.relative_to(self.root)
        except ValueError as exc:
            raise WorkspaceError("Path escapes project root") from exc
        if must_exist and not candidate.exists():
            raise WorkspaceError("Path does not exist")
        return candidate

    def list(self, relative_path: str = ".") -> list[str]:
        directory = self._directory(relative_path)
        results: list[str] = []
        for candidate in directory.rglob("*"):
            if not candidate.is_file():
                continue
            relative = candidate.relative_to(self.root).as_posix()
            try:
                self.resolve(relative, must_exist=True)
            except WorkspaceError:
                continue
            results.append(relative)
        return sorted(results)

    def list_entries(self, relative_path: str = ".") -> builtins.list[dict[str, str]]:
        directory = self._directory(relative_path)
        entries: builtins.list[dict[str, str]] = []
        for candidate in sorted(directory.iterdir(), key=lambda item: item.name.lower()):
            relative = candidate.relative_to(self.root).as_posix()
            if candidate.is_dir():
                if candidate.name.lower() in self._excluded:
                    continue
                entries.append({"name": candidate.name, "path": relative, "kind": "dir"})
                continue
            try:
                self.resolve(relative, must_exist=True)
            except WorkspaceError:
                continue
            if candidate.is_file():
                entries.append({"name": candidate.name, "path": relative, "kind": "file"})
        return entries

    def _directory(self, relative_path: str) -> Path:
        if relative_path in {".", ""}:
            directory = self.root
        else:
            directory = self.resolve(relative_path, must_exist=True)
        if not directory.is_dir():
            raise WorkspaceError("List target must be a directory")
        return directory

    def read(self, relative_path: str) -> str:
        path = self.resolve(relative_path, must_exist=True)
        if not path.is_file():
            raise WorkspaceError("Read target must be a file")
        if path.stat().st_size > self.read_limit_bytes:
            raise WorkspaceError("Read size limit exceeded")
        try:
            return path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise WorkspaceError("Only UTF-8 text files are supported") from exc

    def search(
        self,
        query: str,
        relative_path: str = ".",
        *,
        max_matches: int = 100,
    ) -> builtins.list[SearchMatch]:
        if not query:
            raise WorkspaceError("Search query cannot be empty")
        matches: list[SearchMatch] = []
        for file_path in self.list(relative_path):
            try:
                text = self.read(file_path)
            except WorkspaceError:
                continue
            for line_number, line in enumerate(text.splitlines(), 1):
                if query in line:
                    matches.append(SearchMatch(path=file_path, line=line_number, text=line[:500]))
                    if len(matches) >= max_matches:
                        return matches
        return matches

    def write(self, relative_path: str, content: str) -> FileChangeResult:
        encoded = content.encode()
        if len(encoded) > self.write_limit_bytes:
            raise WorkspaceError("Write size limit exceeded")
        path = self.resolve(relative_path)
        before = path.read_bytes() if path.exists() else None
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
        try:
            with os.fdopen(fd, "wb") as temporary:
                temporary.write(encoded)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_name, path)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)
        return FileChangeResult(
            path=relative_path,
            before_hash=_hash(before) if before is not None else None,
            after_hash=_hash(encoded),
            diff_preview=self._diff(before.decode() if before is not None else "", content),
            created=before is None,
        )

    def apply_patch(self, relative_path: str, old_text: str, new_text: str) -> FileChangeResult:
        content = self.read(relative_path)
        if not old_text or content.count(old_text) != 1:
            raise WorkspaceError("Patch context must match exactly once")
        return self.write(relative_path, content.replace(old_text, new_text, 1))

    def delete(self, relative_path: str) -> dict[str, str]:
        path = self.resolve(relative_path, must_exist=True)
        if not path.is_file():
            raise WorkspaceError("Delete target must be a file")
        path.unlink()
        return {"path": PurePath(relative_path).as_posix()}

    def _diff(self, before: str, after: str) -> str:
        preview = "".join(
            difflib.unified_diff(
                before.splitlines(keepends=True),
                after.splitlines(keepends=True),
                fromfile="before",
                tofile="after",
            )
        )
        encoded = preview.encode()
        if len(encoded) <= self.diff_preview_bytes:
            return preview
        return encoded[: self.diff_preview_bytes].decode("utf-8", errors="ignore")

`
### apps/api/app/tools/registry.py

`python
from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, ValidationError

from app.tools.repository import ProjectWorkspace, WorkspaceError
from app.tools.schemas import ToolExecutionResult


class PathInput(BaseModel):
    path: str


class SearchInput(BaseModel):
    query: str
    path: str = "."


class WriteInput(BaseModel):
    path: str
    content: str


class PatchInput(BaseModel):
    path: str
    old_text: str
    new_text: str


Handler = Callable[[dict[str, Any]], ToolExecutionResult]


class RepositoryToolRegistry:
    def __init__(self, workspace: ProjectWorkspace) -> None:
        self.workspace = workspace

    def execute(self, name: str, arguments: dict[str, Any]) -> ToolExecutionResult:
        handlers: dict[str, Handler] = {
            "repository.list": self._list,
            "repository.search": self._search,
            "repository.read": self._read,
            "repository.write": self._write,
            "repository.apply_patch": self._patch,
            "repository.delete": self._delete,
        }
        handler = handlers.get(name)
        if handler is None:
            return ToolExecutionResult(ok=False, summary="Unknown tool", error="unknown_tool")
        try:
            return handler(arguments)
        except (ValidationError, WorkspaceError) as exc:
            return ToolExecutionResult(ok=False, summary="Tool rejected", error=str(exc))

    def _list(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        path = PathInput.model_validate(arguments).path
        files = self.workspace.list(path)
        return ToolExecutionResult(
            ok=True,
            summary=f"Listed {len(files)} files",
            data={"files": files},
        )

    def _search(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        request = SearchInput.model_validate(arguments)
        matches = self.workspace.search(request.query, request.path)
        return ToolExecutionResult(
            ok=True,
            summary=f"Found {len(matches)} matches",
            data={"matches": [match.model_dump() for match in matches]},
        )

    def _read(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        path = PathInput.model_validate(arguments).path
        content = self.workspace.read(path)
        return ToolExecutionResult(
            ok=True,
            summary=f"Read {path}",
            data={"path": path, "content": content},
        )

    def _write(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        request = WriteInput.model_validate(arguments)
        change = self.workspace.write(request.path, request.content)
        return ToolExecutionResult(
            ok=True,
            summary=f"Wrote {request.path}",
            data=change.model_dump(exclude={"diff_preview"}),
        )

    def _patch(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        request = PatchInput.model_validate(arguments)
        change = self.workspace.apply_patch(request.path, request.old_text, request.new_text)
        return ToolExecutionResult(
            ok=True,
            summary=f"Patched {request.path}",
            data=change.model_dump(exclude={"diff_preview"}),
        )

    def _delete(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        path = PathInput.model_validate(arguments).path
        change = self.workspace.delete(path)
        return ToolExecutionResult(
            ok=True,
            summary=f"Deleted {path}",
            data=change,
        )

`
### apps/api/app/orchestration/tool_definitions.py

`python
from app.schemas.models import ToolDefinition


def agent_tool_definitions() -> list[ToolDefinition]:
    return [
        ToolDefinition(
            name="repository.list",
            description="List UTF-8 project files below a relative path.",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.search",
            description="Search project text files.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "path": {"type": "string"},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.read",
            description="Read one UTF-8 project file.",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.write",
            description="Atomically write one UTF-8 project file.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.apply_patch",
            description="Replace exactly one matching text block in a project file.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old_text": {"type": "string"},
                    "new_text": {"type": "string"},
                },
                "required": ["path", "old_text", "new_text"],
                "additionalProperties": False,
            },
        ),
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
        ToolDefinition(
            name="command.request",
            description="Request explicit user approval for a structured command.",
            parameters={
                "type": "object",
                "properties": {
                    "executable": {"type": "string"},
                    "args": {"type": "array", "items": {"type": "string"}},
                    "cwd": {"type": "string"},
                    "purpose": {"type": "string"},
                    "timeout_seconds": {"type": "number"},
                    "expected_outputs": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["executable", "purpose"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="artifact.create",
            description="Create a concise mission artifact record.",
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                },
                "required": ["title", "summary"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="handoff.prepare",
            description="Prepare a concise handoff to another role.",
            parameters={
                "type": "object",
                "properties": {
                    "to_role": {"type": "string"},
                    "summary": {"type": "string"},
                },
                "required": ["to_role", "summary"],
                "additionalProperties": False,
            },
        ),
    ]

`
### apps/api/tests/test_repository_tools.py

`python
from pathlib import Path

import pytest

from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace, WorkspaceError


def test_reads_searches_lists_writes_and_patches_inside_root(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("value = 1\n", encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path)

    assert workspace.read("src/main.py") == "value = 1\n"
    assert workspace.list("src") == ["src/main.py"]
    assert workspace.search("value", "src")[0].path == "src/main.py"

    write = workspace.write("src/new.py", "safe = True\n")
    patch = workspace.apply_patch("src/main.py", "value = 1\n", "value = 2\n")

    assert write.after_hash
    assert patch.before_hash != patch.after_hash
    assert (tmp_path / "src" / "main.py").read_text(encoding="utf-8") == "value = 2\n"


@pytest.mark.parametrize(
    "path",
    ["../outside.txt", "/absolute.txt", ".env", ".git/config", "credentials.json"],
)
def test_rejects_traversal_absolute_and_sensitive_paths(tmp_path: Path, path: str) -> None:
    workspace = ProjectWorkspace(tmp_path)
    with pytest.raises(WorkspaceError):
        workspace.resolve(path)


def test_rejects_oversized_reads_and_caps_diff_preview(tmp_path: Path) -> None:
    (tmp_path / "large.txt").write_text("x" * 32, encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path, read_limit_bytes=16, diff_preview_bytes=20)

    with pytest.raises(WorkspaceError, match="limit"):
        workspace.read("large.txt")

    (tmp_path / "change.txt").write_text("a\n", encoding="utf-8")
    result = workspace.write("change.txt", "b\n" * 100)
    assert len(result.diff_preview.encode()) <= 20


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

`
