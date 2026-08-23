from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol, TypeVar

from pydantic import BaseModel

from app.providers.openai_compatible import ProviderError
from app.schemas.mission_plan import MissionPlan
from app.schemas.staff import StaffProfileDocument

StructuredOutput = TypeVar("StructuredOutput", bound=BaseModel)


class StructuredPlanProvider(Protocol):
    async def generate_structured(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        output_type: type[StructuredOutput],
        model: str,
    ) -> StructuredOutput: ...


class ProjectKind(StrEnum):
    UNKNOWN = "unknown"
    STATIC_SITE = "static_site"
    REACT_APP = "react_app"


@dataclass(frozen=True)
class PlanContext:
    raw: str = ""
    project_files: tuple[str, ...] = ()
    project_kind: ProjectKind = ProjectKind.UNKNOWN
    primary_files: tuple[str, ...] = ()

    @classmethod
    def from_text(cls, text: str) -> "PlanContext":
        files: list[str] = []
        for line in text.splitlines():
            stripped = line.strip()
            if not stripped.startswith("- "):
                continue
            path = _normalize_path(stripped[2:])
            if path:
                files.append(path)
        unique_files = tuple(dict.fromkeys(files))
        file_set = set(unique_files)
        stylesheet = next(
            (name for name in ("styles.css", "style.css") if name in file_set),
            None,
        )
        if {"index.html", "script.js"}.issubset(file_set) and stylesheet is not None:
            return cls(
                raw=text.strip(),
                project_files=unique_files,
                project_kind=ProjectKind.STATIC_SITE,
                primary_files=("index.html", "script.js", stylesheet),
            )
        if any(path.startswith("src/") for path in file_set) and (
            "package.json" in file_set
        ):
            return cls(
                raw=text.strip(),
                project_files=unique_files,
                project_kind=ProjectKind.REACT_APP,
                primary_files=tuple(path for path in unique_files if path.startswith("src/")),
            )
        return cls(raw=text.strip(), project_files=unique_files)

    def to_prompt(self) -> str:
        parts: list[str] = []
        if self.raw:
            parts.append(self.raw)
        parts.append(f"Detected project kind: {self.project_kind.value}")
        if self.primary_files:
            parts.append("Primary editable files: " + ", ".join(self.primary_files))
        return "\n".join(parts)


def _normalize_path(path: str) -> str:
    cleaned = path.strip().strip("'\"").replace("\\", "/")
    while cleaned.startswith("./"):
        cleaned = cleaned[2:]
    return cleaned


class Coordinator:
    def __init__(self, provider: StructuredPlanProvider, model: str) -> None:
        self.provider = provider
        self.model = model
        self.last_repair_errors: list[str] = []
        self._role_summary_cache: dict[tuple[tuple[str, str], ...], str] = {}

    async def create_plan(
        self,
        objective: str,
        profiles: list[StaffProfileDocument],
        *,
        operational_context: str = "",
        feedback: str = "",
    ) -> MissionPlan:
        self.last_repair_errors = []
        context = PlanContext.from_text(operational_context)
        roles = sorted(profile.role_key for profile in profiles)
        role_summary = self._role_summary(profiles)
        mode = (
            "Compact planning mode: this appears to be a bounded edit in an existing "
            "project. Prefer one implementer plus QA only when requested. "
            if self._use_compact_prompt(objective, context, feedback)
            else ""
        )
        system = mode + (
            "Create a typed mission plan. Use only available role keys. "
            "Select the smallest team that can safely complete the objective; do not assign "
            "every role by default. Keep MVP scope: do not expand the objective into extra "
            "features. When the objective implies files, list concrete relative paths as "
            "assignment deliverables. Prefer existing project files named in context for "
            "edits; do not introduce a new framework, src tree, or parallel replacement "
            "files unless the user explicitly asks. `required_roles`, `staff_role`, "
            "`dependencies`, `handoff_to`, `from_role`, and `to_role` must contain "
            "the exact role keys below. "
            "Each dependency must reference another assigned `staff_role`; independent work "
            "must use an empty dependency list. Never use task IDs, names, titles, or sequence "
            "numbers as dependencies. "
            "Set `interpretation` to a concise reading of the user request for the user to "
            "confirm. Set each assignment `rationale` to a short operational reason that role "
            "was chosen. Each assignment `objective` must preserve exact user-visible wording "
            "from the mission request (branded text, labels, copy). Return assumptions, risks, "
            "deliverables, dependencies, handoffs, validation, and completion criteria. Never "
            "include hidden reasoning. "
            f"Available roles: {', '.join(roles)}. Role capabilities: {role_summary}"
        )
        prompt_parts = [objective]
        if context.raw:
            prompt_parts.append(
                "Existing Team Chat and project context:\n"
                f"{context.to_prompt()}"
            )
        prompt = "\n\n".join(prompt_parts)
        if feedback.strip():
            prompt = f"{prompt}\n\nUser feedback on the previous proposal:\n{feedback.strip()}"
        last_error = ""
        for attempt in range(2):
            if attempt:
                prompt = (
                    f"{prompt}\nRepair the previous plan using these validation errors: "
                    f"{last_error}"
                )
            try:
                plan = await self.provider.generate_structured(
                    system_prompt=system,
                    user_prompt=prompt,
                    output_type=MissionPlan,
                    model=self.model,
                )
            except ProviderError as exc:
                last_error = str(exc)
                self.last_repair_errors.append(last_error)
                continue
            plan = self._normalize(plan)
            errors = self._validate(plan, set(roles), context)
            if not errors:
                return plan
            self.last_repair_errors.extend(errors)
            last_error = "; ".join(errors)
        raise ValueError(f"Coordinator plan validation failed: {last_error}")

    def _role_summary(self, profiles: list[StaffProfileDocument]) -> str:
        key = tuple(sorted((profile.role_key, profile.display_name) for profile in profiles))
        cached = self._role_summary_cache.get(key)
        if cached is not None:
            return cached
        summary = "; ".join(
            f"{profile.role_key}: {profile.display_name} ({profile.role})"
            for profile in sorted(profiles, key=lambda item: item.role_key)
        )
        self._role_summary_cache[key] = summary
        return summary

    def _use_compact_prompt(
        self,
        objective: str,
        context: PlanContext,
        feedback: str,
    ) -> bool:
        if feedback.strip() or context.project_kind == ProjectKind.UNKNOWN:
            return False
        lowered = objective.lower()
        return any(
            token in lowered
            for token in ("add", "edit", "fix", "change", "update", "button", "header", "footer")
        )

    def _normalize(self, plan: MissionPlan) -> MissionPlan:
        copy = plan.model_copy(deep=True)
        copy.required_roles = list(dict.fromkeys(copy.required_roles))
        for assignment in copy.assignments:
            assignment.deliverables = list(
                dict.fromkeys(
                    path
                    for path in (_normalize_path(item) for item in assignment.deliverables)
                    if path
                )
            )
            assignment.dependencies = list(dict.fromkeys(assignment.dependencies))
            assignment.handoff_to = list(dict.fromkeys(assignment.handoff_to))
        return copy

    def _validate(
        self,
        plan: MissionPlan,
        roles: set[str],
        context: PlanContext | None = None,
    ) -> list[str]:
        context = context or PlanContext()
        errors: list[str] = []
        errors.extend(self._validate_roles(plan, roles))
        errors.extend(self._validate_sequences(plan))
        errors.extend(self._validate_dependencies(plan))
        errors.extend(self._validate_handoffs(plan))
        errors.extend(self._validate_static_site_scope(plan, context))
        return errors

    def _validate_roles(self, plan: MissionPlan, roles: set[str]) -> list[str]:
        assignment_roles = [assignment.staff_role for assignment in plan.assignments]
        errors: list[str] = []
        if any(role not in roles for role in plan.required_roles + assignment_roles):
            errors.append("plan references an unavailable role")
        if len(assignment_roles) != len(set(assignment_roles)):
            errors.append("assignment roles must be unique")
        return errors

    def _validate_sequences(self, plan: MissionPlan) -> list[str]:
        if len({assignment.sequence for assignment in plan.assignments}) != len(plan.assignments):
            return ["assignment sequences must be unique"]
        return []

    def _validate_dependencies(self, plan: MissionPlan) -> list[str]:
        assigned = {assignment.staff_role for assignment in plan.assignments}
        errors: list[str] = []
        for assignment in plan.assignments:
            if any(dependency not in assigned for dependency in assignment.dependencies):
                errors.append(f"{assignment.staff_role} has an unknown dependency")
        return errors

    def _validate_handoffs(self, plan: MissionPlan) -> list[str]:
        assigned = {assignment.staff_role for assignment in plan.assignments}
        errors: list[str] = []
        for handoff in plan.handoffs:
            if handoff.from_role not in assigned or handoff.to_role not in assigned:
                errors.append("handoff references an unassigned role")
        return errors

    def _validate_static_site_scope(
        self,
        plan: MissionPlan,
        context: PlanContext,
    ) -> list[str]:
        errors: list[str] = []
        if context.project_kind == ProjectKind.STATIC_SITE:
            framework_deliverables = [
                deliverable
                for assignment in plan.assignments
                for deliverable in assignment.deliverables
                if self._looks_like_new_framework_path(deliverable)
            ]
            if framework_deliverables:
                errors.append(
                    "existing static site changes must edit "
                    + ", ".join(context.primary_files)
                    + " instead of creating a new src/ framework tree"
                )
        return errors

    def _looks_like_new_framework_path(self, deliverable: str) -> bool:
        lowered = deliverable.replace("\\", "/").lower()
        return lowered.startswith("src/") or lowered.endswith((
            ".jsx",
            ".tsx",
            ".vue",
            ".svelte",
        ))
