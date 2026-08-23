# Security Boundaries

TOVA operates on real local projects and can run approved commands. It is not an arbitrary-code sandbox, so the following boundaries are part of the current contract.

## Project and filesystem containment

- Projects are opened by path. When `TOVA_ALLOWED_PROJECT_ROOTS` is configured, the resolved project path must be beneath one of those roots.
- Repository operations accept project-relative paths only. Absolute paths, `..` traversal, symlink escapes, sensitive filenames, excluded directories, and credential-key suffixes are rejected.
- File reads and writes have size limits. Writes use a temporary file and atomic replacement.
- API file responses expose project-relative paths and requested content, not unrestricted host paths.

## Command approval boundary

- A structured command request records the executable, arguments, relative working directory, purpose, timeout, and expected outputs.
- Every command blocks until its approval is accepted or rejected.
- The working directory must resolve inside the active project.
- Approved commands run without stdin, inherit only an allowlisted environment, and enforce timeout and output limits.
- Streamed command events report byte counts and redaction status; raw output is not placed in the event stream.
- Mission cancellation terminates the active runtime task and any command runner participating in that task.

## Model and staff data

- LM Studio is the only live provider. Model server URLs must use HTTP or HTTPS, cannot embed credentials, and default to local or private hosts.
- Provider tokens remain backend-only and are excluded from errors, logs, and events.
- A selected model is required before mission creation. Reachability is rechecked before mission start.
- Staff metadata comes from Markdown under `HiPo-Staff/staff`. The public API uses an explicit response model that excludes permissions, instruction sections, and source paths.

## Events and operational visibility

- Events are schema validated and appended before broadcast.
- Work Logs are projections of persisted operational events; they do not expose hidden reasoning.
- Event payloads must not contain credentials, unrestricted command input, raw command output, or unredacted secrets.

## Deployment limitations

The current HTTP and WebSocket service does not implement user authentication or multi-user authorization. Bind it to a trusted local interface (`127.0.0.1`) and do not expose it directly to an untrusted network. Mission events are persisted under the TOVA data directory so replay survives an API process restart. Pause and cancel take effect between agent iterations and do not abort an in-flight model HTTP request. Command execution is approval-gated and project-root contained; TOVA is not an OS network jail. LM Studio remains an external local process and is not bundled with TOVA.

## Reporting

Security issues should be reported privately to project maintainers. Do not include credentials, private repositories, or sensitive source content in a public issue.
