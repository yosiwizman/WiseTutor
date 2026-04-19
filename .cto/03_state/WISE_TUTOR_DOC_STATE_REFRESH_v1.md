# WiseTutor Doc/State Refresh v1

Close date: 2026-04-19
Lane: bounded documentation refresh — update
`CURRENT_STATE.md` and `DECISIONS_LOG.md` so the local baseline
truth is preserved in git history instead of only in
`.cto/03_state/` artifacts. Zero product code change; zero
runtime change; no push.

Baseline tip before refresh: `d028cd7` (004 hotfix).
Baseline tip after refresh: `17860bb`
(`docs(state): refresh CURRENT_STATE + DECISIONS_LOG for
 2026-04-19 local baseline`).

---

## Claim

`CURRENT_STATE.md` and `DECISIONS_LOG.md` now accurately describe
the current local baseline state. Both files have a new top-of-
file section/entry recording the seven required facts from the
lane brief plus the explicit still-open items that should not
drift into implicit status. Commit `17860bb` is a single doc-only
commit (+216 lines, 0 deletions) across two files; no product
source, no tests, no config, no dependency, no runtime code was
touched. No push was performed.

## Proof

### 1. Required content recorded

Lane-brief items 1–8, cross-checked against the committed
`CURRENT_STATE.md` "Local Baseline Refresh (2026-04-19)"
section and the `DECISIONS_LOG.md`
`2026-04-19 — Local baseline refresh …` entry:

| # | Required fact | Where it appears |
|---|---|---|
| 1 | 005 recovered and merged locally | CURRENT_STATE "005 Session Secret Rotation" bullet → `c813e67`; DECISIONS_LOG bullet 1. |
| 2 | 003 recovered and merged locally | CURRENT_STATE "003 Backend Network Bind Restriction" bullet → `6712477`; DECISIONS_LOG bullet 2. |
| 3 | 002 recovered, hardened, merged locally | CURRENT_STATE "002 API Key Security Hardening" bullet → `2e9a605` with `09268fc` hotfix; DECISIONS_LOG bullet 3. |
| 4 | 004 merged locally, hotfixed, live-proved locally | CURRENT_STATE "004 Configurable Pedagogy Mode" bullet → `e840b22` + `d028cd7`; DECISIONS_LOG bullet 4. |
| 5 | Mr W PIN rotated off 1234 | CURRENT_STATE "Factory-default PIN exposure…Mr W" bullet; DECISIONS_LOG "PIN closeouts" section. |
| 6 | Bella PIN rotated off 5678 | CURRENT_STATE "Factory-default PIN exposure…Bella" bullet; DECISIONS_LOG "PIN closeouts" section. |
| 7 | Baseline local-only, not pushed | CURRENT_STATE first paragraph ("Baseline is local-only"); DECISIONS_LOG "Consequence" bullet. |
| 8 | Remaining unproven items still explicit | CURRENT_STATE "Still explicitly UNPROVEN / OPEN" list (seven bullets); DECISIONS_LOG "Explicitly still unproven at this tip" paragraph. |

### 2. Honesty guardrails observed

- No "done" / "shipped" / "complete" language applied beyond
  what the evidence actually supports.
- The 004 refresh explicitly notes that Playwright
  `pedagogy-divergence` was not run, the four HTTP integration
  tests were not run against a test-mode backend, and
  `adaptive` mode emits no runtime hint today.
- The 002 refresh explicitly notes that the older "API Key
  Security Hardening (2026-04-17)" CURRENT_STATE section below
  still describes the pre-`09268fc` `env_vars_dict` return
  shape and is superseded by the new entry — rather than
  deleting or silently rewriting history.
- PIN rotations are recorded without any PIN values.
- AdminPanel Reset-PIN diagnostic quirk surfaced during the
  Bella rotation is logged as an open item, not suppressed.
- `DECISIONS_LOG.md`'s own "newest at top" policy is
  acknowledged as imperfectly held (the 004 branch prepended a
  `2026-04-17` entry while the operator appended
  `2026-04-18` at the bottom).

### 3. No code change, no runtime change

`git diff 17860bb^ 17860bb --name-only` returns exactly:

    CURRENT_STATE.md
    DECISIONS_LOG.md

`git diff 17860bb^ 17860bb --stat` shows `+216/0`. No other
file touched. The live `deeptutor` container was not rebuilt,
restarted, or probed by this lane.

### 4. Git discipline

- One commit (`17860bb docs(state): refresh CURRENT_STATE +
  DECISIONS_LOG for 2026-04-19 local baseline`).
- No force op. No rebase. No push. No tag.
- Parents: `d028cd7` → `17860bb` (linear, fast-forward-only
  on the branch tip).
- `bootstrap/wisetutor-baseline` now points at `17860bb`
  locally; `origin` has not been informed.

## Verified scope

- Lane-brief required content items 1–8 present in both files,
  cross-linked to evidence artifacts under `.cto/03_state/`.
- Doc-only diff: 2 files, +216 lines, 0 deletions.
- No product code, no test, no config, no runtime touched.
- No push performed.
- Existing dirty tracked paths on the working tree
  (`CLAUDE.md`, `OPERATOR_RUNBOOK.md`, two `dist/*.zip`,
  `web/next-env.d.ts`, `web/next.config.js`) remain unchanged
  by this lane.

## Not yet verified

1. **`ROADMAP.md`, `STACK_STANDARD.md`, `SECURITY_BASELINE.md`
   not refreshed in this lane.** The lane brief scoped the
   refresh to `CURRENT_STATE.md` and `DECISIONS_LOG.md` only.
   `SECURITY_BASELINE.md` was already updated by the 002
   branch on merge (`2e9a605`); `CURRENT_STATE.md` has a
   "superseded by" pointer to the newer refresh section.
   `ROADMAP.md` and `STACK_STANDARD.md` were not part of the
   lane contract; the refresh section does not silently
   modify either.
2. **Older `CURRENT_STATE.md` "API Key Security Hardening
   (2026-04-17)" section is left in place.** The new
   refresh section calls it out as superseded. Removing or
   in-place-rewriting the older section would have widened
   the blast radius; kept intact as historical record.
3. **`DECISIONS_LOG.md` is still not strictly "newest at
   top".** This refresh entry is at the top as expected, but
   the pre-existing `2026-04-17` / `2026-04-18` ordering
   inversion between the 004-prepended entry and the
   operator-appended rotation-closeout entry is flagged, not
   fixed. A future cosmetic reorder is its own lane.
4. **Push status.** `git push` has not been performed this
   session for any commit including `17860bb`. Founder-only
   per `CLAUDE.md — Git rules`.

## Files changed

- **On `bootstrap/wisetutor-baseline` via commit `17860bb`:**
  - `CURRENT_STATE.md` (+119 lines): prepended
    "Local Baseline Refresh (2026-04-19)" section with seven
    labelled bullets (005/003/002/004 merges + Mr W + Bella
    PIN closeouts + baseline-local-only statement + eight
    "still UNPROVEN / OPEN" bullets). Older sections
    untouched.
  - `DECISIONS_LOG.md` (+97 lines): prepended
    `## 2026-04-19 — Local baseline refresh: Aperant recovery
    merges, 002/004 hotfixes, and PIN closeouts` entry with
    Decision / What landed / PIN closeouts / Why / Consequence
    / Evidence chain blocks.
  Totals: 2 files changed, 216 insertions(+), 0 deletions(-).
- **On `bootstrap/wisetutor-baseline` working tree
  (uncommitted):**
  - `.cto/03_state/WISE_TUTOR_DOC_STATE_REFRESH_v1.md`
    (new, this document).
- **Not touched:**
  - Any product source file (`deeptutor/**`,
    `deeptutor_cli/**`, `web/**`, `scripts/**`,
    `scripts_local/**`, `tests/**`, `docs/**`, any
    `Dockerfile` or compose).
  - Any other Aperant branch or worktree.
  - Any `.env` / secret file.
  - The live `deeptutor` container.
  - The seven pre-existing dirty tracked baseline paths
    (`CLAUDE.md`, `OPERATOR_RUNBOOK.md`, two `dist/*.zip`,
    `web/next-env.d.ts`, `web/next.config.js`,
    `phase15_gate_probe.txt`).

## Manual action required

Founder-only, all optional:

1. **Push** `bootstrap/wisetutor-baseline` when ready:
   `git push origin bootstrap/wisetutor-baseline`.
2. **Optional cosmetic reorder** of `DECISIONS_LOG.md` so
   every entry is strictly in newest-at-top order (the
   `2026-04-17` / `2026-04-18` inversion is still present
   below the refresh entry).
3. **Optional `ROADMAP.md` / `SECURITY_BASELINE.md` refresh**
   if the founder wants those files aligned with today's
   closures — deliberately not in this lane's scope.

## Next move

- Doc/state lane is closed. The local baseline accurately
  records what has and has not been proven.
- Do not, in this session, open any new lane (reopen
  001/002/003/004/005, touch 006/008/010/011/012/014/017/
  021/026/027, Multica, Archon, or any product-slice
  follow-on). Do not push. Natural next bounded candidates
  (each its own brief) are: (a) the push; (b) the four
  post-004 follow-ups carried from
  `WISE_TUTOR_004_PEDAGOGY_MODE_HOTFIX_v1.md`
  (Playwright sign-off, integration-test re-run,
  `adaptive`-mode decision, worktree cleanup); (c) an
  optional polish lane for 026 (theme accessibility); (d)
  `DECISIONS_LOG` reorder.
