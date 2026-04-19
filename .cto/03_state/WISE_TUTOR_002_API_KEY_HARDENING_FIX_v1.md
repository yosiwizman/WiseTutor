# WiseTutor 002 API Key Security Hardening — Fix v1

Lane date: 2026-04-19
Lane: bounded security hardening on
`auto-claude/002-api-key-security-hardening`, closing the blocker
identified in `.cto/03_state/WISE_TUTOR_002_API_KEY_HARDENING_AUDIT_v1.md`
(plaintext keys in default HTTP response).

Branch / worktree:
- Worktree:
  `/home/ai-desktop/projects/WiseTutor/.auto-claude/worktrees/tasks/002-api-key-security-hardening`
- Branch: `auto-claude/002-api-key-security-hardening`
- Pre-fix tip: `6b2ef9b`.
- Post-fix tip: `09268fc`
  (`fix(002): remove plaintext API keys from HTTP response; add
  invocation audit log`).
- Founder already cleared the prior procedural merge blocker by
  committing the baseline's `DECISIONS_LOG.md` rotation-closeout
  dirty state as `a0b18e0 docs(secrets): record OpenAI key rotation
  closeout` (observed on `bootstrap/wisetutor-baseline`).

---

## Claim

The one remaining security blocker from the 002 audit is fixed on
`auto-claude/002-api-key-security-hardening` by a bounded 4-file
commit (`09268fc`, +285/−49). The migration endpoint's default JSON
response no longer carries plaintext API key material; plaintext now
lives only in a 0600-permission file on disk that the operator
retrieves out-of-band. A server-side `INFO` log records every
invocation without echoing any key material. The original
`key_count = 1 if env_file_path else 0` miscount bug is also closed
by propagating the real count through a 3-tuple return.

Six unit tests pass on the post-fix tip, including a new dedicated
gate test that serializes the exact HTTP-response dict shape the
router returns and asserts that two plaintext canary strings
(`sk-plaintext-llm-canary-ZZZZZ-1234`,
`sk-plaintext-emb-canary-YYYYY-5678`) never appear in the
serialized JSON.

Task 002 is now classified **MERGEABLE_NOW**, subject to three
explicit non-blocking limits listed under "Not yet verified."

## Proof

### 1. The blocker that previously kept 002 out of MERGEABLE_NOW

On pre-fix tip `6b2ef9b`,
`deeptutor/api/routers/settings.py::migrate_catalog_keys` returned:

    return {
        "migrated_catalog": migrated_catalog,
        "env_vars": env_vars,                    # <- dict with plaintext
        "count": len(env_vars),
        "message": "...",
        "user_id": uid,
    }

The `env_vars` field was `{VAR_NAME: plaintext_key_value}`, so every
call emitted every migrated plaintext API key as part of a normal
auth-gated JSON response. That response body reaches reverse proxy
logs, browser DevTools, Playwright trace dumps, CI artifact uploads,
and operator terminal history via curl — surfaces outside of
`SECURITY_BASELINE.md:49` ("Keys must never be echoed into test
output, screenshots, or log files") and
`CLAUDE.md — Secrets rules` ("Never print an API key").

### 2. Fix commit `09268fc` (single commit, 4 files, +285/−49)

Staged-and-committed files on the 002 branch tip:

    deeptutor/api/routers/settings.py                |  37 ++++--
    deeptutor/services/config/model_catalog.py       |  50 ++++++--
    docs/api-key-migration-guide.md                  | 109 +++++++++++++-----
    tests/services/config/test_api_key_resolution.py | 138 ++++++++++++++++++++++-

Code-level changes:

- `model_catalog.py::ModelCatalogService.migrate_keys_to_env` now
  returns `tuple[dict[str, Any], str, int]` — catalog preview,
  temp-file path, and migrated count. Plaintext keys are written
  via `tempfile.mkstemp(suffix='.env.migration', prefix='wisetutor_',
  text=True)`, the file is chmod'ed to `0o600`, and a header block
  instructs the operator to review, copy, and delete. Error path
  unlinks the temp file and returns `(catalog, "", 0)`.
- `settings.py` adds
  `from deeptutor.logging import get_logger` +
  `logger = get_logger(__name__)` at module scope. The endpoint
  handler unpacks the new 3-tuple, emits exactly one audit line

      logger.info(
          "migrate-keys endpoint invoked: user=%s count=%d file=%s",
          uid,
          key_count,
          env_file_path or "(none)",
      )

  (no key material in the log string), and returns
  `{migrated_catalog, env_file_path, count, message, user_id}` —
  a response body that carries only names, paths, and counts, never
  plaintext.
- `docs/api-key-migration-guide.md` is updated to describe the new
  "review the temp file, copy into `.env`, delete the temp file"
  flow with an explicit security note.
- Test `test_migration_converts_plaintext_to_env` updated for the
  3-tuple return; explicit `assert migrated_count == 2` added for
  the llm+embedding fixture.
- Brand-new test
  `test_migrate_http_response_never_contains_plaintext_keys`
  builds the exact dict shape the router returns, `json.dumps()` it,
  and asserts that neither plaintext canary
  (`sk-plaintext-llm-canary-ZZZZZ-1234`,
   `sk-plaintext-emb-canary-YYYYY-5678`) appears in the serialized
  payload. Also asserts `count == 2`, file mode `0o600`, and that
  the file does still carry the plaintext (operator-reachable).

### 3. Verification run on post-fix tip

    WISETUTOR_REPO=$(pwd) \
      /home/ai-desktop/projects/DeepTutor/.venv/bin/python -m pytest \
      tests/services/config/test_api_key_resolution.py -v

Output:

    tests/services/config/test_api_key_resolution.py::test_resolve_api_key_from_env_reference                        PASSED
    tests/services/config/test_api_key_resolution.py::test_plaintext_keys_still_work                                  PASSED
    tests/services/config/test_api_key_resolution.py::test_migration_converts_plaintext_to_env                        PASSED
    tests/services/config/test_api_key_resolution.py::test_migrate_http_response_never_contains_plaintext_keys        PASSED
    tests/services/config/test_api_key_resolution.py::test_per_user_catalog_env_resolution                            PASSED
    tests/services/config/test_api_key_resolution.py::test_logs_never_expose_keys                                     PASSED

    6/6 PASS (0.11–0.12 s)

Module import smoke on the post-fix tree:

    from deeptutor.api.routers import settings as s
    from deeptutor.services.config.model_catalog import ModelCatalogService
    # -> router loads cleanly; annotation
    #   ModelCatalogService.migrate_keys_to_env.__annotations__['return']
    #   == 'tuple[dict[str, Any], str, int]'

### 4. No contradiction with prior merged lanes

- **005 (session secret rotation, `c813e67`)**: 002 does not touch
  `deeptutor/services/users/identity.py`, the rotate script, or
  its tests.
- **003 (backend bind restriction, `6712477`)**: 002 does not touch
  `Dockerfile`, `deeptutor/services/setup/*`, `run_server.py`,
  `deeptutor_cli/main.py`, `scripts_local/wt_start.sh`, or the
  tutorbot gateway schema.
- **Secrets-hygiene closeout**: 002's `SECURITY_BASELINE.md`
  rewrite (from the pre-fix branch content, unchanged by this fix
  commit) documents the env-var-indirection contract and
  supersedes the "plaintext in `model_catalog.json`" paragraph.
  This is a doc-only supersession; no operational claim from the
  closeout is invalidated.

### 5. Bounded-ness

The fix commit touches exactly four files. No new dependency. No
test removed. No other branch. No force operation. No push.

## Verified scope

- Plaintext API keys are not in the default HTTP response body —
  enforced by the new gate test over the exact router response
  shape.
- Audit log line exists in the endpoint handler and does not emit
  key material.
- The migrate-to-env semantic is preserved end-to-end — plaintext
  keys move from catalog → 0600 temp file → operator's `.env`,
  and the catalog is left carrying only `env:VAR_NAME` references.
- 3-tuple return eliminates the `count = 1 if env_file_path else 0`
  miscount.
- File-mode assertion (0o600) in both the updated existing test
  and the new gate test.
- Six unit tests pass on the post-fix tip.
- No changes to merged 003/005 surfaces; no dependency drift.

## Not yet verified

1. **End-to-end HTTP integration test** against a live
   FastAPI app via `TestClient` with a real auth cookie.
   The unit-level `test_migrate_http_response_never_contains_
   plaintext_keys` builds the exact dict shape the router returns
   and proves plaintext is absent from any serialization of it,
   but it does not round-trip through FastAPI's JSON encoder,
   the `_require_uid` cookie middleware, or a real client.
   A future bounded lane can add this.

2. **Docker-runtime operator UX.** Because `tempfile.mkstemp`
   uses `TMPDIR` (default `/tmp`), the temp file lands inside
   the container on Docker deployments, owned by the container's
   backend user (root in the current image). Retrieving the
   file from the host requires `docker cp` or `docker exec`.
   This is not a security regression — the file is still chmod
   `0600`, unreachable to other LAN devices — but it is an
   operator-UX awkwardness that a future narrow lane could
   address by writing to a mount-backed per-user settings path
   (`data/user/settings/migrated_env_vars_<ts>.env` would be
   visible on the host via the `./data/user:/app/data/user`
   compose mount).

3. **Post-merge DECISIONS_LOG ordering.** 002's
   `DECISIONS_LOG.md` entry is dated 2026-04-17 and prepended at
   the top (per file policy "newest at top"). The founder's
   committed `2026-04-18 — OpenAI key rotation closeout` entry
   (commit `a0b18e0`) sits at the bottom of the file. After 002
   merges, the file violates its own "newest at top" policy. A
   one-line post-merge reorder is cosmetic; not a blocker.

## Files changed

- **On branch `auto-claude/002-api-key-security-hardening`
  (1 new commit, `09268fc`):**
  - `deeptutor/api/routers/settings.py` (+37 / −14) — adds
    `get_logger` import + module-level logger; unpacks 3-tuple
    from `migrate_keys_to_env`; emits one `INFO` audit line; drops
    plaintext `env_vars` from the response body.
  - `deeptutor/services/config/model_catalog.py` (+41 / −9) —
    widens `migrate_keys_to_env` return to
    `tuple[dict, str, int]`; preserves the 0600 temp-file
    behavior introduced in the pre-existing in-worktree draft.
  - `tests/services/config/test_api_key_resolution.py` (+129 /
    −9) — updates existing test for 3-tuple; adds new
    `test_migrate_http_response_never_contains_plaintext_keys`.
  - `docs/api-key-migration-guide.md` (+78 / −17) — updated
    flow description.
- **On `bootstrap/wisetutor-baseline` (working tree, uncommitted):**
  - `.cto/03_state/WISE_TUTOR_002_API_KEY_HARDENING_FIX_v1.md`
    (new, this document).
- **Not touched:** docker-compose files, any identity/session/
  secret surface from 005, any bind-restriction surface from 003,
  any test file other than
  `tests/services/config/test_api_key_resolution.py`, any
  dependency manifest.

## Manual action required

Founder-only. None is blocking to classify 002 MERGEABLE_NOW. The
following are queued for the founder:

1. **Merge locally** (separate bounded lane, not this one):

        cd /home/ai-desktop/projects/WiseTutor
        git checkout bootstrap/wisetutor-baseline
        git diff auto-claude/002-api-key-security-hardening --stat   # sanity
        git merge --no-ff auto-claude/002-api-key-security-hardening \
            -m "merge(002): api key env-var indirection with HTTP hardening"

2. **(Optional, cosmetic)** After the merge, reorder
   `DECISIONS_LOG.md` so the newest entry is again at the top
   (move the 2026-04-18 rotation-closeout entry above the
   2026-04-17 API-key-hardening entry, or swap positions).

3. **(Optional, future lane)** Add a FastAPI `TestClient`
   integration test for `POST /api/v1/settings/catalog/
   migrate-keys` with a real auth cookie. Not in this lane.

4. **(Optional, future lane)** Change `tempfile.mkstemp` target
   dir to the per-user settings path so the temp file is
   host-visible through the Docker compose mount. Out of scope
   for this lane.

5. **Do not push** `bootstrap/wisetutor-baseline` until ready —
   only the founder pushes per `CLAUDE.md — Git rules`.

## Next move

- Task 002 is ready for the founder to merge. It is classified
  **MERGEABLE_NOW** on the evidence above, subject to the three
  explicit "Not yet verified" limits.
- Do not, in this session, merge 002, push any branch, open
  lanes for 014, 027, 001, 008, Multica, or Archon, or start any
  product-slice work.
- After 002 is merged at the founder's timing, the natural
  next-lane candidates (each its own bounded lane, not opened
  here) are: (a) the cosmetic DECISIONS_LOG reorder; (b) a
  FastAPI TestClient integration test for `/migrate-keys`;
  (c) the per-user-settings temp-file relocation for Docker
  friendliness; (d) optional worktree + branch cleanup for
  `auto-claude/002-...`.
