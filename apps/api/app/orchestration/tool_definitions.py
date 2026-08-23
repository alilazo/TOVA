from app.schemas.models import ToolDefinition


def agent_tool_definitions() -> list[ToolDefinition]:
    return [
        ToolDefinition(
            name="repository.list",
            description="List UTF-8 project files below a relative path.",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.search",
            description="Search project text files.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "path": {"type": "string"},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.find",
            description="Find project files by a safe relative glob pattern.",
            parameters={
                "type": "object",
                "properties": {
                    "pattern": {"type": "string"},
                    "path": {"type": "string"},
                },
                "required": ["pattern"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.read",
            description="Read one UTF-8 project file.",
            parameters={
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.write",
            description="Atomically write one UTF-8 project file.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.apply_patch",
            description="Replace exactly one matching text block in a project file.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old_text": {"type": "string"},
                    "new_text": {"type": "string"},
                },
                "required": ["path", "old_text", "new_text"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="repository.delete",
            description=(
                "Delete one project file after explicit user approval. "
                "Use this to remove a file; do not empty a file to simulate deletion."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "purpose": {"type": "string"},
                },
                "required": ["path", "purpose"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="command.request",
            description="Request explicit user approval for a structured command.",
            parameters={
                "type": "object",
                "properties": {
                    "executable": {"type": "string"},
                    "args": {"type": "array", "items": {"type": "string"}},
                    "cwd": {"type": "string"},
                    "purpose": {"type": "string"},
                    "timeout_seconds": {"type": "number"},
                    "expected_outputs": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["executable", "purpose"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="test.pytest",
            description="Request approval to run pytest in the project.",
            parameters={
                "type": "object",
                "properties": {
                    "args": {"type": "array", "items": {"type": "string"}},
                    "cwd": {"type": "string"},
                    "purpose": {"type": "string"},
                    "timeout_seconds": {"type": "number"},
                    "expected_outputs": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["purpose"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="test.vitest",
            description="Request approval to run Vitest in the project.",
            parameters={
                "type": "object",
                "properties": {
                    "args": {"type": "array", "items": {"type": "string"}},
                    "cwd": {"type": "string"},
                    "purpose": {"type": "string"},
                    "timeout_seconds": {"type": "number"},
                    "expected_outputs": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["purpose"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="qa.browser.audit",
            description=(
                "Request user-approved Playwright inspection of a local project URL. "
                "Prefer http://127.0.0.1/ or http://localhost/ for static sites with "
                "index.html; the runner serves project files automatically. Use this "
                "directly for static page QA instead of starting a local HTTP server "
                "or running npx playwright. Returns screenshot and page diagnostics "
                "for QA verdicts."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "purpose": {"type": "string"},
                    "acceptance_criteria": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "viewport": {
                        "type": "object",
                        "properties": {
                            "width": {"type": "integer"},
                            "height": {"type": "integer"},
                        },
                        "additionalProperties": False,
                    },
                    "selectors_to_check": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["url", "purpose", "acceptance_criteria"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="artifact.create",
            description="Create a concise mission artifact record.",
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                },
                "required": ["title", "summary"],
                "additionalProperties": False,
            },
        ),
        ToolDefinition(
            name="handoff.prepare",
            description=(
                "Prepare a concise handoff to another role with changed files, "
                "test instructions, and acceptance criteria when available."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "to_role": {"type": "string"},
                    "summary": {"type": "string"},
                    "changed_paths": {"type": "array", "items": {"type": "string"}},
                    "test_instructions": {"type": "array", "items": {"type": "string"}},
                    "acceptance_criteria": {"type": "array", "items": {"type": "string"}},
                    "artifact_ids": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["to_role", "summary"],
                "additionalProperties": False,
            },
        ),
    ]


def executable_tool_names() -> set[str]:
    return {tool.name for tool in agent_tool_definitions()}
