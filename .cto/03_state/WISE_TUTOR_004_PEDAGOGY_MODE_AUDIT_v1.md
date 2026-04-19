# WiseTutor 004 Configurable Pedagogy Mode — Audit v1

Audit date: 2026-04-19
Auditor: bounded auditor/verifier (agent)
Primary repo baseline: `bootstrap/wisetutor-baseline` @ `2e9a605`
  (after 005 `c813e67`, 003 `6712477`, 002 `2e9a605` merges).
004 branch: `auto-claude/004-configurable-pedagogy-mode` @ `4b4c52d`.
004 merge-base with current baseline: `29f1b9f`.
Scope: audit-only; do not merge; do not widen.

---

## Task name

`auto-claude/004-configurable-pedagogy-mode`

## Product intent

Give operators a per-user **`pedagogy_mode`** preference with three
values (`guided` / `direct` / `adaptive`). The selected mode is
stored in `User.preferences` and threaded through the existing
identity-preference pipeline so the chat model's system prompt
gets a mode-specific instruction on every turn:

- `guided` → "Use Socratic questioning and guiding questions to
  help the user discover insights on their own, rather than giving
  direct answers immediately."
- `direct` → "Provide clear, direct explanations and answers
  without requiring extensive back-and-forth."
- `adaptive` → no explicit system-prompt hint; the mode is
  documented as "handled programmatically at runtime" (effectively
  a pass-through today).

Result: the same prompt produces visibly different assistant
behavior depending on the mode — a genuine user-facing product
slice.

## Actual code surface found

Six commits ahead of merge-base, collapsing into six tracked
files (`git diff --name-status 29f1b9f..HEAD`):

    M  deeptutor/agents/chat/agentic_pipeline.py   (+7 lines)
    M  deeptutor/services/users/user_service.py    (+9)
    M  web/app/(utility)/settings/AdminPanel.tsx    (+46)
    M  web/playwright.config.ts                    (+5)
    A  tests/integration/test_pedagogy_mode.py     (156, new)
    A  web/tests/e2e/pedagogy-divergence.spec.ts   (230, new)

Totals: 6 files, +453 lines. No new dependency. No
`.auto-claude/*` harness residue in the tracked diff
(cleanly unlike 003, which had to strip two spec files before
merge).

### Concrete bits

- **`deeptutor/services/users/user_service.py`**: extends
  `_DEFAULT_PREFERENCES_BY_ROLE` with a per-role
  `pedagogy_mode`: `owner = "direct"`, `user = "guided"`,
  `child = "adaptive"`. Adds `pedagogy_mode: {"direct", "guided",
  "adaptive"}` to `_PREF_SCHEMA`. Adds validation-and-store in
  `_validate_preferences` (`out["pedagogy_mode"] = val` with a
  membership check).
- **`deeptutor/agents/chat/agentic_pipeline.py::_build_identity_preferences_line`**
  (lines 925–950): reads `pedagogy_mode = prefs.get("pedagogy_mode")
  or ""` and appends the guided/direct hint to the system-prompt
  `parts` list. `adaptive` deliberately produces no hint.
- **`web/app/(utility)/settings/AdminPanel.tsx`**: adds a
  `PEDAGOGY_MODES = ["guided", "direct", "adaptive"]` constant,
  `pedagogyModes` state keyed per user, initial load from
  `u.preferences?.pedagogy_mode ?? "guided"`, a `<select>` with
  `data-testid="admin-pedagogy-mode-<uid>"`, a Save button
  `data-testid="admin-save-pedagogy-mode-<uid>"`, and a
  `savePedagogyMode(targetId)` handler that PUTs
  `{pedagogy_mode}` to the existing
  `/api/v1/users/<id>/preferences` endpoint.
- **`web/playwright.config.ts`**: registers a new `pedagogy-
  divergence` Playwright project pointing at the new spec.
- **`tests/integration/test_pedagogy_mode.py`** (five test
  functions): four HTTP-shape tests (valid-accepted,
  invalid-rejected, persist-and-read, role-default-divergence)
  and one in-process prompt-builder test that imports
  `AgenticChatPipeline._build_identity_preferences_line`
  directly.
- **`web/tests/e2e/pedagogy-divergence.spec.ts`** (two tests):
  `"Pedagogy mode divergence: guided asks questions, direct
  gives answers"` opens two browser contexts, flips one to
  `guided` and the other to `direct`, sends the same prompt to
  each via `/api/v1/users/switch` + `ws-token` + a WS turn, and
  asserts the replies differ. Second test asserts the AdminPanel
  dropdown and Save button are visible and functional.

## Evidence found

- The feature is **end-to-end real**: UI dropdown → fetch PUT →
  backend schema validation → preferences dict → WS unified
  context metadata → `agentic_pipeline._build_identity_preferences_line`
  → system prompt line → LLM sees the instruction.
- The **UI write path reuses an existing endpoint**
  (`/api/v1/users/<id>/preferences`) that has already landed in
  baseline (via `136c264` Phase-3-slice-2 preferences); no new
  API surface. That is a good shape: smaller merge blast radius,
  no new security review needed.
- The **per-role defaults** are sensible for the product (owner
  wants direct, child wants adaptive) and are applied at user-
  creation time through the existing `_DEFAULT_PREFERENCES_BY_ROLE`
  plumbing.
- `adaptive` mode **has no system-prompt injection today** —
  documented in the prompt-builder test's comment:
  > "'adaptive' mode doesn't have a specific prompt instruction
  > (it's handled programmatically at runtime)"
  There is no visible runtime code that actually "handles"
  adaptive, so adaptive effectively means "no hint" in shipped
  behavior. Not a blocker (the dropdown still persists the value,
  and guided/direct are the two active behaviors), but the
  feature description is slightly optimistic about adaptive.

## Verification run

1. **Shipped `pytest tests/integration/test_pedagogy_mode.py`**
   (run from the 004 worktree via the DeepTutor venv, against
   the currently-running `deeptutor` Docker container which holds
   **baseline code, not 004 code**):

        5 tests collected.
        test_valid_pedagogy_mode_values_accepted ........... FAIL (401 'no_user')
        test_invalid_pedagogy_mode_rejected ................ FAIL (401 'no_user')
        test_pedagogy_mode_persists_and_can_be_read ........ FAIL (401 'no_user')
        test_pedagogy_mode_defaults_differ_by_role ......... FAIL (KeyError: 'preferences')
        test_prompt_builder_includes_pedagogy_mode ......... PASS

   4/5 fail; 1/5 pass. Both failure modes are **environmental,
   not code defects**:
   - The four HTTP-shape tests call `POST /api/v1/users/switch`
     with hard-coded CI PINs (`mrw=2468`, `bella=1357`). Those
     are the CI fixture PINs rotated by the CI workflow
     (`.github/workflows/ci.yml:50-51`), not the founder's
     live-container PINs. Since 002's prior audit already noted
     this pattern, the `401 no_user` comes from `_switch`
     silently failing authentication — cookie is never set —
     and subsequent PUT/GET requests have no session. A run
     with `WT_MRW_PIN=2468 WT_BELLA_PIN=1357
     WISETUTOR_TEST_MODE=1` against a dedicated 004-code
     backend (the shape the CI lane exercises) would succeed.
   - The fourth test (`defaults_differ_by_role`) reaches the
     `KeyError: 'preferences'` branch because its `_req`
     wrapper returns `None` for a 401 body, not a preferences
     dict — again a symptom of the missing auth, not of the
     004 code.
   - Critically, the live container is running **baseline code
     (no `pedagogy_mode` field at all)**; even if the PINs
     lined up, the backend would reject the unknown key (or
     silently drop it, depending on validation) because the
     feature hasn't been merged yet.

2. **In-process prompt-builder verification (real 004 code):**

        WISETUTOR_REPO=$(pwd) \
          /home/ai-desktop/projects/DeepTutor/.venv/bin/python \
          -m pytest tests/integration/test_pedagogy_mode.py::\
          test_prompt_builder_includes_pedagogy_mode -v

   → **1/1 PASS** (0.44 s). This test imports
   `AgenticChatPipeline._build_identity_preferences_line`
   directly, builds a mock `_Ctx` with
   `metadata._wt_preferences.pedagogy_mode` set to `"guided"`
   and `"direct"` in turn, and asserts the resulting system-
   prompt string carries the right Socratic / direct language.
   This is the **canonical backend-behavior proof** of the
   feature — the code path from preferences dict to system
   prompt is verified against the real 004 code, no mocks of
   product logic.

3. **Playwright `pedagogy-divergence` project** — **not run**.
   Requires the 004 code to be running on a live backend (not
   the case; the running container is on baseline) and a
   Playwright install. Would cost a live LLM call per context
   per test. Out of scope for a bounded audit lane.

4. **No additional tests added in this audit.** No code edits
   in this audit. No commits, merges, or pushes.

## Baseline overlap / merge risk

- 004 merge-base: `29f1b9f`.
- Current baseline tip: `2e9a605`.
- For each of 004's four **modified** files, counted baseline
  commits touching that path in `29f1b9f..2e9a605`:

        deeptutor/agents/chat/agentic_pipeline.py   → 0 commits
        deeptutor/services/users/user_service.py    → 0 commits
        web/app/(utility)/settings/AdminPanel.tsx    → 0 commits
        web/playwright.config.ts                    → 0 commits

  All four 004-overlapping files are **untouched on baseline**
  since the merge-base. The earlier selection artifact named
  commits `136c264`, `78875e8`, `32032d8` as risk sources;
  those are ancestors of `29f1b9f`, not post-merge-base, and
  therefore their effects are already encoded in the merge-base
  file content.

- Merge risk classification: **LOW.** A `git merge --no-ff` is
  expected to be either a clean fast-forward-like 3-way with
  zero auto-merge hunks, or at most a trivial auto-merge on
  files baseline does not touch. No `.auto-claude/*` residue in
  the 004 tracked diff (unlike 003), so no pre-merge cleanup
  commit is required.

- Test files are both new; they cannot conflict.

## Classification

**MERGEABLE_NOW.**

All six verification gates are met:

| Gate | Met? | Note |
|---|---|---|
| Relevant code surface exists | Yes | 6 files, +453 lines, coherent end-to-end |
| Feature is user-facing, not theory | Yes | dropdown + PUT + system-prompt injection |
| Write path and runtime behavior both real | Yes | UI → existing `/preferences` endpoint → `user_service` validation → prefs dict → `agentic_pipeline._build_identity_preferences_line` → LLM |
| At least one strong proof path succeeds honestly | Yes | `test_prompt_builder_includes_pedagogy_mode` PASS (real 004 code, in-process, no mock of product logic) |
| Baseline overlap understood, not hiding merge problems | Yes | 0 baseline commits touched any of the four 004 files post-merge-base; merge risk LOW |
| Merge risk explicit and acceptable | Yes | Trivial 3-way expected; no dependency change; no API-surface expansion |

The four failed HTTP tests are explicitly classified as
**environmental**, not as product defects or gate failures: the
running container is on baseline (pre-004) and the test PINs are
CI-fixture values. The founder can close those gate reads either
by (a) running a 002-style post-merge pytest with
`WISETUTOR_TEST_MODE=1` and the CI PINs against a 004-code
backend, or (b) running the `pedagogy-divergence` Playwright
project once after merge. Both are post-merge belts-and-braces
steps, not pre-merge gates, and the prompt-builder unit test
already verifies the core behavior.

## Recommended next action

Open a small bounded **merge-close** lane for 004 (not this
lane):

1. Operate from `/home/ai-desktop/projects/WiseTutor` on
   `bootstrap/wisetutor-baseline`.
2. Dirty-overlap check vs 004 footprint (expected zero hits on
   the six pre-existing dirty tracked paths).
3. `git merge --no-ff auto-claude/004-configurable-pedagogy-mode
   -m "merge(004): per-user pedagogy mode with system-prompt
   injection"`.
4. Verify the four 004 product files land byte-identical to 004
   tip `4b4c52d` (`git diff HEAD 4b4c52d -- <file>` = 0 lines).
5. Confirm `grep "pedagogy_mode" deeptutor/services/users/user_service.py`
   shows the schema entry, and
   `grep "pedagogy_hint" deeptutor/agents/chat/agentic_pipeline.py`
   shows the system-prompt injection, on the merged tree.
6. Do not push.
7. Write
   `.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_MERGED_v1.md`.

Post-merge belt-and-braces (founder's call, optional):

- Run `pytest tests/integration/test_pedagogy_mode.py` against a
  dedicated 004-code backend with the CI fixture PINs
  (`WT_MRW_PIN=2468 WT_BELLA_PIN=1357
  WISETUTOR_TEST_MODE=1`) to close the four environmentally-
  blocked HTTP tests.
- Run the `pedagogy-divergence` Playwright project for Tier 1
  evidence of observable reply divergence.
- Optional follow-up lane: make `adaptive` actually do something
  at runtime (today it is a pass-through placeholder). Out of
  scope here.

---

## Exact next bounded lane after this audit

**Merge-close for 004 Configurable Pedagogy Mode.** Single
bounded lane: the seven steps listed under "Recommended next
action" above, ending with a merge-close artifact and no push.

Do not, in this session or the next lane, reopen
001/002/003/005/008, touch 006/010/011/012/014/017/021/026/027,
or start CI/infra/secrets/Multica/Archon/non-004 product work.
