# WiseTutor Push Readiness Review v1

Review date: 2026-04-19
Lane: bounded go/no-go review for pushing
`bootstrap/wisetutor-baseline` to `origin` as a **local
checkpoint**, not a production sign-off. Agent reviews only; no
push performed.

Local baseline tip: `17860bb docs(state): refresh CURRENT_STATE +
DECISIONS_LOG for 2026-04-19 local baseline`.

Commits ahead of `origin/bootstrap/wisetutor-baseline`: **49**.

---

## Claim

**Recommendation: READY_TO_PUSH_LOCAL_CHECKPOINT** with one
strongly-recommended pre-push action (commit the
`.cto/03_state/*.md` evidence artifacts so the doc cross-links
resolve). No hard push blocker was found. Every remaining
unproven item from `CURRENT_STATE.md` is classified as
non-blocking for a checkpoint push; none of them are hidden
product-breakers. This is a checkpoint classification, **not** a
statement that every feature is fully Tier-1-proven or
production-ready — see "Not yet verified" below for the explicit
separation between "not pushable" and "not fully proven".

## Proof

### 1. Local-vs-origin delta is crisp

- Current branch: `bootstrap/wisetutor-baseline`.
- Local tip: `17860bb`.
- `git log origin/bootstrap/wisetutor-baseline..HEAD` → **49
  commits** ahead. The set is the sum of:
  - Four Aperant merge commits: `c813e67` (005), `6712477`
    (003), `2e9a605` (002), `e840b22` (004).
  - Four agent-authored fix commits: `8c919b4` (005 redaction),
    `09268fc` (002 HTTP response hardening),
    `d028cd7` (004 PreferencesPatch Pydantic fix),
    `1d5d976` (003 Dockerfile default revert).
  - One revert: `a00a40b` (003 `.env.example` revert).
  - Two cleanup commits: `0005262` (003 harness residue),
    `a0b18e0` (founder's rotation-closeout DECISIONS_LOG entry).
  - One doc-state refresh: `17860bb`.
  - Plus the 32 pre-merge Aperant subtask commits carried in via
    the four merges — these are pre-existing branch authorship
    (author `AI Desktop <ai-desktop@wisetutor.local>`) and
    land on baseline only because they are ancestors of the
    merged branch tips.
- `git status --short` working-tree dirt: six pre-existing
  tracked modifications (`CLAUDE.md`, `OPERATOR_RUNBOOK.md`,
  two `dist/*.zip`, `web/next-env.d.ts`, `web/next.config.js`)
  plus untracked `.cto/`, `.omc/`, `.venv`, `Taskfile.yml`,
  `docs/guide/task-automation.md`, `ops/`,
  `phase15_gate_probe.txt`. **None of the dirty tracked paths
  are staged; the push will publish only committed state**.

### 2. Documentation accurately reflects committed state

- `CURRENT_STATE.md` "Local Baseline Refresh (2026-04-19)"
  section at the top of the file enumerates: 005/003/002/004
  merges with commit hashes, both PIN rotations with
  discriminator-level proof, the baseline-not-pushed statement,
  and the eight still-open items.
- `DECISIONS_LOG.md` "2026-04-19 — Local baseline refresh…"
  entry at the top of the file mirrors those points under the
  file's Decision/How/Why/Consequence format.
- Cross-links from both files point to `.cto/03_state/WISE_TUTOR_*_v1.md`
  artifacts — twenty-five markdown evidence files on disk. See
  the one soft concern in Gap #1 below.

### 3. No hidden blocker in committed content

- Full-tree grep for known live-key prefixes (`sk-…`, `AIza…`,
  `ghp_`, `xoxb-`, `AKIA…`, `glpat-`,
  `-----BEGIN…PRIVATE KEY-----`) on HEAD tree → zero matches
  (established earlier in the secrets-hygiene closeout lane and
  preserved across every subsequent merge).
- No `.env` / secret file is tracked. No `data/users.json` or
  `data/session_secret.key` tracked.
- PIN rotations landed in `data/users.json` which is gitignored
  (under `data/`); nothing about the rotations is in the
  committed tree.
- Fix-commit messages carry no secret material.
- Agent-authored commits use the project's
  `Co-Authored-By: Claude Opus 4.7 (1M context) …` convention;
  pre-merge subtask commits use the harness's
  `AI Desktop <ai-desktop@wisetutor.local>` author.

### 4. Remaining gaps explicitly categorized

From `CURRENT_STATE.md`'s "Still explicitly UNPROVEN / OPEN"
list plus this lane's new finding:

| # | Gap | Classification | Note |
|---|---|---|---|
| 1 | Live Playwright `pedagogy-divergence` project (two-context reply-divergence, real LLM calls) not run | **DOES_NOT_BLOCK_PUSH** | Tier 1 proof path; desirable but not required for a checkpoint. Feature is proven at unit, schema, and HTTP round-trip tiers. |
| 2 | Four HTTP-shape integration tests in `tests/integration/test_pedagogy_mode.py` against a test-mode backend with `WT_MRW_PIN=2468 WT_BELLA_PIN=1357` | **DOES_NOT_BLOCK_PUSH** | GitHub Actions CI workflow (`.github/workflows/ci.yml:49-51`) sets exactly those values; the tests will run on push and either pass or surface a concrete CI-red, which is what a checkpoint push is for. |
| 3 | `adaptive` pedagogy mode has no runtime hint today | **DOES_NOT_BLOCK_PUSH** | Documented open item. Behaviour today: `adaptive` persists as a stored preference but emits no system-prompt line. Not a regression — `guided` and `direct` both work. |
| 4 | Docker UX of 002 migrate-keys temp file lands in container `/tmp` | **DOES_NOT_BLOCK_PUSH** | Security-neutral (still 0600); awkward workflow for Docker operators. Future lane. |
| 5 | `DECISIONS_LOG.md` not strictly newest-at-top (2026-04-17 branch entry above 2026-04-18 rotation closeout) | **DOES_NOT_BLOCK_PUSH** | Cosmetic. One-line reorder is a future lane. |
| 6 | AdminPanel `Reset PIN` client-side validator quirk observed during Bella rotation | **DOES_NOT_BLOCK_PUSH** | Not reproduced; alternative paths (curl, UserGate self-service) both work. |
| 7 | Untouched Aperant tasks 006/010/011/012/014/017/021/026/027 | **DOES_NOT_BLOCK_PUSH** | Separate branches; not on `bootstrap/wisetutor-baseline`. Nothing about them is being pushed. |
| 8 | `.cto/03_state/*.md` evidence files are not tracked in git (25 files on disk, 0 tracked) | **DOES_NOT_BLOCK_PUSH** but **RECOMMENDED TO ADDRESS PRE-PUSH** | New finding this lane. `DECISIONS_LOG.md` + `CURRENT_STATE.md` cross-link to these artifacts; post-push, those links 404 on GitHub unless the founder adds them. One-commit fix: `git add .cto/ && git commit -m "docs(evidence): publish local evidence chain"`. Operator discretion — checkpoint push without them still works, references just become local-only pointers. |
| 9 | Working-tree dirty state (pre-existing: CLAUDE.md, OPERATOR_RUNBOOK.md, two dist zips, web/next-env.d.ts, web/next.config.js) | **DOES_NOT_BLOCK_PUSH** | Uncommitted → unpublished. Push publishes only committed state. If the founder wants those edits in, they need to `git add` + commit first; none of them are this session's work. |
| 10 | Post-push CI behavior is unpredictable from this review seat | **DOES_NOT_BLOCK_PUSH** but noted as "known unknown" | CI will run on the push; the hermetic subset includes the new `test_pedagogy_mode.py` and `test_api_key_resolution.py` tests. If any fails in CI, it surfaces a specific fix-lane rather than a push-block. |

### 5. What a checkpoint push does and does not assert

Pushing now asserts:
- A clean, evidence-linked history of what has and has not
  been proven as of 2026-04-19.
- Baseline at `17860bb` is a durable reference the founder can
  link to, share with collaborators, or compare against later
  lanes.

Pushing now does **not** assert:
- Tier 1 end-to-end proof of every feature (Playwright for 004
  is not run; provider-dependent paths deliberately skipped on
  hosted CI).
- Full product-release readiness.
- A frozen or released version — baseline is still a moving
  branch.

This separation is the point of a "local checkpoint" push:
record current truth in shared git history without overstating
it.

## Verified scope

- Commit delta between `origin/bootstrap/wisetutor-baseline`
  and local tip `17860bb` enumerated and mapped to artifacts.
- `CURRENT_STATE.md` + `DECISIONS_LOG.md` verified to match the
  committed state on `17860bb`.
- Working-tree dirty paths inventoried; none are this session's
  authoring.
- Ten gap items classified with reasoning; eight were in
  `CURRENT_STATE.md`, one is new this lane
  (`.cto/03_state/` not tracked), one is the push-surface
  meta-concern (CI behaviour).
- No push executed by this review.

## Not yet verified

1. **CI green on push.** Cannot preview without actually
   pushing. The CI workflow pins the exact PINs the new 004
   tests expect, so the most likely outcome is pass, but this
   is inference.
2. **Tier 1 Playwright evidence for 004.** Explicitly not in
   this lane.
3. **Whether the founder wants the `.cto/03_state/` evidence
   chain published.** This is a policy question above the agent;
   the recommendation above is advisory.
4. **Production sign-off for multi-user.** The product still
   carries the `SECURITY_BASELINE.md`-documented local-only
   posture; a push of this checkpoint does not change that
   boundary.
5. **Whether `origin` remote is what the founder intends.**
   `git remote -v` should be the operator's check before
   running `git push origin …`; not verified by the agent.

## Files changed

- **New:**
  `.cto/03_state/WISE_TUTOR_PUSH_READINESS_REVIEW_v1.md`
  (this document).
- **No source code was modified** by this lane. No commits on
  any branch. No push. No rebase. No force op. No rebuild.
- **No other file** across the repo was touched.

## Manual action required

Founder-only, in preferred order before a push:

1. **(Recommended.)** Commit the `.cto/03_state/` evidence
   chain so cross-links in `CURRENT_STATE.md` and
   `DECISIONS_LOG.md` resolve on GitHub. Suggested:

        git add .cto/03_state/
        git commit -m "docs(evidence): publish local evidence chain for 2026-04-19 baseline refresh"

   The folder is ~25 `.md` files + a small set of state JSONs.
   One commit, no product impact, no dependency, no test.

2. **(Optional.)** Do a final `git log
   origin/bootstrap/wisetutor-baseline..HEAD --oneline` glance
   to sanity-check the commit shape.

3. **Push** `bootstrap/wisetutor-baseline` to `origin`:

        git push origin bootstrap/wisetutor-baseline

   Watch GitHub Actions for the CI run. If CI goes red, the
   failure localizes a specific follow-up lane; baseline stays
   where it is.

4. **(Optional, after push.)** If CI green, the checkpoint is
   public. Natural next narrow lanes (each its own brief):
   tighten `DECISIONS_LOG.md` newest-at-top ordering; run the
   Playwright `pedagogy-divergence` project with a live LLM
   budget; address the Docker UX of the 002 migrate-keys temp
   file; define `adaptive` pedagogy mode's runtime hint; open
   a diagnostic for the AdminPanel Reset-PIN validator quirk.

## Next move

- Recommendation stands: **READY_TO_PUSH_LOCAL_CHECKPOINT**
  after the optional `.cto/03_state/` commit.
- Do not, in this session, push, open any new feature lane
  (001/006/008/010/011/012/014/017/021/026/027, Multica,
  Archon), reopen 002/003/004/005, or execute Playwright /
  CI / live-LLM work. This lane is review-only.
