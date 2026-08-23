# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the TOVA Windows desktop process.

LM Studio is intentionally not bundled. The packaged app binds 127.0.0.1:8000
and serves the built web UI plus API from one process.
"""

from pathlib import Path

from PyInstaller.building.api import COLLECT, EXE, PYZ
from PyInstaller.building.build_main import Analysis
from PyInstaller.utils.hooks import collect_all

ROOT = Path(SPECPATH).resolve().parents[1]
API_DIR = ROOT / "apps" / "api"
WEB_DIST = ROOT / "apps" / "web" / "dist"

datas = [
    (str(WEB_DIST), "web-dist"),
    (str(ROOT / "HiPo-Staff" / "staff"), "HiPo-Staff/staff"),
    (str(ROOT / "HiPo-Staff" / "avatars"), "HiPo-Staff/avatars"),
    (str(ROOT / "packages" / "pixel-staff" / "assets" / "images"), "packages/pixel-staff/assets/images"),
    (str(ROOT / "samples" / "first-mission"), "samples/first-mission"),
    (str(ROOT / "apps" / "web" / "scripts" / "browser-qa-audit.mjs"), "apps/web/scripts"),
]
binaries: list[tuple[str, str]] = []
hiddenimports: list[str] = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "app.main",
]

for package in ("uvicorn", "fastapi", "starlette", "pydantic", "anyio"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

a = Analysis(
    [str(API_DIR / "app" / "__main__.py")],
    pathex=[str(API_DIR)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="tova",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
