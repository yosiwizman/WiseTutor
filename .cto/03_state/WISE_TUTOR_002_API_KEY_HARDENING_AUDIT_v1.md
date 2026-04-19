# WiseTutor 002 API Key Security Hardening — Audit v1

Audit date: 2026-04-19
Auditor: bounded auditor/verifier (agent)
Baseline tip: `bootstrap/wisetutor-baseline` @ `6712477`
  (after 005 merge `c813e67` and 003 merge `6712477`).
002 branch tip: `auto-claude/002-api-key-security-hardening` @ `6b2ef9b`.
Merge-base with baseline: `29f1b9f`.
Scope: audit-only; do not merge; do not widen.

---

## Task 002 — API Key Security Hardening

### Task name

`auto-claude/002-api-key-security-hardening`

### Claimed intent

Move API key storage away from plaintext JSON
(`data/user/settings/model_catalog.json`) toward environment-variable
indirection and/or secure runtime resolution, preserving provider
configs and preventing key exposure in logs and responses.

### Actual code surface found

Seventeen commits ahead of merge-base, collapsing into eight touched
files (`git diff 29f1b9f..HEAD --name-status`):

- `deeptutor/services/config/provider_runtime.py` (+16/−3) —
  adds `_resolve_api_key(value)` helper that treats any `api_key`
  string beginning with `env:` as a `VAR_NAME` lookup against
  `os.environ`; plaintext passes through unchanged. Wired into
  `resolve_llm_runtime_config`, `resolve_embedding_runtime_config`,
  and the two code paths inside `resolve_search_runtime_config`.
- `deeptutor/services/config/model_catalog.py` (+70/−0) —
  adds a `WARNING`-level log inside `_normalize()` when a profile
  carries a non-`env:` `api_key` (deprecation warning; key value
  itself is **not** logged — only profile `name` + `id`). Adds
  `ModelCatalogService.migrate_keys_to_env() -> (catalog, env_vars)`
  which reads the raw catalog JSON, generates deterministic
  `{SERVICE}_API_KEY_PROFILE_{NORMALIZED_ID}` names, swaps the
  plaintext for `env:VAR_NAME`, and returns a preview catalog +
  env-vars dict without writing to disk.
- `deeptutor/api/routers/settings.py` (+29/−0) — adds
  `POST /api/v1/settings/catalog/migrate-keys`, cookie-gated via
  `_require_uid(request)`, calling the migration method and
  returning `{migrated_catalog, env_vars, count, message, user_id}`
  as JSON. The response body contains the plaintext keys that the
  operator is expected to paste into `.env`.
- `tests/services/config/test_api_key_resolution.py` (+294) — five
  cases: resolver env-reference lookup, plaintext backward-compat,
  migration round-trip, per-user catalog env resolution, and
  redaction in `test_runner` events.
- `docs/api-key-migration-guide.md` (+340) — operator-facing
  migration guide.
- `SECURITY_BASELINE.md` (+15/−4) — rewrites the "catalog storage
  plaintext" paragraph to document env-var indirection +
  deprecation + migration endpoint.
- `DECISIONS_LOG.md` (+81/−0) — prepends
  `2026-04-17 — API key security hardening: env-var indirection`.
- `CURRENT_STATE.md` (+61/−0) — adds a "security posture" block.

Real code — not board-only.

### Evidence found

- `_resolve_api_key` implementation
  (`deeptutor/services/config/provider_runtime.py:178–184`): four
  lines, pure-function, no I/O beyond `os.environ.get`, no logging.
  Returns empty string when the referenced variable is unset (fail-
  closed behavior).
- `migrate_keys_to_env` implementation
  (`deeptutor/services/config/model_catalog.py:480–529`): reads the
  raw catalog JSON via `json.load`, skips empty and already-`env:`-
  prefixed keys, normalizes profile IDs (`upper().replace("-","_")`),
  and builds an env-vars dict without writing to disk. Returns
  `(catalog, env_vars)` tuple.
- `/catalog/migrate-keys` endpoint
  (`deeptutor/api/routers/settings.py:572–598`): per-user via
  `get_model_catalog_service(user_id=uid)`, auth-gated via
  `_require_uid(request)`, returns a JSON body whose `env_vars` field
  is exactly `{VAR_NAME: plaintext_value_as_read_from_catalog}`.
- `_normalize` deprecation warning
  (`deeptutor/services/config/model_catalog.py:413–422`): logs
  `"Plaintext API key detected in <service> service profile '<name>'
   (id: <id>)."` — **no key material** in the log string.
- Test `test_logs_never_expose_keys` enforces `_redact()` masking
  in `test_runner` events and verifies the plaintext cannot be
  recovered from an emitted event JSON.
- `SECURITY_BASELINE.md` rewrite replaces the "plaintext in
  `model_catalog.json`" paragraph with a precise statement of the
  env-var-indirection contract, the deprecation warning, and a
  pointer to the migration endpoint + guide. Doc update is
  consistent with the code.
- `DECISIONS_LOG.md` entry
  (`2026-04-17 — API key security hardening`) accurately describes
  the three-part change.

### Verification run

1. Unit tests (bounded) from the 002 worktree using the DeepTutor
   venv:

       WISETUTOR_REPO=$(pwd) \
         /home/ai-desktop/projects/DeepTutor/.venv/bin/python -m pytest \
         tests/services/config/test_api_key_resolution.py -v

   Result: **5/5 PASS** (0.14 s). Cases exercised:
   - `test_resolve_api_key_from_env_reference`
   - `test_plaintext_keys_still_work`
   - `test_migration_converts_plaintext_to_env`
   - `test_per_user_catalog_env_resolution`
   - `test_logs_never_expose_keys`

2. Pre-merge three-way dry run
   (`git merge --no-commit --no-ff auto-claude/002-...` from the
   primary repo on `bootstrap/wisetutor-baseline` @ `6712477`):

       error: Your local changes to the following files would be
       overwritten by merge:
           DECISIONS_LOG.md
       Please commit your changes or stash them before you merge.
       Aborting
       Merge with strategy ort failed.

   This is a **procedural blocker, not a content conflict.** The
   pre-existing dirty state on `bootstrap/wisetutor-baseline`
   includes an uncommitted `2026-04-18 — OpenAI key rotation
   closeout` entry appended to the end of `DECISIONS_LOG.md`
   (owner's rotation record from the prior secrets lane). The 002
   branch prepends a different entry at the top of the same file.
   The hunks do not overlap; `git merge-tree` produces zero
   `<<<<<<<` conflict markers. A three-way merge would succeed
   once the operator commits (or stashes) the existing dirty
   state.

3. Baseline `SECURITY_BASELINE.md` inspection vs 002's rewrite:
   current baseline retains the older "plaintext in
   `model_catalog.json`" wording (lines 42–45); 002 supersedes
   that paragraph with env-var-indirection wording. The
   supersession is intentional and consistent with the code
   change.

4. No live Docker operation performed; the running `deeptutor`
   container was not touched. No test was rewritten.

### Classification

**SALVAGEABLE_WITH_BOUNDED_FIX**

### Merge risk

Medium as-is, broken down:

- **Procedural (low-effort)**: the existing
  `DECISIONS_LOG.md` dirty state on baseline blocks `git merge`.
  Fix is an operator one-liner: commit or stash. Not a code
  change.
- **Security-surface (nontrivial)**: the new HTTP endpoint
  `/catalog/migrate-keys` newly emits plaintext API keys over
  HTTP. This is an explicit opt-in secret-export flow analogous
  to 005's `--env-format` CLI, and it is cookie-authenticated
  (`_require_uid`). But an HTTP response body is captured by
  reverse proxies, browser devtools, Playwright trace dumps, CI
  artifact uploads, and `curl` terminal history. There is no
  opt-in-confirmation parameter and no server-side audit log
  when the endpoint is invoked.
  Strictly, this violates the verification-gate criterion "key
  material is not newly exposed in logs/output": plaintext keys
  now live in a response surface where they previously did not.
  Hardening options the audit suggests (bounded, not exhaustive):
  * Require `?i_know_this_returns_plaintext=true` query param
    (belt-and-braces).
  * Emit a server-side `INFO`/`WARNING` log when the endpoint is
    invoked (who and when, not the key value), so the owner can
    notice misuse.
  * Instead of returning plaintext, write the env-vars dict to
    a `chmod 600` file (e.g.,
    `data/user/settings/migrated_env_vars.txt`) and return only
    the filename in the HTTP response.
  Any one of those closes the strict gate reading.
- **Doc/DECISIONS_LOG ordering (cosmetic)**: 002 prepends
  `2026-04-17` (earlier date) at the top of `DECISIONS_LOG.md`;
  baseline has the operator's `2026-04-18` entry at the file's
  bottom. Post-merge the file violates its own stated "newest
  at top" policy (`DECISIONS_LOG.md:3`). Easy one-line reorder
  post-merge; not a correctness issue.

### Overlap / conflict with existing secrets lane

Summary: mild doc overlap, no code conflict, no reversal of any
already-merged work.

- **With 005 Session Secret Rotation (`c813e67`)**: no overlap.
  002 does not touch `deeptutor/services/users/identity.py`,
  `scripts/rotate_session_secret.py`, or any
  `tests/*/test_session_secret_rotation.py`. 002's merge-base
  (`29f1b9f`) predates 005; the three-way merge would keep
  baseline's 005 content and apply 002's deltas on top.
- **With 003 Backend Network Bind Restriction (`6712477`)**: no
  overlap. 002 and 003 touch disjoint files.
- **With WISE_TUTOR_SECRETS_HYGIENE_CLOSEOUT_v1/v2 (my prior
  lane)**: partial doc overlap. My closeout cited
  `SECURITY_BASELINE.md:43–45` ("plaintext in
  `model_catalog.json`") as the current state for live-key
  rotation reasoning. 002 replaces those lines with the env-var-
  indirection contract. After 002 merges, line numbers shift
  and the "plaintext" claim the prior closeout referenced is
  no longer the documented default. **This does not invalidate
  the closeout**: rotation still happens by editing `.env` and
  restarting the backend; the only change is that the catalog
  now points at `env:VAR_NAME` instead of carrying the plaintext
  directly. My closeout artifact's line references become stale
  but its operational claim remains valid. The operator may want
  to append a short note to the closeout artifact after 002
  merges noting the new indirection path.
- **With DECISIONS_LOG 2026-04-18 entry (operator's rotation
  closeout, currently dirty on baseline)**: no content conflict
  (different hunks), but procedural blocker as described in
  "Verification run §2".

### Recommended next action

Do not merge 002 in its current form. Before it is merge-ready:

1. **Operator (blocking, simple).** Commit the pre-existing
   `DECISIONS_LOG.md` dirty state on
   `bootstrap/wisetutor-baseline` (the
   `2026-04-18 — OpenAI key rotation closeout` entry). Suggested:

        git checkout bootstrap/wisetutor-baseline
        git diff DECISIONS_LOG.md   # review
        git add DECISIONS_LOG.md
        git commit -m "docs(DECISIONS_LOG): record 2026-04-18 OpenAI key rotation closeout"

   After this, the procedural merge blocker is gone. A dry
   `git merge --no-commit --no-ff auto-claude/002-...` on the
   cleaned baseline should succeed (no content conflicts
   expected, since the hunks do not overlap).

2. **Agent (narrow).** Tighten the `/catalog/migrate-keys`
   endpoint so plaintext keys are not incidentally exposed in
   HTTP response bodies without an explicit operator opt-in.
   Recommended minimum:
   - Add a server-side log line when the endpoint is invoked
     (no key material, just `"migrate-keys invoked for
     user=<uid>, count=<N>"`).
   - Gate plaintext return behind an explicit query parameter
     such as `?i_know_this_returns_plaintext=true`; without it,
     return only `{migrated_catalog, env_var_names, count,
     message}` with the plaintext values masked to
     `"(redacted)"`. Preserve the full plaintext return when
     the operator explicitly opts in.
   - (Optional, stronger) Write the env-vars dict to a
     `chmod 600` file under the user's settings dir and return
     only the file path; delete the file-return path in a
     future lane if not used.
   Any of the above closes the verification-gate reading "key
   material is not newly exposed in logs/output".

3. **Agent (optional, cosmetic).** Reorder `DECISIONS_LOG.md`
   after merge so newest is at the top again (either move the
   002 entry below the 2026-04-18 closeout, or move both).

4. **Agent (optional).** Add an integration test that POSTs to
   `/api/v1/settings/catalog/migrate-keys` with an auth cookie
   and asserts the response shape + masking behavior. Unit
   tests already cover the underlying migration method; an
   end-to-end HTTP test would cover the router surface.

Do not merge 002 until at least items 1 and 2 are done. Items
3 and 4 are quality-of-life.

---

## Single best next bounded lane after this audit

**Operator commit of the `DECISIONS_LOG.md 2026-04-18` dirty state
on `bootstrap/wisetutor-baseline`, as one small doc-only commit.**

Why this one:
- It is the smallest reversible action available and strictly
  an operator-only choice (agent cannot commit for the founder
  per the git rules).
- It is blocking for 002 but useful even if 002 is never
  merged: it records the already-completed OpenAI key rotation
  in the permanent git history (currently only in the
  uncommitted working tree + `.cto/03_state/` artifacts).
- It is not a widening of scope — it just closes a loose end
  from the earlier secrets lane.

After that commit:
- The next bounded agent lane candidate is **002's
  `/catalog/migrate-keys` endpoint hardening** (recommended
  next-action §2 above). That fix is narrow, localized to one
  router file, does not widen 002's scope, and is what stands
  between 002 and MERGEABLE_NOW.
- Do not, in any follow-on lane, reopen 003 or 005, audit 014
  / 027 / 001 / 008, or start product-slice, Multica, or
  Archon work in this session.
