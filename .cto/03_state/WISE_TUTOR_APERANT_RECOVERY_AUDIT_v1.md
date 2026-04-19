# WiseTutor Aperant Recovery Audit v1

Audit date: 2026-04-19
Auditor: bounded auditor/verifier (agent)
Baseline tip under audit: `bootstrap/wisetutor-baseline` @ `895e5f7`
Auto-Claude worktree root: `.auto-claude/worktrees/tasks/`

Scope: four board-visible Aperant-produced tasks only.
No board status was trusted as proof.

Buckets:
- MERGEABLE_NOW — 0 tasks
- SALVAGEABLE_WITH_BOUNDED_FIX — 2 tasks (005, 003)
- NOT_PROVEN_DO_NOT_MERGE — 2 tasks (001, 008)

---

## Task 001 — Read-Only Smoke Test

- **Task name:** Read-Only Smoke Test
- **Claimed board state:** completed evidence run under subtask-1-1
- **Branch / worktree / tip:**
  `auto-claude/001-wisetutor-read-only-smoke-test` @ `0b5689a`,
  merge-base with baseline = `7b19600` (older ancestor).
- **Actual code surface found:** None.
  Commit touches only:
  - `.auto-claude/specs/001-wisetutor-read-only-smoke-test/build-progress.txt`
  - `.auto-claude/specs/001-wisetutor-read-only-smoke-test/implementation_plan.json`
  Both files live entirely under `.auto-claude/`, which is
  ignored in the current baseline by `.gitignore:309`
  (closed by commit `895e5f7 chore: add auto-claude entries to
  .gitignore`). A rebase onto current baseline would produce zero
  tracked diff; the files would be re-ignored.
- **Evidence found:** `build-progress.txt` is a read-only agent
  report enumerating git branch, remotes, and file-existence probes.
  No repo file mutated — the task explicitly opens with
  "Mutation policy: ZERO MUTATIONS".
- **Verification run:** N/A. Nothing to run — no code, no tests.
- **Classification:** NOT_PROVEN_DO_NOT_MERGE
  (more precisely: no mergeable unit exists).
- **Merge risk:** Zero if rebased (diff becomes empty). The only
  "merge" option would be to force-track files under a now-ignored
  path, which would violate the current gitignore contract.
- **Recommended next action:** Do not merge. If the evidence is
  worth preserving, copy it into
  `.cto/03_state/WISE_TUTOR_READ_ONLY_SMOKE_TEST_v1.md` in a
  separate bounded doc-only commit; otherwise discard.

## Task 003 — Backend Network Bind Restriction

- **Task name:** Backend Network Bind Restriction
- **Claimed board state:** subtask-4-1 complete; ✅ VERIFIED in
  the branch's `VERIFICATION_REPORT.md`.
- **Branch / worktree / tip:**
  `auto-claude/003-backend-network-bind-restriction` @ `13c9c23`,
  merge-base = `29f1b9f` (one commit behind current baseline).
- **Actual code surface found:**
  Real code changes, 9 commits ahead of baseline:
  - `deeptutor/services/setup/init.py` — adds
    `get_backend_host(project_root)`; reads
    `BACKEND_HOST` from env-store, default `"127.0.0.1"`.
  - `deeptutor/services/setup/__init__.py` — re-exports it.
  - `deeptutor/api/run_server.py` — uvicorn now binds
    `get_backend_host()` instead of `"0.0.0.0"`.
  - `deeptutor_cli/main.py` — `serve` typer option default becomes
    `get_backend_host()`.
  - `deeptutor/tutorbot/config/schema.py` — `GatewayConfig.host`
    default flipped `"0.0.0.0"` → `"127.0.0.1"`.
  - `scripts_local/wt_start.sh` — `--host ${BACKEND_HOST:-127.0.0.1}`.
  - `Dockerfile` — adds `ENV BACKEND_HOST=127.0.0.1`, rewrites
    `/app/start-backend.sh`, updates supervisord command to use
    `%(ENV_BACKEND_HOST)s`.
  - `.env.example` — adds `BACKEND_HOST=127.0.0.1` with comment.
  - `.gitignore` — appends duplicate `.auto-claude/` entry (already
    present on baseline at line 309).
  - Collateral at repo root: `VERIFICATION_REPORT.md`,
    `test_backend_host.py`.
- **Evidence found:**
  - Local smoke-probe on the branch: `get_backend_host()` returns
    `127.0.0.1` with no env, `0.0.0.0` with `BACKEND_HOST=0.0.0.0`.
    Confirmed.
  - Bare-metal hardening logic is sound and localized.
  - **Critical contradiction for Docker:**
    Current `docker-compose.yml`, `docker-compose.dev.yml`, and
    `docker-compose.ghcr.yml` publish ports via
    `"${BACKEND_PORT:-8001}:${BACKEND_PORT:-8001}"`
    (host `0.0.0.0:8001` → container `:8001`) and do NOT set
    `BACKEND_HOST`. With the new Dockerfile default, the container
    process binds `127.0.0.1:8001` inside the container namespace;
    Docker's DNAT route from the bridge interface then has no
    listener on the container's primary interface, so the published
    port 8001 would not reach the app.
    The currently-proven Docker runtime (covered by
    `WISE_TUTOR_DOCKER_RUNTIME_PROOF_v1.md`) would break on merge.
  - `.gitignore` duplicate: `.auto-claude/` is added, but that line
    is already present at `.gitignore:309` on baseline — the new
    hunk is a redundant duplicate.
  - `VERIFICATION_REPORT.md` at repo root and `test_backend_host.py`
    at repo root are artifacts, not product code. The test file is
    not under `tests/` and is not discovered by pytest; it is a
    standalone script. Both clutter the repo root.
- **Verification run:**
  - Direct module smoke: `get_backend_host()` default/override
    behavior reproduced in the DeepTutor venv against the branch
    checkout — passed both cases.
  - No Docker integration test was run (the running baseline
    container uses the compose that would be broken if 003 lands
    as-is). Not run out of caution.
- **Classification:** SALVAGEABLE_WITH_BOUNDED_FIX
- **Merge risk:** High as-is (breaks proven Docker runtime). Low
  after the bounded fix below.
- **Recommended next action:** Salvage with a narrow cleanup before
  merging:
  1. Revert `Dockerfile:111` so `ENV BACKEND_HOST=0.0.0.0` is the
     default inside the container. Docker's correct idiom for
     host-loopback-only publishing is the compose port map
     `"127.0.0.1:${BACKEND_PORT}:${BACKEND_PORT}"`; the container
     itself must keep binding on `0.0.0.0` so the bridge DNAT
     route reaches the app. Keep the new bare-metal hardening
     (run_server / wt_start.sh / deeptutor_cli / GatewayConfig
     defaults). If host-side Docker restriction is desired, land
     that as a separate one-line change to `docker-compose.yml`
     port map.
  2. Drop `VERIFICATION_REPORT.md` (move contents to
     `.cto/03_state/` under a named evidence file if kept).
  3. Drop `test_backend_host.py` from repo root. If the behavior
     is worth a pytest, move it to `tests/services/test_backend_host.py`
     with parametrized cases.
  4. Drop the duplicate `.auto-claude/` line from `.gitignore`.

## Task 005 — Session Secret Rotation

- **Task name:** Session Secret Rotation
- **Claimed board state:** subtask-3-2 complete (integration test
  for WebSocket token rotation).
- **Branch / worktree / tip:**
  `auto-claude/005-session-secret-rotation` @ `abef81b`,
  merge-base = `29f1b9f`.
- **Actual code surface found:** 5 commits ahead of baseline.
  - `deeptutor/services/users/identity.py` — extends
    `_load_secret()` to a list-returning `_load_secrets()` with
    current + previous support. Current secret always signs;
    verification iterates all known secrets. Keeps
    `_load_secret()` as a thin alias returning the first entry
    (backwards-compat for callers). Sources, in order:
    - `WISETUTOR_SESSION_SECRET` env (colon-separated).
    - `data/session_secret.key` (current) +
      `data/session_secret.key.prev` (previous).
    - Auto-generate on first boot if no current exists.
  - `scripts/rotate_session_secret.py` — 254-line CLI with
    `--overlap-minutes`, `--dry-run`, `--cleanup`, `--env-format`.
    Writes new secret to `data/session_secret.key` with `0600`,
    rotates old to `.prev`. Uses `scripts/_cli_kit.py` helpers
    that already exist on baseline (confirmed).
  - `tests/unit/test_session_secret_rotation.py` — 16 unit tests:
    single-secret, multi-secret rotation, tamper rejection,
    env parsing edge cases, user-id parametrization.
  - `tests/integration/test_session_secret_rotation.py` — HTTP
    cookie + WS token integration tests against a live backend
    (require running backend + seeded PINs).
- **Evidence found:**
  - Contract respected: the "single secret" docstring caveat was
    removed; new docstring accurately describes the rotation
    contract.
  - Backwards compatibility: `sign_user_id()` continues to call
    `_load_secret()` unchanged; `_load_secret()` returns the
    current (first) secret. Existing single-secret `.env` and
    single-file-based deployments work without change.
  - No dependency added; no `requirements/*` edit.
  - No schema migration.
  - **Minor contradiction with SECURITY_BASELINE.md:49**
    ("Keys must never be echoed into test output, screenshots,
    or log files"):
    `scripts/rotate_session_secret.py::rotate_secrets` calls
    `print_step(f"Current secret: {current_secret[:16].decode()+'...'}", …)`
    and the same for the new secret. Running
    `python scripts/rotate_session_secret.py --dry-run` against
    the live `data/session_secret.key` echoed the first 16 hex
    characters of the real HMAC secret to stdout during the
    verification run. Remaining entropy (~192 bits) is still
    secure, but this violates the "never echo keys" floor and
    would leak the same 16 chars into any terminal log, CI
    recorder, or copy-paste.
- **Verification run:**
  - `pytest tests/unit/test_session_secret_rotation.py` →
    **16/16 PASS** (0.16s).
  - `pytest tests/unit/` (branch) → **27/27 PASS** (0.62s);
    the 11 pre-existing `test_memory_identity_guard.py` cases
    continue to pass → no regression in the identity-guard
    lane.
  - `python scripts/rotate_session_secret.py --dry-run` →
    exits 0, writes correct banner, correctly identifies the
    current + new secrets; also exhibits the leak described
    above.
  - Integration tests (`tests/integration/test_session_secret_rotation.py`)
    not run in this audit (require a live backend with a
    known-PIN user state; the running Docker instance uses a
    different PIN profile — out of scope for this recovery
    audit).
- **Classification:** SALVAGEABLE_WITH_BOUNDED_FIX
- **Merge risk:** Low on the library surface
  (`identity.py`). The only unresolved contradiction is the
  rotate-script output leak.
- **Recommended next action:**
  1. Replace the two `{secret[:16].decode()+'...'}` uses in
     `scripts/rotate_session_secret.py` with a non-revealing
     indicator (e.g., `"(redacted)"` or `f"len={len(secret)}"`).
     Two-line edit.
  2. Verify the unit tests still pass (they are independent of
     the print path — expected to remain 16/16).
  3. Merge.
  4. (Optional, follow-up lane.) Run the integration tests
     `tests/integration/test_session_secret_rotation.py` against
     a dedicated test backend. Out of scope here.

## Task 008 — Free-First Content Search & Acquisition

- **Task name:** Free-First Content Search & Acquisition
- **Claimed board state:** subtask-2-1 complete (create educational
  source search module base).
- **Branch / worktree / tip:**
  `auto-claude/008-free-first-content-search-acquisition` @
  `d3e0ebf`, merge-base = `29f1b9f`.
- **Actual code surface found:** 5 commits ahead of baseline, 5
  new files, 628 added lines, zero modifications to existing code:
  - `deeptutor/services/acquisition/__init__.py` (docstring only).
  - `deeptutor/services/acquisition/source_registry.py` (206
    lines).
  - `deeptutor/services/acquisition/robots_checker.py` (157 lines).
  - `deeptutor/services/acquisition/rate_limiter.py` (138 lines,
    token-bucket).
  - `deeptutor/services/search/edu_sources/__init__.py` (124
    lines, registry for BaseSearchProvider subclasses).
- **Evidence found:**
  - Code reads cleanly and is internally coherent.
  - **Zero callers:** `grep -rn "deeptutor\.services\.acquisition"`
    across the branch returns nothing. Same for `edu_sources`.
    No router, no CLI, no agent tool, no test wires into these
    modules. Pure dead-module scaffolding at merge time.
  - **Contradicts SSOT.md:** `SSOT.md:40-43` currently reads:
    > "Knowledge-page AI Librarian mode (goal elicitation →
    >  free-first content acquisition → ingest under caller's
    >  KB). Intent captured 2026-04-15 in
    >  `FEATURE_REQUESTS_2026_04_15.md`; **no runtime code
    >  exists yet**."
    Merging 008 as-is would make this SSOT line factually false
    without a corresponding SSOT + DECISIONS_LOG update.
  - **Contradicts DECISIONS_LOG 2026-04-15 gating:** that entry
    explicitly lists 8 founder-approval gates that must all
    pass before any librarian-surface runtime code merges (VRM
    adoption, crawler adoption, licensing policy, UX specs,
    MVP mode selection, etc.). None of those gates are recorded
    as closed in `DECISIONS_LOG.md`.
- **Verification run:**
  - No runtime verification attempted — there is no call path to
    exercise. The modules import cleanly in isolation, but that
    is a necessary, not sufficient, signal.
- **Classification:** NOT_PROVEN_DO_NOT_MERGE
- **Merge risk:** Medium (dead code at merge time; founder-gate
  contract breakage; SSOT drift).
- **Recommended next action:** Do not merge in its current form.
  The code itself is not broken, so preserve the branch. When the
  librarian pod is officially unlocked (via the 8 gates in
  `DECISIONS_LOG 2026-04-15`), revisit 008 alongside the
  orchestrating layers it is meant to serve. Do not land
  scaffolding in isolation.

---

## Recommended merge queue (ordered)

| Order | Task | Pre-merge fix scope |
|---|---|---|
| 1 | 005 Session Secret Rotation | 2-line redaction in `scripts/rotate_session_secret.py` to stop echoing the first 16 hex of the secret. Re-run unit tests. |
| 2 | 003 Backend Network Bind Restriction | Revert `Dockerfile` ENV default to `0.0.0.0`; drop `VERIFICATION_REPORT.md` and `test_backend_host.py` from repo root; drop duplicate `.auto-claude/` line from `.gitignore`. Keep all bare-metal hardening. |

Both queue items should land as independent small commits. Do not
pipeline them together — the two fix surfaces are unrelated and
rolling back one should not undo the other.

## Tasks to defer

| Task | Reason |
|---|---|
| 001 Read-Only Smoke Test | No mergeable unit; diff is entirely inside the now-gitignored `.auto-claude/` path. Preserve the evidence under `.cto/03_state/` only if wanted; otherwise drop. |
| 008 Free-First Content Search & Acquisition | Scaffolding-only, zero callers, and merging contradicts `SSOT.md:40-43` and the 8 founder-approval gates in `DECISIONS_LOG 2026-04-15`. Hold the branch until the librarian pod is formally unlocked. |

## Single best next bounded lane after this audit

**"Salvage + merge task 005 (Session Secret Rotation) after the
print-redaction fix."**

Why this one and not 003 first:
- Smaller fix surface (2 lines vs. multi-file cleanup).
- Entirely localized to a repo-owned script; no Docker runtime
  coupling to worry about.
- Unit tests already green (16/16); fix does not touch the test
  plane.
- Removes the only item blocking this otherwise-clean branch
  from meeting the security floor.

After 005 lands, the follow-on lane is "Salvage + merge 003 with
the Dockerfile ENV default reverted and root-level collateral
stripped." Do not start 003 until 005 is in.

Do not, in either lane, start 001 or 008. Do not touch Multica or
Archon integration. Do not widen into product feature work. One
bounded lane at a time.
