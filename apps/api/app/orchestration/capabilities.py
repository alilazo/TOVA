from __future__ import annotations

from typing import Final

from app.schemas.staff import StaffProfileDocument

RoleCapabilities = frozenset[str]

ROLE_CAPABILITIES: Final[dict[str, RoleCapabilities]] = {
    "project_coordinator": frozenset(
        {
            "repository.list",
            "repository.search",
            "repository.find",
            "repository.read",
            "handoff.prepare",
        }
    ),
    "frontend_developer": frozenset(
        {
            "repository.list",
            "repository.search",
            "repository.find",
            "repository.read",
            "repository.write",
            "repository.apply_patch",
            "repository.delete",
            "command.request",
            "handoff.prepare",
        }
    ),
    "backend_developer": frozenset(
        {
            "repository.list",
            "repository.search",
            "repository.find",
            "repository.read",
            "repository.write",
            "repository.apply_patch",
            "repository.delete",
            "test.pytest",
            "artifact.create",
            "handoff.prepare",
        }
    ),
    "software_engineer": frozenset(
        {
            "repository.list",
            "repository.search",
            "repository.find",
            "repository.read",
            "repository.write",
            "repository.apply_patch",
            "repository.delete",
            "test.pytest",
            "artifact.create",
            "handoff.prepare",
        }
    ),
    "qa_tester": frozenset(
        {
            "repository.list",
            "repository.search",
            "repository.find",
            "repository.read",
            "test.pytest",
            "test.vitest",
            "qa.browser.audit",
            "artifact.create",
            "handoff.prepare",
        }
    ),
    "researcher": frozenset(
        {
            "repository.list",
            "repository.search",
            "repository.find",
            "repository.read",
            "artifact.create",
            "handoff.prepare",
        }
    ),
    "advisor": frozenset(
        {
            "repository.list",
            "repository.search",
            "repository.find",
            "repository.read",
            "artifact.create",
            "handoff.prepare",
        }
    ),
}


def capabilities_for(profile: StaffProfileDocument) -> set[str]:
    explicit = ROLE_CAPABILITIES.get(profile.role_key)
    if explicit is not None:
        return set(explicit)
    return {"handoff.prepare"}


def validate_capability_registry(
    profiles: list[StaffProfileDocument],
    executable_tools: set[str],
) -> None:
    unknown = {
        capability
        for grants in ROLE_CAPABILITIES.values()
        for capability in grants
        if capability not in executable_tools
    }
    if unknown:
        raise ValueError(f"Capability registry references unknown tools: {sorted(unknown)}")

    for profile in profiles:
        grants = capabilities_for(profile)
        declared = set(profile.tools)
        undeclared = grants - declared
        unauthorized = declared - grants
        if undeclared or unauthorized:
            raise ValueError(
                f"Profile {profile.role_key} capability mismatch: "
                f"missing={sorted(undeclared)}, unauthorized={sorted(unauthorized)}"
            )
