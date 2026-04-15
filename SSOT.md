# WiseTutor — SSOT

Single source of truth for what WiseTutor currently is, what is proven, and
where the canonical documents live.

## What WiseTutor is

WiseTutor is a product-layer build that wraps and customizes **HKUDS/DeepTutor**
to serve the owner's family/tutoring use cases. It is not a fork that intends
to compete with upstream on generality; it is a product surface with governed
customizations (runtime honesty, memory safety, per-user boundaries).

## What is proven (Tier-1 or Tier-2 evidence exists in the imported baseline)

- Local install runs: Python backend on :8001, Next.js frontend on :3782,
  Ollama backend for local models. Launcher scripts exist in `scripts_local/`.
- Provider catalog supports three clean profiles: OpenAI, Anthropic, Local Ollama.
- Active provider/model switching via `POST /api/v1/settings/active`.
- Server-verified diagnostics endpoint `GET /api/v1/settings/diagnostics`.
- Per-turn runtime metadata is emitted by `AgenticChatPipeline.run` and surfaced
  as a per-message chip in the UI.
- Memory identity-guard rejects/redacts identity claims before persistence;
  auto-refresh of PROFILE/SUMMARY is disabled by default.
- Identity questions ("what model are you?") are intercepted and answered from
  server runtime — no LLM inference, no memory parroting.
- Playwright E2E suites exist: identity truth (4 tests) and popup layout
  (6 tests) — all passing against the local running app.
- Pytest suites exist: memory identity guard (11) and reply-honesty (4).

## What is NOT yet proven / not built

- Multi-user architecture. The memory store is global. No per-user namespaces.
- WiseTutor rebrand. Package names, UI strings, and endpoints still say
  "DeepTutor".
- Bella / Mr W profile separation.
- Theme / appearance system.
- Voice STT / TTS.
- CI/CD pipeline for this product repo.
- Remote deployment. This is a local-only build today.
- Knowledge-page AI Librarian mode (goal elicitation → free-first
  content acquisition → ingest under caller's KB). Intent captured
  2026-04-15 in `FEATURE_REQUESTS_2026_04_15.md`; no runtime code
  exists yet.
- Interactive avatar tutor (VRM-based, admin-curated catalog, voice
  loop over the existing Phase-5 substrate). Intent captured
  2026-04-15 in `FEATURE_REQUESTS_2026_04_15.md`; no runtime code
  exists yet.
- Pod-based parallel execution for this product phase (planning-only
  as of 2026-04-15).

## Product boundary

- **Upstream** (`HKUDS/DeepTutor`): base agent framework, capabilities,
  provider SDK glue, RAG pipeline.
- **WiseTutor** (`yosiwizman/WiseTutor`): runtime-truth system, memory
  identity guard, identity short-circuit, Playwright proof framework, product
  docs, governance, future multi-user / profile / theme / voice layers.

Upstream updates are pulled via the `upstream` remote and merged deliberately.
Upstream is never the place to land product-specific logic.

## Canonical links

- Upstream: <https://github.com/HKUDS/DeepTutor>
- Product repo: <https://github.com/yosiwizman/WiseTutor>
- Local working tree: `/home/ai-desktop/projects/WiseTutor`

## Docs that override this file on conflict

None. If any doc disagrees with `SSOT.md`, SSOT wins; the other doc is updated
to match or is explicitly noted as deprecated.
