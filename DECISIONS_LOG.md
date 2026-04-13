# DECISIONS_LOG — WiseTutor

Append-only. Newest at top. Every architectural, toolchain, or scope decision
lands here with a date, the decision, the reason, and the consequence.

---

## 2026-04-13 — Phase 2 closed (slice 3)
**Decision.** Phase 2 is CLOSED. The per-user factories
(`get_memory_service`, `get_sqlite_session_store`, `get_turn_runtime_manager`)
now raise on missing `user_id`; no live router can silently fall back to a
server-global. `UserService.active_user_id()` raises; only `last_used_user_id()`
remains as a diagnostic. `UserSwitcher` no longer reloads — soft hand-off via
CustomEvent. `unified-ws.ts` carries a signed ws-token. Mr W and Bella are
both off the seeded default PIN. Twelve Playwright + six pytest cases pass
against the WiseTutor runtime source.
**Reason.** CTO phase-close required initial PINs replaced (not just gated),
no global identity read on live paths, and no silent clobber of in-flight
chat on user switch.
**Consequence.** Phase 3 (Bella / Mr W profile specialization) can now
start on a real foundation.

## 2026-04-12 — Per-request identity + legacy migration + forced PIN rotation (Phase 2 slice 2)
**Decision.** Replaced the server-global "active user" with a per-request
signed-cookie identity (`wt_uid = <user>.<HMAC>`). WebSocket identity is
resolved from either the Cookie header or a `wt_uid_token=<signed>` query
param. `_VERIFY_CACHE`, `MemoryService`, `SQLiteSessionStore`, and
`TurnRuntimeManager` are keyed by user id; the old global active-user
fallback was removed from live code paths. A one-shot legacy migration
archives `data/memory/`, `data/chat_history.db`, `data/user/chat_history.db`,
and `data/sessions/` into `data/users/_legacy/<ts>/` on first boot. A
`pin_is_default` flag was added to `User`; the WebSocket rejects chat
turns from users with `pin_is_default=True` (reason=`pin_rotation_required`),
and the frontend `UserGate` forces a change-PIN dialog.
**Reason.** Two browser contexts must be able to hold different active
users simultaneously. A server-global active user could never satisfy that
contract honestly. The seeded default PINs are a known weakness and must
not gate real use.
**Consequence.** The drift between the DeepTutor runtime dir and the
WiseTutor repo is gone — the live backend and frontend now run from
`/home/ai-desktop/projects/WiseTutor/` directly (venv + node_modules live
there). Next.js proxies `/api/*` via same-origin rewrites so fetch cookies
flow. WS uses a short-lived signed token because WS-upgrade cookies can be
dropped across origins.

## 2026-04-12 — Multi-user foundation landed (Phase 2 slice 1 of N)
**Decision.** Introduced a real `UserService` with a registry at
`data/users.json` and per-user directories at `data/users/<id>/{memory,sessions.db}`.
`MemoryService` and `SQLiteSessionStore` are cached **per active user id**
and invalidated on user switch. A new REST surface at `/api/v1/users`
provides list/active/switch/pin-change/upsert with PBKDF2-SHA256 salted
PIN hashes. Frontend adds a `UserSwitcher` next to the RuntimeBadge.
**Reason.** The previous single-user shared PROFILE/SUMMARY pattern
conflated Mr W and Bella. A shared file could never be a safe boundary.
**Consequence.** `data/memory/` (the legacy shared dir) is no longer read
by the live chat path; it remains on disk for reference. Per-user memory
lives under `data/users/<id>/memory/`. Seeded users: Mr W (owner) and
Bella (child). Dev-default PINs (Mr W=1234, Bella=5678) are configurable
via `WISETUTOR_DEFAULT_PIN_MRW` / `WISETUTOR_DEFAULT_PIN_BELLA`. Owner
MUST change these before any real use; see SECURITY_BASELINE.

## 2026-04-12 — Baseline pushed to `bootstrap/wisetutor-baseline`, not `main`
**Decision.** The first push lands on a `bootstrap/wisetutor-baseline`
branch, not directly on `main`. Upstream `.github/workflows/*.yml` files
were removed from the baseline to let the push through the current OAuth
token (which lacks the `workflow` scope).
**Reason.** Local `branch-guard` hook refuses pushes to protected `main`;
GitHub refused the workflow files because the token isn't scoped to
update Actions. Bootstrapping on a branch is the honest path.
**Consequence.** The founder must either (a) merge
`bootstrap/wisetutor-baseline` into `main` via the GitHub UI / PR, or
(b) refresh the local `gh` token with `workflow` scope and push `main`
directly. Product CI is Phase 6 anyway, so the dropped workflows are not
load-bearing today.

## 2026-04-12 — WiseTutor formalized as the product repo
**Decision.** The owner-controlled product repo is WiseTutor at
`https://github.com/yosiwizman/WiseTutor`. Local working tree is
`/home/ai-desktop/projects/WiseTutor`.
**Reason.** The DeepTutor working directory had accumulated enough
product-specific customizations (runtime-truth system, memory identity guard,
identity short-circuit, runtime chips, Playwright proof harness) that a clean
product boundary was needed to keep upstream merges sane.
**Consequence.** New development lands in WiseTutor. `HKUDS/DeepTutor` is
configured as the `upstream` remote and is pulled deliberately.

## 2026-04-12 — DeepTutor remains upstream dependency/base
**Decision.** `HKUDS/DeepTutor` stays as the upstream source of the base
framework. We do not fork its README into our product identity; we keep
their README renamed as `DEEPTUTOR_UPSTREAM_README.md` for attribution.
**Reason.** Upstream ships genuinely useful capability scaffolding, provider
glue, and RAG. Re-implementing that from scratch would cost weeks for no
gain.
**Consequence.** Product-specific logic must be isolated so upstream merges
do not repeatedly trash it. Any cross-cutting change gets a note in the
intake about isolation strategy.

## 2026-04-12 — Current customized local build is the WiseTutor baseline
**Decision.** The baseline commit is a snapshot of the working
`/home/ai-desktop/projects/DeepTutor` tree as of this date, imported via
`rsync` with heavy/volatile dirs excluded (`.git`, `.venv`, `node_modules`,
`.next`, `__pycache__`, `logs/`, `artifacts/`,
`data/memory/_quarantined/`, `data/user/`). Upstream git history was NOT
preserved because keeping it blurs the product boundary.
**Reason.** A clean product history is easier to own, review, and revert.
Upstream attribution is preserved via the `upstream` remote and the renamed
README.
**Consequence.** `git log` in WiseTutor starts at the bootstrap commit.
Anyone looking for pre-bootstrap archaeology goes to the upstream repo.

## 2026-04-12 — Multi-user architecture will use per-user namespaces
**Decision.** Future multi-user work (Phase 2+) will namespace memory,
session, and catalog state per user (e.g., `data/users/<uid>/memory/...`).
We will NOT split PROFILE.md / SUMMARY.md into "sections" or share a single
memory file across users.
**Reason.** Shared memory across users caused the 2026-04-12 identity
contamination incident. A per-user namespace is the only honest boundary.
**Consequence.** Phase 2 design doc must specify user identification,
session → user binding, and migration for existing single-user data.

## 2026-04-12 — Truth/proof standard is mandatory
**Decision.** No completion claim ships without evidence at the tier noted
in the intake. Tier 1 requires re-execution against real conditions; Tier 2
requires tests; Tier 3 means "designed, not built" and is labeled as such.
**Reason.** Prior sessions shipped false "it works" claims grounded in
`/verify` responses and model self-report, which turned out to be wrong.
**Consequence.** CLAUDE.md enforces the tier grid. Agents self-classify.
Founder rejects overclaims.

## 2026-04-12 — Auto memory refresh is off by default
**Decision.** `MemoryService.refresh_from_turn` is gated behind
`DEEPTUTOR_MEMORY_AUTO_REFRESH=1`, default off. Re-enabling it requires a
new DECISIONS_LOG entry.
**Reason.** Auto-refresh was the lie-laundering vector that persisted a
hallucinated "GPT-4.1" identity across all providers.
**Consequence.** PROFILE/SUMMARY only change via explicit user action or
manual API call.

## 2026-04-12 — Identity questions answered from server runtime truth
**Decision.** Questions like "what model/provider are you?" are intercepted
in `AgenticChatPipeline.run` and answered directly from the resolver's
binding/model/base_url. No LLM call for these turns.
**Reason.** Every LLM (including Claude) was parroting poisoned memory.
Server truth is the only honest source.
**Consequence.** The identity regex must be maintained; new question
phrasings go through the unit test fixture.
