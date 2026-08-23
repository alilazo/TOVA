# Playwright QA Loop Design

Date: 2026-07-27
Status: Approved for implementation

## Goal

Give Ava a safe, evidence-backed browser QA capability for approved local URLs. Ava can inspect a project page with Playwright, capture a screenshot and page diagnostics, return a `pass`, `fail`, or `needs_improvement` quality recommendation, and escalate non-passing results to Alex for a user-approved fix plan.

## Scope

V1 is local-only. Ava may audit `http://localhost:*` and `http://127.0.0.1:*` after explicit user approval. TOVA does not start arbitrary servers, visit external URLs, expose cookies/storage, or grant Ava unrestricted command/network access.

## Design

### Browser Audit Tool

Add `qa.browser.audit` for Ava. Inputs:

- `url`: approved local URL to inspect
- `purpose`: why the browser check is needed
- `acceptance_criteria`: expected behavior or visual outcome
- `viewport`: optional width/height
- `selectors_to_check`: optional CSS selectors Ava wants inspected

The backend validates the URL, requests approval with a `browser_audit` approval kind, runs a bundled Playwright script, caps output, and returns structured JSON.

### Evidence Contract

The audit result includes:

- final URL and title
- viewport
- screenshot path
- visible text summary
- console errors
- failed requests
- layout findings such as overlapping clickable elements, offscreen elements, zero-size controls, and selected selector summaries
- recommended verdict: `pass`, `fail`, `needs_improvement`, or `blocked`

### QA Report

Ava turns the raw audit into a report artifact with:

- `verdict`: `pass`, `fail`, or `needs_improvement`
- `summary`
- `evidence`
- `defects`
- `coverage_gaps`
- `fix_prompt` when work is needed

`blocked` audit results become `needs_improvement` QA reports unless the mission cannot proceed.

### Coordinator Fix Loop

If Ava reports `fail` or `needs_improvement`, Alex creates a fix plan proposal using Ava's evidence. The user must approve that plan before engineers act. V1 surfaces this through existing plan-review mechanics rather than automatically assigning engineers.

### Events

Add or reuse versioned events:

- `approval.requested`, `approval.accepted`, `approval.rejected` for browser audit approval
- `staff.test.started` before audit
- `staff.test.result` after audit with verdict and evidence summary
- `artifact.created` for the QA report

## Safety Rules

- Only `http://localhost`, `http://127.0.0.1`, and `http://[::1]` are allowed in v1.
- Every browser audit requires explicit approval.
- Do not serialize cookies, local storage, request headers, response bodies, credentials, or full page HTML.
- Output is bounded and redacted.
- Screenshot artifacts stay under the workspace-controlled artifact directory.

## Success Criteria

1. Ava can request a browser audit of an approved local URL.
2. Rejecting the approval does not launch Playwright.
3. Accepting the approval launches Playwright, stores a screenshot, and returns structured evidence.
4. The UI shows browser audit approval copy and QA report evidence in existing mission surfaces.
5. Non-passing QA results create an Alex fix-plan proposal for user approval, not automatic engineering work.
6. Backend, frontend, and Playwright fixture tests cover pass, needs-improvement, blocked, and approval-reject paths.
