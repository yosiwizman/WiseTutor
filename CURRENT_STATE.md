# CURRENT_STATE — WiseTutor

Snapshot of reality at baseline bootstrap. Updated after every meaningful change.

Source baseline: imported from the working `/home/ai-desktop/projects/DeepTutor`
directory on 2026-04-12. Copied via `rsync`, excluding `.git`, `.venv`,
`node_modules`, `.next`, `__pycache__`, `logs/`, `artifacts/`,
`data/memory/_quarantined/`, `data/user/`. Upstream's README was renamed to
`DEEPTUTOR_UPSTREAM_README.md`.

## Proven today (Tier 1 or Tier 2)

- Local backend + frontend run (Python :8001, Next.js :3782) using
  `scripts_local/start_deeptutor.sh`.
- Three LLM profiles configured in `data/user/settings/model_catalog.json`:
  OpenAI, Anthropic, Local Ollama. Active selection persists across restart.
- `POST /api/v1/settings/active`, `POST /api/v1/settings/verify`, and
  `GET /api/v1/settings/diagnostics` endpoints work; Playwright and pytest
  integration tests green against them.
- Memory identity guard (`deeptutor/services/memory/service.py`) rejects
  identity-claim writes. Auto-refresh is off by default.
- Server-truth identity interceptor in `AgenticChatPipeline.run` replies
  from the resolver's runtime and never calls the LLM for identity questions.
- Per-message runtime chip renders in the chat UI and matches the resolver.
- Popup (RuntimeBadge) is portal-based + collision-aware; Playwright
  bounding-box assertions pass at 1280×900, 1366×768, 1440×900.
- Playwright evidence folders live under `artifacts/fix_evidence/<ts>/` and
  `artifacts/popup_fix/<ts>/` (excluded from import; regenerate locally).

## Remote state

- Remotes configured: `origin` = `yosiwizman/WiseTutor`, `upstream` = `HKUDS/DeepTutor`.
- Branch on `origin`: `bootstrap/wisetutor-baseline` (pushed 2026-04-12).
- `main` on `origin` does NOT yet exist. Founder promotes the bootstrap
  branch to `main` via GitHub (merge / PR or rename), or refreshes the
  local `gh` token with `workflow` scope to push `main` directly.

## Designed but not executed (Tier 3)

- WiseTutor rebrand (module names, UI strings, desktop launcher labels).
- Multi-user per-namespace memory.
- Bella / Mr W per-user profile isolation.
- Theme / appearance system.
- Voice pipeline (STT/TTS).
- CI for the product repo.

## Claimed but not built (Tier 4)

- Nothing should be listed here. If you catch a Tier-4 claim, fix it or delete it.

## Known gotchas carried forward from the imported baseline

- Package/module names still say `deeptutor`. Rename is Phase 1 on ROADMAP.
- `data/user/settings/model_catalog.json` is excluded from the import (owner's
  key material). A fresh WiseTutor clone needs its own catalog + keys.
- `.env` holds the OpenAI key in plaintext and was chmod 600 on the source
  machine. Rotate the previously-exposed OpenAI key before reusing.
- In-memory `_VERIFY_CACHE` in `settings.py` clears on backend restart.
- SQLite session history from prior sessions can surface the pre-fix false
  identity text when a user reopens an old session. It is not re-injected
  into PROFILE/SUMMARY.

## Where the evidence lives

- Python tests: `tests/unit/test_memory_identity_guard.py`,
  `tests/integration/test_identity_reply_honesty.py`,
  `tests/integration/test_chat_runtime_truth.py`.
- Playwright tests: `web/tests/e2e/identity-truth.spec.ts`,
  `web/tests/e2e/popup-layout.spec.ts`.
- Artifacts (not committed): re-run Playwright to regenerate PNGs and
  `runtime_proof.json` under `artifacts/`.

## Update policy

After any meaningful change to code, infra, or direction, update this file
in the same commit. If you don't update it, you didn't actually finish.
