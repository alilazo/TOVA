from pathlib import Path

import pytest

from app.orchestration.prompts import compile_staff_system_prompt
from app.services.staff_profiles import StaffProfileError, StaffProfileRepository


def test_loads_all_seven_profiles_and_compiles_safe_prompt() -> None:
    root = Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    profiles = StaffProfileRepository(root).load_all()

    assert len(profiles) == 7
    assert {profile.role_key for profile in profiles} == {
        "project_coordinator",
        "researcher",
        "software_engineer",
        "backend_developer",
        "frontend_developer",
        "qa_tester",
        "advisor",
    }
    prompt = compile_staff_system_prompt(profiles[0])
    assert "Do not reveal hidden reasoning" in prompt
    assert "project root" in prompt
    assert "explicit user approval" in prompt


def test_lina_description_is_not_react_only() -> None:
    root = Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    profiles = StaffProfileRepository(root).load_all()
    lina = next(profile for profile in profiles if profile.id == "staff_lina")

    assert "React" not in lina.description
    assert "HTML" in lina.description or "front-end" in lina.description.lower()


def test_ava_prompt_requires_strict_qa_report_template() -> None:
    root = Path(__file__).parents[3] / "HiPo-Staff" / "staff"
    profiles = StaffProfileRepository(root).load_all()
    ava = next(profile for profile in profiles if profile.id == "staff_ava")

    prompt = compile_staff_system_prompt(ava)

    assert "QA Test Report:" in prompt
    assert "Acceptance Criteria:" in prompt
    assert "Commands Run:" in prompt
    assert "Results:" in prompt
    assert "Conclusion:" in prompt
    assert "Do not repeat the same tool call" in prompt


def test_rejects_missing_sections_and_duplicate_ids(tmp_path: Path) -> None:
    metadata = """---
id: same
employee_id: TOVA-TEST
slug: test-staff
name: Test Staff
display_name: Test
role: Tester
role_key: tester
department: Testing
seniority: Test
avatar: pixel/test
status: available
description: Tests staff profile validation.
model_profile: test-default
tools: []
permissions: {}
can_delegate: false
can_approve: false
tags: []
---
# Identity
Test
"""
    (tmp_path / "one.md").write_text(metadata, encoding="utf-8")
    with pytest.raises(StaffProfileError, match="Missing"):
        StaffProfileRepository(tmp_path).load_all()

    complete = metadata + "\n".join(
        f"# {heading}\ntext\n"
        for heading in StaffProfileRepository.REQUIRED_SECTIONS
        if heading != "Identity"
    )
    (tmp_path / "one.md").write_text(complete, encoding="utf-8")
    (tmp_path / "two.md").write_text(complete, encoding="utf-8")
    with pytest.raises(StaffProfileError, match="Duplicate"):
        StaffProfileRepository(tmp_path).load_all()
