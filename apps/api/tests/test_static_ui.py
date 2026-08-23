from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.ui import mount_web_ui


@pytest.mark.asyncio
async def test_fastapi_serves_production_web_and_keeps_api(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html><body>TOVA</body></html>", encoding="utf-8")
    (dist / "assets" / "app.js").write_text("console.log('tova')", encoding="utf-8")

    app = FastAPI()

    @app.get("/api/runtime/status")
    async def status() -> dict[str, str]:
        return {"state": "unconfigured"}

    assert mount_web_ui(app, dist) is True

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        home = await client.get("/")
        asset = await client.get("/assets/app.js")
        api = await client.get("/api/runtime/status")

    assert home.status_code == 200
    assert "TOVA" in home.text
    assert asset.status_code == 200
    assert api.status_code == 200
    assert api.json()["state"] == "unconfigured"


@pytest.mark.asyncio
async def test_production_app_serves_built_web_index() -> None:
    from httpx import ASGITransport, AsyncClient

    from app.core.paths import web_dist_dir
    from app.main import app

    if not (web_dist_dir() / "index.html").is_file():
        pytest.skip("web dist is not built")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        home = await client.get("/")
        status = await client.get("/api/runtime/status")

    assert home.status_code == 200
    assert "<html" in home.text.lower()
    assert status.status_code == 200
