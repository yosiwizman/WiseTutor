# WiseTutor 002 API Key Security Hardening — Merged v1

Close date: 2026-04-19
Lane: local merge of `auto-claude/002-api-key-security-hardening`
into `bootstrap/wisetutor-baseline`. No push to origin.

Supersedes: `.cto/03_state/WISE_TUTOR_002_API_KEY_HARDENING_FIX_v1.md`.

Baseline tip before merge: `a0b18e0`
  (`docs(secrets): record OpenAI key rotation closeout`).
002 branch tip at merge: `09268fc`
  (`fix(002): remove plaintext API keys from HTTP response; add
  invocation audit log`).
Merge commit: `2e9a605`
Baseline tip after merge: `2e9a605` (local only; not pushed).

---

## Claim

Task 002 API Key Security Hardening is now **merged locally** into
`bootstrap/wisetutor-baseline` via merge commit `2e9a605` (parents
`a0b18e0` + `09268fc`). The merge was no-ff, executed by git's
`ort` strategy with one auto-merge on `DECISIONS_LOG.md` (different
hunks, no conflict markers) and no manual resolution. All four
fix-critical 002 files land byte-identical to the 002 branch tip —
`git diff HEAD 09268fc` returns 0 lines for each. The 005 and 003
content merged earlier this session is intact on the post-merge
tree (`Dockerfile:117 BACKEND_HOST=0.0.0.0`,
`scripts/rotate_session_secret.py:126,131` redacted prints still
present). No push occurred. The running `deeptutor` container
was not touched (still `Up 12 hours (healthy)`).

## Proof

### 1. Pre-merge state

- `git branch --show-current` → `bootstrap/wisetutor-baseline`.
- Pre-merge tip on baseline: `a0b18e0 docs(secrets): record
  OpenAI key rotation closeout` (the founder's prior commit that
  cleared the procedural blocker noted in the 002 audit).
- 002 tip at merge time: `09268fc` (post-fix).
- Dirty-overlap check (loop over six pre-existing dirty tracked
  baseline paths — `CLAUDE.md`, `OPERATOR_RUNBOOK.md`, two
  `dist/*.zip`, `web/next-env.d.ts`, `web/next.config.js` — vs.
  `git diff --name-only bootstrap/wisetutor-baseline..auto-claude/
  002-api-key-security-hardening`): **zero `CONFLICT-RISK` lines**.
  None of the six dirty paths appear in 002's footprint. Safe
  for `git merge` to proceed.
- Note: `DECISIONS_LOG.md` is no longer dirty on baseline — the
  founder committed it as `a0b18e0` in the prior step. That
  cleared the exact procedural blocker flagged in
  `WISE_TUTOR_002_API_KEY_HARDENING_AUDIT_v1.md`.

### 2. Merge

Command:

    git merge --no-ff auto-claude/002-api-key-security-hardening \
        -m "merge(002): api key env-var indirection with HTTP hardening"

Output:

    Auto-merging DECISIONS_LOG.md
    Merge made by the 'ort' strategy.
     CURRENT_STATE.md                                 |  61 ++++
     DECISIONS_LOG.md                                 |  81 +++++
     SECURITY_BASELINE.md                             |  17 +-
     deeptutor/api/routers/settings.py                |  50 +++
     deeptutor/services/config/model_catalog.py       | 104 ++++++
     deeptutor/services/config/provider_runtime.py    |  17 +-
     docs/api-key-migration-guide.md                  | 393 +++++++++++++++++++++
     tests/services/config/test_api_key_resolution.py | 422 +++++++++++++++++++++++
     8 files changed, 1137 insertions(+), 8 deletions(-)
     create mode 100644 docs/api-key-migration-guide.md
     create mode 100644 tests/services/config/test_api_key_resolution.py

The only `Auto-merging` line was on `DECISIONS_LOG.md`, where
002's `2026-04-17 — API key security hardening` entry at the top
of the file and the founder's `2026-04-18 — OpenAI key rotation
closeout` entry at the bottom occupy non-overlapping hunks. No
conflict markers written. No manual resolution needed.

Merge commit shape:

    2e9a605 merge(002): api key env-var indirection with HTTP hardening
    parents: a0b18e0 09268fc

### 3. Post-merge tree equivalence for 002's fix-critical files

    git diff HEAD 09268fc -- <file>

results on the merged baseline:

    deeptutor/api/routers/settings.py                → 0 diff lines
    deeptutor/services/config/model_catalog.py       → 0 diff lines
    tests/services/config/test_api_key_resolution.py → 0 diff lines
    docs/api-key-migration-guide.md                  → 0 diff lines

The merged tree is byte-identical to the 002 branch tip on every
fix-critical file. No resolver rewrite on the 002 surface.

`grep -n "def migrate_keys_to_env"
deeptutor/services/config/model_catalog.py` on the merged tree
returns the 3-tuple signature introduced by the fix:

    483:    def migrate_keys_to_env(self) -> tuple[dict[str, Any], str, int]:

### 4. Previously merged 003 and 005 content survived

- `grep -n "BACKEND_HOST=0\.0\.0\.0" Dockerfile` on merged tree
  → `117:    BACKEND_HOST=0.0.0.0 \` (003's Docker-safe default
  preserved).
- `grep -n "redacted" scripts/rotate_session_secret.py` on merged
  tree → lines 126 and 131 still carry the 005 redaction:
  `Current secret: (redacted, {len(current_secret)} bytes)` and
  `New secret: (redacted, {len(new_secret)} bytes)`.
- `tests/unit/test_session_secret_rotation.py`,
  `tests/integration/test_session_secret_rotation.py`, and
  `tests/services/config/test_api_key_resolution.py` all present
  on the merged tree.

### 5. No push, no force, no rebase

- `git push` was not executed.
- `git log -1 --format="%H %P"` confirms the merge is a genuine
  no-ff with two parents (`a0b18e0` + `09268fc`), not a rewrite.
- `git status --short` after merge shows exactly the same six
  pre-existing dirty tracked paths (`CLAUDE.md`,
  `OPERATOR_RUNBOOK.md`, two `dist/*.zip`, `web/next-env.d.ts`,
  `web/next.config.js`). No new modification introduced on
  unrelated files.

### 6. Running Docker container unaffected

    sg docker -c "docker ps --filter name=^/deeptutor$ ..."
    → deeptutor Up 12 hours (healthy)

Same container instance, `StartedAt = 2026-04-19T01:32:20Z`, was
not rebuilt, not restarted, and not touched by this lane. 002's
changes live in the source tree only.

## Verified scope

- Procedural merge blocker (the founder's uncommitted rotation-
  closeout edit to `DECISIONS_LOG.md`) was resolved before this
  lane started — observed via `a0b18e0` on baseline.
- Dirty-overlap check vs 002's footprint: zero hits on the six
  pre-existing dirty tracked paths.
- Merge mechanics: no-ff, `ort`, one harmless `Auto-merging` on
  non-overlapping hunks in `DECISIONS_LOG.md`, zero conflicts,
  correct parents (`a0b18e0` + `09268fc`).
- Byte-for-byte tree equivalence of 002's four fix-critical
  files vs 002 branch tip.
- 3-tuple signature on the merged `migrate_keys_to_env`.
- 003 and 005 earlier merges' content present and intact.
- No push, no rebase, no force operation.
- Pre-existing dirty state unchanged.
- Live container continuously healthy through the merge.

## Not yet verified

1. **Post-merge pytest run from the primary repo path.**
   Consistent with the 003-merge lane, `pytest` launched from
   `/home/ai-desktop/projects/WiseTutor` errors at collection
   because `data/user/logs/` is `root:root`-owned via the live
   Docker volume mount (`PermissionError` on
   `deeptutor_20260419.log`). Covered indirectly by: (a) the
   byte-for-byte tree equivalence check above, (b) the 6/6 PASS
   pytest run on the 002 worktree recorded in
   `WISE_TUTOR_002_API_KEY_HARDENING_FIX_v1.md`, (c) the earlier
   `last_evidence.json` closures for 002's source paths.

2. **End-to-end HTTP `/catalog/migrate-keys` test.** Not run.
   The unit-level
   `test_migrate_http_response_never_contains_plaintext_keys`
   proves the response-dict shape carries no plaintext; a
   FastAPI TestClient round-trip is a future bounded lane.

3. **DECISIONS_LOG ordering.** Post-merge the file has the
   `2026-04-17 — API key security hardening` entry near the top
   and the `2026-04-18 — OpenAI key rotation closeout` entry
   near the bottom, so the "Newest at top" policy
   (`DECISIONS_LOG.md:3`) is now violated. Purely cosmetic; a
   future one-commit reorder would fix it.

4. **Docker temp-file operator UX.** When an operator calls
   `POST /api/v1/settings/catalog/migrate-keys` on the live
   Docker deployment, the temp file lives in the container's
   `/tmp` and is reachable only via `docker cp` / `docker exec`.
   Not a security regression — file is `0o600` and inside the
   container. A future narrow lane could target
   `data/user/settings/migrated_env_vars_<ts>.env` instead so
   the file is host-visible via the compose mount.

5. **Publication to `origin`.** Not performed. Founder-only per
   `CLAUDE.md — Git rules`.

6. **Cleanup of the 002 worktree** at
   `.auto-claude/worktrees/tasks/002-api-key-security-hardening/`
   and of the branch
   `auto-claude/002-api-key-security-hardening`. Both are
   preserved and not blocking; `git worktree remove` + `git
   branch -d` is the founder's call.

## Files changed

- **On `bootstrap/wisetutor-baseline` via merge commit
  `2e9a605`:**
  - `CURRENT_STATE.md` (+61) — security posture block.
  - `DECISIONS_LOG.md` (+81) — `2026-04-17 — API key security
    hardening: env-var indirection` entry.
  - `SECURITY_BASELINE.md` (+15 / −4) — catalog-storage
    paragraph rewrite documenting env-var indirection.
  - `deeptutor/api/routers/settings.py` (+50) — new
    `/catalog/migrate-keys` endpoint; `get_logger` import;
    audit-log line; response returns path + count, not
    plaintext.
  - `deeptutor/services/config/model_catalog.py` (+104) —
    `_normalize()` deprecation warning (no key material) +
    `migrate_keys_to_env` 3-tuple return writing plaintext to
    a 0600 `tempfile.mkstemp` file.
  - `deeptutor/services/config/provider_runtime.py` (+13 / −4)
    — `_resolve_api_key()` helper threaded into all three
    `resolve_*_runtime_config` paths.
  - `docs/api-key-migration-guide.md` (+393, new) — operator
    migration guide.
  - `tests/services/config/test_api_key_resolution.py` (+422,
    new) — 6 cases including the HTTP-response gate test.
  Totals: 8 files changed, 1137 insertions(+), 8 deletions(-).
- **On `bootstrap/wisetutor-baseline` working tree
  (uncommitted):**
  - `.cto/03_state/WISE_TUTOR_002_API_KEY_HARDENING_MERGED_v1.md`
    (new, this document).
- **Not touched by this lane:**
  - `docker-compose*.yml`, `.env.example`, `.gitignore`,
    any 003 product file beyond what baseline already carries,
    any 005 identity/rotate file beyond what baseline already
    carries.
  - Any Aperant branch other than 002.
  - The running Docker container.
  - The six pre-existing dirty tracked paths.

## Manual action required

Founder-only. None is blocking to declare 002 merged locally:

1. **Push `bootstrap/wisetutor-baseline`** when ready:
   `git push origin bootstrap/wisetutor-baseline`. Only the
   founder pushes.
2. **(Optional, cosmetic)** Reorder `DECISIONS_LOG.md` so
   "newest at top" holds again.
3. **(Optional, future lane)** Add a FastAPI `TestClient`
   integration test for `/catalog/migrate-keys`.
4. **(Optional, future lane)** Retarget
   `migrate_keys_to_env`'s temp file to a
   `data/user/settings/` path so Docker deployments don't
   need `docker cp`.
5. **(Optional, future lane)** `git worktree remove` + `git
   branch -d` for 002 once the founder is satisfied.
6. **(Optional)** Run the 002 unit tests from a writable-
   `data/user/logs/` context (e.g., inside the 002 worktree or
   after `chown`) to independently re-confirm 6/6 PASS on the
   merged tree.

## Next move

- Task 002 lane is closed locally. The entire Aperant recovery
  queue from the original audit
  (`WISE_TUTOR_APERANT_RECOVERY_AUDIT_v1.md`) is now materially
  exhausted:
  - **005** → merged (`c813e67`).
  - **003** → merged (`6712477`).
  - **002** → merged (`2e9a605`).
  - **001** → no mergeable unit (audit-classified, no action).
  - **008** → blocked by SSOT + founder-approval gates in
    `DECISIONS_LOG 2026-04-15`; do not merge.
- Do not, in this session, open any new lane (001, 008, 014,
  027, any other auto-claude branch, Multica, Archon, CI/CD,
  product feature slice, host-side Docker restriction,
  DECISIONS_LOG reorder, temp-file relocation, TestClient
  integration, worktree cleanup). Each of those is its own
  bounded lane to be opened by an explicit next-lane brief.
- Do not push.
