# HiPo-Staff Profile Specification

HiPo-Staff (High-Power Staff) profiles are Markdown documents with validated YAML frontmatter and role-specific operating instructions. Markdown is the human-editable source of truth; database records are projections.

## Frontmatter

Required keys are `id`, `employee_id`, `slug`, `name`, `display_name`, `role`, `role_key`, `department`, `seniority`, `avatar`, `status`, `description`, `model_profile`, `temperature`, `max_context_tokens`, `tools`, `permissions`, `can_delegate`, `can_approve`, `handoff_targets`, `tags`, and `version`.

- IDs and slugs must be unique.
- `employee_id` uses `TOVA-NNN`.
- `role_key` and handoff targets use snake case.
- `avatar` must resolve to a bundled local pixel-art identifier.
- `temperature` is between 0 and 2.
- Tools are explicit capabilities, not free-form executable commands.
- Permissions default to false.
- Unknown frontmatter fields are rejected for version 1.

## Required body sections

Every profile includes, in order:

1. Identity
2. Mission
3. Responsibilities
4. Operating Instructions
5. Inputs Expected
6. Outputs Required
7. Tools
8. Quality Standards
9. Constraints
10. Handoff Rules
11. Escalation Rules
12. Completion Checklist

Sections describe operational behavior and observable outputs. They must not request hidden chain-of-thought. Decisions are summarized with evidence, assumptions, and confidence.

## Parsing

The parser:

1. Reads only `.md` files below the configured `HiPo-Staff/staff` root.
2. Resolves and verifies paths to prevent traversal.
3. Parses YAML with safe loading.
4. Validates frontmatter with Pydantic.
5. Verifies all required headings.
6. Returns a typed profile plus Markdown body.
7. Reports file and field context without leaking unrelated file contents.

## Versioning

`version: 1` is the initial profile format. Breaking changes increment the version and require a migration function. Existing missions retain a snapshot of staff identity and assignment metadata so historical event replay remains stable after profiles change.
