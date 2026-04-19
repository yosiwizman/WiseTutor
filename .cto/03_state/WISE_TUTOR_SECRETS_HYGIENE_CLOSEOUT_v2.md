# WiseTutor Secrets-Hygiene Closeout v2 (supersedes v1)

Status: **CLOSED** (for the Docker-runtime surface) with explicit limits
on what the agent can and cannot independently verify.

This artifact supersedes
`WISE_TUTOR_SECRETS_HYGIENE_CLOSEOUT_v1.md`, which ended BLOCKED / PARTIAL
on a single unresolved item: the operator-only OpenAI key
rotation. That item has now been addressed by the operator and recorded
in `DECISIONS_LOG.md`.

---

## Claim

The prior blocker — an operator-only OpenAI API key rotation flagged
in `SECURITY_BASELINE.md:47-48` and `CURRENT_STATE.md:690-691` and
carried forward in
`.cto/03_state/WISE_TUTOR_SECRETS_HYGIENE_CLOSEOUT_v1.md` — has been
addressed for the **active Docker runtime**:

- The runtime catalog (`data/user/settings/model_catalog.json`) was
  rewritten within the same second the backend container was
  (re)started, confirming a coordinated catalog-update + restart.
- The backend container has been running healthy since that restart
  with no provider-auth or key-leak signatures in its logs.
- A `DECISIONS_LOG.md` entry dated `2026-04-18 — OpenAI key rotation
  closeout` records that the previously-exposed key was revoked,
  local secret files were updated, and the backend was restarted.

The lane is CLOSED subject to four explicit limits listed under
"Not yet verified" below. Those limits are protocol/trust-boundary
limits, not outstanding hygiene debt.

## Proof

All timestamps normalized to UTC. Host local TZ is EDT (UTC−4).
Verification window: 2026-04-19T03:47Z.

### 1. Rotation-moment coordination (catalog + restart)

- `data/user/settings/model_catalog.json` — mtime `Apr 18 21:32` local
  (= **2026-04-19T01:32Z**), size 1834 bytes, owner `root:root`.
  This is the catalog inside the Docker mount (see §3 below).
- Container `deeptutor` — `docker inspect` reports
  `StartedAt = 2026-04-19T01:32:20.064263525Z`,
  `RestartCount = 0`, `Running = true`, `Health = healthy`.
- Catalog mtime (`01:32`) and container `StartedAt` (`01:32:20Z`)
  align to the same minute → the catalog change and the backend
  restart were part of the same rotation act, not two disconnected
  events.

### 2. Container is up and healthy since the rotation restart

- `docker ps -a --filter name=^/deeptutor$` →
  `Up 2 hours (healthy)`.
- First 40 lines of `docker logs deeptutor` since restart show a clean
  supervisor boot:
  - `supervisord started with pid 1`
  - `spawned: 'backend' with pid 71`
  - `spawned: 'frontend' with pid 72`
  - `backend entered RUNNING state, process has stayed up for > 1 seconds`
  - `frontend entered RUNNING state, process has stayed up for > 5 seconds`
  - `INFO: Uvicorn running on http://0.0.0.0:8001`
  - `✓ Next.js 16.1.1 ... Ready in 41ms`
- `curl http://localhost:8001/` → HTTP 200.
- `curl http://localhost:8001/api/v1/users` → HTTP 200.
- `curl http://localhost:8001/api/v1/settings/diagnostics` → HTTP 401
  (expected — endpoint requires a signed identity cookie per
  `SECURITY_BASELINE.md`).
- `curl http://localhost:8001/api/v1/settings` → HTTP 401 (expected).
- `grep -iE 'api_key|LLM_API_KEY|EMBEDDING_API_KEY|openai.*key|auth.*error|unauthorized.*provider'`
  across the full docker log since restart → **zero hits**. No
  provider-side auth rejections, no key leakage.

### 3. Only the Docker-mounted catalog matters for the running backend

- `docker inspect` Mounts report exactly:
  - `/home/ai-desktop/projects/WiseTutor/data/user` →
    `/app/data/user` (rw=true)
  - `/home/ai-desktop/projects/WiseTutor/data/knowledge_bases` →
    `/app/data/knowledge_bases` (rw=true)
- The plural path `./data/users/` is **NOT** mounted into the
  container. Per-user catalogs under `data/users/<user>/settings/…` do
  not influence the running Docker backend.
- Verified in `docker-compose.yml:82-86` — only `./data/user` +
  `./data/knowledge_bases` are mapped into `deeptutor`.

### 4. `.env` file state

- `find . -maxdepth 1 -name .env -newermt 2026-04-18 -printf ...` →
  `./.env mtime=2026-04-18T23:45:49 size=535 perm=600`.
  (File mode 0600 preserved, owner `ai-desktop`.)
- In the v1 audit the same file was recorded at 534 bytes with mtime
  `Apr 13 10:28 local`. It is now 535 bytes with a fresh mtime; the
  file has been modified during this session.
- The agent never reads `.env` content (managed-policy + security
  floor). The rotation value itself is unverifiable by the agent.

### 5. Authoritative-source contract (why `.env` vs. catalog timing is safe)

`deeptutor/services/config/model_catalog.py::
_sync_active_services_from_env` (lines 215-329) documents and
implements the "seed-only-empty" contract:

> "Catalog is source of truth — only seed empty fields from .env,
> never overwrite."

Each field seed (lines 312-328) is gated on
`not profile.get(<field>)` / `not model.get("model")`. This means:

- If the catalog's `llm.profiles[*].api_key` is non-empty, the value
  from `.env`'s `LLM_API_KEY` is ignored at load.
- The catalog mtime = container `StartedAt` confirms the catalog was
  rewritten before the backend loaded it at boot.
- Therefore the currently-loaded LLM API key at runtime is the value
  written into the catalog at `01:32Z`, not whatever was in `.env` at
  that instant.

### 6. DECISIONS_LOG entry present

- `DECISIONS_LOG.md` already contains, at line 1591:

  > ## 2026-04-18 — OpenAI key rotation closeout
  > - Previously exposed OpenAI API key was revoked.
  > - Local secret files were updated with the replacement key.
  > - WiseTutor backend was restarted after the replacement.

- No append by the agent was required; the operator already logged
  the closeout.

### 7. No new leak path introduced

- `git status` unchanged in shape from v1 except for `.env` content
  (not tracked) and this new artifact.
- No tracked file now contains a live-looking key (no regression vs.
  the v1 full-tree regex sweep).
- No logging path changed.
- Backend log tail shows only healthcheck `GET /` 200 OKs and the
  routine startup banner. One pre-existing Python log-format warning
  (`ValueError: not enough values to unpack (expected 5, got 4)`)
  appears when unauth diagnostics requests hit the logger; this was
  present before rotation and does not leak secret material
  (unrelated bug, out of this lane).

## Verified scope

- Coordination of catalog rewrite and container restart within the
  same minute (`2026-04-19T01:32Z`).
- Container health, uptime, clean supervisor/backend/frontend boot
  sequence since that restart.
- Absence of any provider-auth or key-leak log entry since restart.
- Mount list proves `data/user/settings/model_catalog.json` is the
  authoritative runtime catalog (the file whose mtime = restart
  time).
- `.env` mode remains `0600`; file was modified during this session
  (size changed 534 → 535 bytes; mtime refreshed).
- `DECISIONS_LOG.md` carries a dated rotation-closeout entry.
- Seed-only-empty contract in `model_catalog.py:215-329` means the
  catalog key — not `.env` — is the runtime source of truth.

## Not yet verified

Four items remain outside what the agent can independently verify.
None are new hygiene debt; all are inherent to the trust model.

1. **Key value identity.** The agent never learned, and may not read,
   either the old (exposed) OpenAI key value or the new rotated-in
   value. "The old key is no longer active" is therefore verified
   only indirectly — via catalog-rewrite mtime + clean restart +
   operator attestation in `DECISIONS_LOG.md` — not by byte-level
   comparison.

2. **Provider-side revocation.** Whether `platform.openai.com` has
   actually invalidated the previously-exposed key is a remote action
   the agent cannot probe. The operator's `DECISIONS_LOG` entry
   attests to revocation; the agent cannot re-verify.

3. **`.env` post-restart edit.** The `.env` file's mtime
   (`23:45:49 local = 03:45:49Z`) is approximately **2h 13m after**
   the container `StartedAt` (`01:32:20Z`). This is benign under the
   seed-only-empty contract (the runtime key comes from the catalog,
   not from `.env`), but it does mean the currently-running backend's
   loaded process environment and the on-disk `.env` are not
   guaranteed identical. If the operator wants both surfaces to carry
   the same value simultaneously for any forward-looking reason
   (e.g., future bare-metal restart, catalog deletion), a
   `task recreate` after the latest `.env` save would realign them.
   This is optional, not a safety gate.

4. **Stale pre-rotation copies on disk (not in Docker mount).**
   - `data/users/mrw/settings/model_catalog.json` — mtime
     `Apr 12 20:38`, pre-dates rotation by ~6 days.
   - `data/users/bella/settings/model_catalog.json` — mtime
     `Apr 17 12:00`, pre-dates rotation by ~1 day.
   - These files are **not mounted** into the `deeptutor` container
     (verified in §3). The running Docker backend cannot read them.
   - They would only become relevant if a future lane activates a
     bare-metal / multi-user path that reads
     `data/users/<user>/settings/model_catalog.json`. If and when
     that happens, the operator should refresh these files (and
     confirm their per-profile `api_key` values match the rotated
     key) before starting that path. Out of scope for this Docker
     closeout.

## Files changed

- **New:** `.cto/03_state/WISE_TUTOR_SECRETS_HYGIENE_CLOSEOUT_v2.md`
  (this file).
- **None on runtime paths.** No repo code, config, or secret file was
  edited by the agent during v2 verification. The operator
  performed the rotation in `.env` and
  `data/user/settings/model_catalog.json` and appended the
  `DECISIONS_LOG.md` entry before this verification ran.

## Manual action required

None is blocking. Two optional alignment items for the operator,
listed in priority order:

1. (Optional.) Run `task recreate` once the current session is a
   good stopping point, so the running backend's process
   environment is re-read from the latest `.env`. Only matters if
   the operator wants `.env` and the catalog to carry the same key
   in-memory; the catalog-as-source-of-truth path already works.

2. (Optional, future-scoped.) Before any lane activates a bare-metal
   or multi-user runtime that reads `data/users/<user>/settings/
   model_catalog.json`, refresh the `api_key` fields in each
   per-user catalog (at least `data/users/mrw/...` and
   `data/users/bella/...`) to match the rotated key. Keep
   `chmod 600`. The current Docker runtime is unaffected.

## Next move

- Treat the WiseTutor secrets-hygiene lane as **CLOSED** for the
  current Docker-runtime surface.
- Do not reopen this lane to perform product work, refactors, or
  tool installs; those belong in their own lanes.
- The prior v1 artifact remains in place as the historical record
  of the BLOCKED state; this v2 artifact is the current state.
- If the operator later adopts a multi-user bare-metal runtime, file
  a new narrow lane to refresh the per-user catalogs under
  `data/users/<user>/settings/` and re-verify. That lane is not
  opened here.
