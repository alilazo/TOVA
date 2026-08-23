# TOVA Contributor Guidance

## Product invariants

- TOVA is a serious local-first development environment with a restrained visual workforce layer.
- Never expose or request private chain-of-thought. Use operational summaries, evidence, decisions, blockers, and next actions.
- Preserve the product name `TOVA` and directory name `HiPo-Staff`.
- Keep the interface mostly neutral and compact. Avoid gradients, glass effects, cartoon office scenes, and decorative game mechanics.

## Engineering rules

- Use strict TypeScript and typed Python.
- Write behavior tests before implementation and run them in red-green order.
- Keep event contracts versioned and synchronized between frontend and backend.
- TanStack Query owns server state; Zustand owns ephemeral interface state.
- Persist events before broadcasting when working on the backend.
- Do not expose credentials in APIs, logs, events, or tests.
- Do not enable unrestricted host filesystem, command, or network access.
- Prefer focused files and components under roughly 300 lines.

## Verification

Run `pnpm verify` for frontend checks and `uv run python scripts/verify.py` for the complete workspace once backend dependencies are installed. Do not claim behavior works without fresh command or browser evidence.
