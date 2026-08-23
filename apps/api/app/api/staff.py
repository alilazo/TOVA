from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.paths import pixel_staff_images_dir, staff_avatars_dir, staff_root
from app.schemas.staff import (
    StaffAvatarCatalog,
    StaffAvatarUpdate,
    StaffAvatarView,
    StaffDocumentUpdate,
    StaffDocumentView,
    StaffProfileView,
)
from app.services.staff_avatars import StaffAvatarService
from app.services.staff_profiles import StaffProfileError, StaffProfileRepository

router = APIRouter(prefix="/api")


def _repository() -> StaffProfileRepository:
    return StaffProfileRepository(staff_root())


def _avatars() -> StaffAvatarService:
    return StaffAvatarService(pixel_staff_images_dir(), staff_avatars_dir(), _repository())


def _http_error(exc: StaffProfileError) -> HTTPException:
    detail = str(exc)
    unknown = detail.startswith("Unknown staff profile") or "not found" in detail.lower()
    return HTTPException(status_code=404 if unknown else 400, detail=detail)


@router.get("/staff", response_model=list[StaffProfileView])
async def list_staff() -> list[StaffProfileView]:
    try:
        return [profile.to_view() for profile in _repository().load_all()]
    except (StaffProfileError, OSError) as exc:
        raise HTTPException(
            status_code=500,
            detail="Staff profiles are unavailable",
        ) from exc


@router.get("/staff/avatar-catalog", response_model=StaffAvatarCatalog)
async def staff_avatar_catalog() -> StaffAvatarCatalog:
    try:
        return StaffAvatarCatalog(stock=_avatars().list_stock())
    except StaffProfileError as exc:
        raise _http_error(exc) from exc


@router.get("/staff-assets/{kind}/{filename}")
async def staff_avatar_asset(kind: str, filename: str) -> FileResponse:
    try:
        path = _avatars().resolve_asset(f"{kind}/{filename}")
    except StaffProfileError as exc:
        raise _http_error(exc) from exc
    return FileResponse(path)


@router.put("/staff/{staff_id}/avatar", response_model=StaffAvatarView)
async def put_staff_avatar(staff_id: str, body: StaffAvatarUpdate) -> StaffAvatarView:
    try:
        if body.avatar.startswith("stock/"):
            avatar = _avatars().set_stock_avatar(staff_id, body.avatar.removeprefix("stock/"))
        else:
            raise StaffProfileError("Use stock/* for selection or upload for custom avatars")
    except StaffProfileError as exc:
        raise _http_error(exc) from exc
    return StaffAvatarView(id=staff_id, avatar=avatar)


@router.post("/staff/{staff_id}/avatar", response_model=StaffAvatarView)
async def upload_staff_avatar(
    staff_id: str,
    file: Annotated[UploadFile, File()],
) -> StaffAvatarView:
    try:
        data = await file.read()
        avatar = _avatars().save_upload(
            staff_id,
            file.content_type or "",
            data,
        )
    except StaffProfileError as exc:
        raise _http_error(exc) from exc
    return StaffAvatarView(id=staff_id, avatar=avatar)


@router.get("/staff/{staff_id}/document", response_model=StaffDocumentView)
async def get_staff_document(staff_id: str) -> StaffDocumentView:
    try:
        profile, markdown = _repository().read_markdown(staff_id)
    except StaffProfileError as exc:
        raise _http_error(exc) from exc
    return StaffDocumentView(id=profile.id, slug=profile.slug, markdown=markdown)


@router.put("/staff/{staff_id}/document", response_model=StaffDocumentView)
async def put_staff_document(
    staff_id: str,
    body: StaffDocumentUpdate,
) -> StaffDocumentView:
    try:
        profile = _repository().write_markdown(staff_id, body.markdown)
        _, markdown = _repository().read_markdown(staff_id)
    except StaffProfileError as exc:
        raise _http_error(exc) from exc
    return StaffDocumentView(id=profile.id, slug=profile.slug, markdown=markdown)
