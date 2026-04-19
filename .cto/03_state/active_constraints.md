# State — Active Constraints

**Purpose:** The hard constraints every plan must respect. Short, absolute, non-negotiable without founder approval. If a constraint is relaxed, it moves to `decision_log.md` with the justification.

**Rules:**
- Each constraint is one sentence.
- Each has a source (doctrine file, ADR, or founder decision line).
- A plan that violates an active constraint is rejected at review — not "flagged for discussion."

---

## Constraints currently in force

- **C-1 · Upstream boundary.** No product business logic is added inside `deeptutor/`. Product logic lives in WiseTutor-owned files or behind extension points.
  *Source:* `02_doctrine/architecture_rules.md §3` · `CLAUDE.md`

- **C-2 · Identity guard is inviolate.** `MemoryService._rewrite_one` may not be bypassed. Identity answers come from server runtime, not the LLM.
  *Source:* `02_doctrine/security_rules.md §4` · `CLAUDE.md`

- **C-3 · Memory auto-refresh is off.** `DEEPTUTOR_MEMORY_AUTO_REFRESH` stays `0` unless a new `decision_log.md` entry explicitly re-enables it.
  *Source:* `CLAUDE.md` · `02_doctrine/security_rules.md §4`

- **C-4 · No direct push to origin by agents.** Only the founder pushes. Agents may open PRs when authorized in the current session.
  *Source:* `02_doctrine/security_rules.md §8`

- **C-5 · No destructive ops without founder approval.** See the full list in `02_doctrine/security_rules.md §1`.
  *Source:* `02_doctrine/security_rules.md §1`

- **C-6 · No fake completion.** "Almost there", "should work", "probably fixed" are banned as completion claims. See `02_doctrine/definition_of_done.md`.
  *Source:* `02_doctrine/definition_of_done.md §9` · `CLAUDE.md`

- **C-7 · No unvetted dependencies.** New runtime deps require license + maintenance + security signal; no `curl | bash` installers without ADR.
  *Source:* `02_doctrine/security_rules.md §6` · `02_doctrine/architecture_rules.md §7`

- **C-8 · MCP / Ollama setup is the agreed local backbone.** Agents do not substitute alternative memory or LLM backends without an ADR.
  *Source:* founder decision (add to `decision_log.md` on first reference)
