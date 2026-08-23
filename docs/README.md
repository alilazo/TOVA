# TOVA Documentation Map

This directory contains the project’s current product, architecture, security, planning, and implementation documentation.

## Current project documents

- [`PLANS.md`](PLANS.md) — delivered runtime contract, global constraints, and verification gate.
- [`MVP_CHECKLIST.md`](MVP_CHECKLIST.md) — release-gate checklist for the next local-first MVP.
- [`DIAGNOSTICS.md`](DIAGNOSTICS.md) — web, API, LM Studio, and project-root recovery path.
- [`RELEASE_NOTES.md`](RELEASE_NOTES.md) — user-visible MVP behavior for this release.
- [`PRODUCT_SPEC.md`](PRODUCT_SPEC.md) — product behavior and user-facing scope.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system boundaries and data flow.
- [`EVENT_PROTOCOL.md`](EVENT_PROTOCOL.md) — versioned event contracts and replay behavior.
- [`STAFF_PROFILE_SPEC.md`](STAFF_PROFILE_SPEC.md) — HiPo-Staff profile structure.
- [`SECURITY.md`](SECURITY.md) — filesystem, command, network, and credential boundaries.

## Historical implementation records

- [`superpowers/plans/`](superpowers/plans/) — implementation plans.
- [`superpowers/specs/`](superpowers/specs/) — approved design specifications.

Historical records remain chronological references. Current behavior and release status belong in the documents at this directory’s top level.

## Source structure

```text
apps/
├── api/
│   ├── app/
│   │   ├── api/             # HTTP route boundaries
│   │   ├── orchestration/   # Mission coordination
│   │   ├── providers/       # Model/provider adapters
│   │   ├── schemas/         # Typed API and event contracts
│   │   └── services/        # Application services and registries
│   └── tests/               # Backend behavior and contract tests
└── web/
    ├── src/
    │   ├── app/             # Application composition and routing
    │   ├── components/      # Focused UI components
    │   ├── features/        # Domain-specific client behavior
    │   ├── stores/           # Ephemeral interface state
    │   ├── styles/           # Global visual system
    │   └── types/            # Shared frontend types
    └── tests/               # Unit, integration, and browser tests
docs/
├── current documents
└── superpowers/
    ├── plans/
    └── specs/
```

## Navigation rule

When changing behavior, start with the relevant current document here, then trace into the corresponding `apps/api` or `apps/web` domain directory. Keep new plans and checklists in `docs/`, not at the repository root.
