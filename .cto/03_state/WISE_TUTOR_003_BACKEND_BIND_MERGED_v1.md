# WiseTutor 003 Backend Network Bind Restriction — Merged v1

Close date: 2026-04-19
Lane: local merge of
`auto-claude/003-backend-network-bind-restriction` into
`bootstrap/wisetutor-baseline`. No push to origin.

Supersedes: `.cto/03_state/WISE_TUTOR_003_BACKEND_BIND_MERGE_READINESS_v1.md`.

Baseline tip before merge: `c813e67`
  (the prior 005-merge commit).
003 branch tip at merge time: `0005262`
  (the untrack-harness-residue cleanup committed in this lane).
Merge commit: `6712477`
Baseline tip after merge: `6712477` (local only; not pushed).

---

## Claim

Task 003 Backend Network Bind Restriction is now **merged locally**
into `bootstrap/wisetutor-baseline` via merge commit `6712477`
(parents `c813e67` + `0005262`). The merge was no-ff, executed by
git's `ort` strategy with zero conflicts. All seven product files
landed byte-identical to the 003 branch tip — `git diff HEAD
00052625` returns 0 lines for each. Before merging, the two
Aperant harness residue files under
`.auto-claude/specs/003-backend-network-bind-restriction/`
(`build-progress.txt`, `implementation_plan.json`) were removed
from the merge unit via `git rm --cached` on a new cleanup
commit `0005262`, so no `.auto-claude/`-tracked paths landed on
baseline. The Dockerfile container defaults carry `0.0.0.0` at
all three executable sites on the merged baseline; bare-metal
hardening remains on `get_backend_host()`, `wt_start.sh`, and
`GatewayConfig`. The currently-running `deeptutor` container
(`Up 3 hours (healthy)`, StartedAt `2026-04-19T01:32:20Z`) was
not touched. No push occurred.

## Proof

### 1. Residue cleanup before merge

Pre-cleanup `git diff --name-status 29f1b9f..HEAD` on
`auto-claude/003-backend-network-bind-restriction` @ `a00a40b`
still showed:

    A  .auto-claude/specs/003-backend-network-bind-restriction/build-progress.txt
    A  .auto-claude/specs/003-backend-network-bind-restriction/implementation_plan.json

Cleanup commit `0005262 chore(003): untrack .auto-claude/specs/003-*
harness residue before merge` (`git rm --cached` on both files):

    2 files changed, 585 deletions(-)
    delete mode 100644 .auto-claude/specs/003-backend-network-bind-restriction/build-progress.txt
    delete mode 100644 .auto-claude/specs/003-backend-network-bind-restriction/implementation_plan.json

Post-cleanup merge unit on the 003 branch is now exactly the
intended seven product/runtime paths, nothing else:

    M  Dockerfile
    M  deeptutor/api/run_server.py
    M  deeptutor/services/setup/__init__.py
    M  deeptutor/services/setup/init.py
    M  deeptutor/tutorbot/config/schema.py
    M  deeptutor_cli/main.py
    M  scripts_local/wt_start.sh

`.auto-claude/specs/003-*/*` still exist on disk in the worktree
for harness context but are no longer tracked.

### 2. Pre-merge state on baseline

- `git branch --show-current` (primary repo) →
  `bootstrap/wisetutor-baseline`.
- `git log -1 bootstrap/wisetutor-baseline` → `c813e67
  merge(005): session secret rotation with dry-run redaction`.
- Dirty-overlap loop: for each of the seven pre-existing dirty
  tracked paths (`CLAUDE.md`, `DECISIONS_LOG.md`,
  `OPERATOR_RUNBOOK.md`, `dist/wisetutor-macos-launcher.zip`,
  `dist/wisetutor-windows-launcher.zip`, `web/next-env.d.ts`,
  `web/next.config.js`), checked against
  `git diff --name-only c813e67..auto-claude/003-backend-network-bind-restriction`.
  Zero `CONFLICT-RISK` lines printed. The dirty state does not
  intersect the 003 footprint.

### 3. Merge

Command:

    git merge --no-ff auto-claude/003-backend-network-bind-restriction \
        -m "merge(003): backend bind restriction with Docker-safe defaults"

Output:

    Merge made by the 'ort' strategy.
     Dockerfile                           | 20 +++++++++++++++-----
     deeptutor/api/run_server.py          |  7 ++++---
     deeptutor/services/setup/__init__.py |  2 ++
     deeptutor/services/setup/init.py     | 13 +++++++++++++
     deeptutor/tutorbot/config/schema.py  |  2 +-
     deeptutor_cli/main.py                |  4 ++--
     scripts_local/wt_start.sh            |  2 +-
     7 files changed, 38 insertions(+), 12 deletions(-)

No conflict markers were printed. No manual resolution required.
Merge commit shape:

    6712477 merge(003): backend bind restriction with Docker-safe defaults
    parents: c813e67 00052625

No `.auto-claude/`, `.gitignore`, `.env.example`,
`VERIFICATION_REPORT.md`, `test_backend_host.py`, docker-compose
file, or any other path outside the audit-scoped product surface
was touched by the merge.

### 4. Post-merge tree equivalence

For each of the seven 003-touched product files,
`git diff HEAD 00052625 -- <file>` on the merged baseline
returned 0 lines:

    Dockerfile                           → 0
    deeptutor/api/run_server.py          → 0
    deeptutor/services/setup/__init__.py → 0
    deeptutor/services/setup/init.py     → 0
    deeptutor/tutorbot/config/schema.py  → 0
    deeptutor_cli/main.py                → 0
    scripts_local/wt_start.sh            → 0

The merged tree is byte-identical to the 003 branch tip — no
resolver rewrite.

### 5. Docker-runtime-safety invariant on the merged baseline

On `bootstrap/wisetutor-baseline` @ `6712477`:

- `grep -cE "BACKEND_HOST=127\.0\.0\.1|BACKEND_HOST:-127\.0\.0\.1"
  Dockerfile` → `1` — that single remaining match is inside the
  comment at `Dockerfile:115` explaining the bare-metal
  hardening path. No executable container-side default carries
  127.0.0.1.
- `grep "BACKEND_HOST" docker-compose.yml docker-compose.dev.yml
  docker-compose.ghcr.yml` → no output. Compose files unchanged;
  no BACKEND_HOST injection on the compose side.
- The currently-running `deeptutor` container (Docker `ps`:
  `Up 3 hours (healthy)`, `StartedAt = 2026-04-19T01:32:20Z`,
  `RestartCount = 0`) was not touched by this lane. No
  `docker build`, `docker compose up`, `docker restart`, or
  `docker stop` was executed.

### 6. Bare-metal hardening still intact on the merged baseline

- `deeptutor/services/setup/init.py:239`
  `return get_env_store().get("BACKEND_HOST", "127.0.0.1")`
  — bare-metal `get_backend_host()` default.
- `scripts_local/wt_start.sh:22`
  `--host ${BACKEND_HOST:-127.0.0.1} --port ${BACKEND_PORT:-8001}`
  — shell-level default.
- `deeptutor/tutorbot/config/schema.py:105`
  `host: str = "127.0.0.1"` — GatewayConfig default.

Callers `deeptutor/api/run_server.py` and
`deeptutor_cli/main.py::serve` route through
`get_backend_host()`, inheriting the 127.0.0.1 default when no
env override is present.

### 7. No push occurred

- `git push` was not executed.
- `git status` post-merge shows only the same seven pre-existing
  dirty tracked paths (`CLAUDE.md`, `DECISIONS_LOG.md`,
  `OPERATOR_RUNBOOK.md`, two `dist/*.zip` files, `web/next-env.d.ts`,
  `web/next.config.js`). No new modification introduced on
  unrelated files.
- Local tip `6712477` is ahead of any remote-tracked ref by
  this merge + the 003 branch commits. Publication is the
  founder's call per `CLAUDE.md — Git rules`.

## Verified scope

- Residue cleanup: both `.auto-claude/specs/003-*` harness
  files untracked via `git rm --cached` before merge; merge unit
  ends at seven intended product files.
- Merge mechanics: no-ff, `ort` strategy, zero conflicts,
  correct parents (`c813e67` + `00052625`).
- Post-merge tree equivalence vs 003 tip verified byte-for-byte
  across all seven product paths.
- Dockerfile executable defaults on the merged baseline carry
  `0.0.0.0` at all three sites (only comment-line 127.0.0.1
  remains, as designed).
- Compose files unchanged; no hidden BACKEND_HOST injection.
- Bare-metal hardening retained on three expected surfaces.
- Currently-running Docker container unaffected (still healthy,
  uptime continuous since 01:32:20Z).
- No push, no rebase, no force op.
- Seven pre-existing dirty tracked paths remain unchanged.

## Not yet verified

1. **Live Docker rebuild with the merged tree.** Not run in this
   lane — the bounded scope was local-merge only. The Docker-
   runtime safety claim is structural: `ENV BACKEND_HOST=0.0.0.0`
   on the merged tree matches the binding the currently-healthy
   container is already using, and compose publishing
   (`"${BACKEND_PORT:-8001}:${BACKEND_PORT:-8001}"`) is
   unchanged. A confirming rebuild + `--force-recreate` is
   available to the founder as a post-merge belt-and-braces
   step; see "Manual action required" §2.

2. **Bare-metal uvicorn end-to-end.** Only the in-process
   `get_backend_host()` smoke was exercised during the prior
   merge-readiness lane (default → `127.0.0.1`; override →
   `0.0.0.0`). No full bare-metal uvicorn start/stop cycle was
   performed against the merged tree.

3. **Publication to `origin`.** Not performed. Founder-only per
   `CLAUDE.md — Git rules`.

4. **Cleanup of the 003 worktree** at
   `.auto-claude/worktrees/tasks/003-backend-network-bind-restriction/`
   and of the branch
   `auto-claude/003-backend-network-bind-restriction`. Both are
   preserved and not blocking; cleanup via
   `git worktree remove` + `git branch -d` is the founder's
   call.

## Files changed

- **On `bootstrap/wisetutor-baseline` via merge commit
  `6712477` (this lane's merge):**
  - `Dockerfile` (+15 / −5; container defaults
    `0.0.0.0`; inline comment documents bare-metal split).
  - `deeptutor/api/run_server.py` (+5 / −2; uvicorn host
    from `get_backend_host()`).
  - `deeptutor/services/setup/__init__.py` (+2; re-exports
    `get_backend_host`).
  - `deeptutor/services/setup/init.py` (+13; new
    `get_backend_host()` with 127.0.0.1 default).
  - `deeptutor/tutorbot/config/schema.py` (+1 / −1;
    GatewayConfig default 127.0.0.1).
  - `deeptutor_cli/main.py` (+2 / −2; serve command uses
    `get_backend_host()`).
  - `scripts_local/wt_start.sh` (+1 / −1;
    `--host ${BACKEND_HOST:-127.0.0.1}`).
  Totals: 7 files changed, 38 insertions(+), 12 deletions(-).
- **On the 003 branch immediately before merge (commit
  `0005262`):** `git rm --cached` of two harness residue
  files (−585 lines, disk-preserved).
- **On `bootstrap/wisetutor-baseline` working tree
  (uncommitted):**
  - `.cto/03_state/WISE_TUTOR_003_BACKEND_BIND_MERGED_v1.md`
    (new, this document).
- **Not touched by this lane:**
  - `docker-compose*.yml`, `.env.example`, `.gitignore`,
    `VERIFICATION_REPORT.md`, `test_backend_host.py`, any
    `tests/*` file, any dependency manifest.
  - Any Aperant branch other than 003.
  - Any product feature surface.
  - The running Docker container.
  - The seven pre-existing dirty tracked paths.

## Manual action required

Founder-only. None is blocking to declare 003 locally merged.
The following are explicitly deferred:

1. **Push `bootstrap/wisetutor-baseline` to `origin`** when
   ready: `git push origin bootstrap/wisetutor-baseline`. Only
   the founder pushes.

2. **(Optional) Live Docker rebuild as belt-and-braces.** From
   the primary repo:

        sg docker -c "docker compose -f docker-compose.yml build deeptutor"
        sg docker -c "docker compose -f docker-compose.yml up -d --force-recreate"
        curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8001/

   Expected: `HTTP 200`. The current container does not need
   to be rebuilt for product reasons — the merged code matches
   its binding contract — but the founder may want to rebuild
   once to close the structural claim with a live signal.

3. **(Optional) Host-side Docker restriction follow-up.** If
   the founder wants `docker compose up` to publish only on
   host loopback (hardening the Docker path the same way 003
   hardened bare-metal), change
   `docker-compose.yml:30-32` (and the `.ghcr.yml` / `.dev.yml`
   equivalents) port map to
   `"127.0.0.1:${BACKEND_PORT:-8001}:${BACKEND_PORT:-8001}"`.
   That is a separate one-line change and a separate bounded
   lane, not in 003.

4. **(Optional) Worktree + branch cleanup** for
   `auto-claude/003-backend-network-bind-restriction` after
   the founder is satisfied the merge is final.

## Next move

- Task 003 lane is closed locally. Do not reopen unless the
  founder needs a post-merge regression probe.
- The Aperant recovery queue is materially exhausted:
  - **005** → merged (`c813e67`).
  - **003** → merged (`6712477`).
  - **001** → no mergeable unit (audit-classified, no action).
  - **008** → blocked by SSOT + founder-approval gates in
    `DECISIONS_LOG 2026-04-15`; do not merge.
  No further Aperant recovery lane is queued by the original
  audit.
- Do not, in this session, open any new lane (001/008,
  Multica, Archon, CI/CD, product feature slice, secrets
  rotation follow-up, host-side Docker restriction follow-up,
  worktree cleanup). Each of those is its own bounded lane
  to be opened by an explicit next-lane brief.
- Do not push.
