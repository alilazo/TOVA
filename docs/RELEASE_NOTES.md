# TOVA release notes

## 0.1.0 — local-first MVP

TOVA is a one-process Windows app plus a contributor `pnpm dev` path. LM Studio is not bundled.

User-visible behavior in this MVP:

- Start Menu launch opens `http://127.0.0.1:8000/` and serves the UI from the same process as the API.
- First launch opens the sample project and prefills the Count-button mission when there is no history.
- Last project and newest mission restore onto the Team Floor after relaunch.
- Alex proposes a plan before staff run. Plan accept, command approval, and browser-audit approval are blocking next actions.
- Ava cannot finish QA on file reads alone. Packaged browser audit falls back to a static page check when Node/Playwright is not installed.
- Pause waits between agent steps and does not abort an in-flight LM Studio HTTP request. Cancel marks the mission cancelled and cancels the asyncio task.
- Settings includes Local model and Diagnostics. HiPo Staff, Search, Explorer, Missions, and Team Floor are distinct destinations.

Known limitations are listed in the README.
