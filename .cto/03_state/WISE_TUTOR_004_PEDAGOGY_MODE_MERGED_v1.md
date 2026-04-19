# WiseTutor 004 Configurable Pedagogy Mode — Merged v1

Close date: 2026-04-19
Lane: local merge of `auto-claude/004-configurable-pedagogy-mode`
into `bootstrap/wisetutor-baseline`. No push to origin.

Supersedes: `.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_AUDIT_v1.md`.

Baseline tip before merge: `2e9a605 merge(002): api key env-var
indirection with HTTP hardening`.
004 branch tip at merge: `4b4c52d`.
Merge commit: `e840b22`.
Baseline tip after merge: `e840b22` (local only; not pushed).

---

## Claim

Task 004 Configurable Pedagogy Mode is now **merged locally**
into `bootstrap/wisetutor-baseline` via merge commit `e840b22`
(parents `2e9a605` + `4b4c52d`). Merge was no-ff, executed by
git's `ort` strategy with zero `Auto-merging` lines and zero
conflicts. All six 004 files land byte-identical to the 004
branch tip — `git diff HEAD 4b4c52d -- <file>` returns 0 diff
lines for each of the four modified paths and the two new test
files. The pedagogy feature is present on the merged tree: the
system-prompt injection in `agentic_pipeline.py`, the per-role
defaults + schema + validation in `user_service.py`, and the
AdminPanel dropdown with `data-testid="admin-pedagogy-mode-<uid>"`
are all in place. No push occurred. The running `deeptutor`
container remained `Up 12 hours (healthy)` throughout (not
touched).

## Proof

### 1. Pre-merge state

- Primary repo cwd `/home/ai-desktop/projects/WiseTutor`;
  `git branch --show-current` → `bootstrap/wisetutor-baseline`.
- Pre-merge baseline tip: `2e9a605 merge(002): api key env-var
  indirection with HTTP hardening`.
- 004 tip: `git rev-parse auto-claude/004-configurable-pedagogy-mode`
  → `4b4c52d9d603d7eada2c56f0cf28a464062a5a0c`.
- Dirty-overlap check (loop over six pre-existing dirty tracked
  baseline paths — `CLAUDE.md`, `OPERATOR_RUNBOOK.md`, two
  `dist/*.zip`, `web/next-env.d.ts`, `web/next.config.js` — vs.
  `git diff --name-only bootstrap/wisetutor-baseline..auto-claude/
  004-configurable-pedagogy-mode`): **zero `CONFLICT-RISK`
  lines**. None of the six dirty paths appears in 004's
  footprint. Safe for `git merge` to proceed.

### 2. Merge

Command:

    git merge --no-ff auto-claude/004-configurable-pedagogy-mode \
        -m "merge(004): per-user pedagogy mode with system-prompt injection"

Output:

    Merge made by the 'ort' strategy.
     deeptutor/agents/chat/agentic_pipeline.py |   7 +
     deeptutor/services/users/user_service.py  |   9 ++
     tests/integration/test_pedagogy_mode.py   | 156 ++++++++++++++++++++
     web/app/(utility)/settings/AdminPanel.tsx |  46 ++++++
     web/playwright.config.ts                  |   5 +
     web/tests/e2e/pedagogy-divergence.spec.ts | 230 ++++++++++++++++++++++++++++++
     6 files changed, 453 insertions(+)
     create mode 100644 tests/integration/test_pedagogy_mode.py
     create mode 100644 web/tests/e2e/pedagogy-divergence.spec.ts

No `Auto-merging` lines, no conflict markers, no manual
resolution. Merge commit shape:

    e840b22 merge(004): per-user pedagogy mode with system-prompt injection
    parents: 2e9a605 4b4c52d

### 3. Post-merge tree equivalence for all six merged files

    git diff HEAD 4b4c52d -- <file>

results on the merged baseline:

    deeptutor/agents/chat/agentic_pipeline.py   → 0 diff lines
    deeptutor/services/users/user_service.py    → 0 diff lines
    web/app/(utility)/settings/AdminPanel.tsx    → 0 diff lines
    web/playwright.config.ts                    → 0 diff lines
    tests/integration/test_pedagogy_mode.py     → 0 diff lines
    web/tests/e2e/pedagogy-divergence.spec.ts   → 0 diff lines

The merged tree is byte-identical to the 004 branch tip on every
file the merge touched. No resolver rewrite.

### 4. Feature presence on the merged baseline

Three grep checks against the merged tree confirm the feature is
live:

    grep -n "pedagogy_mode|pedagogy_hint"
      deeptutor/agents/chat/agentic_pipeline.py
    → 928:  pedagogy_mode = prefs.get("pedagogy_mode") or ""
      945:  pedagogy_hint = {
      948:  }.get(pedagogy_mode, "")
      953:  if pedagogy_hint:
      954:      parts.append(pedagogy_hint)

    grep -n "pedagogy_mode"
      deeptutor/services/users/user_service.py
    → 54:  "pedagogy_mode": "direct",                          (owner default)
      62:  "pedagogy_mode": "guided",                          (user default)
      69:  "pedagogy_mode": "adaptive",                        (child default)
      83:  "pedagogy_mode": {"direct", "guided", "adaptive"},  (schema)
      120: if "pedagogy_mode" in prefs:                        (validator)

    grep -n "PEDAGOGY_MODES|admin-pedagogy-mode"
      web/app/(utility)/settings/AdminPanel.tsx
    → 40:   const PEDAGOGY_MODES = ["guided", "direct", "adaptive"];
      398: data-testid={`admin-pedagogy-mode-${u.id}`}
      403: {PEDAGOGY_MODES.map((p) => <option key={p} value={p}>{p}</option>)}

End-to-end wiring is present on baseline:
UI `<select>` with a stable `data-testid` → existing
`PUT /api/v1/users/<id>/preferences` → `_validate_preferences`
accepts `pedagogy_mode` → stored in `User.preferences` → read
by `_build_identity_preferences_line` → Socratic / direct hint
appended to the system prompt sent to the LLM.

### 5. Previously merged 005 / 003 / 002 content intact

- `grep -n "redacted" scripts/rotate_session_secret.py`
  (005 contribution) still returns the redacted prints at
  lines 126 and 131.
- `grep -cE "BACKEND_HOST=127\.0\.0\.1|BACKEND_HOST:-127\.0\.0\.1"
  Dockerfile` (003 contribution) still returns `1`
  (the comment-only mention at line 115); all executable
  container defaults remain `0.0.0.0`.
- `grep "def migrate_keys_to_env"
  deeptutor/services/config/model_catalog.py` (002
  contribution) still returns the 3-tuple signature
  `tuple[dict[str, Any], str, int]`.

### 6. No push; no rebase; no force operation

- `git push` was not executed.
- `git status --short` after merge shows exactly the same six
  pre-existing dirty tracked paths (`CLAUDE.md`,
  `OPERATOR_RUNBOOK.md`, two `dist/*.zip`,
  `web/next-env.d.ts`, `web/next.config.js`). No new
  modifications on unrelated files.
- `git log -1 --format="%H %P"` confirms a genuine no-ff merge
  with two parents.

### 7. Running Docker container unaffected

    sg docker -c "docker ps --filter name=^/deeptutor$ ..."
    → deeptutor Up 12 hours (healthy)

Same container instance, `StartedAt = 2026-04-19T01:32:20Z`,
was not rebuilt, not restarted, and not touched by this lane.
The merge affects the source tree only; the live container
continues to run baseline-minus-004 code.

## Verified scope

- Dirty-overlap check vs 004's footprint — zero hits.
- Merge mechanics: no-ff, `ort`, zero auto-merge lines, zero
  conflicts, correct parents (`2e9a605` + `4b4c52d`).
- Byte-for-byte tree equivalence for all six merged files vs
  004 branch tip.
- Feature presence on the merged tree (system-prompt injection,
  schema + defaults + validation, AdminPanel control).
- 005 / 003 / 002 previously-merged content still intact.
- No push, no rebase, no force, no unrelated file edited.
- Live Docker container continuously healthy through the merge.

## Not yet verified

1. **Post-merge pytest from the primary repo path.** Consistent
   with the 002/003 merge lanes: launching pytest from
   `/home/ai-desktop/projects/WiseTutor` errors at collection
   because `data/user/logs/` is `root:root`-owned via the live
   Docker volume mount (`PermissionError` on
   `deeptutor_20260419.log`). Indirectly covered by the audit
   lane's 1/1 PASS on
   `test_prompt_builder_includes_pedagogy_mode` from the 004
   worktree (real 004 code, in-process, no product-logic mocks)
   plus the byte-for-byte tree equivalence to that same tree on
   the merged baseline.

2. **HTTP-shape integration tests** (`test_valid_pedagogy_mode_values_accepted`,
   `test_invalid_pedagogy_mode_rejected`,
   `test_pedagogy_mode_persists_and_can_be_read`,
   `test_pedagogy_mode_defaults_differ_by_role`).
   Still not run. They require a dedicated test-mode backend
   with `WISETUTOR_TEST_MODE=1`, `WT_MRW_PIN=2468`,
   `WT_BELLA_PIN=1357` — the shape CI exercises. Post-merge
   belt-and-braces, founder's call; not a pre-merge gate.

3. **Playwright `pedagogy-divergence` project.** Not run.
   Requires a 004-code backend, a Playwright install, and a
   live-LLM budget (the spec makes real WS turns to two
   contexts and asserts reply divergence). Tier-1 proof path
   the founder can exercise post-merge.

4. **`adaptive` mode runtime behavior.** As flagged in the
   audit: `adaptive` is persisted but does not inject any
   system-prompt hint in shipped code. The prompt-builder test
   comment documents this as "handled programmatically at
   runtime", but no visible runtime code yet reacts to
   `adaptive`. Not a merge blocker (dropdown persists value,
   guided/direct are active); a future follow-up lane could
   make `adaptive` actually do something.

5. **Doc update (`CURRENT_STATE.md`, `DECISIONS_LOG.md`).** 004
   does not update the top-level planning docs. By
   `CLAUDE.md — "Every meaningful change updates these docs"`
   this is a soft gap — the founder may want to append a
   `2026-04-19 — Per-user pedagogy mode (guided/direct/adaptive)`
   entry to `DECISIONS_LOG.md` and note the feature in
   `CURRENT_STATE.md`. Non-blocking for the local merge.

6. **Publication to `origin`.** Not performed. Founder-only per
   `CLAUDE.md — Git rules`.

7. **Cleanup of the 004 worktree** at
   `.auto-claude/worktrees/tasks/004-configurable-pedagogy-mode/`
   and of the branch
   `auto-claude/004-configurable-pedagogy-mode`. Both
   preserved, not blocking. `git worktree remove` +
   `git branch -d` at the founder's discretion.

## Files changed

- **On `bootstrap/wisetutor-baseline` via merge commit
  `e840b22`:**
  - `deeptutor/agents/chat/agentic_pipeline.py` (+7) —
    pedagogy-mode read + hint injection in
    `_build_identity_preferences_line`.
  - `deeptutor/services/users/user_service.py` (+9) —
    per-role defaults (owner=direct, user=guided,
    child=adaptive), `_PREF_SCHEMA` entry, and
    `_validate_preferences` branch.
  - `web/app/(utility)/settings/AdminPanel.tsx` (+46) —
    per-user `<select>` dropdown + Save button + save handler
    wired to the existing `/preferences` PUT.
  - `web/playwright.config.ts` (+5) — new `pedagogy-divergence`
    project registration.
  - `tests/integration/test_pedagogy_mode.py` (+156, new) —
    5 tests (1 in-process prompt-builder + 4 HTTP-shape).
  - `web/tests/e2e/pedagogy-divergence.spec.ts` (+230, new) —
    2 Playwright tests (reply-divergence + AdminPanel
    control visibility).
  Totals: 6 files changed, 453 insertions(+), 0 deletions(-).
- **On `bootstrap/wisetutor-baseline` working tree
  (uncommitted):**
  - `.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_MERGED_v1.md`
    (new, this document).
- **Not touched:**
  - Any `docker-compose*.yml`, `.env.example`, `.gitignore`,
    or other file outside the 004 branch's own footprint.
  - Any other Aperant branch or worktree.
  - The running Docker container.
  - The six pre-existing dirty tracked baseline paths
    (`CLAUDE.md`, `OPERATOR_RUNBOOK.md`, two `dist/*.zip`,
    `web/next-env.d.ts`, `web/next.config.js`).

## Manual action required

Founder-only, all optional / non-blocking:

1. **Push** `bootstrap/wisetutor-baseline` to `origin` when
   ready: `git push origin bootstrap/wisetutor-baseline`.
2. **Live-exercise** the feature:
   - Rebuild the container on the merged code
     (`sg docker -c "docker compose -f docker-compose.yml build
     deeptutor"` then `... up -d --force-recreate`), then
     operate the AdminPanel dropdown and observe
     guided/direct reply divergence.
   - Or run the shipped integration tests against a test-mode
     backend: `WISETUTOR_TEST_MODE=1 WT_MRW_PIN=2468
     WT_BELLA_PIN=1357 pytest tests/integration/test_pedagogy_mode.py`.
   - Or run the Playwright proof:
     `cd web && npx playwright test --project pedagogy-divergence`.
3. **Doc refresh (optional)**: append a
   `2026-04-19 — Per-user pedagogy mode (guided/direct/adaptive)`
   entry to `DECISIONS_LOG.md` and note the feature in
   `CURRENT_STATE.md` (same convention the existing doc history
   uses).
4. **(Optional future lane)** Decide what `adaptive` should
   actually do at runtime beyond persisting the value, or drop
   it from the allowed set.
5. **(Optional)** Worktree + branch cleanup for 004.

## Next move

- Task 004 lane is closed locally. Baseline tip is `e840b22`.
- The selection queue from
  `.cto/03_state/WISE_TUTOR_FIRST_PRODUCT_SLICE_SELECTION_v1.md`
  has 004 now merged. The documented POSSIBLE_LATER
  candidate is 026 theme-accessibility-wcag-aa; 006 and 027
  remain NOT_NEXT. The founder-gated librarian/avatar surface
  (007, 009, 010, 011) and 008 remain gated. 012 multi-family-
  tenant-architecture and 014 CI-provider-dependent-test-lane
  remain out of scope per the lane contract.
- Do not, in this session, open any new lane
  (005/003/002 reopen, 006, 010, 011, 012, 014, 017, 021,
  026, 027, 001, 008, Multica, Archon, or any product-slice
  work beyond 004). Each belongs to its own bounded lane
  opened by an explicit next-lane brief.
- Do not push.
