from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def mount_web_ui(app: FastAPI, dist_dir: Path | None = None) -> bool:
    root = dist_dir if dist_dir is not None else _default_dist()
    index = root / "index.html"
    if not index.is_file():
        return False
    assets = root / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="web-assets")

    @app.get("/")
    async def spa_index() -> FileResponse:
        return FileResponse(index)

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (root / full_path).resolve()
        try:
            candidate.relative_to(root.resolve())
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="Not found") from exc
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)

    return True


def _default_dist() -> Path:
    from app.core.paths import web_dist_dir

    return web_dist_dir()
