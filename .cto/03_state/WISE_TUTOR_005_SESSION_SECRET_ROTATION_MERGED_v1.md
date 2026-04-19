# WiseTutor 005 Session Secret Rotation — Merged v1

Close date: 2026-04-19
Lane: local merge of `auto-claude/005-session-secret-rotation` into
`bootstrap/wisetutor-baseline`. No push to origin.

Supersedes: `.cto/03_state/WISE_TUTOR_005_SESSION_SECRET_ROTATION_MERGE_READINESS_v1.md`.

Baseline tip before merge: `895e5f7`
005 branch tip at merge: `8c919b4`
Merge commit: `c813e67`
Baseline tip after merge: `c813e67` (local only; not pushed)

---

## Claim

Task 005 Session Secret Rotation is now **merged locally** into
`bootstrap/wisetutor-baseline`. The merge was a no-ff merge
executed by git's `ort` strategy with zero conflicts, zero
auto-resolution, and the four 005-authored files land on baseline
byte-for-byte identical to the 005 branch tip `8c919b4`. No push to
`origin` was performed. No other branch was touched. No unrelated
file was edited to make the merge go through.

The redacted `--dry-run` output fix from commit `8c919b4` is
present in the merged tree. The pre-merge unit coverage
(16/16 + 27/27 PASS, recorded in
`.cto/03_state/WISE_TUTOR_005_SESSION_SECRET_ROTATION_MERGE_READINESS_v1.md`
and in `last_evidence.json`) is preserved because the merged files
are byte-identical to the tested 005-branch files — not rewritten
during merge.

## Proof

### Pre-flight state

- `git branch --show-current` → `bootstrap/wisetutor-baseline`.
- `git log -1 bootstrap/wisetutor-baseline` before merge → `895e5f7`.
- `git rev-parse auto-claude/005-session-secret-rotation` → `8c919b4`.
- `git merge-base bootstrap/wisetutor-baseline auto-claude/005-session-secret-rotation` → `29f1b9f`.
- `git status --short` surface dirt before merge (tracked modified
  files carried over from prior sessions):
  - `CLAUDE.md`, `DECISIONS_LOG.md`, `OPERATOR_RUNBOOK.md`,
    `dist/wisetutor-macos-launcher.zip`,
    `dist/wisetutor-windows-launcher.zip`,
    `web/next-env.d.ts`, `web/next.config.js`.
  None of these paths appear in `git diff --name-only
  29f1b9f..auto-claude/005-session-secret-rotation`, which lists:
    - `deeptutor/services/users/identity.py`
    - `scripts/rotate_session_secret.py`
    - `tests/integration/test_session_secret_rotation.py`
    - `tests/unit/test_session_secret_rotation.py`
  Explicit overlap check (loop over each dirty tracked file) printed
  zero "CONFLICT-RISK" lines. The dirty state does not touch the
  005 footprint.

### Pre-flight pytest skipped (environment constraint)

- `pytest tests/unit/test_memory_identity_guard.py` from the primary
  repo path errored at collection with
  `PermissionError: [Errno 13] Permission denied: '/home/ai-desktop/projects/WiseTutor/data/user/logs/deeptutor_20260419.log'`.
  Root cause: `data/user/` is owned by `root:root` because the live
  Docker container created it via its volume mount; host-side pytest
  cannot initialize the file-logging handler there.
- Per brief: "Re-run this narrow pre-flight set only if the
  environment supports it cleanly." It does not. Skipped.
- The pre-merge tests (run earlier in the 005 worktree, where
  `data/` is not root-owned) are already recorded as 16/16 + 27/27
  PASS in
  `.cto/03_state/WISE_TUTOR_005_SESSION_SECRET_ROTATION_MERGE_READINESS_v1.md`
  and in `.cto/03_state/last_evidence.json`.

### Merge

- Command:
  `git merge --no-ff auto-claude/005-session-secret-rotation
   -m "merge(005): session secret rotation with dry-run redaction"`.
- Git output: `Merge made by the 'ort' strategy.`
  - `deeptutor/services/users/identity.py              |  78 ++++--`
  - `scripts/rotate_session_secret.py                  | 255 +++++++++++++++++++`
  - `tests/integration/test_session_secret_rotation.py | 289 ++++++++++++++++++++++`
  - `tests/unit/test_session_secret_rotation.py        | 147 +++++++++++`
  - `4 files changed, 751 insertions(+), 18 deletions(-)`
  - `create mode 100755 scripts/rotate_session_secret.py`
  - `create mode 100644 tests/integration/test_session_secret_rotation.py`
  - `create mode 100644 tests/unit/test_session_secret_rotation.py`
- No conflict markers were printed. No manual resolution was
  required.
- Merge commit shape:
  `c813e67 merge(005): session secret rotation with dry-run redaction`
  with parents `c813e67: 895e5f7 8c919b4`.

### Post-merge tree equivalence (strongest post-merge check available in this env)

For each 005-touched file, `git diff c813e67 8c919b4 -- <file>`
returned `0` lines:

- `deeptutor/services/users/identity.py` → 0 diff lines.
- `scripts/rotate_session_secret.py` → 0 diff lines.
- `tests/integration/test_session_secret_rotation.py` → 0 diff lines.
- `tests/unit/test_session_secret_rotation.py` → 0 diff lines.

The merged content is byte-identical to the 005 branch tip. Since
the pre-merge pytest on that tip was 16/16 + 27/27 PASS, the merged
tree carries the same test verdict for those paths (no new code was
introduced by the merge itself; it only grafted the 005 commits onto
baseline).

### Redaction fix present in the merged tree

`grep -n "redacted" scripts/rotate_session_secret.py` (on merged
`c813e67`):

    126:        print_step(f"Current secret: (redacted, {len(current_secret)} bytes)", success("loaded"))
    131:    print_step(f"New secret: (redacted, {len(new_secret)} bytes)", success("generated"))

Both redacted print_step calls from commit `8c919b4` are present at
the expected line numbers. No hex-prefix leak remains.

### No push occurred

- Command `git push` was not executed.
- `git status` after merge still reports only pre-existing dirty
  tracked files (same seven paths as pre-merge); no new
  modifications were introduced on unrelated files.
- Branch remains `bootstrap/wisetutor-baseline`; the local tip is
  `c813e67`, which is ahead of any remote-tracked ref by at least
  this merge commit + the 005 branch commits. Publication is the
  founder's call.

## Verified scope

- Merge base and merge strategy confirmed; `ort` with no conflicts.
- Post-merge tip parents confirmed (895e5f7 + 8c919b4).
- Byte-for-byte tree equivalence of every 005-touched file between
  the merged baseline and the 005 branch tip.
- Redaction fix present at the correct lines in the merged
  `scripts/rotate_session_secret.py`.
- No push operation; no force operation; no rebase.
- No unrelated file edited during this lane; the seven dirty
  tracked paths carried over from prior sessions remain untouched.

## Not yet verified

1. **Post-merge pytest run from the primary repo path.** Blocked by
   `/home/ai-desktop/projects/WiseTutor/data/user/logs/` being
   `root:root`-owned (Docker volume). Covered indirectly by the
   byte-for-byte tree equivalence + the prior green 16/16 + 27/27
   run on the 005 worktree, recorded in the prior merge-readiness
   artifact and in `last_evidence.json`. If the founder wants a
   direct post-merge test run, the simplest option is to either
   (a) run pytest inside the 005 worktree where the checkout is
   identical, or (b) adjust ownership of `data/user/logs/` so
   host-side pytest can initialize its file handler.

2. **Integration tests
   (`tests/integration/test_session_secret_rotation.py`).** Still
   not run — require a dedicated, disposable backend with seeded
   users and known PINs. Out of scope for this local-merge lane as
   it was for the audit and fix lanes.

3. **Publication to `origin`.** Not performed per `CLAUDE.md — Git
   rules`. The founder decides when and whether to push
   `bootstrap/wisetutor-baseline` now that `c813e67` is on it.

4. **Cleanup of the 005 worktree** at
   `.auto-claude/worktrees/tasks/005-session-secret-rotation/` and
   of the `auto-claude/005-session-secret-rotation` branch was not
   performed. Both are safely preserved and can be removed at the
   founder's discretion (via `git worktree remove` + `git branch
   -d`); they are not blocking anything.

## Files changed

- **On `bootstrap/wisetutor-baseline` via merge commit `c813e67`
  (this lane's merge):**
  - `deeptutor/services/users/identity.py` (+60 / −18,
    multi-secret support with `_load_secret()` kept as
    backwards-compat alias).
  - `scripts/rotate_session_secret.py` (new, +255 lines, includes
    the redaction fix at lines 126 & 131).
  - `tests/integration/test_session_secret_rotation.py` (new,
    +289 lines; not run in this lane).
  - `tests/unit/test_session_secret_rotation.py` (new, +147 lines;
    16/16 PASS on pre-merge worktree run).
- **On `bootstrap/wisetutor-baseline` working tree (not yet
  committed):**
  - `.cto/03_state/WISE_TUTOR_005_SESSION_SECRET_ROTATION_MERGED_v1.md`
    (new, this document).
  - `.cto/03_state/last_evidence.json` (will be updated after this
    write to close the evidence gate for the merge, if the hook
    fires).
- **Not touched in this lane:**
  - The seven pre-existing dirty tracked paths
    (`CLAUDE.md`, `DECISIONS_LOG.md`, `OPERATOR_RUNBOOK.md`,
    `dist/wisetutor-macos-launcher.zip`,
    `dist/wisetutor-windows-launcher.zip`,
    `web/next-env.d.ts`, `web/next.config.js`) remain as-is.
  - No Aperant branch other than 005 was touched.
  - No Docker/compose/runtime file was edited.

## Manual action required

Founder-only. None is blocking to declare 005 locally merged. The
following are explicitly deferred until the founder decides:

1. **Push `bootstrap/wisetutor-baseline` to `origin`** when ready:
   `git push origin bootstrap/wisetutor-baseline`. Only the founder
   performs this (per `CLAUDE.md — Git rules`).
2. **Optional DECISIONS_LOG entry** for the rotation-capability
   addition, if the founder considers this a decision worth
   recording beyond the existing "2026-04-18 — OpenAI key rotation
   closeout" entry.
3. **Optional post-merge pytest run** from the primary repo path,
   after either (a) adjusting `data/user/logs/` ownership so the
   host-side pytest logging handler can write there, or (b) running
   pytest from within the 005 worktree (where `data/user/` is not
   root-owned).
4. **Optional cleanup** of the 005 worktree and branch once the
   founder is comfortable the merge is final.
5. **Optional secondary tightening** of `--env-format` output
   hygiene (see prior merge-readiness artifact "Not yet verified"
   §1). Non-blocking.

## Next move

- Task 005 lane is closed locally. Do not reopen it unless the
  founder needs a post-merge regression probe.
- The next bounded recovery lane in the queue (per
  `.cto/03_state/WISE_TUTOR_APERANT_RECOVERY_AUDIT_v1.md`) is
  **003 Backend Network Bind Restriction**, which is SALVAGEABLE
  with a bounded fix (revert `Dockerfile` `ENV BACKEND_HOST`
  default to `0.0.0.0` so the proven Docker runtime continues to
  route; drop `VERIFICATION_REPORT.md` and `test_backend_host.py`
  from repo root; drop the duplicate `.auto-claude/` line from
  `.gitignore`). **Do not open 003 in this session.** It is its
  own bounded lane, to be opened by an explicit next-lane brief.
- Do not touch 001, 008, Multica, Archon, or any product feature
  slice.
- Do not push `bootstrap/wisetutor-baseline` — that is founder
  action, not agent action.
