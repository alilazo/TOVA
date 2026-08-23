from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

BrowserAuditVerdict = Literal["pass", "fail", "needs_improvement", "blocked"]


class ApprovalStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXECUTING = "executing"
    EXECUTED = "executed"
    FAILED = "failed"


class CommandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["command"] = "command"
    mission_id: str = Field(min_length=1)
    staff_id: str = Field(min_length=1)
    executable: str = Field(min_length=1)
    args: list[str] = []
    cwd: str = "."
    purpose: str = Field(min_length=1, max_length=500)
    timeout_seconds: float = Field(default=60, gt=0, le=600)
    expected_outputs: list[str] = []


class FileDeleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["file_delete"] = "file_delete"
    mission_id: str = Field(min_length=1)
    staff_id: str = Field(min_length=1)
    staff_display_name: str = Field(min_length=1)
    path: str = Field(min_length=1)
    purpose: str = Field(min_length=1, max_length=500)


class BrowserAuditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["browser_audit"] = "browser_audit"
    mission_id: str = Field(min_length=1)
    staff_id: str = Field(min_length=1)
    staff_display_name: str = Field(min_length=1)
    url: str = Field(min_length=1, max_length=500)
    purpose: str = Field(min_length=1, max_length=500)
    acceptance_criteria: list[str] = Field(default_factory=list)
    viewport: dict[str, int] | None = None
    selectors_to_check: list[str] = Field(default_factory=list)


ApprovalRequestPayload = Annotated[
    CommandRequest | FileDeleteRequest | BrowserAuditRequest,
    Field(discriminator="kind"),
]


class ApprovalRecord(BaseModel):
    id: str
    request: ApprovalRequestPayload
    status: ApprovalStatus


class CommandResult(BaseModel):
    approval_id: str
    exit_code: int | None = None
    output: str = ""
    duration_ms: int = 0
    timed_out: bool = False
    rejected: bool = False
    output_truncated: bool = False


class FileDeleteResult(BaseModel):
    approval_id: str
    path: str = ""
    rejected: bool = False
    error: str | None = None


class BrowserAuditResult(BaseModel):
    approval_id: str = ""
    rejected: bool = False
    url: str = ""
    title: str = ""
    verdict: BrowserAuditVerdict = "blocked"
    summary: str = ""
    screenshot_path: str = ""
    visible_text: str = ""
    console_errors: list[str] = Field(default_factory=list)
    failed_requests: list[str] = Field(default_factory=list)
    layout_findings: list[str] = Field(default_factory=list)
    error: str | None = None
