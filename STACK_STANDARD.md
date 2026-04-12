# STACK_STANDARD — WiseTutor

Primary stack, allowed fallbacks, and banned patterns. Deviations require a
DECISIONS_LOG entry before they land.

## Primary stack (what we build on)

| Area | Primary |
|---|---|
| Backend language | Python 3.12 |
| Backend framework | FastAPI + Uvicorn + WebSockets |
| Package manager (Py) | pip + `pyproject.toml` editable install |
| Frontend | Next.js 16, React 19, TypeScript |
| UI | Tailwind CSS (tokens via `[var(--...)]`) |
| Local LLM | Ollama (qwen2.5:72b, nomic-embed-text) |
| Cloud LLM | OpenAI (gpt-5.4 / gpt-5 / gpt-4o / gpt-4o-mini), Anthropic (claude-opus-4-6 / sonnet-4-6 / haiku-4-5) |
| Embeddings | Ollama nomic-embed-text (local-first) |
| Session store | SQLite under `data/user/sessions/` |
| Memory store | Two-file system (PROFILE.md, SUMMARY.md) behind identity guard |
| Python tests | pytest + pytest-asyncio |
| E2E tests | Playwright (Chromium headless shell) |
| Runtime proof | Server-emitted runtime event + per-message chip |

## Fallbacks (allowed when primary is unavailable)

- **LLM provider**: if the user's preferred cloud provider is down, the
  composer picker may switch to any other configured profile. Fallback is
  explicit, not silent.
- **Search**: DuckDuckGo is the default fallback provider; Brave is an
  option when a Brave API key is configured.
- **Embeddings**: OpenAI text-embedding-3-large is acceptable as a
  last-resort fallback if Ollama nomic-embed-text is unavailable. Record
  the switch in DECISIONS_LOG.

## Banned patterns

- Silent cross-provider fallback. If provider A fails, we must tell the user
  — we do not quietly route to provider B behind their back.
- Using model self-report ("I am GPT-4") as proof of anything. Only backend
  runtime metadata counts.
- Landing product business logic in upstream DeepTutor code paths that we
  would need to re-apply on every merge. Product logic lives in WiseTutor-
  owned files or behind clear extension points.
- Writing identity claims into PROFILE.md or SUMMARY.md. The memory guard
  must reject/redact them; bypassing the guard is not allowed.
- Auto-refreshing memory on every turn. Disabled by default; enabling it
  requires a DECISIONS_LOG entry.
- `--no-verify`, `--force`, `--force-push`, `git reset --hard` without
  explicit owner approval in the working session.
- Committing secrets. `.env`, `*.key`, `*credentials*.json`, `data/user/`
  are `.gitignore`d; a pre-commit grep for common key prefixes is expected.
- Introducing new dependencies without updating `STACK_STANDARD.md` and
  `DECISIONS_LOG.md` in the same commit.
- Claiming completion without evidence at the appropriate tier (see CLAUDE.md).

## Testing standard

- Any change that claims to affect runtime behavior must ship with either a
  pytest or Playwright test that would have failed before the change.
- UI changes prefer Playwright with saved screenshot + bounding-box / text
  assertions written to `artifacts/`.
- Provider-routing changes require a real websocket test that captures
  backend runtime metadata — not just a `verify` endpoint call.

## Claude Code usage standard

- Claude Code must read CLAUDE.md before making changes.
- Claude Code must declare evidence tier when claiming something is done.
- Claude Code must update CURRENT_STATE.md in the same commit as a
  meaningful change; DECISIONS_LOG.md when a decision was made.
- Claude Code may not silently change the stack. Adding a new dep, runtime,
  or service requires a DECISIONS_LOG entry in the same commit.
