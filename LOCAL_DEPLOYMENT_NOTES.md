# DeepTutor — Local Deployment (ai-desktop)

## Paths
- Repo: `/home/ai-desktop/projects/DeepTutor`
- Python venv: `.venv/` in repo root
- Logs + PIDs: `logs/` in repo root
- Desktop launchers: `~/Desktop/DeepTutor.desktop`, `~/Desktop/DeepTutor Stop.desktop`

## Models (local Ollama @ localhost:11434)
- LLM: `qwen2.5:72b`
- Embedding: `nomic-embed-text` (dimension 768)

## Ports
- Backend: 8001 (`python -m deeptutor.api.run_server`)
- Frontend: 3782 (`npm run dev` in `web/`)

## Launch / Stop / Status
```
scripts_local/start_deeptutor.sh
scripts_local/stop_deeptutor.sh
scripts_local/status_deeptutor.sh
```
Or double-click the Desktop icon.

## Changing models
Edit `.env`:
- `LLM_MODEL=<ollama model tag>`
- `EMBEDDING_MODEL=<ollama embedding model>`
- `EMBEDDING_DIMENSION=<model dim>`
Then restart via the Stop/Start launchers.

## Runtime Truth UI

- **Chat composer** has a small pill near the send button showing `Provider · Model` with a colored dot. Click it for a Provider dropdown, Model dropdown, and a Verify button. Colors:
  - green = last verification against provider succeeded
  - yellow = selection exists but not yet verified this session
  - red = last verification failed
  - gray = no selection
- **Settings page** has a "Runtime Truth" panel at the top showing active binding, model, base URL, API-key presence, last-test result, and a per-model Verify button. Values come from backend diagnostics, not the model's self-description in chat.
- **Diagnostics**: `GET /api/v1/settings/diagnostics` — read-only runtime truth (no secrets).
- **Switch active**: `POST /api/v1/settings/active` `{service,profile_id,model_id}`.
- **Verify**: `POST /api/v1/settings/verify` `{service, profile_id?, model_id?}` — runs a real provider call and caches the result.

## Search
- `duckduckgo` is the default / fallback provider (no key required).
- `brave` is selectable in Settings → Search. Provide a Brave API key to activate it; otherwise DuckDuckGo remains active.
- RuntimeTruthPanel shows the active search provider and flags "no key — falling back to DuckDuckGo" when Brave is selected without a key.

## Notes
- Search providers are disabled (unset) per local-first setup.
- API key fields contain the harmless placeholder `ollama-local` (Ollama ignores them).
- First launch of the desktop `.desktop` file may require one GUI "Allow Launching" click in Nautilus/GNOME.
