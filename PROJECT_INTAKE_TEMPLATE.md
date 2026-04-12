# PROJECT_INTAKE_TEMPLATE — WiseTutor

Copy this template into `docs/intake/<utc-timestamp>-<slug>.md` when starting
a new slice. Founder approves before code touches the tree.

---

## Title
<one-line title of the slice>

## Date
<yyyy-mm-dd>

## Requestor
<founder | agent-proposed>

## Problem
<what is actually broken or missing, in user terms>

## Scope (in-scope)
- <specific, bounded outcome>
- <specific, bounded outcome>

## Non-goals (explicitly out of scope)
- <things we are NOT doing in this slice>
- <things we are NOT doing in this slice>

## Upstream / boundary impact
- Does this touch any `deeptutor/` upstream path? If yes, how do we isolate
  the change so the next upstream merge is not painful?
- Does this need a new extension point?

## Evidence tier expected
- [ ] Tier 1 — proven by real re-execution against live conditions
- [ ] Tier 2 — proven by tests in sandbox
- [ ] Tier 3 — designed / documented only
- [ ] Tier 4 — not-acceptable completion state

## Proof plan
- Backend: <pytest module to add/modify, what assertions>
- UI: <Playwright spec path, what bounding-box / text assertions, screenshots>
- Artifact path: `artifacts/<slug>/<utc-ts>/`

## Rollback plan
- If this breaks, the revert is: <commit revert | config swap | data restore>
- Data impact: <none | SQLite migration | memory files | catalog>

## Risk assessment
- Blast radius: <local-only | can affect other users | touches keys>
- Reversibility: <trivial | medium | hard>
- External side effects: <none | provider billing | push to remote>

## Docs to update in the same commit
- [ ] `CURRENT_STATE.md`
- [ ] `DECISIONS_LOG.md` (if a decision was made)
- [ ] `ROADMAP.md` (if phases shifted)
- [ ] `STACK_STANDARD.md` (if stack changed)
- [ ] `SECURITY_BASELINE.md` (if security surface changed)

## Completion checklist
- [ ] Failing test existed before the fix
- [ ] Test passes after the fix
- [ ] Evidence artifacts saved
- [ ] Self-classification of claims done honestly
- [ ] CURRENT_STATE updated
- [ ] Founder review requested with evidence paths
