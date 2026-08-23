from collections.abc import Awaitable, Callable
from typing import Any

from app.schemas.approvals import (
    ApprovalStatus,
    FileDeleteRequest,
    FileDeleteResult,
)
from app.services.approvals import ApprovalRegistry
from app.tools.repository import ProjectWorkspace, WorkspaceError

EventSink = Callable[[str, dict[str, Any]], Awaitable[None]]


async def _no_events(_event_type: str, _payload: dict[str, Any]) -> None:
    return None


class ApprovedFileDeleteRunner:
    def __init__(
        self,
        workspace: ProjectWorkspace,
        approvals: ApprovalRegistry,
        *,
        event_sink: EventSink = _no_events,
    ) -> None:
        self.workspace = workspace
        self.approvals = approvals
        self.event_sink = event_sink

    async def run(self, request: FileDeleteRequest) -> FileDeleteResult:
        try:
            target = self.workspace.resolve(request.path, must_exist=True)
            if not target.is_file():
                raise WorkspaceError("Delete target must be a file")
        except WorkspaceError as exc:
            return FileDeleteResult(
                approval_id="",
                path=request.path,
                error=str(exc),
            )

        approval = await self.approvals.request(request)
        await self.event_sink(
            "approval.requested",
            {
                "approval_id": approval.id,
                "kind": "file_delete",
                "staff_id": request.staff_id,
                "staff_display_name": request.staff_display_name,
                "path": request.path,
                "purpose": request.purpose,
            },
        )
        decision = await self.approvals.wait_for_decision(approval.id)
        if decision == ApprovalStatus.REJECTED:
            await self.event_sink("approval.rejected", {"approval_id": approval.id})
            return FileDeleteResult(
                approval_id=approval.id,
                path=request.path,
                rejected=True,
            )

        await self.event_sink("approval.accepted", {"approval_id": approval.id})
        self.approvals.set_status(approval.id, ApprovalStatus.EXECUTING)
        try:
            deleted = self.workspace.delete(request.path)
        except WorkspaceError as exc:
            self.approvals.set_status(approval.id, ApprovalStatus.FAILED)
            return FileDeleteResult(
                approval_id=approval.id,
                path=request.path,
                error=str(exc),
            )
        self.approvals.set_status(approval.id, ApprovalStatus.EXECUTED)
        return FileDeleteResult(approval_id=approval.id, path=deleted["path"])
