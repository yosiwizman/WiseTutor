# WiseTutor

WiseTutor is a product-layer build on top of **HKUDS/DeepTutor** (upstream). It
is being formalized as the owner-controlled repo where the customizations,
governance, and eventual multi-user / multi-profile features live.

Upstream: <https://github.com/HKUDS/DeepTutor>
Product repo: <https://github.com/yosiwizman/WiseTutor>

## Repo purpose

- Own the customized tutoring assistant build (runtime-truth, provider/model
  picker, memory-contamination guard, identity-question interceptor,
  per-message runtime chip, Playwright evidence flow).
- Provide a governed surface for future work: rebrand to WiseTutor, per-user
  namespaces, profile separation (Bella / Mr W), themes, voice (STT/TTS).
- Keep a hard product boundary between upstream behavior and product-specific
  logic. Product business decisions live here, not in the upstream fork.

## Local run context (known good)

- Repo path on the owner's desktop: `/home/ai-desktop/projects/WiseTutor`
- Backend: `python -m deeptutor.api.run_server` on :8001 (module names still
  reference `deeptutor` — rebrand is Phase 1 of the roadmap).
- Frontend: `npm run dev -- --port 3782` from `web/`.
- Local launcher scripts: `scripts_local/{start,stop,status}_deeptutor.sh`.
- Local LLM: Ollama @ localhost:11434 (qwen2.5:72b, nomic-embed-text).

## Doc map (read in this order)

1. [SSOT.md](SSOT.md) — executive truth and canonical links
2. [CURRENT_STATE.md](CURRENT_STATE.md) — what exists right now, honestly
3. [STACK_STANDARD.md](STACK_STANDARD.md) — primary / fallback / banned tools
4. [INSTALL_BASELINE.md](INSTALL_BASELINE.md) — machine software required
5. [AGENT_ROLE_MATRIX.md](AGENT_ROLE_MATRIX.md) — founder vs agent authority
6. [SECURITY_BASELINE.md](SECURITY_BASELINE.md) — secrets, ports, backups
7. [DELIVERY_PIPELINE.md](DELIVERY_PIPELINE.md) — idea → shipped
8. [PROJECT_INTAKE_TEMPLATE.md](PROJECT_INTAKE_TEMPLATE.md) — new-work template
9. [DECISIONS_LOG.md](DECISIONS_LOG.md) — append-only CTO decisions
10. [ROADMAP.md](ROADMAP.md) — phased execution plan
11. [CLAUDE.md](CLAUDE.md) — agent operating contract (MUST READ before any code change)

Upstream's original README is preserved as `DEEPTUTOR_UPSTREAM_README.md`.
