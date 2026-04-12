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

- Namespace memory, sessions, and catalog state per user under
  `data/users/<uid>/...`.
- Define user identification mechanism (local profile switcher, cookie,
  or auth). No external auth yet.
- Migration plan for existing single-user data (assign it to user 0).
- Per-user verify cache; runtime truth chip scoped to the current user.
- Update identity short-circuit to include "you are talking to user X"
  context without echoing PII.

**Exit criteria.** Two distinct users can chat in parallel with no memory
crossover; Playwright e2e proves isolation.

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

- STT path: browser Web Speech API as first pass; Whisper local as fallback.
- TTS path: OS voice or Coqui / Piper local; provider-based TTS only as
  fallback.
- Profile-scoped voice choice.
- Push-to-talk and continuous modes.

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
