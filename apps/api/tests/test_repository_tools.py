from pathlib import Path

import pytest

from app.tools.registry import RepositoryToolRegistry
from app.tools.repository import ProjectWorkspace, WorkspaceError


def test_reads_searches_lists_writes_and_patches_inside_root(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("value = 1\n", encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path)

    assert workspace.read("src/main.py") == "value = 1\n"
    assert workspace.list("src") == ["src/main.py"]
    assert workspace.search("value", "src")[0].path == "src/main.py"

    write = workspace.write("src/new.py", "safe = True\n")
    patch = workspace.apply_patch("src/main.py", "value = 1\n", "value = 2\n")

    assert write.after_hash
    assert patch.before_hash != patch.after_hash
    assert (tmp_path / "src" / "main.py").read_text(encoding="utf-8") == "value = 2\n"


def test_finds_project_files_by_safe_glob(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "index.html").write_text("<main />", encoding="utf-8")
    (tmp_path / "src" / "app.ts").write_text("export {}", encoding="utf-8")
    (tmp_path / "README.md").write_text("# TOVA", encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path)

    assert workspace.find("*.html") == ["src/index.html"]
    assert workspace.find("src/**/*.ts") == ["src/app.ts"]


def test_finds_project_references_by_prefix(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "index.html").write_text("<main />", encoding="utf-8")
    (tmp_path / "src" / "input.ts").write_text("export {}", encoding="utf-8")
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "intro.md").write_text("# Intro", encoding="utf-8")
    (tmp_path / ".env.local").write_text("SECRET=1", encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path)

    assert workspace.reference_entries("in") == [
        {"name": "index.html", "path": "src/index.html", "kind": "file"},
        {"name": "input.ts", "path": "src/input.ts", "kind": "file"},
        {"name": "intro.md", "path": "docs/intro.md", "kind": "file"},
    ]
    assert workspace.reference_entries("do") == [
        {"name": "docs", "path": "docs", "kind": "dir"},
    ]
    assert all(".env" not in entry["path"] for entry in workspace.reference_entries(""))


@pytest.mark.parametrize(
    "path",
    [
        "../outside.txt",
        "/absolute.txt",
        "/Windows/System32",
        "C:index.html",
        ".env",
        ".git/config",
        "credentials.json",
    ],
)
def test_rejects_traversal_absolute_and_sensitive_paths(tmp_path: Path, path: str) -> None:
    workspace = ProjectWorkspace(tmp_path)
    with pytest.raises(WorkspaceError):
        workspace.resolve(path)


def test_rejects_windows_drive_relative_and_root_anchored_paths(tmp_path: Path) -> None:
    workspace = ProjectWorkspace(tmp_path)
    with pytest.raises(WorkspaceError, match="project-relative"):
        workspace.resolve("C:temp")
    with pytest.raises(WorkspaceError, match="project-relative"):
        workspace.resolve("/index.html")


def test_rejects_oversized_reads_and_caps_diff_preview(tmp_path: Path) -> None:
    (tmp_path / "large.txt").write_text("x" * 32, encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path, read_limit_bytes=16, diff_preview_bytes=20)

    with pytest.raises(WorkspaceError, match="limit"):
        workspace.read("large.txt")

    (tmp_path / "change.txt").write_text("a\n", encoding="utf-8")
    result = workspace.write("change.txt", "b\n" * 100)
    assert len(result.diff_preview.encode()) <= 20


def test_deletes_single_file_and_rejects_directories(tmp_path: Path) -> None:
    (tmp_path / "hello.html").write_text("<p>hi</p>", encoding="utf-8")
    (tmp_path / "subdir").mkdir()
    workspace = ProjectWorkspace(tmp_path)

    result = workspace.delete("hello.html")
    assert result["path"] == "hello.html"
    assert not (tmp_path / "hello.html").exists()

    with pytest.raises(WorkspaceError, match="file"):
        workspace.delete("subdir")


def test_registry_delete_tool_unlinks_file(tmp_path: Path) -> None:
    (tmp_path / "bye.txt").write_text("x", encoding="utf-8")
    registry = RepositoryToolRegistry(ProjectWorkspace(tmp_path))
    outcome = registry.execute("repository.delete", {"path": "bye.txt"})
    assert outcome.ok is True
    assert outcome.data["path"] == "bye.txt"
    assert not (tmp_path / "bye.txt").exists()


def test_registry_find_tool_returns_project_relative_matches(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "index.html").write_text("<main />", encoding="utf-8")
    registry = RepositoryToolRegistry(ProjectWorkspace(tmp_path))

    outcome = registry.execute("repository.find", {"pattern": "**/*.html"})

    assert outcome.ok is True
    assert outcome.data == {"matches": ["src/index.html"]}
