# DECISIONS_LOG — WiseTutor

Append-only. Newest at top. Every architectural, toolchain, or scope decision
lands here with a date, the decision, the reason, and the consequence.

---

## 2026-04-12 — WiseTutor formalized as the product repo
**Decision.** The owner-controlled product repo is WiseTutor at
`https://github.com/yosiwizman/WiseTutor`. Local working tree is
`/home/ai-desktop/projects/WiseTutor`.
**Reason.** The DeepTutor working directory had accumulated enough
product-specific customizations (runtime-truth system, memory identity guard,
identity short-circuit, runtime chips, Playwright proof harness) that a clean
product boundary was needed to keep upstream merges sane.
**Consequence.** New development lands in WiseTutor. `HKUDS/DeepTutor` is
configured as the `upstream` remote and is pulled deliberately.

## 2026-04-12 — DeepTutor remains upstream dependency/base
**Decision.** `HKUDS/DeepTutor` stays as the upstream source of the base
framework. We do not fork its README into our product identity; we keep
their README renamed as `DEEPTUTOR_UPSTREAM_README.md` for attribution.
**Reason.** Upstream ships genuinely useful capability scaffolding, provider
glue, and RAG. Re-implementing that from scratch would cost weeks for no
gain.
**Consequence.** Product-specific logic must be isolated so upstream merges
do not repeatedly trash it. Any cross-cutting change gets a note in the
intake about isolation strategy.

## 2026-04-12 — Current customized local build is the WiseTutor baseline
**Decision.** The baseline commit is a snapshot of the working
`/home/ai-desktop/projects/DeepTutor` tree as of this date, imported via
`rsync` with heavy/volatile dirs excluded (`.git`, `.venv`, `node_modules`,
`.next`, `__pycache__`, `logs/`, `artifacts/`,
`data/memory/_quarantined/`, `data/user/`). Upstream git history was NOT
preserved because keeping it blurs the product boundary.
**Reason.** A clean product history is easier to own, review, and revert.
Upstream attribution is preserved via the `upstream` remote and the renamed
README.
**Consequence.** `git log` in WiseTutor starts at the bootstrap commit.
Anyone looking for pre-bootstrap archaeology goes to the upstream repo.

## 2026-04-12 — Multi-user architecture will use per-user namespaces
**Decision.** Future multi-user work (Phase 2+) will namespace memory,
session, and catalog state per user (e.g., `data/users/<uid>/memory/...`).
We will NOT split PROFILE.md / SUMMARY.md into "sections" or share a single
memory file across users.
**Reason.** Shared memory across users caused the 2026-04-12 identity
contamination incident. A per-user namespace is the only honest boundary.
**Consequence.** Phase 2 design doc must specify user identification,
session → user binding, and migration for existing single-user data.

## 2026-04-12 — Truth/proof standard is mandatory
**Decision.** No completion claim ships without evidence at the tier noted
in the intake. Tier 1 requires re-execution against real conditions; Tier 2
requires tests; Tier 3 means "designed, not built" and is labeled as such.
**Reason.** Prior sessions shipped false "it works" claims grounded in
`/verify` responses and model self-report, which turned out to be wrong.
**Consequence.** CLAUDE.md enforces the tier grid. Agents self-classify.
Founder rejects overclaims.

## 2026-04-12 — Auto memory refresh is off by default
**Decision.** `MemoryService.refresh_from_turn` is gated behind
`DEEPTUTOR_MEMORY_AUTO_REFRESH=1`, default off. Re-enabling it requires a
new DECISIONS_LOG entry.
**Reason.** Auto-refresh was the lie-laundering vector that persisted a
hallucinated "GPT-4.1" identity across all providers.
**Consequence.** PROFILE/SUMMARY only change via explicit user action or
manual API call.

## 2026-04-12 — Identity questions answered from server runtime truth
**Decision.** Questions like "what model/provider are you?" are intercepted
in `AgenticChatPipeline.run` and answered directly from the resolver's
binding/model/base_url. No LLM call for these turns.
**Reason.** Every LLM (including Claude) was parroting poisoned memory.
Server truth is the only honest source.
**Consequence.** The identity regex must be maintained; new question
phrasings go through the unit test fixture.
