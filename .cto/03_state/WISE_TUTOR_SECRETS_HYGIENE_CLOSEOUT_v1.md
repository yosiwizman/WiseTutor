# WiseTutor Secrets-Hygiene Closeout v1

Status: **BLOCKED / PARTIAL** — repo-local hygiene audit is clean, but a
documented operator-only OpenAI key rotation remains unresolved. Lane
cannot honestly be closed as complete.

---

## Claim

The WiseTutor repo-local secrets-hygiene surface is clean on every axis
the agent can independently verify from inside the repo: no live-looking
key values are committed, ignore rules cover every known secret-bearing
path, configuration/runtime/task/CI files do not print or interpolate
secrets unnecessarily, and logging/script code only references secret
variables by name or through a masking helper. Repo-local hygiene
required no fixes to close.

The lane is NOT declared complete, because
`SECURITY_BASELINE.md:47-48` and `CURRENT_STATE.md:690-691` explicitly
document an operator-only action that has not been confirmed done in any
`DECISIONS_LOG` entry: an OpenAI API key was exposed on screen in an
earlier session and must be rotated at `platform.openai.com`. That key
may still be live in the operator's local `.env` and
`data/user/settings/model_catalog.json`. This is exactly the STOP
condition described in the lane contract and is only closeable by the
human operator.

## Proof

### Tracked-file surface (what git actually owns)

- `git ls-files | grep .env` → only the templates `.env.example`,
  `.env.example_CN`, and `deeptutor/services/embedding/.env.example`.
  No real `.env`, no `.env.local`, no `web/.env.local`.
- `git ls-files --error-unmatch .env` → NOT tracked.
- `git ls-files --error-unmatch web/.env.local` → NOT tracked.
- `git show HEAD:.env.example` → every secret-bearing field is an
  obvious placeholder: `LLM_API_KEY=sk-xxx`,
  `EMBEDDING_API_KEY=sk-xxx`, `SEARCH_API_KEY=` (empty).
- `git show HEAD:.env.example_CN` → identical placeholder shape
  (`sk-xxx`), Chinese comments only; no values differ from the EN
  template.
- `git show HEAD:deeptutor/services/embedding/.env.example` → every
  provider section uses `your-<provider>-api-key-here` or `sk-...` /
  `sk-your-openai-api-key-here`. No live-shaped value.
- Full-repo regex scan for known live-key prefixes
  (`sk-[A-Za-z0-9]{20,}`, `sk-proj-`, `AIza[0-9A-Za-z_-]{20,}`,
  `ghp_`, `xoxb-`, `AKIA[0-9A-Z]{16}`, `glpat-`,
  `-----BEGIN ... PRIVATE KEY-----`) → **zero matches** across the
  entire repo tree (including untracked `ops/` and `.cto/`).

### Ignore-rule coverage

- `.gitignore:302-305` — `.env` and `.env.*` blocked, with explicit
  allowlist exceptions only for `.env.example` and `.env.example_CN`.
- `.gitignore:9-12, 292` — `data/`, `data/user/`, and
  `data/memory/_quarantined/` blocked. Confirmed via
  `git check-ignore -v data/user/settings/model_catalog.json` →
  matched by rule `data/` at `.gitignore:9`.
- `.gitignore:316-317` — `.security-key`, `logs/security/` blocked.
- `ops/ansible/.gitignore:1-4` — `ops/ansible/.venv/` ignored; confirmed
  via `git check-ignore -v ops/ansible/.venv` → matched by local
  `.gitignore:1`.
- Runtime log files (`logs/backend.log`, `logs/frontend.log`,
  `logs/backend.pid`, etc.) exist on disk but `git ls-files logs/`
  returns nothing — `.gitignore:290` `logs/` covers them.

### Docker / Compose handling

- `docker-compose.yml`, `docker-compose.ghcr.yml`,
  `docker-compose.dev.yml` never contain a hardcoded secret. Every
  secret-bearing variable is either `${VAR}` passthrough or
  `${VAR:-default}` where the default is a non-secret (port, binding
  name, URL). Secrets arrive via `env_file: .env` only.
- `Taskfile.yml::compose-config` (line 41-47) invokes
  `docker compose config --no-interpolate` specifically so the default
  behavior (which DOES interpolate `.env`) cannot leak
  `LLM_API_KEY` / `EMBEDDING_API_KEY` to stdout. An in-task comment
  documents the reasoning. `docs/guide/task-automation.md:84` reiterates
  it.
- Repo-wide grep for any other invocation of
  `docker compose config` / `docker-compose config` → only the two
  references above; nothing else runs the interpolating form.

### Script / test hygiene

- `scripts/test_llm_api.py:39-44, 118` — defines `_mask_key(key)` that
  emits `(empty)`, `****` (≤10 char), or `first6...last4`. Only the
  masked form is ever printed.
- `scripts/test_embedding.py:39-44, 112` — identical mask pattern.
- `scripts/check_install.py:315-367` — reads `.env`, builds a per-key
  presence map, prints only key names with a set/not-set indicator.
  An in-file comment (line 321) states "without revealing values".
- `scripts/audit_prompts.py`, `scripts/_cli_kit.py`,
  `scripts/generate_roster.py`, `scripts/start_tour.py` — grep for
  `api_key|API_KEY|sk-|secret|password|token|bearer` returned no
  secret-printing paths. `start_tour.py:815` only logs the name of the
  file being persisted, not its contents.
- `scripts_local/wt_restore.sh:57-97` — handles `.env` only as file I/O
  (move/copy), applies `chmod 600` to the sidecar, never echoes file
  contents.
- CI workflow `.github/workflows/ci.yml:101-145` — every `api_key`
  field in the seeded `model_catalog.json` is literally
  `"ci-placeholder"` or `"local"` / `"ollama-local"`. Obvious
  non-secrets.
- CI PIN fixtures (`WT_MRW_PIN=2468`, `WT_BELLA_PIN=1357`) are CI-only
  test credentials, documented as such in
  `SECURITY_BASELINE.md:25-27` (default PINs intentionally weak, meant
  to be rotated).

### Logging paths

- `deeptutor/services/llm/config.py:58-68` — `_set_openai_env_vars` logs
  "Set OPENAI_API_KEY env var (%s)" where `%s` is the `source` label,
  never the key value.
- `deeptutor/services/llm/client.py:52-60` — same pattern; only logs
  that the env var was set, not its value.
- `deeptutor/tutorbot/agent/tools/web.py:107, 129, 169` — log
  "BRAVE_API_KEY not set", "TAVILY_API_KEY not set", "JINA_API_KEY not
  set" (i.e., absence warnings). No value ever printed.
- `deeptutor/logging/` (handlers/console, handlers/file,
  handlers/websocket, logger, config) — grep for `api_key`,
  `LLM_API_KEY`, `EMBEDDING_API_KEY`, `authorization` → **zero
  matches**. The unified logging layer does not touch secret fields.

### .secrets.baseline (pre-commit guard)

- `.secrets.baseline` is tracked and configured with the full
  detect-secrets plugin set (AWS, Azure, Base64/Hex entropy, OpenAI,
  GitHub/GitLab tokens, JWT, Stripe, Slack, Twilio, Private Key, etc.).
- `.pre-commit-config.yaml` is tracked and wires the guard.
- The baseline contains two stale allowlist entries that do NOT leak
  any secret (they hold only hashed digests), but reflect drift from a
  prior repo state:
  - `.github/workflows/docker-publish.yml:175` — that file is no
    longer tracked (`git ls-files .github/workflows/` returns only
    `ci.yml` and `launcher-validate.yml`).
  - `web/app/guide/page.tsx:159/161/163` — the file has been moved to
    `web/app/(workspace)/guide/page.tsx` and those exact lines no
    longer contain Base64 strings. The flagged entries were already
    marked `is_secret: false`.
  The stale baseline is noise, not a leak. Rebaselining would require
  running `detect-secrets scan` — deliberately not done in this lane
  so tooling/scope does not widen.

### Dist artifacts

- `dist/wisetutor-macos-launcher.zip` → `unzip -l` shows 7 files:
  `WiseTutor.app/Contents/{MacOS/WiseTutor, Info.plist}`,
  `WiseTutor.command`, `README.txt`. No env material.
- `dist/wisetutor-windows-launcher.zip` → `unzip -l` shows 4 files:
  `WiseTutor.bat`, `WiseTutor.url`, `install-wisetutor.ps1`,
  `README.txt`. No env material.

### Ansible

- `ops/ansible/playbooks/ubuntu-docker-baseline.yml` is verify-only
  (`become: false`). Never reads or templates a secret.
- `ops/ansible/README.md:127` explicitly asserts: "No secrets are read,
  templated, or printed by this playbook."

### Untracked probe

- `phase15_gate_probe.txt` → single ASCII line, `Phase 1.5 gate probe`.
  No secret content.

## Verified scope

- Presence/absence of live secrets in all git-tracked content reachable
  from `git ls-files`.
- Placeholder-only status of every `.env.example*` template.
- `.gitignore` + `ops/ansible/.gitignore` coverage of every known
  secret-bearing path (`.env`, `.env.*`, `data/user/`,
  `data/memory/_quarantined/`, `logs/`, `.security-key`,
  `ops/ansible/.venv/`).
- Docker Compose files: no hardcoded secrets; all secrets arrive
  through `env_file: .env`.
- `Taskfile.yml` + `docs/guide/task-automation.md`: compose-config path
  uses `--no-interpolate` to prevent leakage; no other path runs the
  interpolating form.
- Script-level handling (`scripts/test_llm_api.py`,
  `scripts/test_embedding.py`, `scripts/check_install.py`,
  `scripts/audit_prompts.py`, `scripts/_cli_kit.py`,
  `scripts/start_tour.py`, `scripts_local/wt_restore.sh`): keys are
  masked or referenced by name only.
- CI workflow `.github/workflows/ci.yml`: seeded catalogs use
  `ci-placeholder` / `local` — no live keys.
- Logging substrate (`deeptutor/logging/**`,
  `deeptutor/services/llm/config.py`, `deeptutor/services/llm/client.py`,
  `deeptutor/tutorbot/agent/tools/web.py`): log statements refer to
  secret variables by name only; the `_mask_key` helper is the only
  path that emits any fragment of key material, and only six chars of
  prefix + four of suffix.
- Full repo regex sweep for live-key prefixes: zero hits.
- `.secrets.baseline` plugin list + pre-commit wiring present.
- Dist launcher zips carry only launcher scripts, no env material.

## Not yet verified

- Whether the operator has actually rotated the previously-exposed
  OpenAI key at `platform.openai.com`. No DECISIONS_LOG entry confirms
  rotation. Repo documentation
  (`SECURITY_BASELINE.md:47-48`, `CURRENT_STATE.md:690-691`) still
  flags this as an open action.
- Current plaintext contents of the local `.env` on the operator's
  machine and of `data/user/settings/model_catalog.json`. These paths
  are correctly gitignored, but the managed-policy layer (correctly)
  blocks the agent from reading them, so the agent cannot independently
  confirm whether the exposed OpenAI key is still present in them. That
  check is operator-only by design.
- Runtime log output under `logs/` at this exact instant — files are
  gitignored and not inspected as part of this lane. Logging paths
  audited by source code only.
- Freshness of `.secrets.baseline` against the current tree. The
  baseline is correctly present and wired via pre-commit, but has two
  stale allowlist entries (see Proof → `.secrets.baseline`). Rebaselining
  would require running `detect-secrets scan`, deliberately out of
  scope for this narrow lane.
- The `.secrets.baseline`-style sweep above looked for known live-key
  prefixes and catalog `api_key` fields. High-entropy strings outside
  those prefixes (e.g., custom internal tokens with non-standard
  prefixes, if any) were not independently re-entropied.

## Files changed

None. This lane made no repo edits.

Rationale: every hygiene axis reachable without widening scope already
passes. The only open work is operator-only (real-key rotation), which
is explicitly not something the agent performs.

## Manual action required

1. **Rotate the previously-exposed OpenAI API key at
   `platform.openai.com`.**
   - Revoke the key that was shown on screen in the earlier session
     referenced by `SECURITY_BASELINE.md:47-48` and
     `CURRENT_STATE.md:690-691`.
   - Issue a replacement key.
   - Update `.env` (`LLM_API_KEY` and, if applicable,
     `EMBEDDING_API_KEY`) with the new value. File must remain
     `chmod 600` per `SECURITY_BASELINE.md:46`.
   - Update `data/user/settings/model_catalog.json` in any profile that
     still carries the old key value. File must remain `chmod 600` per
     `SECURITY_BASELINE.md:43-45`.
   - Restart the backend so the new key is picked up.
   - Append a `DECISIONS_LOG.md` entry dated to the day of rotation
     stating "OpenAI key rotated; old key revoked; new key in `.env` +
     per-user catalog(s)." — then this lane can be re-audited and
     closed.

2. (Optional, not blocking.) Rebaseline `.secrets.baseline` after
   rotation, to drop the stale entries for the no-longer-tracked
   `.github/workflows/docker-publish.yml` and the moved
   `web/app/guide/page.tsx`. Requires running `detect-secrets scan
   --baseline .secrets.baseline` (operator decision — outside this
   narrow hygiene lane).

## Next move

- Wait for the operator to perform item 1 above and record the
  DECISIONS_LOG entry.
- After that confirmation, re-run the bounded audit: re-check that the
  rotated key is NOT present anywhere in tracked content; re-check
  `.env` / catalog permissions (`chmod 600`); then this artifact can
  be superseded by a `v2` that drops the BLOCKED label and records
  full closure.
- Optionally refresh `.secrets.baseline` at that time to drop the two
  stale entries.
- Do NOT, in this lane, start any other WiseTutor work. The lane is
  BLOCKED on a human action; nothing else widens.
