from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.approvals import ApprovalRecord
from app.services.approvals import ApprovalRegistry

router = APIRouter(prefix="/api")
_registry = ApprovalRegistry()


def get_approval_registry() -> ApprovalRegistry:
    return _registry


Registry = Annotated[ApprovalRegistry, Depends(get_approval_registry)]


@router.get("/missions/{mission_id}/approvals", response_model=list[ApprovalRecord])
async def list_approvals(mission_id: str, registry: Registry) -> list[ApprovalRecord]:
    return registry.list_for_mission(mission_id)


@router.post("/approvals/{approval_id}/accept", response_model=ApprovalRecord)
async def accept(approval_id: str, registry: Registry) -> ApprovalRecord:
    try:
        return await registry.accept(approval_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Approval not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/approvals/{approval_id}/reject", response_model=ApprovalRecord)
async def reject(approval_id: str, registry: Registry) -> ApprovalRecord:
    try:
        return await registry.reject(approval_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Approval not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
