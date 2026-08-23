# Web Application Guidance

- Compose the UI from small feature and product components.
- Use shadcn/ui primitives as accessible foundations, then apply TOVA semantic tokens.
- Keep colors in CSS variables; use status color only with visible status text.
- Keep projects, model profiles, missions, staff, approvals, and repository data in TanStack Query. Zustand is limited to panel, selection, tab, filter, and overlay state.
- All mission UI state must be reconstructable from ordered `EventEnvelope` values.
- Derive every Work Log field from persisted mission events; do not create a parallel staff activity state.
- Treat model runtime states as the closed set Unconfigured, Connected, and Unavailable.
- Do not enable mission submission until a model is selected and Connected; the backend remains authoritative and revalidates before execution.
- Use real path-based project APIs. Never introduce bundled project content or bypass backend filesystem containment.
- Mission controls are pause, resume, and cancel; WebSocket heartbeat supports connection health.
- Approval UI must display structured command details and must not imply a command can run before explicit acceptance.
- Reconnect from the last accepted sequence and reduce replayed events through the same projection path as live events.
- Monaco is an adapter boundary; tests may replace only the editor implementation.
- Respect keyboard navigation, screen readers, focus management, and reduced motion.
- Avoid raw hidden reasoning language. Use Work Log, Decision Summary, Observations, and Next Action.
