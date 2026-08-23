from __future__ import annotations

import builtins
import difflib
import hashlib
import os
import tempfile
from fnmatch import fnmatch
from pathlib import Path, PurePath

from app.tools.schemas import FileChangeResult, SearchMatch

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


class WorkspaceError(ValueError):
    pass


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
