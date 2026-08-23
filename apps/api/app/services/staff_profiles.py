import re
from pathlib import Path
from typing import Any

import frontmatter
import yaml
from pydantic import ValidationError

from app.schemas.staff import StaffProfileDocument


class StaffProfileError(ValueError):
    pass


class StaffProfileRepository:
    REQUIRED_SECTIONS = (
        "Identity",
        "Mission",
        "Responsibilities",
        "Operating Instructions",
        "Inputs Expected",
        "Outputs Required",
        "Tools",
        "Quality Standards",
        "Constraints",
        "Handoff Rules",
        "Escalation Rules",
        "Completion Checklist",
    )

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve(strict=True)
        if not self.root.is_dir():
            raise StaffProfileError("Staff profile root must be a directory")

    def load_all(self) -> list[StaffProfileDocument]:
        profiles = [self._load(path) for path in sorted(self.root.glob("*.md"))]
        if not profiles:
            raise StaffProfileError("No staff profiles found")
        identifiers = [profile.id for profile in profiles]
        if len(identifiers) != len(set(identifiers)):
            raise StaffProfileError("Duplicate staff profile ID")
        role_keys = [profile.role_key for profile in profiles]
        if len(role_keys) != len(set(role_keys)):
            raise StaffProfileError("Duplicate staff role key")
        return profiles

    def get_by_id(self, staff_id: str) -> StaffProfileDocument:
        for profile in self.load_all():
            if profile.id == staff_id:
                return profile
        raise StaffProfileError(f"Unknown staff profile: {staff_id}")

    def read_markdown(self, staff_id: str) -> tuple[StaffProfileDocument, str]:
        profile = self.get_by_id(staff_id)
        path = self._resolved_source(profile.source_path)
        try:
            markdown = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            raise StaffProfileError(f"Unable to read profile {profile.source_path}") from exc
        return profile, markdown

    def write_markdown(self, staff_id: str, markdown: str) -> StaffProfileDocument:
        profile = self.get_by_id(staff_id)
        path = self._resolved_source(profile.source_path)
        # Validate before mutating disk.
        parsed = self._parse(markdown, path.name)
        if parsed.id != staff_id:
            raise StaffProfileError("Staff profile id cannot change")
        try:
            path.write_text(markdown, encoding="utf-8")
        except OSError as exc:
            raise StaffProfileError(f"Unable to write profile {profile.source_path}") from exc
        return self._load(path)

    def _resolved_source(self, source_path: str) -> Path:
        candidate = Path(source_path)
        if candidate.is_absolute() or ".." in candidate.parts:
            raise StaffProfileError("Profile path escapes staff root")
        resolved = (self.root / candidate.name).resolve()
        try:
            resolved.relative_to(self.root)
        except ValueError as exc:
            raise StaffProfileError("Profile path escapes staff root") from exc
        if not resolved.is_file():
            raise StaffProfileError(f"Profile file missing: {candidate.name}")
        return resolved

    def _load(self, path: Path) -> StaffProfileDocument:
        resolved = path.resolve(strict=True)
        try:
            resolved.relative_to(self.root)
        except ValueError as exc:
            raise StaffProfileError("Profile path escapes staff root") from exc
        try:
            text = resolved.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            raise StaffProfileError(f"Malformed profile {path.name}") from exc
        return self._parse(text, path.name)

    def _parse(self, text: str, source_name: str) -> StaffProfileDocument:
        try:
            post = frontmatter.loads(text)
        except (UnicodeDecodeError, yaml.YAMLError) as exc:
            raise StaffProfileError(f"Malformed profile {source_name}") from exc
        sections = self._sections(post.content)
        missing = [name for name in self.REQUIRED_SECTIONS if not sections.get(name)]
        if missing:
            raise StaffProfileError(f"Missing required sections: {', '.join(missing)}")
        values: dict[str, Any] = dict(post.metadata)
        values.update(sections=sections, source_path=Path(source_name).name)
        try:
            return StaffProfileDocument.model_validate(values)
        except ValidationError as exc:
            raise StaffProfileError(f"Invalid frontmatter in {source_name}: {exc}") from exc

    def _sections(self, content: str) -> dict[str, str]:
        heading = re.compile(r"^# (.+?)\s*$", re.MULTILINE)
        matches = list(heading.finditer(content))
        sections: dict[str, str] = {}
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
            name = match.group(1).strip()
            if name in sections:
                raise StaffProfileError(f"Duplicate section: {name}")
            sections[name] = content[match.end() : end].strip()
        return sections
