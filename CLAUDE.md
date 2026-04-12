# CLAUDE.md — Agent Operating Contract (WiseTutor)

This file is binding on any AI agent working in this repo. Read it before any
change. If instructions elsewhere in the conversation conflict with this
file, this file wins unless the founder explicitly overrides.

## Truth-first, always

- Tell the truth. Not encouragement. Not vibes.
- Never say "almost there" unless what remains is small AND already proven
  feasible by a demonstrable signal (a test, a measurement, a reproducible
  probe). "Almost there" without evidence is a banned phrase.
- Distinguish **lane progress** from **whole-product progress**. Fixing the
  settings page is lane progress; shipping multi-user is whole-product
  progress. Do not conflate.
- Do not celebrate. Report.

## Evidence tier grid (classify every completion claim)

| Tier | Meaning | Accept as completion? |
|---|---|---|
| **Tier 1** | Proven by independent re-execution against real conditions (live websocket, real provider, real user action in Playwright) | Yes — default bar |
| **Tier 2** | Proven by tests in sandbox (pytest, Playwright headless) | Acceptable for tight slices if Tier 1 isn't practical |
| **Tier 3** | Designed / documented, not executed | Never acceptable as "done" — must be labeled "designed, not built" |
| **Tier 4** | Claimed but not built | Unacceptable. If you find one, delete the claim or demote it to Tier 3 with a TODO |

Trivial proofs do not justify non-trivial claims. A `/verify` 200 response
does not prove the normal chat path routes correctly; a Playwright screenshot
does not prove runtime metadata is honest. Pick the proof that matches the
claim.

## Built-by attribution

- Distinguish what the **founder** built from what **Claude Code** built.
- In PR bodies and evidence reports, state it explicitly when it matters
  (e.g., "founder wrote the memory quarantine playbook; Claude Code
  implemented the identity regex and tests").
- Do not let agent-authored code silently masquerade as founder-authored
  decisions.

## Every meaningful change updates these docs, in the same commit

- `CURRENT_STATE.md` — always
- `DECISIONS_LOG.md` — if a decision was made
- `ROADMAP.md` — if phases shifted
- `STACK_STANDARD.md` — if the stack changed
- `SECURITY_BASELINE.md` — if the security surface changed

If you skip the doc update, you did not finish.

## Drift rules

- No silent architectural drift. New service, new daemon, new event bus →
  DECISIONS_LOG entry first.
- No silent toolchain changes. New language version, new package manager,
  new test runner → DECISIONS_LOG entry first.
- No silent dependency additions. `requirements/`, `pyproject.toml`,
  `package.json` changes must be justified in the commit message and
  matched to an intake or decision entry.

## Completion bar for UI work

- Playwright visual verification with saved artifacts in
  `artifacts/<slice>/<utc-ts>/`.
- Bounding-box or text assertions against real rendered content. "Looks
  fine" screenshots do not count.
- `data-testid` on the element under test.
- Screenshots avoid exposing any key / secret.

## Completion bar for backend work

- At least one test that would have failed before the change.
- For runtime-truth-affecting work: a real websocket integration test that
  captures the server-emitted runtime event and asserts provider/model.
- No mock of the provider when a real call is feasible and cheap.

## Multi-user boundary (binding, even pre-Phase-2)

- Do not mix multi-user memory. The PROFILE/SUMMARY story is single-user
  today. When multi-user arrives (Phase 2), memory is per-user-namespace.
  Never shared via sections or suffixes.
- Do not silently inject another user's context into the current user's
  prompt. If in doubt, inject nothing.

## Product / upstream boundary

- Do not bury product business logic back into upstream DeepTutor code
  paths. If a change belongs to WiseTutor the product, it lives in a
  WiseTutor-owned file or behind an extension point so the next upstream
  merge is a no-op on it.
- Before editing a file under `deeptutor/` that we imported from upstream,
  ask: "could this live in a WiseTutor-side wrapper instead?" If yes, wrap.

## Memory rules

- The identity guard (`MemoryService._rewrite_one`) may not be bypassed.
- `DEEPTUTOR_MEMORY_AUTO_REFRESH` stays `0` unless a DECISIONS_LOG entry
  re-enables it.
- Identity questions are answered from server runtime, not the LLM.

## Secrets rules (also see SECURITY_BASELINE.md)

- Never print an API key. Never include one in a screenshot. Never commit
  one. If you detect one in an output you're about to show, redact it.
- Treat every `data/user/settings/model_catalog.json` field named
  `api_key` as a secret.

## Git rules

- Only the founder pushes to `origin`.
- Only the founder force-pushes, resets --hard, or deletes branches.
- Agents may create feature branches, commit, and open PRs (via `gh`) only
  when explicitly authorized in the current session.
- Commit messages state what changed and why. If a decision was made, link
  it: "see DECISIONS_LOG 2026-04-12: ...".

## When blocked

- Report what you tried, what failed, the smallest next action, and the
  evidence you already have. Do not invent a "almost there" status.
- If a stop condition in AGENT_ROLE_MATRIX is hit, stop and wait.
