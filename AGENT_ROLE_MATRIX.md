# AGENT_ROLE_MATRIX — WiseTutor

Who does what, with what authority, and where the boundary lies.

## Roles

### Founder (human, owner)
- Final decision maker on product direction, scope, timing, and what counts
  as "done enough."
- Sole authority to approve:
  - destructive git operations (force-push, reset --hard, branch deletion)
  - push to `origin main`, merge PRs, tag releases
  - adding/removing dependencies or runtime services
  - rotating or issuing API keys
  - exposing anything beyond localhost
- Reviews evidence tiers and rejects overclaims.
- Owns DECISIONS_LOG.md entries that mark a decision as made.

### Claude Code (AI implementation agent)
- Reads and writes source code, tests, docs, launcher scripts.
- Runs local servers, tests, and Playwright.
- Produces artifacts (screenshots, runtime_proof.json, evidence_report.md).
- Must classify every completion claim by evidence tier (see CLAUDE.md).
- Must not overclaim. If something is unproven, it says unproven.
- Must update CURRENT_STATE.md on every meaningful change and DECISIONS_LOG.md
  when a decision is made.
- May propose ROADMAP updates; founder confirms.

### Subagents / specialized agents (spawned by Claude Code)
- Authority is bounded by the spawning agent's authority.
- Output is not directly trusted without verification in the main thread.

## Limits (things agents may NOT do without explicit founder approval)

- Push to any remote (including `origin`).
- Open, merge, or close PRs.
- Run `git push --force` or `git reset --hard` against any branch.
- Delete files or directories outside the current working session scope
  unless the founder asked for it in the current instruction.
- Modify `.gitconfig`, user environment, or system services.
- Install new OS packages.
- Add a new cloud dependency or external API.
- Rotate, create, or revoke API keys.
- Contact external networks beyond fetches the founder authorized.
- Claim completion without evidence at the required tier.

## Proof / evidence contract

| Claim type | Minimum required evidence |
|---|---|
| "Backend routing is correct" | Tier 1 — live websocket run that captures runtime metadata from the real chat pipeline |
| "UI popup is fixed" | Tier 1 — Playwright bounding-box assertions + saved screenshots |
| "Tests pass" | Tier 2 — pytest/Playwright output attached or reproducible |
| "Design is sound" | Tier 3 — explicit "designed, not built" label |
| "Will work on a fresh machine" | Tier 3 unless re-verified end-to-end |

Verifying via `/verify` alone is Tier 2 at best; it does not prove the real
message path, only that the resolver can dial a provider.

## Escalation

If an agent encounters:
- a DECISIONS_LOG conflict
- a stack deviation not pre-approved
- an ambiguous product requirement
- a request that would violate founder approvals

...it stops, reports, and waits for founder direction. It does not make the
call itself.
