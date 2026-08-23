import sys
from pathlib import Path

from app.api.staff import _repository
from app.core.paths import browser_audit_script, repo_root, staff_root


def test_staff_root_uses_meipass_when_frozen(monkeypatch, tmp_path: Path) -> None:
    bundled = tmp_path / "HiPo-Staff" / "staff"
    bundled.mkdir(parents=True)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)

    assert repo_root() == tmp_path
    assert staff_root() == bundled


def test_staff_api_repository_uses_bundled_staff_root(
    monkeypatch, tmp_path: Path
) -> None:
    bundled = tmp_path / "HiPo-Staff" / "staff"
    bundled.mkdir(parents=True)
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)

    assert _repository().root == bundled.resolve()


def test_installer_includes_start_menu_browser_shortcut() -> None:
    iss = Path(__file__).parents[3] / "packaging" / "windows" / "tova.iss"
    text = iss.read_text(encoding="utf-8")
    assert 'Name: "{group}\\TOVA"' in text
    assert "Close that window to stop TOVA." in text
    assert 'Filename: "http://127.0.0.1:8000/"' in text


def test_windows_spec_is_a_single_console_executable() -> None:
    spec = Path(__file__).parents[3] / "packaging" / "windows" / "tova.spec"
    text = spec.read_text(encoding="utf-8")
    assert "console=True" in text
    assert "samples/first-mission" in text
    assert "browser-qa-audit.mjs" in text


def test_browser_audit_script_uses_meipass_when_frozen(
    monkeypatch, tmp_path: Path
) -> None:
    script = tmp_path / "apps" / "web" / "scripts" / "browser-qa-audit.mjs"
    script.parent.mkdir(parents=True)
    script.write_text("export {}\n", encoding="utf-8")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "_MEIPASS", str(tmp_path), raising=False)

    assert browser_audit_script() == script.resolve()
