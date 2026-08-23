# API Application Guidance

- Validate all transport input with Pydantic and type all service boundaries.
- Keep routers thin; use services and repositories for use cases and persistence.
- Append mission events transactionally before broadcasting them.
- Preserve per-mission sequence ordering and support replay after a sequence.
- Keep SQLite defaults PostgreSQL compatible.
- Provider credentials stay server-side and are redacted from logs and errors.
- Tool adapters are default-deny. Never pass a user string directly to a command shell.
- Normalize and allowlist repository paths before future filesystem access.
- Use Ruff, mypy, and pytest before reporting backend behavior as working.
