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


class FindInput(BaseModel):
    pattern: str
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
            "repository.find": self._find,
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

    def _find(self, arguments: dict[str, Any]) -> ToolExecutionResult:
        request = FindInput.model_validate(arguments)
        matches = self.workspace.find(request.pattern, request.path)
        return ToolExecutionResult(
            ok=True,
            summary=f"Found {len(matches)} files",
            data={"matches": matches},
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
