# TOVA Diagnostics

Use this page when the UI, API, local model, or project root is not working.

## 1. Web client

- Packaged TOVA: the app should open `http://127.0.0.1:8000/` in your browser.
- Contributor `pnpm dev`: the client is `http://127.0.0.1:5173` against the API on port 8000.
- If no window appears, open that URL yourself. Set `TOVA_OPEN_BROWSER=0` to disable auto-open.

Recovery: relaunch TOVA, or open the Start Menu item **Open TOVA in browser**.

## 2. API

- Check `GET http://127.0.0.1:8000/api/runtime/status`.
- A JSON body with `state` `connected`, `unconfigured`, or `unavailable` means the API is up.
- If the request fails, another process may own port 8000, or TOVA is not running.

Recovery: close the TOVA command window, or quit leftover `tova.exe` / uvicorn processes, then start TOVA again. Packaged runs accept `TOVA_PORT`. Closing the command window is the supported way to stop the app and release the port.

## 3. Local model (LM Studio)

- Default endpoint: `http://127.0.0.1:1234/v1`.
- Install LM Studio separately. Start **Local Server** and load a model.
- Unconfigured: open **Connect local model** and finish setup.
- Unavailable / no loaded model: start Local Server, load a model, then Retry.
- Advanced: use a non-default local URL only from the setup dialog **Advanced** controls.

Recovery: Settings → Diagnostics, then Retry in the model dialog.

## 4. Project root

- Open or create a project from Explorer. Empty machines get the bundled first-mission sample.
- If `TOVA_ALLOWED_PROJECT_ROOTS` is set, paths outside that list are rejected.
- Invalid, missing, or non-directory paths return an actionable error in the Open project dialog.

Recovery: pick a folder you own, or create a new project path.

## 5. Mission recovery after restart

- A running mission is restored as paused. Reopen the last mission from the Team Floor or Missions list.
- WebSocket close `4404` means replay could not reconstruct the mission. Reopen the project and send a follow-up.

## Verification commands (contributors)

```bash
pnpm verify
uv run python scripts/verify.py
pnpm --filter @tova/web test:e2e
```
