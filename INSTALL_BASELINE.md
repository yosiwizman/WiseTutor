# INSTALL_BASELINE — WiseTutor

Exact machine software required to run WiseTutor locally, derived from the
proven working build on Ubuntu 24.04 LTS (owner's desktop, 2026-04-12).

## OS
- Ubuntu 24.04 LTS (or binary-compatible Linux). Tested on this baseline.

## System packages
- `git`, `curl`, `build-essential`
- `python3` >= 3.11 (tested: 3.12.3)
- `python3-venv`
- `nodejs` >= 20 (tested: v22.22.2)
- `npm` (ships with Node 22)
- `lsof`, `ss`, `xdg-open` (used by launcher scripts)

## Python environment
- Virtualenv at repo root: `.venv/`
- Install:
  ```
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip setuptools wheel
  .venv/bin/pip install -r requirements/server.txt
  .venv/bin/pip install -e ".[server]"
  .venv/bin/pip install pytest pytest-asyncio websockets
  ```

## Frontend
- `cd web && npm install`
- Dev server: `npm run dev -- --port 3782`
- Playwright browsers: `npx playwright install chromium`

## Local LLM
- Ollama daemon reachable at `http://localhost:11434`.
- Models used by the baseline:
  - `qwen2.5:72b` — local LLM
  - `nomic-embed-text` — local embeddings
- Pull with: `ollama pull qwen2.5:72b` and `ollama pull nomic-embed-text`.
- On this baseline the Ollama blob directory is `/mnt/models/ollama/` with
  group `ollama` write perms; adjust for a fresh machine.

## Runtime config
- `.env` at repo root (chmod 600). Required keys:
  - `BACKEND_PORT=8001`, `FRONTEND_PORT=3782`
  - `LLM_*` seed values (overridden by catalog after first load)
  - `EMBEDDING_BINDING=ollama`, `EMBEDDING_MODEL=nomic-embed-text`,
    `EMBEDDING_HOST=http://localhost:11434`, `EMBEDDING_DIMENSION=768`
- `data/user/settings/model_catalog.json` (chmod 600) holds the multi-profile
  catalog. Not imported from upstream; must be provisioned per machine.

## Launch
- `scripts_local/start_deeptutor.sh` — starts backend + frontend, waits for
  :3782 to respond, opens the browser.
- `scripts_local/stop_deeptutor.sh` — stops both.
- `scripts_local/status_deeptutor.sh` — shows status and ports.
- Desktop launchers: `~/Desktop/DeepTutor.desktop` (and `DeepTutor Stop.desktop`).
  Rename to WiseTutor in Phase 1.

## Verification gate on a fresh machine
1. `curl http://localhost:8001/api/v1/settings/diagnostics` returns non-error JSON.
2. `curl -X POST http://localhost:8001/api/v1/settings/verify -d '{"service":"llm"}' -H 'Content-Type: application/json'` returns `"ok": true`.
3. Frontend at `http://localhost:3782` renders the composer; the RuntimeBadge
   pill shows the active provider/model and opens a popup that fully fits the
   viewport.
4. `pytest tests/unit tests/integration` — 15 tests pass.
5. `cd web && npx playwright test --project=identity-truth --project=popup-layout` — 10 tests pass.

## Security baseline (see SECURITY_BASELINE.md for detail)
- Never commit `.env`, `data/user/`, or `data/memory/_quarantined/`.
- Rotate any OpenAI/Anthropic keys that were ever displayed on screen.
