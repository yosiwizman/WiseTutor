# ROADMAP — WiseTutor

Phased execution plan, grounded in what exists today (see CURRENT_STATE.md).
Phases are sequential unless noted. Each phase needs an intake
(PROJECT_INTAKE_TEMPLATE.md) and ends when the evidence bar is met.

## Phase 0 — Repo / bootstrap / SSOT (current)

- [x] Create product repo at `github.com/yosiwizman/WiseTutor`
- [x] Import customized working tree as baseline
- [x] Configure `origin` and `upstream` remotes
- [x] Write the governance doc set (README, SSOT, CURRENT_STATE,
      STACK_STANDARD, INSTALL_BASELINE, AGENT_ROLE_MATRIX,
      SECURITY_BASELINE, DELIVERY_PIPELINE, PROJECT_INTAKE_TEMPLATE,
      DECISIONS_LOG, ROADMAP, CLAUDE.md)
- [x] First baseline commit
- [ ] Push baseline to origin (gated by founder credentials — see final report)

**Exit criteria.** Clone-able product repo with docs that honestly describe
the baseline and the product boundary.

## Phase 1 — Rebrand to WiseTutor

- Rename visible strings: app title, README references, desktop `.desktop`
  files, launcher script names, UI copy.
- Decide: keep `deeptutor/` Python package name (internal only) or rename
  to `wisetutor/` (invasive). Log the call in DECISIONS_LOG.
- Update Playwright/pytest fixtures that reference "DeepTutor" in asserted
  text.
- Update `INSTALL_BASELINE.md` and `scripts_local/` script names to use
  WiseTutor naming.

**Exit criteria.** A fresh user sees "WiseTutor" everywhere user-visible.
Internal module names are either renamed or explicitly deferred with a dated
decision.

## Phase 2 — Real multi-user architecture

### Slice 1 — foundation (LANDED 2026-04-12)
- [x] `UserService` + `data/users.json` registry
- [x] Per-user dirs under `data/users/<id>/{memory,sessions.db}`
- [x] `MemoryService` / `SQLiteSessionStore` / `TurnRuntimeManager` are
      per-active-user and invalidate on switch
- [x] Seed Mr W and Bella
- [x] PIN-gated switch API + salted PBKDF2 hashes
- [x] Frontend `UserSwitcher` with PIN modal
- [x] 8 pytest + 3 Playwright cases, all green

### Slice 2 — per-request identity, legacy migration, forced PIN rotation (LANDED 2026-04-12)
- [x] Per-request signed-cookie identity (`wt_uid = <user>.<HMAC>`)
- [x] WebSocket identity via Cookie or signed `wt_uid_token` query param
- [x] `_VERIFY_CACHE`, Memory/Sessions/Runtime all keyed by user id (no global)
- [x] Legacy `data/memory/`, `data/chat_history.db`, `data/user/chat_history.db`,
      `data/sessions/` → archived to `data/users/_legacy/<ts>/`
- [x] Forced PIN rotation for seeded defaults (WS reject + UserGate modal)
- [x] Next.js same-origin proxy for `/api/*`; WS uses signed-token param
- [x] Live drift fix: backend and frontend now run from WiseTutor tree
- [x] 6 pytest integration + 2 Playwright two-browser E2E — all green

### Slice 3 — phase close (LANDED 2026-04-13)
- [x] Per-user factories raise on missing `user_id` (no live global fallback)
- [x] `/api/v1/sessions` + `/api/v1/memory` → 401 anon
- [x] `UserService.active_user_id()` removed from live paths; `last_used_user_id`
      retained as CLI diagnostic only
- [x] Soft hand-off in `UserSwitcher` (no `location.reload`, in-flight guard,
      `wt:user-switched` CustomEvent)
- [x] `unified-ws.ts` uses signed ws-token for backend WS
- [x] Mr W + Bella off seeded default PINs
- [x] 12 Playwright + 6 pytest cases pass against the WiseTutor runtime

**Phase 2 exit criteria all met.**

## Phase 3 — Bella / Mr W profile specialization

### Slice 1 — per-user provider/model catalog (LANDED 2026-04-13)
- [x] `data/users/<id>/settings/model_catalog.json` is the live path
- [x] `get_model_catalog_service(user_id)` + resolvers threaded
- [x] `/api/v1/settings/*` auth-gated (401 anon)
- [x] Legacy shared catalog migrated: Mr W inherits, shared dir archived
- [x] `AgenticChatPipeline(user_id=…)` wired via UnifiedContext.metadata
- [x] 13 pytest + 13 Playwright cases green

### Slice 2 — Bella/Mr W preferences + prompt identity (LANDED 2026-04-14)
- [x] `User.preferences` + role defaults (owner/user/child)
- [x] `/api/v1/users/{id}/preferences` GET/PUT with owner vs self authz
- [x] Runtime threading: cookie → unified_ws → turn_runtime metadata → pipeline
- [x] Prompt injection: boxed identity+prefs line in `_build_messages`
- [x] Settings `PreferencesPanel` with "editing as" badge
- [x] Legacy test cleanup: 6 duplicate WS tests deleted; 2 unit guards kept
- [x] 22 pytest + 15 Playwright, 0 skipped
- [x] Divergence proof: same prompt, different bytes, shorter child reply

### Slice 3 — capability enforcement (LANDED 2026-04-14)
- [x] Composer picker filtered by `allowed_capabilities`
- [x] Active capability snaps back to chat on user switch if disallowed
- [x] WS boundary rejects disallowed capability with explicit terminal payload
- [x] `turn_runtime._run_turn` safety net rejects crafted disallowed turns
- [x] 7 pytest + 3 Playwright new cases, all green (29 + 18 total)

### Slice 4 — child safety reinforcement (LANDED 2026-04-14)
- [x] `deeptutor/services/safety/child_policy.py` — rule-based categories
- [x] Input gate in `unified_ws` for `safety_profile=child`
- [x] Output gate in `turn_runtime._run_turn`
- [x] Child-safe redirect + structured audit log
- [x] Mr W (standard profile) unaffected
- [x] 11 new pytest + 3 new Playwright, all green (40 + 21 total)

### Slice 5 — owner admin tooling + output-gate Tier 1 (LANDED 2026-04-14)
- [x] Owner-override on `POST /api/v1/users/{id}/pin`
- [x] Owner cross-user `PUT /preferences` audited
- [x] `wisetutor.admin` structured audit logger
- [x] AdminPanel in Settings (owner-only)
- [x] Output-gate deterministic proof via `_wt_test_inject_output` seam
- [x] 9 new pytest + 3 new Playwright cases; 49 + 24 green total

**Phase 3 is closed.**

## Phase 6 — CI / hardening

### Slice 1 — CI foundation (LANDED 2026-04-13)
- [x] `.github/workflows/ci.yml` on origin
- [x] Boots uvicorn + next dev, rotates PINs to CI values
- [x] Runs pytest integration + Playwright subset (no-provider)
- [x] Uploads JUnit + Playwright report + logs + evidence artifacts
- [x] `@requires_provider()` gates 8 pytest cases behind `WT_CI_SKIP_PROVIDER_TESTS=1`
- [x] CI skips Playwright projects: identity-truth, popup-layout, preferences-divergence, per-user-catalog
- [x] **Remote: workflow committed to origin** (commit `5b2db76`)
- [x] **Remote: first hosted Actions run green** — run `24325424376`, 48 pytest passed + 15 Playwright passed, artifact `wisetutor-ci-artifacts` (739 KB)

### Slice 2 — CI provider lane (NEXT, optional)
- [ ] Secrets-gated job running the excluded projects with repo-secret keys
- [ ] Honest pass/fail reporting for that lane

## Phase 4 — Themes / appearance

### Slice 1 — per-user theme foundation (LANDED 2026-04-14)
- [x] Finite theme enum `{light, dark, bella}`; backend validation
- [x] Top-level `User.theme` persisted; `/active` returns it
- [x] `ThemeProvider` applies `data-theme=…` on mount + user switch
- [x] `globals.css` tokens for dark + bella
- [x] Self + owner-admin theme controls in Settings
- [x] Two-browser simultaneous-theme proof captured
- [x] 7 pytest + 4 Playwright new cases; 56 + 28 total green

### Slice 2 — theme depth + accessibility (NEXT, optional)
- [ ] Contrast verification for each theme (WCAG AA spot check)
- [ ] Motion / font-size preference per user
- [ ] Respect `prefers-reduced-motion`

**Exit criteria (phase).** Two distinct users can chat with no memory
crossover, verify caches scoped per user, and initial PINs replaced.

## Phase 3 — Bella / Mr W profile separation

- First two concrete user profiles: Bella (child) and Mr W (adult).
- Profile-scoped preferences: tone, response length, allowed capabilities,
  default language.
- Profile switcher in UI.
- Safety presets per profile (no web search for child by default, etc.).

**Exit criteria.** Switching between Bella and Mr W changes the runtime
surface visibly and provably; unit tests cover the preset application path.

## Phase 4 — Themes / appearance

- Theme system: light / dark / per-profile accent.
- CSS token layer (already present in Tailwind tokens via `--*` vars);
  make it profile-aware.
- Persist theme per profile.

**Exit criteria.** Each profile boots into its own theme; Playwright
visual-diffs lock the look.

## Phase 5 — Voice STT/TTS

### Slice 1 — STT foundation (2026-04-13, implementation closed)
- [x] Browser Web Speech API adapter (`web/lib/speech-recognition.ts`) — code wired; real-capture path is **Tier 3** (not independently executed from this agent; needs a human+mic to promote).
- [x] Deterministic test seam (`window.__wt_test_speech`) — **Tier 2** sandbox proof of UI/state wiring.
- [x] MicButton in composer: idle / listening / permission / unsupported states.
- [x] Final transcripts append to draft; interim shown in status chip only.
- [x] Cleanup on unmount + `wt:user-switched`.
- [x] 7 Playwright cases green locally (project `voice-stt`); 48 pytest passed / 8 skipped.

### Slice 1A — STT proof hardening + hosted CI gate (LANDED 2026-04-13)
- [x] `voice-stt` Playwright project added to hosted CI workflow.
- [x] Hosted green run includes voice-stt (7 deterministic cases).
- [x] Docs corrected: adapter seam is **Tier 2** (not Tier 1); real-browser-native path is **Tier 3** (not Tier 1 "designed/manually verified").
- [x] Real-browser mic capture **Tier 1 proof (Chrome, 2026-04-13)** — founder dictation in Chrome 146 on ai-desktop; artifacts in `artifacts/phase5_stt_real_browser/`.

### Slice 2 — Whisper local fallback (LANDED 2026-04-13, Tier 2 local)
- [x] Backend `POST /api/v1/voice/transcribe` using lazy-loaded `faster-whisper` (tiny/cpu/int8 defaults, env-overridable), with short-audio guardrails and a deterministic `WISETUTOR_VOICE_STT_TEST_MODE=1` seam.
- [x] Frontend `whisper-fallback` adapter (`MediaRecorder` + backend round-trip) with a `__wt_test_fallback` deterministic seam.
- [x] MicButton composes native-first / fallback-second; live engine exposed as `data-engine`.
- [x] Runtime failover: browser-native `error-generic` rebinds MicButton to the Whisper fallback once per mount (`data-failed-over="true"`); permission-denied and unsupported stay terminal.
- [x] 9 Playwright cases green locally (project `voice-stt-fallback`, including 4 failover cases); 6 pytest cases green (`tests/api/test_voice_router.py`).
- [x] Real `faster-whisper` on real audio (Firefox 149 on ai-desktop, 2026-04-13) — **Tier 1** — proof pack: `artifacts/phase5_whisper_real_firefox/`.
- [ ] Hosted CI wiring — still deferred; hosted runners lack `faster-whisper` and real mic. Will revisit only if the voice lane expands beyond single-machine proof.
- [ ] Profile-scoped voice input language

### Slice 3A — browser-native TTS foundation (LANDED 2026-04-13, Tier 2 local + hosted CI seam)
- [x] `window.speechSynthesis` adapter (`web/lib/tts.ts`) with deterministic seam.
- [x] `useAssistantTts` hook: single-active-utterance, cancel-on-user-switch / unmount.
- [x] Listen / Stop control on assistant messages (next to Copy/Retry).
- [x] 5 Playwright cases under `tts` project (supported, single-active, unsupported hidden, no-autoplay, user-switch cleanup); wired into hosted CI.
- [ ] Real audible browser output — **Tier 3**, requires human + speakers.

### Slice 3B — Piper local TTS fallback (LANDED 2026-04-13, Tier 1 audible, 100%)
- [x] `createPiperRealAdapter` in `web/lib/tts.ts` — fetches audio blob from `POST /api/v1/voice/synthesize`, plays via `HTMLAudioElement`, single-active-utterance semantics.
- [x] `createPiperTestAdapter` — deterministic seam (`__wt_test_tts_piper` + `__wt_test_tts_piper_driver`) for Playwright; deferred-event model (`emitStart/emitEnd/emitBackendError`, `lastText`).
- [x] `useAssistantTts` hook extended: `engine` (TTSEngine) + `ttsState` exposed.
- [x] `ChatMessages.tsx` and `tts-harness/page.tsx` updated: `data-engine`, `data-tts-state` using `tts.ttsState`; render gate changed to `engine !== "unsupported"`.
- [x] Backend `POST /api/v1/voice/synthesize` + `GET /api/v1/voice/tts-status` wired; 503 with `piper_not_installed` when binary absent.
- [x] 7 of 7 Playwright cases green under `tts-fallback` project; wired into hosted CI (`--project=tts-fallback`). Seam gap (case 7) closed: Rule 3 now requires `__wt_test_tts_piper.supported !== false`.
- [x] Coqui ruled out (archived 2024); Piper only.
- [x] **Piper installed (2026-04-13):** `piper-tts 1.4.2` via `.venv/bin/pip install piper-tts`; binary at `.venv/bin/piper`. Voice model `en_US-lessac-low` at `/mnt/models/piper/en_US-lessac-low.onnx` (63 MB). Backend synth returns real WAV — Tier 1 backend-side (see `artifacts/phase5_piper_real_backend/`).
- [x] **Tier 1 (real audible with human + speakers) 2026-04-13:** founder ran `aplay artifacts/phase5_piper_real_backend/synth_hello_world.wav` on ai-desktop; confirmed audible. `aplay` reported "Signed 16 bit Little Endian, Rate 16000 Hz, Mono".
- [ ] Profile-scoped voice choice (deferred to a future slice).

### Slice 4A — Push-to-talk voice conversation foundation (LANDED 2026-04-13, Tier 2 local + hosted CI seam)
- [x] `useVoiceTurn` hook (`web/hooks/useVoiceTurn.ts`): one-shot state machine (`idle|listening|submitting|awaiting_assistant|speaking|error`) reusing existing STT and TTS adapters. Single-active guarantee: `start()` cancels any active TTS and STT first. Unmount + `wt:user-switched` cancel cleanly.
- [x] Deterministic harness page (`/voice-turn-harness`) with seam-driven submit (`__wt_test_voice_turn_submit = {mode, reply}`) exposing `data-testid` attributes for state / error / transcript / reply.
- [x] `ChatComposer.tsx` integration: small `Headphones` PTT button next to the existing mic. Click maps by state: idle→start, listening/speaking→cancel, error→reset. Exposes `data-voice-turn-state` + `data-voice-turn-error`. Disabled while `isStreaming`.
- [x] 8 Playwright cases under `voice-turn` project (happy path, cancel-listening, cancel-speaking, STT failure, submit failure, empty reply, TTS failure, start-while-not-idle no-op + no-autoplay). All green. Wired into hosted CI (`--project=voice-turn`).
- [x] Cross-suite regression: 36/36 (voice-stt 7 + voice-stt-fallback 9 + tts 5 + tts-fallback 7 + voice-turn 8).
- [x] **Slice 4B LANDED 2026-04-13 (Tier 2 local + hosted CI seam):** `useVoiceTurnProduction(chatAdapter)` subscribes to the real `useUnifiedChat` isStreaming + messages. Submit resolves with the completed assistant message (or rejects with `reply-timeout` after 60 s, `reply-failed` on stream-end with no assistant message). Workspace page builds the adapter with ref-backed live state. ChatComposer accepts the controls as a `voiceTurn` prop. Cancel in submitting/awaiting_assistant returns to idle without canceling the chat turn. 7 Playwright cases under `voice-turn-real` project; wired into hosted CI.
- [ ] Full human-audible mic→LLM→speakers conversation (Tier 1): requires one human PTT cycle in Chrome on ai-desktop.
- [ ] Continuous / duplex / barge-in modes (not planned for 4).
- [ ] Wake word (out of scope for Phase 5).

**Exit criteria.** End-to-end voice conversation with Bella and Mr W
profiles using at least one local voice path; latency budget documented.

## Phase 6 — Evidence-driven polish + hardening

- CI on push (pytest + Playwright headless).
- Key rotation / secrets management (OS keyring or env-only indirection).
- Backup/restore for `data/users/`.
- Performance pass on RAG / embeddings.
- Remote access hardening (auth, TLS, bind to 127.0.0.1 unless explicitly
  routed) — only if a decision to expose is logged.

**Exit criteria.** A new contributor (or the owner on a new machine) can
clone, run tests, and reach green on the evidence gates without hand-holding.
