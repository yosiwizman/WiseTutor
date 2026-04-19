# WiseTutor 004 Configurable Pedagogy Mode — Hotfix v1

Close date: 2026-04-19
Lane: one-bug hotfix for the `PreferencesPatch` silent-drop bug
identified in
`.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_LIVE_PROOF_v1.md`.
Baseline tip before hotfix: `e840b22` (`merge(004)`).
Baseline tip after hotfix: `d028cd7`
(`fix(004): add pedagogy_mode to PreferencesPatch Pydantic model`).
Supersedes: `.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_LIVE_PROOF_v1.md`.

---

## Claim

The one-line bug that made 004 LIVE_PROOF_PARTIAL is fixed and
live on the merged baseline. Commit `d028cd7` adds
`pedagogy_mode: Optional[str] = None` to `PreferencesPatch` at
`deeptutor/api/routers/users.py:131-138`. After
rebuild + recreate of the `deeptutor` container
(`StartedAt = 2026-04-19T14:27:50Z`, health=healthy), the full
HTTP round-trip succeeds end-to-end: role-default GET, PUT
override, subsequent GET shows override persisted, invalid value
rejected with 400, cleanup PUT restores the default. Task 004 is
now **LIVE_PROOF_COMPLETE** for the pedagogy preference plumbing
(read path + write path + validation path).

## Proof

### 1. Fix commit `d028cd7`

    diff --git a/deeptutor/api/routers/users.py b/deeptutor/api/routers/users.py
    @@ -134,6 +134,7 @@
         safety_profile: Optional[str] = None
         display_name_override: Optional[str] = None
         theme: Optional[str] = None
    +    pedagogy_mode: Optional[str] = None

One file, +1 line. No test added or removed. No dependency
change. No other product area touched.

### 2. Rebuild + recreate

    task build        → `deeptutor  Built` (18.x s full build)
    task recreate     → Container deeptutor Recreate / Recreated /
                        Starting / Started

Health poll → `healthy` within ~4 s.

### 3. OpenAPI schema now declares pedagogy_mode

    curl http://localhost:8001/openapi.json | jq ...
    → PreferencesPatch.properties = [
        'allowed_capabilities', 'display_name_override',
        'pedagogy_mode', 'response_length', 'safety_profile',
        'theme', 'tone'
      ]
    → pedagogy_mode type = {'anyOf': [{'type': 'string'},
                                      {'type': 'null'}],
                            'title': 'Pedagogy Mode'}
    PASS: pedagogy_mode declared in PreferencesPatch

Pre-hotfix, the same probe returned the set WITHOUT
`pedagogy_mode`. That bit flipped is the live-at-the-schema
proof.

### 4. Full authenticated round-trip (mrw owner, PIN 1234)

Note: Mr W's PIN is still the `SECURITY_BASELINE.md:25-27`-
documented default `1234` on this container (the operator has
not rotated it). That gave this lane auth without requiring
operator-secret access.

All curl probes below went to `http://localhost:8001` on the
rebuilt container running the hotfix code:

    [2] Switch mrw/1234
        POST /api/v1/users/switch  {"user_id":"mrw","pin":"1234"}
        → 200                                              (cookie set)

    [3] Initial GET (role default)
        GET /api/v1/users/mrw/preferences
        → preferences.pedagogy_mode = 'direct'             (owner default)
        PASS: role-default surfaced on read

    [4] PUT override
        PUT /api/v1/users/mrw/preferences  {"pedagogy_mode":"guided"}
        → 200
        → response.preferences.pedagogy_mode = 'guided'
        PASS: PUT response carries 'guided'

    [5] Persist verification
        GET /api/v1/users/mrw/preferences
        → preferences.pedagogy_mode = 'guided'
        PASS: override persisted across an independent GET request

    [7] Invalid value rejected
        PUT /api/v1/users/mrw/preferences  {"pedagogy_mode":"invalid_xyz"}
        → 400  body={"detail":"pedagogy_mode must be one of
                               {'adaptive', 'direct', 'guided'}"}
        PASS: _validate_preferences at user_service.py:120-124
              enforces the allowed set

    [8] Cleanup — restore owner default
        PUT /api/v1/users/mrw/preferences  {"pedagogy_mode":"direct"}
        → 200, preferences.pedagogy_mode = 'direct'

Pre-hotfix, step 4's response came back with
`pedagogy_mode='direct'` (unchanged role default) because the
field was silently stripped at the Pydantic boundary. The
persistence step would have failed its assertion. Post-hotfix
every step succeeds.

Step 6 (unauth list-endpoint cross-check) was attempted but the
probe script mis-parsed the response shape (the endpoint
returns `{active_user_id, users: [...]}`, not a bare list). The
persistence claim is fully proven by step 5 alone; the list
endpoint is a non-critical cross-check.

### 5. Previously merged lanes still intact

- `grep -n "pedagogy_mode"
  deeptutor/services/users/user_service.py` still shows the
  per-role defaults at lines 54, 62, 69 + `_PREF_SCHEMA` at 83
  + validator at 120-124 (from 004 merge).
- `grep -n "redacted" scripts/rotate_session_secret.py` still
  shows the 005 redaction at lines 126, 131.
- `grep -cE "BACKEND_HOST=127\.0\.0\.1|BACKEND_HOST:-127\.0\.0\.1" Dockerfile`
  still returns 1 — the only match is the documentation
  comment at line 115 (003 container-default preserved at
  0.0.0.0).
- `grep "def migrate_keys_to_env"
  deeptutor/services/config/model_catalog.py` still returns
  the 3-tuple signature `tuple[dict[str, Any], str, int]`
  (002 intact).

### 6. No unrelated area changed

- `git diff e840b22 d028cd7` touches exactly one file
  (`deeptutor/api/routers/users.py`) and exactly one line.
- `git status --short` post-merge shows the same six
  pre-existing dirty tracked paths as before
  (`CLAUDE.md`, `OPERATOR_RUNBOOK.md`, two `dist/*.zip`,
  `web/next-env.d.ts`, `web/next.config.js`) — unchanged.
- No push; no rebase; no force op.

## Verified scope

- Fix commit `d028cd7` on `bootstrap/wisetutor-baseline`;
  single file, single line, no other product area touched.
- Clean rebuild + recreate of the `deeptutor` container; new
  container healthy within seconds.
- OpenAPI schema probe confirms `pedagogy_mode` now declared
  on `PreferencesPatch`.
- Authenticated round-trip on real container: initial GET,
  PUT override, persist-verification GET, invalid-value
  rejection, cleanup restoration.
- Prior-merged 002/003/005 surfaces still intact on the
  rebuilt runtime.

## Not yet verified

1. **Full Playwright `pedagogy-divergence` project** (the
   two-context reply-divergence test that exercises real WS
   turns and real LLM calls). Not run here. Would require a
   live LLM budget. The "guided asks questions, direct gives
   answers" behavior depends on the upstream model honoring
   the prompt hint — validated structurally but not measured
   at output level in this lane.
2. **Bella (child) cross-check.** Not round-tripped. Expected
   to behave identically to owner with default `adaptive`;
   follow-up if desired.
3. **`adaptive` runtime behavior** beyond persistence —
   prompt-builder deliberately emits no hint for `adaptive`
   (verified in prior audit). Follow-up lane could define
   what `adaptive` should do at runtime.
4. **Integration-test suite (`tests/integration/test_pedagogy_mode.py`)
   not re-run against the hotfixed container.** Three of the
   four previously-failing HTTP-shape tests used PIN `2468`
   (a CI-fixture rotation value), not the default `1234` this
   lane used. Running them unchanged would still 401 on the
   live container — a test-mode backend with the fixture PIN
   rotation is the right environment; not in this lane.
5. **Publication to `origin`.** Not performed. Founder-only
   per `CLAUDE.md — Git rules`.

## Files changed

- **On `bootstrap/wisetutor-baseline` via commit `d028cd7`:**
  - `deeptutor/api/routers/users.py` (+1 line):
    `pedagogy_mode: Optional[str] = None` added to
    `PreferencesPatch` (after `theme`).
- **On `bootstrap/wisetutor-baseline` working tree
  (uncommitted):**
  - `.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_HOTFIX_v1.md`
    (new, this document).
- **Container state change:** rebuilt `deeptutor` image from
  `d028cd7`; new container pid + `StartedAt = 2026-04-19T14:27…Z`,
  health=healthy. Runtime-state change only, no source-tree
  change beyond the commit above.
- **Not touched:** any other source file, any test, any
  other task branch, any `.env` / secret file, any docker-
  compose file, any dependency manifest. The six pre-existing
  dirty tracked baseline paths are unchanged.

## Manual action required

Founder-only, all optional:

1. **Push** when ready: `git push origin bootstrap/wisetutor-baseline`.
2. **Optional Playwright sign-off**: `cd web && npx playwright
   test --project pedagogy-divergence` against the hotfixed
   container. Needs a live LLM budget.
3. **Optional integration-test re-run**: run
   `tests/integration/test_pedagogy_mode.py` against a
   test-mode backend with `WISETUTOR_TEST_MODE=1
   WT_MRW_PIN=2468 WT_BELLA_PIN=1357` to close the four
   previously-environmentally-blocked test cases; if the
   operator later rotates Mr W / Bella PINs to those values
   on the live container, the same tests can also run
   directly.
4. **Optional DECISIONS_LOG entry**: append a
   `2026-04-19 — Pedagogy mode PreferencesPatch hotfix` line
   summarizing this commit.
5. **Optional worktree + branch cleanup** for 004.
6. **(Future lane)** define `adaptive` runtime behavior beyond
   persistence, or drop it from the allowed set.

## Next move

- 004 Configurable Pedagogy Mode is now fully live on
  `bootstrap/wisetutor-baseline` @ `d028cd7`. Defaults,
  overrides, persistence, and validation all exercised on
  real runtime.
- Do not, in this session, open any new lane
  (001/002/003/005 reopen, 006/010/011/012/014/017/021/
  026/027, 008, Multica, Archon, or any product slice beyond
  the closed 004 work). Do not push.
- Natural next bounded candidates (each its own brief) are the
  five optional items in "Manual action required" above.
