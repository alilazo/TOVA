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


def test_creates_files_and_directories_without_overwriting(tmp_path: Path) -> None:
    workspace = ProjectWorkspace(tmp_path)

    assert workspace.create_directory("src") == {"path": "src", "kind": "dir"}
    assert workspace.create_file("src/main.ts") == {
        "path": "src/main.ts",
        "kind": "file",
    }
    assert (tmp_path / "src" / "main.ts").read_text(encoding="utf-8") == ""

    with pytest.raises(WorkspaceError, match="already exists"):
        workspace.create_file("src/main.ts")


def test_moves_populated_directory_without_overwriting(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.ts").write_text("export {}", encoding="utf-8")
    (tmp_path / "app").mkdir()
    workspace = ProjectWorkspace(tmp_path)

    assert workspace.move("src", "app/source") == {
        "path": "app/source",
        "kind": "dir",
    }
    assert (tmp_path / "app" / "source" / "main.ts").is_file()
    assert not (tmp_path / "src").exists()


def test_renames_file_changing_only_letter_case(tmp_path: Path) -> None:
    (tmp_path / "Readme.md").write_text("notes", encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path)

    assert workspace.move("Readme.md", "readme.md") == {
        "path": "readme.md",
        "kind": "file",
    }
    assert any(path.name == "readme.md" for path in tmp_path.iterdir())
    assert (tmp_path / "readme.md").read_text(encoding="utf-8") == "notes"


def test_requires_recursive_confirmation_for_nonempty_directory(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.ts").write_text("export {}", encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path)

    with pytest.raises(WorkspaceError, match="recursive confirmation"):
        workspace.delete_entry("src", recursive=False)

    assert workspace.delete_entry("src", recursive=True) == {
        "path": "src",
        "kind": "dir",
    }
    assert not (tmp_path / "src").exists()


def test_deletes_file_and_empty_directory_without_recursive_confirmation(
    tmp_path: Path,
) -> None:
    (tmp_path / "notes.txt").write_text("safe", encoding="utf-8")
    (tmp_path / "empty").mkdir()
    workspace = ProjectWorkspace(tmp_path)

    assert workspace.delete_entry("notes.txt", recursive=False) == {
        "path": "notes.txt",
        "kind": "file",
    }
    assert workspace.delete_entry("empty", recursive=False) == {
        "path": "empty",
        "kind": "dir",
    }


@pytest.mark.parametrize(
    "path",
    [
        ".",
        "../outside.txt",
        "missing/main.ts",
        "CON",
        "name.",
        "name ",
        "bad<name",
        "bad>name",
        'bad"name',
        "bad:name",
        "bad/name",
        "bad\\name",
        "bad|name",
        "bad?name",
        "bad*name",
        ".git/config",
    ],
)
def test_create_file_rejects_unsafe_or_unavailable_paths(
    tmp_path: Path,
    path: str,
) -> None:
    workspace = ProjectWorkspace(tmp_path)

    with pytest.raises(WorkspaceError):
        workspace.create_file(path)


def test_rejects_raw_backslash_when_its_apparent_parent_exists(tmp_path: Path) -> None:
    (tmp_path / "bad").mkdir()
    workspace = ProjectWorkspace(tmp_path)

    with pytest.raises(WorkspaceError, match="invalid file or folder name"):
        workspace.create_file("bad\\name")


def test_mutations_reject_missing_sources_parents_and_collisions(tmp_path: Path) -> None:
    (tmp_path / "source.txt").write_text("source", encoding="utf-8")
    (tmp_path / "destination.txt").write_text("destination", encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path)

    with pytest.raises(WorkspaceError, match="does not exist"):
        workspace.move("missing.txt", "moved.txt")
    with pytest.raises(WorkspaceError, match="parent directory"):
        workspace.create_directory("missing/child")
    with pytest.raises(WorkspaceError, match="parent directory"):
        workspace.move("source.txt", "missing/moved.txt")
    with pytest.raises(WorkspaceError, match="already exists"):
        workspace.move("source.txt", "destination.txt")


def test_rejects_moving_directory_into_its_descendant(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    workspace = ProjectWorkspace(tmp_path)

    with pytest.raises(WorkspaceError, match="into itself"):
        workspace.move("src", "src/nested")


@pytest.mark.parametrize("root_path", [".", "./", ".\\"])
@pytest.mark.parametrize("operation", ["create", "move-source", "move-destination", "delete"])
def test_mutations_reject_project_root(
    tmp_path: Path,
    operation: str,
    root_path: str,
) -> None:
    (tmp_path / "source.txt").write_text("source", encoding="utf-8")
    workspace = ProjectWorkspace(tmp_path)

    with pytest.raises(WorkspaceError, match="root cannot be changed"):
        if operation == "create":
            workspace.create_directory(root_path)
        elif operation == "move-source":
            workspace.move(root_path, "moved")
        elif operation == "move-destination":
            workspace.move("source.txt", root_path)
        else:
            workspace.delete_entry(root_path, recursive=True)


def test_mutations_reject_symbolic_link_segments(tmp_path: Path) -> None:
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    link = tmp_path / "linked"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("Symbolic links are unavailable on this platform")
    workspace = ProjectWorkspace(tmp_path)

    with pytest.raises(WorkspaceError, match="Symbolic-link"):
        workspace.create_file("linked/escape.txt")


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
