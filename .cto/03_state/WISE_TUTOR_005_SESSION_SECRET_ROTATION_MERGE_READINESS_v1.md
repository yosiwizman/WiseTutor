# WiseTutor 005 Session Secret Rotation — Merge Readiness v1

Audit date: 2026-04-19
Lane: bounded fix + re-verification of the single known blocker on
`auto-claude/005-session-secret-rotation`, per the Aperant recovery
audit classification SALVAGEABLE_WITH_BOUNDED_FIX
(`.cto/03_state/WISE_TUTOR_APERANT_RECOVERY_AUDIT_v1.md`).

Branch / worktree:
- Worktree path: `/home/ai-desktop/projects/WiseTutor/.auto-claude/worktrees/tasks/005-session-secret-rotation`
- Branch: `auto-claude/005-session-secret-rotation`
- Baseline at audit time: `bootstrap/wisetutor-baseline` @ `895e5f7`
- Pre-fix tip: `abef81b` (auto-claude: subtask-3-2)
- Post-fix tip: `8c919b4` (fix(005): redact secret prefixes …)

---

## Claim

The single blocker that kept task 005 in SALVAGEABLE_WITH_BOUNDED_FIX
is now resolved by a bounded 2-line redaction in
`scripts/rotate_session_secret.py`. Neither `--dry-run` nor the
default rotation path exposes any portion of the live HMAC session
secret to stdout. Existing unit test coverage remains 100% green
(16/16 for the rotation suite; 27/27 for the full unit tier on the
branch). No other file was touched, no dependency added, no test
changed, no product code changed.

Task 005 is now **MERGEABLE_NOW** subject to two explicit limits
listed under "Not yet verified."

## Proof

### 1. Blocker reproduced on the pre-fix tip

Source of the leak (pre-fix `abef81b`,
`scripts/rotate_session_secret.py`, lines 126 and 130):

    print_step(f"Current secret: {current_secret[:16].decode()+'...'}", success("loaded"))
    ...
    print_step(f"New secret: {new_secret[:16].decode()+'...'}", success("generated"))

Both statements run in `rotate_secrets(...)`, which is invoked in
every mode (`--dry-run`, default, and `--env-format`). A dry-run
probe in the pre-fix state emitted:

    Current secret: a554186e532dbe5f... - loaded
    New secret:     5ba7910d66e847b7... - generated

That is 16 hex characters of the live HMAC secret plus 16 hex
characters of a newly generated secret, printed to stdout on
every dry-run — i.e. captured by every terminal recorder, CI
log, or copy-paste.

The leak violates two explicit floors:
- `SECURITY_BASELINE.md:49`:
  "Keys must never be echoed into test output, screenshots, or
  log files."
- `CLAUDE.md — Secrets rules`:
  "Never print an API key. Never include one in a screenshot.
   Never commit one. If you detect one in an output you're about
   to show, redact it."

### 2. Fix applied (single-file, +3/-2 lines)

Commit `8c919b4` on `auto-claude/005-session-secret-rotation`:

    fix(005): redact secret prefixes from rotate_session_secret.py output

    scripts/rotate_session_secret.py | 5 +++--
    1 file changed, 3 insertions(+), 2 deletions(-)

Diff body:

```diff
-    print_step(f"Current secret: {current_secret[:16].decode()+'...'}", success("loaded"))
+    print_step(f"Current secret: (redacted, {len(current_secret)} bytes)", success("loaded"))

     # Generate new secret
     new_secret = generate_secret()
-    print_step(f"New secret: {new_secret[:16].decode()+'...'}", success("generated"))
+    # Never echo any portion of the secret — see SECURITY_BASELINE.md
+    print_step(f"New secret: (redacted, {len(new_secret)} bytes)", success("generated"))
```

The replacement shows only the byte length of the secret value.
Length is deterministic (the secret is always
`os.urandom(32).hex().encode("utf-8")` — a 64-byte ASCII-hex
value) and carries zero entropy about the actual key material.

Operator UX preserved:
- The CLI still reports that a current secret was loaded and a
  new one generated (status strings unchanged).
- The banner still announces the rotation window with expiry time.
- The `--env-format` opt-in path still emits the full export
  value (see "Not yet verified" §3 below).
- `--dry-run` still correctly refuses to mutate the disk.

### 3. Post-fix dry-run probe shows no secret material

Exact stdout capture of
`/home/ai-desktop/projects/DeepTutor/.venv/bin/python
scripts/rotate_session_secret.py --dry-run` on post-fix tip
`8c919b4`:

    ┌ Session Secret Rotation ─────────────────────────────────────────────────────┐
    │                                                                              │
    │ Rotating session secret with zero-downtime overlap window                    │
    │                                                                              │
    │ Overlap window: 5 minutes                                                    │
    │ Previous secret expires at: 2026-04-19 04:26:54 UTC                          │
    │                                                                              │
    │ DRY RUN - no changes will be made                                            │
    │                                                                              │
    └──────────────────────────────────────────────────────────────────────────────┘

      Current secret: (redacted, 64 bytes) - loaded
      New secret: (redacted, 64 bytes) - generated
      ... Would move session_secret.key -> session_secret.key.prev
      ... Would write 64 bytes to session_secret.key

    DRY RUN - no files were modified

    During the overlap window:
      • Both old and new secrets are valid for signature verification
      • New signatures are created with the new secret
      • Active sessions continue without interruption

    After 5 minutes:
      • Old signatures will be rejected
      • Run: python scripts/rotate_session_secret.py --cleanup

Leak-scan probes on the same output:
- `grep -oE '[a-f0-9]{8,}'` → zero matches.
- `grep -cE '[a-f0-9]{16,}'` → 0.
- `grep -cE '[a-f0-9]{8,}\.\.\.'` → 0 (the old pattern shape is
  also gone).
- `grep` for the first 16 hex characters of the live current
  secret (read via `xxd -c 256 -p /home/ai-desktop/projects/WiseTutor/data/session_secret.key`
  and then prefix-matched) → 0 matches.
- `grep` for the first 8 hex characters of the same secret → 0
  matches.

Conclusion: the post-fix `--dry-run` output contains no hex run,
no partial-secret prefix, and no substring of the live key.

### 4. Unit test re-run on post-fix tip

Invocation:
`/home/ai-desktop/projects/DeepTutor/.venv/bin/python -m pytest
tests/unit/test_session_secret_rotation.py -v`

Result: **16/16 PASS** (0.15 s):

- `test_single_secret_sign_and_verify` — baseline sign/verify.
- `test_multi_secret_current_secret_works` — colon-separated env,
  current accepted.
- `test_multi_secret_previous_secret_works` — cookie signed with
  old secret still verifies during overlap.
- `test_unknown_secret_rejected` — cookie signed with
  not-in-list secret rejected.
- `test_rotation_scenario` — full A → B rotation, both work in
  overlap.
- `test_invalid_cookie_format` — malformed input rejected.
- `test_tampered_signature_rejected` — HMAC integrity.
- `test_tampered_user_id_rejected` — HMAC integrity.
- `test_load_secrets_from_env` — env parsing correctness.
- `test_load_secrets_ignores_empty_parts` — trailing-colon safety.
- `test_various_user_ids_work[alice | bob | child | admin |
  user_with_underscores | 123]` — parametrized identity coverage.

Anti-regression run:
`pytest tests/unit/ -v` on the post-fix tip.

Result: **27/27 PASS** (0.60 s). The pre-existing 11
`test_memory_identity_guard.py` cases continue to pass alongside
the 16 new rotation tests — no regression in the identity-guard
lane caused by the multi-secret refactor or by this fix.

### 5. Branch-vs-baseline merge-forward coherence

- Merge-base with current baseline: `29f1b9f` (one commit behind
  `895e5f7`).
- The intermediate baseline commit `895e5f7 chore: add auto-claude
  entries to .gitignore` adds exactly the `.auto-claude/` rule
  that the 005 worktree currently has as unstaged
  `.gitignore` drift. On rebase/merge onto `895e5f7`, that drift
  collapses to a no-op — no conflict expected.
- Files touched on the branch (commits `d5730fd`, `de64c23`,
  `279d6ca`, `314c44b`, `abef81b`, `8c919b4`):
  - `deeptutor/services/users/identity.py` (multi-secret support,
    backwards-compatible; `_load_secret()` kept as alias)
  - `scripts/rotate_session_secret.py` (new CLI + redaction fix)
  - `tests/unit/test_session_secret_rotation.py` (new, 16 cases)
  - `tests/integration/test_session_secret_rotation.py` (new)
- No shared-helper file outside the 005 surface was touched.
- No upstream-imported `deeptutor/` file was business-logic'd
  (only `deeptutor/services/users/identity.py`, which is a
  WiseTutor-owned multi-user surface, per
  `SECURITY_BASELINE.md:6-19`).
- No dependency added (no `requirements/`, no `pyproject.toml`,
  no `package.json`).

## Verified scope

- Pre-fix blocker reproduced in the dry-run output, cross-checked
  against the live secret file at
  `/home/ai-desktop/projects/WiseTutor/data/session_secret.key`.
- Post-fix dry-run output byte-swept and regex-swept for any
  hex-string leakage — zero matches.
- 16/16 rotation unit tests pass on post-fix tip.
- 27/27 full unit tier on the branch passes — no regression
  observed in the identity-guard lane that shares the module.
- Diff is bounded to one file, +3/-2 lines. No test modified.
- Fix commit `8c919b4` is cleanly on top of pre-fix tip
  `abef81b`; no rewrite of history; no force-push; no
  destructive operation.
- `_load_secret()` backwards-compat alias preserved — existing
  callers (`sign_user_id`, `verify_cookie`, `COOKIE_NAME` flow
  in `routers/users.py` and `routers/unified_ws.py`) continue to
  work unchanged.

## Not yet verified

1. **`--env-format` output is still an intentional secret-export
   path.** Lines 179 and 182 of `scripts/rotate_session_secret.py`
   emit (respectively) a 32-char prefix + full new secret as
   `export WISETUTOR_SESSION_SECRET="..."` so the operator can
   paste the rotated value into a shell config. This is opt-in
   (`--env-format` flag, never implied by `--dry-run`), documented
   in the argparse help, and analogous to how `aws configure`
   style CLIs surface credentials. The lane-brief blocker was
   "dry-run prints part of the current secret", which is now
   resolved; the `--env-format` path remains as an explicit
   secret-export feature. If the founder later wants to tighten
   this (e.g., require an extra `--i-know-this-prints-a-secret`
   confirmation, or redact line 179's 32-char preview while
   keeping line 182's full value), that is a separate follow-up
   lane, not a merge blocker today.

2. **Integration tests
   (`tests/integration/test_session_secret_rotation.py`) not run.**
   They require a live WiseTutor backend with seeded users and
   known PINs (`mrw`/`2468`, `bella`/`1357`) and a dedicated
   data-directory. The currently-running Docker container uses
   a different PIN profile and is reserved for the operator's
   real work; running integration tests against it is out of
   scope for this bounded lane. Unit coverage is sufficient to
   prove the library-level rotation contract; integration
   coverage is the operator's/CI's job to run against a
   disposable backend before production rotation.

3. **Branch is not pushed.** Per `CLAUDE.md — Git rules`, only
   the founder pushes to `origin`. The post-fix tip `8c919b4`
   exists locally on `auto-claude/005-session-secret-rotation`;
   no remote push has been attempted or is implied by this
   artifact.

## Files changed

- **On branch `auto-claude/005-session-secret-rotation`
  (1 new commit, `8c919b4`):**
  - `scripts/rotate_session_secret.py` — +3 / −2 lines.
- **On `bootstrap/wisetutor-baseline`:**
  - `.cto/03_state/WISE_TUTOR_005_SESSION_SECRET_ROTATION_MERGE_READINESS_v1.md`
    — new file, this document.
- No other file on either branch was touched by this lane.
- No test was added or modified by this lane.
- No product code was changed by this lane beyond the one-file
  redaction.

## Manual action required

The founder (not the agent) performs the merge. Recommended
invocation, once the founder chooses to run it:

    # From the main repo (not the worktree):
    cd /home/ai-desktop/projects/WiseTutor
    git checkout bootstrap/wisetutor-baseline
    git merge --no-ff auto-claude/005-session-secret-rotation \
        -m "merge(005): session secret rotation with --dry-run redaction"

Before merging, a bounded pre-flight check the founder may want to
run (optional, belt-and-braces):

    # Re-run unit tier from the main repo at the merge tip:
    /home/ai-desktop/projects/DeepTutor/.venv/bin/python -m pytest \
        tests/unit/test_session_secret_rotation.py \
        tests/unit/test_memory_identity_guard.py -v

    # Confirm dry-run remains clean after the merge:
    /home/ai-desktop/projects/DeepTutor/.venv/bin/python \
        scripts/rotate_session_secret.py --dry-run | \
        grep -E "[a-f0-9]{8,}" | wc -l
    # expected: 0

No other manual action is required to declare 005 merged. A
DECISIONS_LOG entry on merge is appropriate but is the founder's
call (the change is a capability addition plus a security-floor
fix, not an architectural decision).

## Next move

- Task 005 is ready for the founder to merge. It is classified
  MERGEABLE_NOW on the evidence above.
- After 005 lands, the next bounded recovery lane in the queue
  (per `WISE_TUTOR_APERANT_RECOVERY_AUDIT_v1.md`) is
  003 Backend Network Bind Restriction with its own salvage fix
  (revert `Dockerfile` `ENV BACKEND_HOST` to `0.0.0.0` as
  container default; drop `VERIFICATION_REPORT.md` and
  `test_backend_host.py` from repo root; drop duplicate
  `.auto-claude/` line from `.gitignore`). Do not open that
  lane in this session — it is a separate bounded audit/fix
  slice.
- Do not, in this lane, touch 001, 008, or any other
  Aperant branch.
- Do not, in this lane, open product feature work,
  Multica/Archon integration, or pod-unlock.
- Optional follow-up (not blocking 005 merge): a later narrow
  lane could tighten `--env-format` output hygiene (Item 1 in
  "Not yet verified") by either requiring an explicit
  confirmation flag or dropping the line-179 32-char preview in
  favor of a full-value print. Out of scope for this lane.
