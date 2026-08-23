from __future__ import annotations

import sys
from pathlib import Path


def repo_root() -> Path:
    meipass = getattr(sys, "_MEIPASS", None)
    if getattr(sys, "frozen", False) and isinstance(meipass, str):
        return Path(meipass)
    return Path(__file__).resolve().parents[4]


def staff_root() -> Path:
    return repo_root() / "HiPo-Staff" / "staff"


def pixel_staff_images_dir() -> Path:
    return repo_root() / "packages" / "pixel-staff" / "assets" / "images"


def staff_avatars_dir() -> Path:
    return repo_root() / "HiPo-Staff" / "avatars"


def sample_template_dir() -> Path:
    return repo_root() / "samples" / "first-mission"


def web_dist_dir() -> Path:
    if getattr(sys, "frozen", False):
        return repo_root() / "web-dist"
    return Path(__file__).resolve().parents[3] / "web" / "dist"


def browser_audit_script() -> Path:
    return repo_root() / "apps" / "web" / "scripts" / "browser-qa-audit.mjs"
