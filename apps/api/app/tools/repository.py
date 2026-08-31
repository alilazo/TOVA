from __future__ import annotations

import builtins
import difflib
import hashlib
import os
import shutil
import tempfile
from fnmatch import fnmatch
from pathlib import Path, PurePath
from typing import Literal, TypedDict

from app.tools.schemas import FileChangeResult, SearchMatch

_INVALID_ENTRY_CHARACTERS = frozenset('<>:"/\\|?*')
_WINDOWS_RESERVED_NAMES = frozenset(
    {"CON", "PRN", "AUX", "NUL"}
    | {f"COM{index}" for index in range(1, 10)}
    | {f"LPT{index}" for index in range(1, 10)}
)
_EXCLUDED_NAMES = {
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
    "dist",
    "build",
    ".tova",
    "credentials.json",
    "secrets.json",
}
_EXCLUDED_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}


class WorkspaceEntryResult(TypedDict):
    path: str
    kind: Literal["file", "dir"]


class WorkspaceError(ValueError):
    pass


def _validate_entry_parts(relative_path: str) -> None:
    if relative_path in {"", ".", ".\\"}:
        raise WorkspaceError("Project root cannot be changed")
    if "\\" in relative_path:
        raise WorkspaceError("Path contains an invalid file or folder name")
    parts = PurePath(relative_path).parts
    if not parts:
        raise WorkspaceError("Project root cannot be changed")
    for part in parts:
        stem = part.split(".", 1)[0].upper()
        if (
            not part
            or part in {".", ".."}
            or part.endswith((" ", "."))
            or stem in _WINDOWS_RESERVED_NAMES
            or any(character in _INVALID_ENTRY_CHARACTERS for character in part)
            or any(ord(character) < 32 for character in part)
        ):
            raise WorkspaceError("Path contains an invalid file or folder name")


def _hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class ProjectWorkspace:
    def __init__(
        self,
        root: str | Path,
        *,
        read_limit_bytes: int = 1_000_000,
        write_limit_bytes: int = 1_000_000,
        diff_preview_bytes: int = 16_000,
        extra_exclusions: set[str] | None = None,
    ) -> None:
        self.root = Path(root).resolve(strict=True)
        if not self.root.is_dir():
            raise WorkspaceError("Project root must be a directory")
        self.read_limit_bytes = read_limit_bytes
        self.write_limit_bytes = write_limit_bytes
        self.diff_preview_bytes = diff_preview_bytes
        self._excluded = _EXCLUDED_NAMES | (extra_exclusions or set())

    def resolve(self, relative_path: str, *, must_exist: bool = False) -> Path:
        pure = PurePath(relative_path)
        if (
            not relative_path
            or pure.is_absolute()
            or ".." in pure.parts
            or any(part in {"/", "\\"} for part in pure.parts)
            or any(len(part) == 2 and part[1] == ":" for part in pure.parts)
        ):
            raise WorkspaceError("Path must be project-relative")
        lowered = [part.lower() for part in pure.parts]
        if any(
            part in self._excluded
            or part.startswith(".env")
            or part.endswith(tuple(_EXCLUDED_SUFFIXES))
            for part in lowered
        ):
            raise WorkspaceError("Sensitive or excluded path")
        candidate = self.root.joinpath(*pure.parts).resolve(strict=False)
        try:
            candidate.relative_to(self.root)
        except ValueError as exc:
            raise WorkspaceError("Path escapes project root") from exc
        if must_exist and not candidate.exists():
            raise WorkspaceError("Path does not exist")
        return candidate

    def _entry_path(self, relative_path: str, *, must_exist: bool = False) -> Path:
        _validate_entry_parts(relative_path)
        lexical = self.root.joinpath(*PurePath(relative_path).parts)
        for candidate in (lexical, *lexical.parents):
            if candidate == self.root:
                break
            if candidate.is_symlink():
                raise WorkspaceError("Symbolic-link entry mutations are not allowed")
        return self.resolve(relative_path, must_exist=must_exist)

    def _require_existing_parent(self, path: Path) -> None:
        if not path.parent.exists() or not path.parent.is_dir():
            raise WorkspaceError("Destination parent directory does not exist")

    def list(self, relative_path: str = ".") -> list[str]:
        directory = self._directory(relative_path)
        results: list[str] = []
        for candidate in directory.rglob("*"):
            if not candidate.is_file():
                continue
            relative = candidate.relative_to(self.root).as_posix()
            try:
                self.resolve(relative, must_exist=True)
            except WorkspaceError:
                continue
            results.append(relative)
        return sorted(results)

    def list_entries(self, relative_path: str = ".") -> builtins.list[dict[str, str]]:
        directory = self._directory(relative_path)
        entries: builtins.list[dict[str, str]] = []
        for candidate in sorted(directory.iterdir(), key=lambda item: item.name.lower()):
            relative = candidate.relative_to(self.root).as_posix()
            if candidate.is_dir():
                if candidate.name.lower() in self._excluded:
                    continue
                entries.append({"name": candidate.name, "path": relative, "kind": "dir"})
                continue
            try:
                self.resolve(relative, must_exist=True)
            except WorkspaceError:
                continue
            if candidate.is_file():
                entries.append({"name": candidate.name, "path": relative, "kind": "file"})
        return entries

    def find(self, pattern: str, relative_path: str = ".") -> builtins.list[str]:
        if not pattern.strip():
            raise WorkspaceError("Find pattern cannot be empty")
        if (
            PurePath(pattern).is_absolute()
            or ".." in PurePath(pattern).parts
            or any(len(part) == 2 and part[1] == ":" for part in PurePath(pattern).parts)
        ):
            raise WorkspaceError("Find pattern must be project-relative")
        directory = self._directory(relative_path)
        matches: builtins.list[str] = []
        for candidate in directory.rglob("*"):
            if not candidate.is_file():
                continue
            relative = candidate.relative_to(self.root).as_posix()
            try:
                self.resolve(relative, must_exist=True)
            except WorkspaceError:
                continue
            scoped = candidate.relative_to(directory).as_posix()
            normalized_pattern = pattern.replace("**/", "", 1)
            if (
                fnmatch(scoped, pattern)
                or fnmatch(relative, pattern)
                or fnmatch(relative, normalized_pattern)
            ):
                matches.append(relative)
        return sorted(matches)

    def reference_entries(
        self,
        query: str = "",
        *,
        max_matches: int = 50,
    ) -> builtins.list[dict[str, str]]:
        normalized = query.strip().lstrip("/").lower()
        matches: builtins.list[dict[str, str]] = []
        for current_root, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [
                name for name in dirnames if self._is_reference_visible_name(name)
            ]
            current = Path(current_root)
            candidates = [
                (current / name, "dir")
                for name in dirnames
            ] + [
                (current / name, "file")
                for name in filenames
            ]
            for candidate, kind in candidates:
                relative = candidate.relative_to(self.root).as_posix()
                try:
                    self.resolve(relative, must_exist=True)
                except WorkspaceError:
                    continue
                name = candidate.name
                target = relative.lower() if "/" in normalized else name.lower()
                if normalized and not target.startswith(normalized):
                    continue
                matches.append({"name": name, "path": relative, "kind": kind})
                if len(matches) >= max_matches:
                    return sorted(matches, key=lambda item: (item["name"].lower(), item["path"]))
        return sorted(matches, key=lambda item: (item["name"].lower(), item["path"]))

    def _is_reference_visible_name(self, name: str) -> bool:
        lowered = name.lower()
        return not (
            lowered in self._excluded
            or lowered.startswith(".env")
            or lowered.endswith(tuple(_EXCLUDED_SUFFIXES))
        )

    def _directory(self, relative_path: str) -> Path:
        if relative_path in {".", ""}:
            directory = self.root
        else:
            directory = self.resolve(relative_path, must_exist=True)
        if not directory.is_dir():
            raise WorkspaceError("List target must be a directory")
        return directory

    def read(self, relative_path: str) -> str:
        path = self.resolve(relative_path, must_exist=True)
        if not path.is_file():
            raise WorkspaceError("Read target must be a file")
        if path.stat().st_size > self.read_limit_bytes:
            raise WorkspaceError("Read size limit exceeded")
        try:
            return path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise WorkspaceError("Only UTF-8 text files are supported") from exc

    def search(
        self,
        query: str,
        relative_path: str = ".",
        *,
        max_matches: int = 100,
    ) -> builtins.list[SearchMatch]:
        if not query:
            raise WorkspaceError("Search query cannot be empty")
        matches: list[SearchMatch] = []
        for file_path in self.list(relative_path):
            try:
                text = self.read(file_path)
            except WorkspaceError:
                continue
            for line_number, line in enumerate(text.splitlines(), 1):
                if query in line:
                    matches.append(SearchMatch(path=file_path, line=line_number, text=line[:500]))
                    if len(matches) >= max_matches:
                        return matches
        return matches

    def write(self, relative_path: str, content: str) -> FileChangeResult:
        encoded = content.encode()
        if len(encoded) > self.write_limit_bytes:
            raise WorkspaceError("Write size limit exceeded")
        path = self.resolve(relative_path)
        before = path.read_bytes() if path.exists() else None
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
        try:
            with os.fdopen(fd, "wb") as temporary:
                temporary.write(encoded)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_name, path)
        finally:
            if os.path.exists(temporary_name):
                os.unlink(temporary_name)
        return FileChangeResult(
            path=relative_path,
            before_hash=_hash(before) if before is not None else None,
            after_hash=_hash(encoded),
            diff_preview=self._diff(before.decode() if before is not None else "", content),
            created=before is None,
        )

    def apply_patch(self, relative_path: str, old_text: str, new_text: str) -> FileChangeResult:
        content = self.read(relative_path)
        if not old_text or content.count(old_text) != 1:
            raise WorkspaceError("Patch context must match exactly once")
        return self.write(relative_path, content.replace(old_text, new_text, 1))

    def create_file(self, relative_path: str) -> WorkspaceEntryResult:
        path = self._entry_path(relative_path)
        self._require_existing_parent(path)
        if path.exists():
            raise WorkspaceError("Destination already exists")
        path.touch(exist_ok=False)
        return {"path": path.relative_to(self.root).as_posix(), "kind": "file"}

    def create_directory(self, relative_path: str) -> WorkspaceEntryResult:
        path = self._entry_path(relative_path)
        self._require_existing_parent(path)
        if path.exists():
            raise WorkspaceError("Destination already exists")
        path.mkdir()
        return {"path": path.relative_to(self.root).as_posix(), "kind": "dir"}

    def move(
        self,
        source_path: str,
        destination_path: str,
    ) -> WorkspaceEntryResult:
        source = self._entry_path(source_path, must_exist=True)
        destination = self._entry_path(destination_path)
        self._require_existing_parent(destination)
        requested = PurePath(destination_path).as_posix()
        requested_name = PurePath(destination_path).name
        same_entry = destination.exists() and source.exists() and source.samefile(destination)
        if destination.exists() and not same_entry:
            raise WorkspaceError("Destination already exists")
        if source.is_dir() and (destination == source or source in destination.parents):
            raise WorkspaceError("Directory cannot be moved into itself")
        kind: Literal["file", "dir"] = "dir" if source.is_dir() else "file"
        if same_entry and source.name != requested_name:
            temporary = source.with_name(f".{requested_name}.case-rename")
            source.replace(temporary)
            temporary.replace(source.with_name(requested_name))
            return {"path": requested, "kind": kind}
        source.replace(destination)
        return {
            "path": destination.relative_to(self.root).as_posix(),
            "kind": kind,
        }

    def delete_entry(
        self,
        relative_path: str,
        *,
        recursive: bool,
    ) -> WorkspaceEntryResult:
        path = self._entry_path(relative_path, must_exist=True)
        if path.is_file():
            path.unlink()
            return {"path": PurePath(relative_path).as_posix(), "kind": "file"}
        if not path.is_dir():
            raise WorkspaceError("Delete target must be a file or directory")
        if any(path.iterdir()) and not recursive:
            raise WorkspaceError("Non-empty directory requires recursive confirmation")
        if recursive:
            shutil.rmtree(path)
        else:
            path.rmdir()
        return {"path": PurePath(relative_path).as_posix(), "kind": "dir"}

    def delete(self, relative_path: str) -> dict[str, str]:
        path = self.resolve(relative_path, must_exist=True)
        if not path.is_file():
            raise WorkspaceError("Delete target must be a file")
        path.unlink()
        return {"path": PurePath(relative_path).as_posix()}

    def _diff(self, before: str, after: str) -> str:
        preview = "".join(
            difflib.unified_diff(
                before.splitlines(keepends=True),
                after.splitlines(keepends=True),
                fromfile="before",
                tofile="after",
            )
        )
        encoded = preview.encode()
        if len(encoded) <= self.diff_preview_bytes:
            return preview
        return encoded[: self.diff_preview_bytes].decode("utf-8", errors="ignore")
