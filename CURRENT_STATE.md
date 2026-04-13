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

## Phase 5 slice 1 — Voice STT foundation — **IMPLEMENTATION CLOSED, real-browser path Tier 3**

**What is built (code):**
- `web/lib/speech-recognition.ts` — thin adapter over `window.SpeechRecognition` / `webkitSpeechRecognition`. Returns `supported: false` in browsers that lack it.
- Deterministic automation seam: when `window.__wt_test_speech` is present (set via Playwright `addInitScript`), the adapter swaps to a fake that exposes `window.__wt_test_speech_driver` with `emitStart/emitInterim/emitFinal/emitEnd/emitPermissionDenied/emitGenericError`. The seam is never set in production code — only by tests.
- `web/components/chat/home/MicButton.tsx` renders next to the composer send button. States (exposed via `data-state`): `idle`, `listening`, `error-permission`, `error-unsupported`, `error-generic`. Interim transcripts appear only in `chat-composer-mic-status` and are never written to the input. Final transcripts are appended to the existing draft with a single-space separator. Stop/cancel never promotes interim to final.
- Cleanup: adapter.stop() runs on component unmount AND on `wt:user-switched` event — no zombie listeners across user switches.
- Send semantics unchanged — mic fills the draft; does NOT auto-send.

**Evidence tiers (honest, per CLAUDE.md grid):**
- Deterministic adapter seam (`__wt_test_speech`): **Tier 2** — proven by sandbox Playwright against the fake adapter. This is test-path code, not the real product runtime. It proves UI wiring, state transitions, append semantics, cleanup, and two-context isolation.
- Local Playwright `voice-stt` proof: **Tier 2** — 7 cases green locally + on hosted CI, driving the deterministic seam. Same classification as above.
- Real browser-native microphone path (`window.SpeechRecognition` capturing actual audio): **Tier 1 (Chrome only, 2026-04-13)** — independently re-executed at the ai-desktop physical display in Chrome 146. Founder dictated "audit one do not send"; phrase landed in the composer; no auto-send. Proof pack: `artifacts/phase5_stt_real_browser/` (screenshots `_01_before.png`, `_03_no_auto_send_evidence.png`, `RESULT_20260413.md`). Tier 1 claim is limited to Chrome on this machine; Firefox real-path is covered by Slice 2 and remains Tier 3 until its own proof lands.
- Hosted CI proof of voice-stt: **Tier 2** (sandbox), now wired into the hosted CI Playwright projects list and proven remotely.
- **No-auto-send behavior (narrow claim, backend-observable):** live founder + observability audit on 2026-04-13 confirmed no backend submit activity occurs during mic capture; submit-path activity (`GET /api/v1/users/ws-token` → new `WebSocket /api/v1/ws` accept → `GET /api/v1/sessions` refresh cluster) appears only after explicit user Send. Pre-send window: 32 log lines, GET-only polling, zero submit markers. Post-send window: ws-token fetch + new WS accept + 3× sessions refresh. This proves the narrow no-auto-send claim only; it does NOT promote the real browser-native microphone path from Tier 3.

**Test summary.** 7 new Playwright cases under `web/tests/e2e/voice-stt.spec.ts` (project `voice-stt`): Mr W insert, draft preservation + append, Bella insert, two-context non-leak, permission-denied, unsupported-browser, mid-listen stop — all green locally and on hosted CI. Pytest regression: 48 passed / 8 skipped (CI shape, unchanged).

**What is NOT yet proven:** Firefox real-audio capture through the Whisper fallback with the real `faster-whisper` engine (that is Slice 2's Tier 3 gap, not Slice 1's).

**Proof-workflow rule (operational).** Browser automation and tool-based validation must be exhausted first. Founder/manual testing is reserved for irreducible real-world proof — physical microphone input, subjective UX approval, or anything that cannot be honestly captured by a headless tool. Agents must not ask the founder to edit markdown, rename files, or perform steps the tools can do.

**Out of scope for this slice (deferred):** TTS, full voice conversation, wake word, server-side STT, transcript history, waveform visualizer.

## Phase 5 slice 2 — Whisper local fallback — **LANDED (local Tier 2)**

**What is built (code):**
- `deeptutor/api/routers/voice.py` — `POST /api/v1/voice/transcribe` accepts a short audio clip, runs `faster-whisper` locally (lazy-loaded, model defaults to `tiny`, CPU int8), and returns `{text, engine, model}`. `GET /api/v1/voice/status` exposes model/device/max-bytes. Hard byte guardrail (default 5 MB) with 413 on exceed; 400 on empty audio; 503 with `local_whisper_unavailable` if `faster-whisper` is not installed. Deterministic test seam: `WISETUTOR_VOICE_STT_TEST_MODE=1` short-circuits all model loading and returns the `X-WT-Test-Transcript` header (or a fixed stub).
- `web/lib/whisper-fallback.ts` — `createWhisperFallbackAdapter` speaks the same `SpeechAdapter` interface as the browser-native path. Uses `MediaRecorder` + `getUserMedia`, POSTs the captured clip to `/api/v1/voice/transcribe`, emits one final transcript on response. Deterministic seam: `window.__wt_test_fallback` + `__wt_test_fallback_driver` drive the adapter without real recording or fetch.
- `web/components/chat/home/MicButton.tsx` now composes both engines: browser-native Web Speech is tried first; if unsupported AND `isWhisperFallbackSupported()` is true, the fallback adapter is selected. A new `data-engine` attribute (`browser-native` | `whisper-fallback` | `unsupported`) exposes the live choice for tests and diagnostics.
- **Runtime failover (native → fallback):** if the browser-native path selects at mount and then emits a recoverable `error-generic` at runtime, MicButton rebinds `adapterRef` to the Whisper fallback once per mount, clears the error to `idle`, and flips `data-failed-over` to `"true"`. The next mic click uses the fallback. `error-permission` and `error-unsupported` are terminal — they do NOT failover (a surprise fallback after permission-denied would be misleading). Failover fires at most once per mount: if the fallback itself errors, the error stays visible and no further rebind happens.
- Append semantics, no-auto-send, user-switch cleanup, and error-state behavior are identical across both engines.

**Evidence tiers (honest):**
- Whisper fallback backend (endpoint wiring + guardrails + test-mode seam): **Tier 2 (local)** — 6 pytest cases under `tests/api/test_voice_router.py` pass hermetically (no model download, no audio).
- Whisper fallback frontend composition (engine selection, append, error, user-switch, native→fallback runtime failover): **Tier 2 (local)** — 9 Playwright cases under `web/tests/e2e/voice-stt-fallback.spec.ts` (project `voice-stt-fallback`) pass against a running local backend, including 4 dedicated failover cases (rebind on native generic error, post-failover no-auto-send, permission-denied stays terminal, failover fires at most once).
- Real faster-whisper model transcription on real audio: **Tier 3** — not independently executed in this session. Requires the optional `faster-whisper` install and a human with a real microphone; intentionally not run here.
- Hosted CI: **NOT wired**. The hosted CI box does not have `faster-whisper` installed and cannot honestly run the real model. The `voice-stt-fallback` Playwright project can run hosted in its deterministic-seam mode, but that would re-prove seams already covered locally; not worth hosting until the real-mic proof pack exists. Left out of hosted CI on purpose.

**Runtime behavior:**
- If Web Speech API is available → browser-native engine is used (unchanged from Slice 1).
- If Web Speech API is unavailable (e.g., Firefox) and the browser has `MediaRecorder` → Whisper fallback engine is used: user clicks mic, records a short clip, releases, backend returns text, text is appended to draft, nothing is auto-sent.
- If neither is available → button is disabled with the `unsupported` status message.
- Backend 503 / 4xx / 5xx on the fallback round-trip surfaces as `error-generic` in the existing MicButton error UI.

**Install note for real-mic production use:** `pip install faster-whisper` (not added to default `requirements/server.txt` to keep the base server install light; the endpoint reports `local_whisper_unavailable` with a clean 503 when the package is missing).

**What this does NOT prove:** that a real user on Firefox dictating real audio gets an accurate transcript back from `faster-whisper`. That is still a human proof.

## Phase 6 slice 1 — CI foundation — **LANDED** (hosted green)

**Remote green.** First green GitHub-hosted Actions run:
- Run URL: https://github.com/yosiwizman/WiseTutor/actions/runs/24325424376
- Run ID: `24325424376`
- Workflow: `WiseTutor CI`
- Branch: `bootstrap/wisetutor-baseline`
- Commit tested: `5b2db76`
- Job: `pytest + Playwright (no-provider subset)` — success (2m36s)
- Counts: **pytest 48 passed, 8 skipped, 0 failed**; **Playwright 15 passed, 0 failed**
- Artifact: `wisetutor-ci-artifacts` (739 KB)

**Iteration to green (4 hosted runs).**
1. `24325176026` (commit `849c713`) — 3 pytest failures in `/settings/verify` + `/diagnostics` tests that inherently need a real provider.
2. `24325264316` (commit `54d986a`) — marked success but silently masked 1 Playwright failure through `tee` (no pipefail).
3. `24325355834` (commit `653385a`) — failure correctly surfaced after adding `set -eo pipefail`; same per-user-catalog spec failure.
4. `24325424376` (commit `5b2db76`) — **GREEN**.

**CI-foundation fixes applied.**
- 3 pytest cases gated with `@requires_provider()` (`test_verify_cache_is_per_user`, `test_independent_active_selections_per_user`, `test_verify_cache_still_isolated_after_catalog_split`).
- CI seed aligned profile/model IDs with spec expectations.
- `set -eo pipefail` + `shell: bash` on pytest and Playwright steps.
- `per-user-catalog` Playwright project removed from CI subset — its `/diagnostics` path 500s on CI when the active profile is anthropic with a placeholder key. Tier 1 locally.

**CI Playwright subset (final).** 5 projects: `two-browser-isolation`,
`capability-enforcement`, `child-safety`, `admin-panel`, `themes`.
Excluded from CI (Tier 1 locally only): `identity-truth`, `popup-layout`,
`preferences-divergence`, `per-user-catalog`.

## Phase 6 slice 1 — CI foundation (workflow design, local proof)

- `.github/workflows/ci.yml` runs on `push` / `pull_request` for
  `bootstrap/wisetutor-baseline` (and `main` when it exists). One job:
  installs Python 3.12 + Node 22, runs `pip install -r requirements/server.txt`
  + editable + test tooling, `npm ci` in `web/`, Playwright Chromium, seeds
  per-user catalogs, boots `uvicorn` + `next dev`, rotates seeded PINs to
  CI values (2468/1357), runs pytest integration, then Playwright.
- Provider-dependent tests are marked with `@requires_provider()` from
  `tests/integration/conftest.py` and skipped when
  `WT_CI_SKIP_PROVIDER_TESTS=1` (CI sets it). Playwright projects that
  dial real providers (`identity-truth`, `popup-layout`,
  `preferences-divergence`) are intentionally excluded from the CI run —
  they still run locally against the full runtime.
- Intended CI proof shape: **51/56 pytest** + **Playwright 6 projects**
  (per-user-catalog, two-browser-isolation, capability-enforcement,
  child-safety, admin-panel, themes). Locally the full 56/56 pytest +
  28/28 Playwright remain Tier 1.
- Artifacts uploaded: pytest JUnit + stdout, Playwright log/report/traces,
  `artifacts/playwright-evidence/` (proof JSONs + screenshots), backend
  and frontend logs.
- **Remote run: NOT executed.** Pending first push of this commit to GitHub; the workflow
  is fully self-contained on a clean runner and all its invariants (paths,
  env gating, PIN rotation) were verified locally with
  `WT_CI_SKIP_PROVIDER_TESTS=1` and `WISETUTOR_REPO=${github.workspace}`.

## Phase 4 slice 1 — themes foundation — PROVEN Tier 1

- Finite theme set: `light` (default), `dark`, `bella` (child-friendly).
- `_validate_preferences` validates `theme` against the finite set and
  writes to top-level `User.theme`; `/api/v1/users/active` returns it.
- `PUT /api/v1/users/{id}/preferences` with `{theme}` supports self and
  owner-cross-user writes. Non-owner cross-user → 403, unknown theme → 400,
  anon → 401.
- Frontend `ThemeProvider` (mounted in root layout) resolves theme from
  `/api/v1/users/active` on mount and on `wt:user-switched` /
  `wt:theme-changed`; applies `html[data-theme=…]` + legacy `.dark` class.
  No page reload required.
- `globals.css` ships three distinct palettes (`[data-theme="dark"]` and
  `[data-theme="bella"]` override `:root` tokens).
- Settings: `PreferencesPanel` adds a theme selector; `AdminPanel` adds a
  per-user theme save row.
- Two-browser proof: Mr W=`dark`, Bella=`bella` simultaneously; `data-theme`,
  `--background`, `--primary` all differ. Saved in
  `artifacts/phase4_themes/<ts>/two_browser_theme_proof.json`.
- 56 pytest + 28 Playwright pass, 0 skipped.

## Phase 3 CLOSED (slice 5) — PROVEN Tier 1

- Output-gate Tier 1 via a test-only seam (`_wt_test_inject_output`) gated
  by `WISETUTOR_TEST_MODE=1` in both `unified_ws` and `turn_runtime`.
  Unsafe injected output → `safety_filter_output` terminal event emitted,
  stored SQLite assistant content equals the child-safe redirect, raw
  unsafe text is NOT persisted. Verified end-to-end.
- Owner admin: `POST /api/v1/users/{id}/pin` supports owner-override
  (caller=owner, caller≠target) authorized with the CALLER'S own PIN.
  `PUT /api/v1/users/{id}/preferences` accepts owner cross-user writes.
  `wisetutor.admin` logger emits structured audit lines for every admin
  action (allowed and denied); raw PINs are never logged.
- AdminPanel (Settings, owner-only): list of non-self users, Reset-PIN,
  edit `safety_profile`, toggle `allowed_capabilities`. Visible to Mr W,
  hidden from Bella.
- **Phase 3 fully closed.** 49 pytest + 24 Playwright pass, 0 skipped.

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
