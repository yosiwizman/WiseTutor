# DELIVERY_PIPELINE — WiseTutor

Path from idea to shipped software. This is the agreed sequence; deviations
require founder approval logged in DECISIONS_LOG.

## Stages

1. **Intake**
   - Use `PROJECT_INTAKE_TEMPLATE.md` to draft the slice.
   - Intake must state: problem, scope boundary, non-goals, proof plan,
     rollback plan, evidence tier expected at completion.
   - Founder approves the intake (or asks for revisions) before any code.

2. **Design (if non-trivial)**
   - Lightweight design note in `docs/design/<slice>.md` when the slice
     crosses a module boundary, adds a dep, or touches data shape.
   - For small bug fixes and tight slices, intake alone is enough.

3. **Implementation**
   - Work happens on a feature branch (`feat/<slice>` or `fix/<slice>`).
   - Every meaningful commit must either pass tests or be clearly
     work-in-progress labeled.
   - Docs in the same commit when they change:
     - `CURRENT_STATE.md` always
     - `DECISIONS_LOG.md` when a decision was made
     - `STACK_STANDARD.md` when the stack changed
     - `ROADMAP.md` when phases shifted

4. **Verification**
   - Write the failing test first when practical; make it pass.
   - Backend behavior: pytest (`tests/unit/`, `tests/integration/`).
   - UI behavior: Playwright in `web/tests/e2e/` with
     `data-testid` anchors and bounding-box / text assertions.
   - For runtime-truth-affecting changes: a websocket integration test that
     captures the server-emitted `runtime` metadata is required.

5. **Evidence capture**
   - Save artifacts under `artifacts/<slice>/<utc-timestamp>/`:
     - `evidence_report.md` — 1-page summary with root cause, files
       changed, pass/fail, limitations
     - `runtime_proof.json` (when applicable)
     - Playwright PNGs
   - Evidence folders are gitignored; reference their path in the PR body.

6. **Review**
   - Founder reviews diff, evidence, and classification of claims against
     the evidence tier grid in CLAUDE.md.
   - Agents must self-classify claims before review; overclaim is a blocker.

7. **Merge / push**
   - Only the founder pushes to `origin main`.
   - Merge commit or squash is chosen per slice; default is a clean squash.
   - Tag a release (`vX.Y.Z`) when a user-visible milestone lands.

8. **Post-merge**
   - Update `CURRENT_STATE.md` to reflect the new reality if the pre-merge
     update missed anything.
   - Close intake entry.

## Rollback

- Every slice includes a rollback note in its intake.
- Preferred rollback: `git revert <sha>` — never `git reset --hard` on a
  shared branch.
- If `data/user/` or `data/memory/` was modified, restore from the
  quarantine dir or a manual backup.

## Pipeline status today

- Stages 1–5 are operable with current tooling.
- Stages 6–7 are manual (no CI yet). CI is a Phase-6 roadmap item.
- Branching: baseline bootstrap lands on `main` directly because there is
  no downstream consumer yet. After the first non-trivial feature slice
  (Phase 1 rebrand), new work uses feature branches + PRs.
