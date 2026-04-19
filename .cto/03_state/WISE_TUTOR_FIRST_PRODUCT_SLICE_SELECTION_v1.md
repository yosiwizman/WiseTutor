# WiseTutor First Product-Slice Selection v1

Selection date: 2026-04-19
Selector: bounded auditor/selector (agent)
Primary repo: `/home/ai-desktop/projects/WiseTutor`

Scope: pick ONE Aperant task as the single best candidate for the
first end-to-end user-facing product slice on the current baseline.
Audit/select only; no merge, no push, no implementation.

---

## Current baseline state

- `bootstrap/wisetutor-baseline` @ `2e9a605 merge(002): api key
  env-var indirection with HTTP hardening` (local; not pushed).
- Aperant recovery queue from
  `WISE_TUTOR_APERANT_RECOVERY_AUDIT_v1.md` is materially closed:
  - 005 Session Secret Rotation → merged at `c813e67`.
  - 003 Backend Network Bind Restriction → merged at `6712477`.
  - 002 API Key Security Hardening → merged at `2e9a605`.
  - 001 Read-Only Smoke Test → no mergeable unit.
  - 008 Free-First Content Search & Acquisition → blocked by SSOT +
    founder-approval gates in `DECISIONS_LOG 2026-04-15`.
- Running `deeptutor` container: `Up 12 hours (healthy)`, continuous
  since `2026-04-19T01:32:20Z`.

## Candidate tasks reviewed

Enumerated 17 Aperant branches via `git worktree list`. Seven tips
equal the old merge-base `29f1b9f` with zero new commits (001 excepted;
empty: 010, 011, 012, 017, 021) — no code to audit. Five were already
disposed of in recovery (001, 002, 003, 005, 008). Four branches
(007, 009) are inside the founder-gated librarian/licensing surface.
One (014) is CI-only and excluded by brief. That leaves **four
product-adjacent candidates** with real commits ahead of baseline:

| Task | Tip | Commits | Lines | Kind |
|---|---|---|---|---|
| 004 configurable-pedagogy-mode | `4b4c52d` | 6 | +453 | user-facing feature |
| 006 wisetutor-module-rebrand | `421a037` | 5 | +1351, 481 files | rename/infra |
| 026 theme-accessibility-wcag-aa | `7fd3adb` | 10 | +754 | a11y polish |
| 027 knowledge-page-ui-decomposition | `cdfbcc6` | 10 | +1563/−632 | UI refactor |

Each is covered below.

---

### Candidate 004 — Configurable Pedagogy Mode

- **Task name:** `auto-claude/004-configurable-pedagogy-mode`
- **Product intent:** Let an operator pick between `guided` (Socratic
  questioning) and `direct` (clear explanations) — and `adaptive` —
  as a per-user preference. The selected mode is injected into the
  chat system prompt so the same user message produces visibly
  different AI replies depending on the setting. User-facing,
  observable, per-user.
- **Actual code surface:**
  ```
  deeptutor/agents/chat/agentic_pipeline.py |   7 +
  deeptutor/services/users/user_service.py  |   9 +
  tests/integration/test_pedagogy_mode.py   | 156 ++++  (new)
  web/app/(utility)/settings/AdminPanel.tsx |  46 ++++
  web/playwright.config.ts                  |   5 +
  web/tests/e2e/pedagogy-divergence.spec.ts | 230 +++++  (new)
  6 files, +453 / −0
  ```
  Concrete bits:
  - `agentic_pipeline.py::_build_identity_preferences_line` gets a
    new `pedagogy_mode` read from `UnifiedContext.metadata`
    preferences, with two system-prompt hints:
    * `guided` → "Use Socratic questioning and guiding questions …"
    * `direct` → "Provide clear, direct explanations and answers …"
  - `user_service.py` extends the preferences schema with
    `pedagogy_mode` + validation (allowed: guided|direct|adaptive).
  - `AdminPanel.tsx` adds a per-user dropdown (`PEDAGOGY_MODES =
    ["guided", "direct", "adaptive"]`) that PUTs through the
    existing `/preferences` PUT path from the merged Phase 3 slice 2
    (`136c264`).
  - `tests/integration/test_pedagogy_mode.py` (156 lines) tests
    preference validation + system-prompt-line contents.
  - `web/tests/e2e/pedagogy-divergence.spec.ts` (230 lines) opens
    two browser contexts with the same prompt, flips one to
    `guided` and the other to `direct`, captures
    `pedagogy_divergence_proof.json` + screenshots, asserts reply
    divergence.
- **Implementation status:** Complete on the 004 branch. Unit-level
  wiring, backend integration test, and Playwright e2e spec all
  present in the tip.
- **Proof burden:** Low-to-medium. Branch ships its own tests.
  Merge onto current baseline likely produces small resolver diffs
  on `user_service.py` / `AdminPanel.tsx` / `agentic_pipeline.py`
  (baseline has moved through Phase-3-slice-2 preferences +
  profile-hard-delete + pdf-ingestion-overhaul since 004's
  `merge-base = 29f1b9f`; those three files are touched on
  baseline's side). A bounded merge-prep lane would resolve
  auto-merges, re-run `pytest tests/integration/test_pedagogy_mode.py`
  and `pnpm playwright test web/tests/e2e/pedagogy-divergence.spec.ts`,
  and decide MERGEABLE_NOW vs SALVAGEABLE.
- **Blockers:** None structural. Depends only on Phase-3-slice-2
  preferences (already merged in `136c264`). No founder gate. No
  dependency install. No architecture change.
- **Classification:** **BEST_NEXT_PRODUCT_SLICE**

### Candidate 006 — WiseTutor Module Rebrand

- **Task name:** `auto-claude/006-wisetutor-module-rebrand`
- **Product intent:** Rename `deeptutor/` → `wisetutor/` and
  `deeptutor_cli/` → `wisetutor_cli/` throughout the repo.
- **Actual code surface:** 481 files, +1351 / 0 lines (git mv plus
  import updates). Not user-facing; no behavior change; only package
  identity flips.
- **Implementation status:** Rename appears complete via `git mv`.
  Import updates: partial (branch log shows "Count and document all
  files with 'deeptutor' imports" but no sweeping rename commit of
  import statements).
- **Proof burden:** Very high. Every test file, every consumer
  (Docker build paths, pytest collection paths, wheel metadata,
  docs, CLAUDE.md references) has to keep working after a 481-file
  rename. Merge-conflict surface vs current baseline is also huge
  because baseline has moved substantially since `29f1b9f`.
- **Blockers:** No founder gate, but this is infra/cosmetic: it
  doesn't make any user-visible capability ship. The WiseTutor
  product brand is already presented in the UI, CLI, and
  SECURITY_BASELINE without the package rename. Proof burden
  vastly exceeds product value right now.
- **Classification:** **NOT_NEXT** (cosmetic / infra; too wide for a
  single bounded product-slice lane).

### Candidate 026 — Theme Accessibility WCAG AA

- **Task name:** `auto-claude/026-theme-accessibility-wcag-aa`
- **Product intent:** Add `font_size` and `reduced_motion` as
  per-user preferences; surface them in the `PreferencesPanel`;
  apply them via CSS custom properties + `prefers-reduced-motion`
  media query + a `useReducedMotion` hook. Also a Bella-theme
  contrast adjustment.
- **Actual code surface:** 8 files, +754 / −5 lines:
  ```
  deeptutor/api/routers/users.py              |   2 +
  deeptutor/services/users/user_service.py    |  12 +
  web/app/(utility)/settings/PreferencesPanel.tsx |  36 +
  web/app/globals.css                         |  67 +
  web/components/ThemeProvider.tsx            |  33 +
  web/hooks/useReducedMotion.ts               |  75 +  (new)
  web/tests/e2e/accessibility.spec.ts         | 456 +  (new)
  web/tests/e2e/themes.spec.ts                |  78
  ```
- **Implementation status:** Looks complete. Includes a 456-line
  Playwright accessibility spec.
- **Proof burden:** Medium. Merge-conflict surface overlaps with
  baseline's `user_service.py` + `PreferencesPanel.tsx` + `users.py`
  (same files 004 touches).
- **Blockers:** No founder gate. No dependency.
- **Classification:** **POSSIBLE_LATER_PRODUCT_SLICE.** It's
  user-visible but polish-shaped rather than new capability: the
  user gains font-size + reduced-motion controls that scale an
  existing UI, not a new behavior. Fine as a follow-up lane after
  a first real feature slice lands.

### Candidate 027 — Knowledge Page UI Decomposition

- **Task name:** `auto-claude/027-knowledge-page-ui-decomposition`
- **Product intent:** Refactor `web/app/(utility)/knowledge/page.tsx`
  by extracting inline sections into `KnowledgeBaseCreate`,
  `KnowledgeBaseList`, `KnowledgeBaseUpload`, `NotebookManager`,
  plus a `LibrarianPanel` placeholder.
- **Actual code surface:** 10+ commits, +1563 / −632 lines, ~11
  tracked paths. The diff also carries harness/build pollution
  (`.auto-claude-security.json`, `.auto-claude-status`,
  `.claude_settings.json`, `web/node_modules`,
  `web/visual-verify.js`, plus a duplicate `KnowledgeBaseCreate.tsx`
  at an unexpected path) that should not land on baseline.
- **Implementation status:** Refactor-only. No new user capability.
  No new test beyond existing knowledge-isolation coverage.
- **Proof burden:** Medium-to-high — visual verification that the
  knowledge page still does what it did before (upload, KB list,
  notebook management), plus stripping the harness pollution.
- **Blockers:** No founder gate. But this is a pure refactor with
  observable downside risk (UI regression) and zero new product
  value. Poor first-product-slice candidate.
- **Classification:** **NOT_NEXT.** Revisit later if/when component
  maintenance becomes painful.

---

## Selected best next slice

**004 Configurable Pedagogy Mode** is the single best next
product-proof lane.

## Reason for selection

Five criteria, scored against the four candidates:

| Criterion | 004 | 006 | 026 | 027 |
|---|---|---|---|---|
| User-facing / observable behavior change | **Yes** | No (rename) | Partial (polish) | No (refactor) |
| Bounded (< ~500 lines of diff) | **~450** | 1351 | 754 | 1563 |
| Not founder-gated / no dependency install | **Yes** | Yes | Yes | Yes |
| Ships its own end-to-end test (Playwright) | **Yes** | No | Yes | No |
| Higher value than pure cleanup | **Yes** | No | Marginal | No |

004 is the only candidate that clears every bar:
- User-facing: flipping the pedagogy dropdown visibly changes the
  LLM's style on the very next turn. That is a real product-level
  capability, not a rename or an a11y adjustment.
- Bounded: 6 files, +453 lines, no new third-party dependency.
- Builds on already-landed Phase-3-slice-2 preferences
  (`136c264`) rather than a founder-gated feature like librarian
  or avatar — so there is no approval gate between this and
  merge-readiness.
- Already ships `tests/integration/test_pedagogy_mode.py` +
  `web/tests/e2e/pedagogy-divergence.spec.ts`, so the evidence
  path is drafted. A bounded next-lane can re-run both from the
  merged tree, resolve any Phase-3-slice-2 auto-merge, and
  classify MERGEABLE_NOW vs SALVAGEABLE.
- 026 is a reasonable second-next but is polish; 006 and 027 are
  infra/refactor and don't justify being the first real feature
  proof.

## Exact next bounded lane after this selection

A bounded audit lane for **004 Configurable Pedagogy Mode**,
mirroring the 002/003/005 pattern:

1. Operate against `.auto-claude/worktrees/tasks/004-configurable-pedagogy-mode`.
2. Identify the actual diff vs current baseline tip `2e9a605`
   (not just vs `29f1b9f` merge-base) and confirm the merge-surface
   overlap on `user_service.py`, `AdminPanel.tsx`,
   `agentic_pipeline.py`, `playwright.config.ts`.
3. Run the ship-with-branch tests:
   - `pytest tests/integration/test_pedagogy_mode.py -v`
   - `npx playwright test web/tests/e2e/pedagogy-divergence.spec.ts --project pedagogy-divergence`
     (or whichever Playwright project the branch registered).
4. Classify 004 as MERGEABLE_NOW / SALVAGEABLE_WITH_BOUNDED_FIX /
   NOT_PROVEN_DO_NOT_MERGE using the same evidence-tier bar as
   the earlier recovery lanes.
5. Write
   `.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_AUDIT_v1.md` and
   stop. Do not merge in that lane. Do not push.

Do not, in any follow-on lane: reopen 001/002/003/005/008; touch
006/010/011/012/014/017/021/026/027; start CI, infra, secrets,
Multica, Archon, or any product slice other than 004.
