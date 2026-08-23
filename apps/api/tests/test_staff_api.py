from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.staff_profiles import StaffProfileError

ALEX_DEFAULT = "stock/black-white-pixel-art-guy-with-hair-and-glasses-64x64.png"
AVA_DEFAULT = "stock/black-white-pixel-art-ponytail-girl-without-glasses-64x64.png"
AVA_CUSTOM_PATH = (
    Path(__file__).resolve().parents[3] / "HiPo-Staff" / "avatars" / "staff_ava.png"
)


@pytest.mark.asyncio
async def test_staff_avatar_catalog_and_stock_assignment() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        catalog = await client.get("/api/staff/avatar-catalog")
        assert catalog.status_code == 200
        stock = catalog.json()["stock"]
        assert len(stock) >= 7
        chosen = next(
            name
            for name in stock
            if name != ALEX_DEFAULT.removeprefix("stock/")
        )

        assigned = await client.put(
            "/api/staff/staff_alex/avatar",
            json={"avatar": f"stock/{chosen}"},
        )
        assert assigned.status_code == 200
        assert assigned.json()["avatar"] == f"stock/{chosen}"

        asset = await client.get(f"/api/staff-assets/stock/{chosen}")
        assert asset.status_code == 200
        assert asset.headers["content-type"].startswith("image/")

        staff = await client.get("/api/staff")
        alex = next(item for item in staff.json() if item["id"] == "staff_alex")
        assert alex["avatar"] == f"stock/{chosen}"

        restored = await client.put(
            "/api/staff/staff_alex/avatar",
            json={"avatar": ALEX_DEFAULT},
        )
        assert restored.status_code == 200
        assert restored.json()["avatar"] == ALEX_DEFAULT


@pytest.mark.asyncio
async def test_staff_avatar_upload_stores_custom_copy() -> None:
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/staff/staff_ava/avatar",
            files={"file": ("ava.png", png, "image/png")},
        )
        assert response.status_code == 200
        assert response.json()["avatar"] == "custom/staff_ava.png"

        asset = await client.get("/api/staff-assets/custom/staff_ava.png")
        assert asset.status_code == 200
        assert asset.content.startswith(b"\x89PNG")

        restored = await client.put(
            "/api/staff/staff_ava/avatar",
            json={"avatar": AVA_DEFAULT},
        )
        assert restored.status_code == 200
        AVA_CUSTOM_PATH.unlink(missing_ok=True)


@pytest.mark.asyncio
async def test_staff_api_returns_safe_markdown_metadata() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/staff")

    assert response.status_code == 200
    staff = response.json()
    assert len(staff) == 7
    alex = next(item for item in staff if item["id"] == "staff_alex")
    assert alex["display_name"] == "Alex"
    assert alex["role_key"] == "project_coordinator"
    assert "sections" not in alex
    assert "permissions" not in alex
    assert "source_path" not in alex
    assert set(alex) == {
        "id",
        "employee_id",
        "slug",
        "name",
        "display_name",
        "role",
        "role_key",
        "department",
        "seniority",
        "avatar",
        "status",
        "description",
        "model_profile",
        "tools",
        "can_delegate",
        "can_approve",
        "tags",
    }


@pytest.mark.asyncio
async def test_staff_document_get_and_put_round_trip() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        original = await client.get("/api/staff/staff_alex/document")
        assert original.status_code == 200
        payload = original.json()
        assert payload["id"] == "staff_alex"
        assert payload["slug"] == "alex-project-coordinator"
        assert "display_name: Alex" in payload["markdown"]
        assert "# Identity" in payload["markdown"]

        updated_markdown = payload["markdown"].replace(
            "Coordinates missions and assembles engineering teams.",
            "Coordinates missions and assembles engineering teams. (edited)",
            1,
        )
        saved = await client.put(
            "/api/staff/staff_alex/document",
            json={"markdown": updated_markdown},
        )
        assert saved.status_code == 200
        assert "(edited)" in saved.json()["markdown"]

        restored = await client.put(
            "/api/staff/staff_alex/document",
            json={"markdown": payload["markdown"]},
        )
        assert restored.status_code == 200
        assert restored.json()["markdown"] == payload["markdown"]


@pytest.mark.asyncio
async def test_staff_document_rejects_unknown_id_and_invalid_markdown() -> None:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        missing = await client.get("/api/staff/staff_missing/document")
        assert missing.status_code == 404

        invalid = await client.put(
            "/api/staff/staff_alex/document",
            json={"markdown": "---\nid: staff_alex\n---\n# Identity\nOnly one section\n"},
        )
        assert invalid.status_code == 400
        assert "Missing required sections" in invalid.json()["detail"]


@pytest.mark.asyncio
async def test_staff_api_hides_profile_load_failure_details(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.api import staff

    class FailingStaffProfileRepository:
        def __init__(self, _root: object) -> None:
            pass

        def load_all(self) -> list[object]:
            raise StaffProfileError("secret markdown contents from hidden-profile.md")

    monkeypatch.setattr(staff, "StaffProfileRepository", FailingStaffProfileRepository)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/api/staff")

    assert response.status_code == 500
    assert response.json() == {"detail": "Staff profiles are unavailable"}
    assert "secret markdown contents" not in response.text
    assert "hidden-profile.md" not in response.text
