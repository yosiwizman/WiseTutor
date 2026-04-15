# FEATURE_REQUESTS_2026_04_15 — WiseTutor planning pass (v2)

Founder-intent capture for the Knowledge-page AI Librarian and Interactive
Avatar Tutor. Planning only. Nothing in this file is proof that any
capability exists today.

This document sits below SSOT.md. Whenever a line here is promoted to
reality, move it from the "PLANNED" table to SSOT.md / CURRENT_STATE.md
with tier-1/tier-2 evidence and delete it here.

**v2 (2026-04-15) refinements** extend the intent dialog (level +
preferred format), make the storage/indexing surface map explicit,
enumerate dedup / metadata / source-tracking expectations for the
librarian ingest path, and surface the MVP voice/avatar interaction
fork for founder decision. All v2 additions are under clearly marked
**"v2:"** callouts so the v1 intent remains intact.

---

## 0. Status preface (current real state, 2026-04-15, tip 5e4cdbe)

- Hosted WiseTutor CI green on run 24451850132.
- Repo is in stabilization mode: services/config lane is 18/19 green;
  one remaining red is a model-catalog default-binding drift tracked
  separately and explicitly NOT part of this planning slice.
- No avatar code, no VRM code, no librarian-mode UI, no free-first
  content-acquisition pipeline exists in the tree today.
- What does exist and is relevant as substrate:
  - Knowledge page UI: `web/app/(utility)/knowledge/page.tsx`
    (1207 lines, monolithic; has upload + URL ingestion UI already).
  - Knowledge backend: `deeptutor/knowledge/` (manager, initializer,
    add_documents) + `deeptutor/services/rag/` (factory, pipelines —
    LlamaIndex default + Qdrant adoption v1 landed, confirmed on
    tip 28bd985).
  - URL ingestion v1 closed: `deeptutor/services/ingestion/url_fetch.py`,
    `POST /api/v1/knowledge/{kb_name}/ingest-url`.
  - PDF ingestion v1 closed with encrypted/image-only/malformed
    preflight.
  - Voice substrate: `deeptutor/api/routers/voice.py` (faster-whisper
    STT + Piper TTS), `web/lib/tts.ts`, `useVoiceTurn` + PTT button in
    composer. Tier-1 audible conversation path proven on tip ~Apr-13.
  - Chat composer / workspace UI lives under `web/app/(workspace)/`;
    per-user theme + identity + capability enforcement all landed.

Nothing beyond the above is assumed to exist.

---

## 1. Founder feature intent (captured 2026-04-15)

### 1A. Knowledge-page AI Librarian mode
- Inline AI agent bubble on the Knowledge page.
- User states what they want to study.
- Librarian asks follow-ups on: subject, **current level**, desired
  outcome, depth, time available, existing background, **preferred
  format** (book / PDF / site / course / video / mixed).
- Librarian searches for learning materials with priority:
  **free first** (open books, PDFs, docs, sites, OCW-style courses),
  **paid only if free is insufficient**.
- Free path: fetch, normalize, store into the caller's KB, ingest
  through the existing pipeline.
- Paid path: surface purchase links only. No auto-purchase. No assumed
  license. Wait for the user to bring the purchased artifact in.
- Per-user scope preserved (URL ingestion v1 + PDF v1 contracts apply).

**v2: ingestion pipeline expectations** — once material is selected,
the free-first acquisition path must:
- deduplicate at URL + sha256 level against the caller's existing KB
  (reuse `DocumentAdder._get_file_hash` contract);
- stamp each ingested artifact with source metadata: source URL,
  fetch timestamp, declared license, librarian plan id, goal-slug;
- surface `source_manifest.json` per KB listing every acquired item
  with its provenance so the owner can audit or delete per-source;
- honor robots.txt and per-host rate limits on the fetch side;
- never delete or mutate prior ingested items as a side effect of a
  new plan run.

### 1B. Interactive avatar tutor
- Side-pop avatar on the tutoring surface (workspace), opt-in.
- Avatar can teach interactively (talk, listen, gesture at some level).
- User picks an avatar from a catalog.
- Admin/owner can upload/enable many avatars.
- Reference experience: VRoid-based conversational anime avatars
  (ChatVRM / LocalChatVRM shape).
- Voice is expected (talk to it, hear it talk).

### 1C. Team / pod shape
- Stop one-agent-does-everything serialization for this product phase.
- Define pods by surface: research, backend, frontend, ingestion,
  avatar UX, admin / content ops.
- Each pod owns one contract, not a grab-bag.

---

## 2. Feature classification (evidence-bound)

Only four allowed labels: VERIFIED, BUILT BUT NOT YET CHECKED, PLANNED,
OUTDATED.

| Item | Classification | Evidence |
|---|---|---|
| Knowledge page exists with upload + URL ingest | VERIFIED | page.tsx, router.py, URL ingestion v1 slice |
| PDF ingestion with preflight | VERIFIED | PDF ingestion overhaul v1 slice, CI green |
| Qdrant as per-KB vector backend | VERIFIED | Qdrant adoption v1 slice (28bd985) |
| Librarian inline agent bubble on Knowledge page | PLANNED | no code; no route; no UI |
| Librarian Q&A dialog about goals/depth | PLANNED | no such agent |
| Free-first content search → fetch → ingest flow | PLANNED | only URL ingest (single URL) + PDF upload exist today |
| Paid-materials flow (link-only, no purchase) | PLANNED | not built |
| Avatar rendering on a UI surface | PLANNED | no VRM, no three-vrm, no avatar component |
| Avatar chat (speak / listen) wiring | PLANNED | voice substrate exists but no avatar consumer |
| Avatar catalog + admin upload surface | PLANNED | not built |
| VRoid Hub / VRM ecosystem adoption | PLANNED | no dependency, no decision |
| Pod-based execution of this product phase | PLANNED | historical work was 1-lane sequential |
| v2: Librarian ingest dedup + source_manifest per KB | PLANNED | no manifest writer today |
| v2: Per-avatar voice + expression driven by assistant metadata | PLANNED | voice substrate exists; avatar consumer does not |
| v2: Voice/avatar MVP mode decision (text+presence vs text+TTS vs duplex) | PLANNED | open decision fork — see §4C |

No item here is BUILT BUT NOT YET CHECKED.
No item here is OUTDATED.

---

## 3. Impacted surface map (read-only)

### Knowledge / ingestion
- `web/app/(utility)/knowledge/page.tsx` — single 1207-line file; owns
  KB list, create, upload, ingest-url, config, progress. Librarian UI
  will need to split this file or add a sibling panel; no route change
  required.
- `deeptutor/api/routers/knowledge.py` — `/create`, `/upload`,
  `/ingest-url`, `/list`, `/{kb}/config`. Librarian will probably add
  `/{kb}/librarian/plan` (goal → sub-topics) and
  `/{kb}/librarian/acquire` (free-first fetch orchestration) but those
  endpoints do not exist yet.
- `deeptutor/knowledge/{add_documents,initializer,manager}.py` — per-user
  ingestion infra; will be reused unchanged.
- `deeptutor/services/ingestion/url_fetch.py` — single-URL SSRF-gated
  fetch. Needs generalization (or a sibling) for crawler-style
  page-set acquisition.
- `deeptutor/services/rag/{factory,pipelines/llamaindex}.py` — vector
  backend selector (default + qdrant). No change required for
  librarian.

### Tutor / voice / avatar
- `web/app/(workspace)/...` — workspace page hosts ChatMessages +
  ChatComposer (PTT button lives there). Avatar side-panel will mount
  here.
- `web/lib/tts.ts` + `web/lib/speech-recognition.ts` + `useVoiceTurn` —
  voice substrate. Avatar lip-sync / expression driver will consume
  these, not replace them.
- `deeptutor/api/routers/voice.py` — whisper + piper endpoints. Avatar
  audio consumer can reuse the existing `/voice/synthesize` endpoint.
- **No avatar component file exists today.** No VRM viewer, no
  `@pixiv/three-vrm` dependency in `web/package.json`, no avatar catalog
  route, no VRoid Hub integration.

### Admin / content ops
- `AdminPanel` already exists (owner-only) for profile/PIN/prefs.
  Avatar catalog CRUD would live alongside it or as a sibling settings
  page. Not yet built.

### v2: Storage / indexing surface (for uploaded / acquired documents)
- Per-user KB filesystem root: `data/knowledge_bases/<uid>/<kb_name>/`
  with `raw/` (staged artifacts) + `llamaindex_storage/` (docstore +
  index persistence) + `qdrant_storage/` (when `rag_provider=qdrant`,
  see Qdrant adoption v1).
- Document hash index: `DocumentAdder.get_ingested_hashes` reads
  `metadata.json::file_hashes`; the librarian dedup path must reuse
  this map rather than invent a new index.
- Proposed-new artifact (not yet built): `source_manifest.json` per KB
  listing `{url, sha256, license, fetched_at, plan_id, goal_slug}` for
  every librarian-acquired item. Lives next to `metadata.json`.
- Collection naming for qdrant-backed KBs: `wt_kb_<safe_kb_name>`
  scoped per-user via the per-user `kb_base_dir` — structural isolation
  already proven by Qdrant adoption v1 tests.

---

## 4. External adoption matrix

### A. Avatar stack

| Candidate | Status | Adoptable? | Notes |
|---|---|---|---|
| `@pixiv/three-vrm` | Actively maintained, v3.5.1 as of early 2026, ~26k weekly npm downloads, MIT-like OSS | **Adopt as core** | Official pixiv library. Works with Three.js r176+. Has react-three-fiber examples. |
| VRM 1.0 file format | Open standard (by VRM Consortium / Vket) | **Adopt** | Model format the avatar component consumes. |
| `three` / `react-three-fiber` | Ubiquitous, stable | **Adopt** | Next.js integration requires dynamic import / `'use client'` boundary — standard pattern, not a blocker. |
| `pixiv/local-chat-vrm` | Public demo for Google I/O 2025 | **Reference only** | Useful as a UX reference for voice-chat avatar loop; not intended to be vendored. |
| `zoan37/ChatVRM`, `camenduru/ChatVRM-LocalAI` | Older community demos | **Reference only** | Architecture study; pixiv's local-chat-vrm supersedes these as the current reference. |
| VRoid Hub API | Requires pixiv app registration | **Deferred decision** | Useful for pulling public community avatars later; not on the critical path for MVP. Admin-uploaded VRM is simpler phase 1. |
| VRoid Studio / Mobile | End-user authoring tools | **Out of runtime** | Owner / users create VRMs here offline and upload them; no runtime dependency. |

**Decision fork (open, for founder):** whether Phase-5 avatar loads
admin-uploaded VRMs only (local-first, zero third-party auth) or also
pulls from VRoid Hub (wider avatar selection, adds an OAuth dependency).
Recommendation: MVP is admin-upload-only; VRoid Hub is a later slice.

### B. Librarian / ingestion stack

| Candidate | License | Adoptable? | Notes |
|---|---|---|---|
| Existing WiseTutor URL ingestion v1 | in-repo | **Reuse, generalize** | Single-URL path; SSRF-gated. Needs a crawl-lite wrapper. |
| Existing WiseTutor PDF preflight v1 | in-repo | **Reuse** | Preflight classifier already rejects encrypted / image-only / malformed. |
| `crawl4ai` | Apache-2.0 | **Strong candidate** | LLM-friendly crawler, outputs markdown, ~58k stars. Good fit for "goal → page set" acquisition. |
| `crawlee-python` (Apify) | Apache-2.0 | **Alternative** | Downloads HTML + PDF + images. Has Playwright integration. Heavier than needed for MVP. |
| `Scrapy` | BSD-3 | **Overkill** | Full scraping stack; more than a tutor needs. |
| `MechanicalSoup` | MIT | **Fallback** | Tiny; fine for deterministic single-page fetches if we avoid crawl4ai. |
| Open-book sources (OpenStax, MIT OCW, Project Gutenberg, arXiv for technical, Wikibooks) | Each permissive | **Allowlist, tier-1 candidates** | Librarian MVP should search a founder-approved allowlist before going open-web. |
| Google / Bing search APIs | Commercial | **Deferred** | Out of scope for free-first; revisit only if allowlist is insufficient. |
| Commercial textbooks / paid PDFs | N/A | **Link-only** | Provide purchase links; never attempt to acquire. |

**Licensing/copyright boundary (must survive to SSOT):** the librarian
may download material ONLY if the source URL's license is
`public-domain | cc0 | cc-by | cc-by-sa | mit | bsd | apache | gfdl |
openstax-unless-stated-otherwise | arXiv (pre-prints)`. Ambiguous
license → treat as paid: link only. This is a hard rule, not a heuristic.

### C. Voice / avatar interaction

| Path | Status | Decision |
|---|---|---|
| STT via `faster-whisper` + browser Web Speech | Proven, tier-1 audible | Reuse |
| TTS via Piper + browser `speechSynthesis` | Proven, tier-1 audible | Reuse |
| Push-to-talk chat loop | `useVoiceTurn` + `useVoiceTurnProduction` landed | Reuse |
| Avatar lip-sync from Piper WAV | Not built | Phase 5 slice |
| Avatar expression from assistant-message metadata | Not built | Phase 5 slice |
| Continuous / duplex / barge-in | Out of scope | Deferred |

**Recommendation:** Phase 1 of avatar work should present the avatar and
drive it from the EXISTING PTT loop (no new voice infra). Expression
and lip-sync sync can be a second slice once the avatar mounts.

**v2: MVP voice/avatar mode decision fork (unsettled — founder call):**

| Mode | What user gets on day 1 | Infra cost | Recommendation |
|---|---|---|---|
| **text-first + avatar presence** | Avatar renders + idle animates; chat stays text-only | Lowest (no voice consumer changes) | **Default recommended** — lowest regression risk to the Phase-5 voice lane; avatar ships proven before adding voice binding |
| **text + TTS only (one-way speak)** | Avatar speaks assistant replies via existing Piper TTS; user still types | Medium (adds lip-sync driver reading Piper WAV) | Acceptable if Piper WAV→viseme mapping can ship within slice budget |
| **full duplex voice from day one** | User talks to avatar via existing STT, avatar replies via TTS + lip-sync + expression | Highest; requires expression-metadata contract from the chat pipeline and barge-in semantics | Not recommended for MVP — couples two unfinished unknowns |

Per CLAUDE.md evidence tiers, the default recommendation ships the
avatar at Tier-2 with presence only, then promotes voice bindings one
at a time. Founder picks the mode before Phase 4 code starts.

---

## 5. SSOT update draft (proposed insertions)

These are the exact additions to make against the existing docs. They
are not yet committed to SSOT.md in this run — they are the draft that
the next SSOT-edit slice should apply verbatim.

### 5.1. SSOT.md — append under "What is NOT yet proven / not built"
```
- Knowledge-page AI Librarian mode (goal elicitation → free-first
  content acquisition → ingest under caller's KB).
- Interactive avatar tutor (VRM-based, admin-curated catalog,
  voice loop over the existing PTT substrate).
- Pod-based parallel execution for this product phase.
```

### 5.2. ROADMAP.md — add sequential phases
- Phase 7 — AI Librarian MVP (builds on URL ingestion v1 + PDF v1 +
  Qdrant v1).
- Phase 8 — Avatar Tutor MVP (builds on Phase 5 voice substrate;
  admin-upload VRMs only).
- Phase 9 — Avatar catalog / admin ops + VRoid Hub (optional).

### 5.3. DECISIONS_LOG.md — add the planning-pass entry
- Date-stamped 2026-04-15 planning pass recording the adoption shortlist
  (three-vrm, crawl4ai, allowlist open-book sources) without committing
  to them as final dependencies. Final adoption decisions require a
  separate intake + decision entry per the governance rules.

Nothing in 5.1–5.3 promotes intent to proof.

---

## 6. Pod structure (paper only, not active)

| Pod | Mission | Scope | Depends on | Blockers | Must prove before build |
|---|---|---|---|---|---|
| **A. Stabilization** | Close current stabilization edge and keep CI green | `tests/services/test_model_catalog.py::test_load_syncs_existing_active_profiles_from_env` + any regression that appears during parallel pod work | Nothing | Nothing | Already the smallest-surface lane; ready to run. |
| **B. Librarian UX** | Knowledge-page librarian bubble + Q&A dialog + recommendation surface | `web/app/(utility)/knowledge/*` (split page.tsx if needed), new `<LibrarianChat>` component, state model for the goal/outcome/depth fields | Pod C for the acquire endpoint contract | Founder-approved UX spec | Mock contract with Pod C agreed before first PR |
| **C. Librarian Ingestion** | Backend planner + free-first acquisition + license gate | New `deeptutor/services/librarian/` (plan, search, acquire, gate), `/{kb}/librarian/*` router endpoints, reuse `url_fetch` + pdf_preflight, extend to crawl-lite | URL ingestion v1, PDF v1, Qdrant v1 | Allowlist not yet defined | Founder signs allowlist + license policy |
| **D. Avatar Runtime** | VRM viewer, pose, expression, TTS-driven lip-sync, voice loop integration | New `web/components/avatar/` (VRM canvas + hooks), uses `@pixiv/three-vrm` + `@react-three/fiber` | Phase 5 voice substrate | `@pixiv/three-vrm` + three + r3f dependency adds require a DECISIONS_LOG entry before merge | Adoption decision recorded before the first dependency PR |
| **E. Admin & Avatar Catalog** | Owner-only admin surface to upload / enable / disable avatars, per-user default avatar preference | `AdminPanel` sibling route, new `data/avatars/` storage, `/api/v1/avatars/*` router | Pod D's VRM contract | None | Storage schema + owner-only authz contract agreed with Pod A |
| **F. OSS Adoption / Licensing Review** | Hard licensing boundary + adoption-candidate verification | No code; produces `DECISIONS_LOG` entries + a `LICENSING_POLICY.md` | Nothing | Needs founder input on commercial-content policy | Policy doc ratified before Pod C ingest builds |

**Pods B/D/E cannot run in true parallel with each other on a code
surface — they must coordinate on contracts first.** Pods A, C, F can
run in parallel with B+D because they touch disjoint surfaces.

---

## 7. Phase plan (revised, evidence-gated)

- **Phase 0 (running):** preserve current repo truth. Stabilization pod
  closes model-catalog red case. No new surface shipped.
- **Phase 1:** SSOT + contracts + UX specs. This file is the seed;
  doc-only PRs add the librarian UX spec + the avatar UX spec + the
  licensing policy. No runtime code.
- **Phase 2:** Knowledge librarian MVP (planner + allowlist + free
  fetch + ingest). Behind a user-toggle.
- **Phase 3:** Ingestion pipeline hardening (crawl-lite, license gate
  enforcement, paid-link handling). Still behind the toggle.
- **Phase 4:** Avatar tutor MVP (one admin-uploaded VRM, voice-loop
  integrated, hidden behind a feature flag).
- **Phase 5:** Admin catalog / multi-avatar / per-user default avatar.
- **Phase 6 (optional):** VRoid Hub integration.

Each phase exit requires Tier-1 or Tier-2 evidence per CLAUDE.md; each
phase entry requires a PROJECT_INTAKE entry per DELIVERY_PIPELINE.md.

---

## 8. Implementation gates (must be true before coding starts)

1. Founder ratifies **licensing policy** (free-only whitelist, paid =
   link-only, no auto-purchase, no credential-required sources).
2. Founder ratifies **VRM adoption** (approve `@pixiv/three-vrm` +
   `three` + `@react-three/fiber` as new deps; log the entry).
3. Founder ratifies **crawler adoption** (approve `crawl4ai` OR
   stick with extended `url_fetch` + `httpx`; log the decision).
4. Librarian UX spec (Pod B ↔ Pod C contract) is a file in the repo.
5. Avatar UX spec (Pod D ↔ Pod E contract) is a file in the repo.
6. `LICENSING_POLICY.md` is a file in the repo.
7. Stabilization pod has tests/services/test_model_catalog.py
   green before Phase 2 work begins.

Until all seven are true, no runtime code for librarian or avatar
merges into `bootstrap/wisetutor-baseline`.
