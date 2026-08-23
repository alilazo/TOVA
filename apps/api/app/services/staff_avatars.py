from __future__ import annotations

import re
from pathlib import Path

from app.services.staff_profiles import StaffProfileError, StaffProfileRepository

ALLOWED_UPLOAD_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
MAX_UPLOAD_BYTES = 512_000


class StaffAvatarService:
    def __init__(
        self,
        stock_root: str | Path,
        custom_root: str | Path,
        profiles: StaffProfileRepository,
    ) -> None:
        self.stock_root = Path(stock_root).resolve(strict=True)
        self.custom_root = Path(custom_root).resolve()
        self.custom_root.mkdir(parents=True, exist_ok=True)
        self.profiles = profiles

    def list_stock(self) -> list[str]:
        return sorted(path.name for path in self.stock_root.glob("*.png") if path.is_file())

    def resolve_asset(self, avatar: str) -> Path:
        kind, _, name = avatar.partition("/")
        if not kind or not name or "/" in name or "\\" in name or name.startswith("."):
            raise StaffProfileError("Invalid avatar reference")
        if kind == "stock":
            path = (self.stock_root / name).resolve()
            root = self.stock_root
        elif kind == "custom":
            path = (self.custom_root / name).resolve()
            root = self.custom_root
        else:
            raise StaffProfileError("Avatar must be stock/* or custom/*")
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise StaffProfileError("Avatar path escapes asset root") from exc
        if not path.is_file():
            raise StaffProfileError("Avatar file not found")
        return path

    def set_stock_avatar(self, staff_id: str, filename: str) -> str:
        if filename not in self.list_stock():
            raise StaffProfileError("Unknown stock avatar")
        avatar = f"stock/{filename}"
        self._write_avatar_field(staff_id, avatar)
        return avatar

    def save_upload(
        self,
        staff_id: str,
        content_type: str,
        data: bytes,
    ) -> str:
        extension = ALLOWED_UPLOAD_TYPES.get(content_type)
        if extension is None:
            raise StaffProfileError("Unsupported image type")
        if not data or len(data) > MAX_UPLOAD_BYTES:
            raise StaffProfileError("Image must be between 1 byte and 512KB")
        # Keep only one custom file per staff id.
        for existing in self.custom_root.glob(f"{staff_id}.*"):
            existing.unlink(missing_ok=True)
        filename = f"{staff_id}{extension}"
        path = self.custom_root / filename
        path.write_bytes(data)
        avatar = f"custom/{filename}"
        self._write_avatar_field(staff_id, avatar)
        return avatar

    def _write_avatar_field(self, staff_id: str, avatar: str) -> None:
        _, markdown = self.profiles.read_markdown(staff_id)
        if not re.search(r"^avatar:\s*.+$", markdown, flags=re.MULTILINE):
            raise StaffProfileError("Staff profile is missing avatar field")
        updated = re.sub(
            r"^avatar:\s*.+$",
            f"avatar: {avatar}",
            markdown,
            count=1,
            flags=re.MULTILINE,
        )
        self.profiles.write_markdown(staff_id, updated)
