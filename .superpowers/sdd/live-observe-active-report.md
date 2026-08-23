# Live observe run — blank project

Project: `TOVA-live-hello-observe`  
Objective: create `hello.html` with exact text `Hello TOVA`, centered.

## Final clean run

- Status: **completed** in ~77s
- Abnormalities: **none**
- Plan gate: proposed → accept; no staff work before accept
- Deliverable: `hello.html` with `Hello TOVA` + flexbox centering

## Abnormalities found earlier (fixed)

1. **Coordinator plan hung / timed out (300s)**  
   Qwen thinking consumed the request; empty or missing `content`.  
   Fix: LM Studio chat completions now send `reasoning_effort: "none"`.

2. **`model.request.failed` missing on plan timeout**  
   Only `mission.failed` was emitted after `model.request.started`.  
   Fix: `_create_plan` emits `model.request.failed` before re-raising.

3. **Wrong copy (`Hello, World!` / bare `Hello`) despite soft remediation**  
   Assignment objective was vague (`Write the code for hello.html`), so phrase checks never saw `Hello TOVA`.  
   Fix: pass mission objective into `AgentRunner` for prompts + wording remediation; coordinator prompt asks assignment objectives to preserve exact user-visible wording.

4. **Ops: zombie uvicorn workers on `:8000`**  
   Reload/`taskkill` left orphan listeners that served stale code. Prefer a clean single API process for live tests.

## Evidence

- Timeline JSON: `.superpowers/sdd/live-observe-active.json`
- Unit coverage: `test_disables_reasoning_on_chat_completions`, `test_plan_timeout_emits_model_request_failed`, updated wording remediation test
