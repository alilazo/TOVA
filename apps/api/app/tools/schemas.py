from typing import Any

from pydantic import BaseModel, Field


class SearchMatch(BaseModel):
    path: str
    line: int = Field(gt=0)
    text: str


class FileChangeResult(BaseModel):
    path: str
    before_hash: str | None
    after_hash: str
    diff_preview: str
    created: bool = False


class ToolExecutionResult(BaseModel):
    ok: bool
    summary: str
    data: dict[str, Any] = {}
    error: str | None = None
