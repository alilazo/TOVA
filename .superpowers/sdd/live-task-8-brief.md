### Task 8: Synchronize canonical documentation and contracts

**Files:**
- Modify: `README.md`
- Modify: `docs/PRODUCT_SPEC.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/SECURITY.md`
- Modify: `docs/EVENT_PROTOCOL.md`
- Modify: `PLANS.md`
- Modify: `apps/web/AGENTS.md`
- Modify: `.env.example` if current live model defaults are incomplete

- [ ] **Step 1: Rewrite canonical product/runtime descriptions**

Document:

- selected LM Studio model is required,
- runtime states are Unconfigured/Connected/Unavailable,
- real path-based projects,
- Markdown-backed staff,
- event-derived Work Logs,
- pause/resume/cancel,
- persisted reconnect replay,
- command approvals and filesystem containment.

Remove current support claims for deterministic simulation, Orion fixtures, virtual repository, seeded mission replay, and playback speed.

- [ ] **Step 2: Update the event protocol**

Keep reconnect replay. Remove the claim that WebSocket controls include playback speed. Supported controls are pause, resume, cancel, and heartbeat.

- [ ] **Step 3: Audit canonical docs**

```powershell
rg -i "simulation|simulated|seeded mission|orion platform|virtual repository|playback speed|fake provider" README.md docs/PRODUCT_SPEC.md docs/ARCHITECTURE.md docs/SECURITY.md docs/EVENT_PROTOCOL.md PLANS.md apps/web/AGENTS.md
```

Expected: no claims that TOVA supports production simulation. Historical files under `docs/superpowers/` are excluded.

## Global constraints

- Canonical docs must describe only the implemented live-only architecture.
- A selected, reachable LM Studio model is required before mission persistence and revalidated before execution.
- Runtime states are exactly Unconfigured, Connected, and Unavailable.
- Projects are real path-based local workspaces with containment.
- Staff metadata comes from Markdown under `HiPo-Staff`; public API fields are allowlisted.
- Work Logs derive only from persisted mission events.
- Supported mission controls are pause, resume, cancel, and heartbeat.
- Reconnect replay remains persisted event replay, not seeded/demo playback.
- Command approvals and filesystem containment remain explicit security boundaries.
- Historical plans/specs under `docs/superpowers/` must not be edited.
- No Git repository exists; do not attempt commits.
