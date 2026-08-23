import asyncio
from uuid import uuid4

from app.schemas.approvals import ApprovalRecord, ApprovalRequestPayload, ApprovalStatus


class ApprovalRegistry:
    def __init__(self) -> None:
        self._records: dict[str, ApprovalRecord] = {}
        self._decisions: dict[str, asyncio.Future[ApprovalStatus]] = {}
        self._lock = asyncio.Lock()

    async def request(self, request: ApprovalRequestPayload) -> ApprovalRecord:
        async with self._lock:
            approval = ApprovalRecord(
                id=f"approval_{uuid4().hex}",
                request=request,
                status=ApprovalStatus.PENDING,
            )
            self._records[approval.id] = approval
            self._decisions[approval.id] = asyncio.get_running_loop().create_future()
            return approval.model_copy(deep=True)

    async def accept(self, approval_id: str) -> ApprovalRecord:
        return await self._decide(approval_id, ApprovalStatus.ACCEPTED)

    async def reject(self, approval_id: str) -> ApprovalRecord:
        return await self._decide(approval_id, ApprovalStatus.REJECTED)

    async def _decide(
        self, approval_id: str, status: ApprovalStatus
    ) -> ApprovalRecord:
        async with self._lock:
            record = self._records.get(approval_id)
            if record is None:
                raise KeyError(approval_id)
            if record.status != ApprovalStatus.PENDING:
                raise ValueError("Approval is no longer pending")
            record.status = status
            future = self._decisions[approval_id]
            if not future.done():
                future.set_result(status)
            return record.model_copy(deep=True)

    async def wait_for_decision(self, approval_id: str) -> ApprovalStatus:
        future = self._decisions.get(approval_id)
        if future is None:
            raise KeyError(approval_id)
        return await asyncio.shield(future)

    def set_status(self, approval_id: str, status: ApprovalStatus) -> None:
        self._records[approval_id].status = status

    def get(self, approval_id: str) -> ApprovalRecord:
        record = self._records.get(approval_id)
        if record is None:
            raise KeyError(approval_id)
        return record.model_copy(deep=True)

    def list_pending(self) -> list[ApprovalRecord]:
        return [
            record.model_copy(deep=True)
            for record in self._records.values()
            if record.status == ApprovalStatus.PENDING
        ]

    def list_for_mission(self, mission_id: str) -> list[ApprovalRecord]:
        return [
            record.model_copy(deep=True)
            for record in self._records.values()
            if record.request.mission_id == mission_id
        ]
