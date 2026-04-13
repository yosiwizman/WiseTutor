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

## Phase 3 slice 4 — child safety reinforcement — PROVEN Tier 1 (input) / Tier 2 (output)

- `deeptutor/services/safety/child_policy.py` — conservative rule-based
  categories: sexual, self_harm, weapons, drugs, wrongdoing, violence.
  `screen_input`, `screen_output`, `safe_child_redirect`, `log_safety_event`.
- Input gate: `unified_ws` screens requests for users with
  `safety_profile=child`. Blocked → terminal event `{reason: "safety_filter_input",
  category, user_id, safety_profile}` + child-safe redirect content event.
- Output gate: `turn_runtime._run_turn` screens assembled `assistant_content`
  before persist. Blocked → terminal `safety_filter_output` event and the
  stored content is replaced with the redirect (conversation history stays safe).
- Structured audit on logger `wisetutor.safety` — raw user text is not logged.
- Safe educational prompts are not blocked (verified live for Bella).
- Mr W (`safety_profile=standard`) is never routed through the child gate.
- 40 pytest + 21 Playwright pass, 0 skipped.

## Phase 3 slice 3 — capability enforcement — PROVEN Tier 1

- Frontend composer picker is filtered by `preferences.allowed_capabilities`
  from the active user. Disallowed capabilities do not render; the current
  selection is snapped to plain chat on user switch.
- WebSocket boundary (unified_ws) rejects turns with unlisted capability via
  an explicit terminal event `{reason: "capability_not_allowed", requested_capability, allowed_capabilities, user_id}`.
- Runtime safety net in `turn_runtime._run_turn` rejects stamped-user turns
  whose capability is not in their allowlist, even if the WS is bypassed.
- Mr W default allowlist covers all 6 capabilities; Bella is restricted to
  `chat`, `deep_question`, `math_animator`. Verified live.
- 29 pytest + 18 Playwright pass, 0 skipped.

## Phase 3 slice 2 — per-user preferences + prompt identity — PROVEN Tier 1

- `User.preferences` merged with role defaults (`owner` / `user` / `child`).
  Bella default: tone=warm, response_length=short, safety=child, restricted caps.
  Mr W default: tone=direct, response_length=medium, safety=standard, full caps.
- REST surface: `GET /api/v1/users/{id}/preferences`, `PUT .../preferences`.
  Anon → 401; non-owner cross-user → 403; owner can read/write any; validation → 400.
- Runtime threading: `unified_ws` resolves prefs from the signed cookie and
  stamps them + display_name + user_id onto the payload. `turn_runtime`
  forwards them into `UnifiedContext.metadata`. `ChatCapability`
  instantiates `AgenticChatPipeline(user_id=...)`. `_build_messages`
  prepends a boxed, auditable identity/preferences system message.
- Settings UI gains a `PreferencesPanel` with a visible
  "editing as <display_name> (<role>)" badge.
- Measurable divergence proven: same prompt, same model → Bella gets a
  shorter, child-friendly answer; Mr W gets a longer, direct one. Bytes
  differ. Proof JSON + screenshots under `artifacts/phase3_prefs/<ts>/`.
- 22/22 pytest, 15/15 Playwright, **0 skipped**.

## Phase 3 slice 1 — per-user catalog — PROVEN Tier 1

- Provider/model catalog is now per-user at `data/users/<id>/settings/model_catalog.json`.
- `get_model_catalog_service(user_id)` returns a per-user instance.
- `/api/v1/settings/*` endpoints resolve user from cookie; 401 anon.
- Legacy shared `data/user/settings/model_catalog.json` archived under
  `data/users/_legacy/<ts>/user/settings/`; Mr W inherited the shared
  catalog as legacy owner (option (a)); Bella starts with a clean default.
- `resolve_llm_runtime_config(user_id=...)`, `resolve_embedding_runtime_config(user_id=...)`,
  and `get_llm_config(user_id)` are per-user. `AgenticChatPipeline` takes
  `user_id` from `UnifiedContext.metadata['_wt_user_id']`.
- Proven: Mr W on Anthropic/claude-opus-4-6 while Bella stays on Ollama/qwen2.5:7b
  simultaneously; neither can mutate the other's catalog bytes.
- 13 pytest pass, 13 Playwright pass across four projects.

## Phase 2 closed (slice 3) — PROVEN Tier 1

- `get_memory_service` / `get_sqlite_session_store` / `get_turn_runtime_manager`
  **REQUIRE an explicit `user_id`**. The legacy "fall back to UserService
  active hint" behavior is removed from live paths; any bare call raises
  `RuntimeError`. Only a narrow CLI helper (`get_memory_service_for_cli`)
  remains, and it still requires an explicit user.
- `/api/v1/sessions` and `/api/v1/memory` return **401** when there is no
  signed cookie (no silent reads of another user's data).
- `UserService.active_user_id()` now raises; the last-used hint is available
  as `last_used_user_id()` for CLI/diagnostic callers only. No router reads it.
- `UserSwitcher` no longer `window.location.reload()`s. It blocks while a
  turn is in flight (`window.__wt_inflight_turn`) and dispatches a
  `wt:user-switched` event on clean switch.
- `lib/unified-ws.ts` now asks the backend for a signed `ws-token` and
  connects with `?wt_uid_token=...` — main composer WS is identity-bound.
- Mr W and Bella are **both off** the seeded default PIN (`pin_is_default: false`).
- 6 pytest + 12 Playwright cases pass against the live WiseTutor runtime.
- Legacy shared storage archived to `data/users/_legacy/<ts>/` on first WiseTutor boot.

## Per-request identity + legacy migration + forced PIN rotation (Phase 2 slice 2) — PROVEN Tier 1

- Identity is now a **per-request signed cookie** (`wt_uid`). No server-global
  active user on the live path. WebSocket reads the cookie header or a signed
  `wt_uid_token` query param.
- `MemoryService`, `SQLiteSessionStore`, `TurnRuntimeManager`, and
  `/api/v1/settings/{verify,diagnostics}` are all keyed by user id.
- The legacy shared `data/memory/`, `data/user/chat_history.db`,
  `data/chat_history.db`, and `data/sessions/` have been archived to
  `data/users/_legacy/<timestamp>/` on the first boot from the WiseTutor tree.
- Seeded-default PINs block chat: the WS rejects turns with
  `reason=pin_rotation_required`, and the frontend `UserGate` renders a
  mandatory change-PIN dialog until the user rotates.
- Next.js proxies `/api/*` (not `/ws`) to the FastAPI backend so fetch
  cookies flow same-origin.
- Runtime source of truth: live backend + frontend run from
  `/home/ai-desktop/projects/WiseTutor/` (not DeepTutor). Drift eliminated.
- 6/6 pytest integration cases pass, 2/2 Playwright two-browser cases pass.

## Multi-user foundation (Phase 2 slice 1) — PROVEN Tier 1/2

- `UserService` with registry at `data/users.json` and per-user directories at
  `data/users/<id>/{memory,sessions.db}`.
- Seed users on first run: `mrw` (Mr W, owner) and `bella` (Bella, child).
- PINs are PBKDF2-SHA256 with per-user salt. Defaults are configurable via
  `WISETUTOR_DEFAULT_PIN_MRW` and `WISETUTOR_DEFAULT_PIN_BELLA` env vars.
- REST API at `/api/v1/users`: list, active, switch, pin change, upsert.
  Wrong PIN → HTTP 403, never reveals which field was wrong.
- `MemoryService`, `SQLiteSessionStore`, and `TurnRuntimeManager` all cache
  per active user id and invalidate on switch.
- Legacy shared `data/memory/` dir is no longer read by the chat path.
- Frontend `UserSwitcher` component sits next to the RuntimeBadge pill;
  profile switch opens a PIN modal and reloads the client on success.
- 8/8 integration tests pass (`tests/integration/test_multi_user_isolation.py`).
- 3/3 Playwright E2E pass (`web/tests/e2e/user-switcher.spec.ts`).

## Designed but not executed (Tier 3)

- WiseTutor rebrand (module names, UI strings, desktop launcher labels).
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
