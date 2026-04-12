# SECURITY_BASELINE — WiseTutor

Local-only product today. This file captures the baseline rules.

## User PINs (Phase 2 slice 1)

- PINs are 4 digits. Stored as PBKDF2-SHA256 with a per-user 16-hex-char
  salt and 50k iterations in `data/users.json`. The registry is
  gitignored via `data/`.
- **Default seeded PINs are intentionally weak**: Mr W = `1234`, Bella
  = `5678`. Override on install with `WISETUTOR_DEFAULT_PIN_MRW` /
  `WISETUTOR_DEFAULT_PIN_BELLA`, OR change immediately via
  `POST /api/v1/users/{id}/pin` (requires current PIN).
- `/api/v1/users` never returns `pin_hash` or `pin_salt`. Wrong PIN
  returns HTTP 403 with a vague "invalid credentials" message so a leaked
  response cannot distinguish bad-user from bad-PIN.
- PIN input in the UI is a masked `<input type="password">` with
  `inputMode="numeric"`; the value is sent over HTTP (local only) and
  never logged.

## Secrets handling

- No secret ever gets committed. The following are gitignored:
  - `.env`, `.env.*`
  - `data/user/` (session DB, catalog with api_key plaintext)
  - `data/memory/_quarantined/` (may contain historical PII from chats)
  - any `*.key`, `*credentials*.json`
- Catalog storage for API keys is **plaintext in
  `data/user/settings/model_catalog.json`** on this baseline. Keep that file
  at `chmod 600`. Move to env-indirection / OS keyring in a later phase.
- The `.env` is `chmod 600` and lives in the repo root. Do not share.
- An earlier session exposed an OpenAI key on screen; that key must be
  rotated at platform.openai.com before it is reused in shared contexts.
- Keys must never be echoed into test output, screenshots, or log files.
  Playwright viewports crop around chat content; Settings screenshots should
  not show the Catalog JSON editor expanded with key text.
- The Anthropic key is read from the `ANTHROPIC_API_KEY` environment
  variable on this machine; document-but-never-echo.

## Local ports

| Port | Service | Binding |
|---|---|---|
| 8001 | FastAPI backend (WiseTutor) | `0.0.0.0` (localhost access only, unless firewalled) |
| 3782 | Next.js dev server (WiseTutor) | `0.0.0.0` (dev only) |
| 11434 | Ollama | localhost |

Backend binds `0.0.0.0` today for convenience. That means another device on
the LAN can reach it if the host is exposed. Before exposing WiseTutor
outside the host, restrict bind to `127.0.0.1` or add an auth layer.

## Local-only vs remote exposure

- WiseTutor is **local-only** today. No reverse proxy, no auth, no TLS.
- Any plan to expose WiseTutor on the LAN, via ngrok/cloudflared, or to
  another user's machine must land in DECISIONS_LOG first and add at
  minimum: auth, TLS, per-user namespaces (Roadmap Phase 2).

## Backups & artifacts

- Evidence artifacts live under `artifacts/<purpose>/<utc-timestamp>/` and
  are gitignored. Regenerate locally as needed.
- Quarantined memory lives under `data/memory/_quarantined/<utc-timestamp>/`
  and is also gitignored. It contains raw chat-derived content and must not
  be shared.
- SQLite session DB: `data/user/sessions/` — gitignored; back up manually
  if a session is worth preserving.
- The only durable source of truth for the repo is `git`. Anything in
  `data/user/` or `artifacts/` is treated as ephemeral.

## Remote access

- No remote access is provisioned in this baseline.
- SSH into the owner's desktop is owner-only and out of scope for this repo.

## Incident playbook (minimum)

1. If a key leaks: rotate at the provider, invalidate the old one, edit the
   catalog/`.env`, restart backend, add a DECISIONS_LOG entry noting what
   was rotated and when.
2. If the memory becomes contaminated again: `POST /api/v1/settings/memory/quarantine`
   from Settings → Runtime Truth → "Quarantine & reset," or run the same
   endpoint via curl. The old PROFILE/SUMMARY are preserved under
   `data/memory/_quarantined/<ts>/` for forensic review.
3. If a suspect dependency appears in `package.json` or `pyproject.toml`
   that was not introduced by the owner: revert, audit diff, log.

## What the agent MUST NOT do here

- Print, log, or embed any API key.
- Push secrets to the remote even if `.gitignore` was bypassed.
- Disable the memory identity guard.
- Re-enable `DEEPTUTOR_MEMORY_AUTO_REFRESH` without an explicit owner
  DECISIONS_LOG entry.
