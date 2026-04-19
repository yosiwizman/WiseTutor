# WiseTutor Bella PIN Rotation Closeout v1

Close date: 2026-04-19
Lane: operator-led rotation of Bella's child PIN off the
factory default `5678`. Agent-guided; zero secret handling by
the agent.
Baseline tip: `bootstrap/wisetutor-baseline` @ `d028cd7`
(unchanged by this lane).
Live runtime: `deeptutor` container, unchanged.

---

## Claim

Bella's child PIN has been rotated off the factory default
`5678` via the owner-override curl path. The operator performed
the rotation out-of-band with a `read -s`-gated command block
that never echoed either PIN to terminal history or disk. The
server confirms the rotation with three independent
discriminators: `POST /api/v1/users/switch {bella,5678}` → 403,
`GET /api/v1/users` now reports `bella pin_is_default=False`,
and the container admin log carries
`admin_action ok action=pin_reset actor=mrw target=bella`.
Every common default candidate (`5678`, `1234`, `0000`, `1111`,
`4321`, `1357`) is now rejected for Bella. Mr W's prior
rotation remains intact. Lane **CLOSED** for Bella.

## Proof

All probes ran against the live `deeptutor` container at
`http://localhost:8001`.

### 1. Operator's own curl output (reported in the preceding turn)

    Mr W current PIN: (hidden, read -s)
    New Bella PIN (4 digits): (hidden, read -s)
    switch HTTP 200
    bella pin change HTTP 200

Both HTTP codes are 200 — the owner switched in cleanly and the
owner-override `POST /api/v1/users/bella/pin` was accepted by
the backend. The operator finished with
`unset MRW NEW; rm -f /tmp/wt-bella.jar; history -c` per the
instructions, so no PIN value and no cookie jar were left on
disk or in shell history.

### 2. Old PIN rejected

    POST /api/v1/users/switch {"user_id":"bella","pin":"5678"}
    → 403

Pre-rotation (captured before the successful attempt): the same
probe returned 200. The flip 200 → 403 is proof that `set_pin`
ran with a new hash.

### 3. Defense-in-depth sweep

    bella pin=5678 -> 403
    bella pin=1234 -> 403
    bella pin=0000 -> 403
    bella pin=1111 -> 403
    bella pin=4321 -> 403
    bella pin=1357 -> 403  (the CI fixture value)

No common default candidate is now a valid credential for
Bella.

### 4. `pin_is_default` flag flipped

    GET /api/v1/users
    → mrw:   pin_set=True pin_is_default=False role=owner
    → bella: pin_set=True pin_is_default=False role=child

Per `deeptutor/services/users/user_service.py:350-359`,
`set_pin` is the only code path that toggles
`pin_is_default=False` on an existing user, and it only runs
when either the target's own PIN (self-rotation) or the
owner's own PIN (owner-override) was verified first. The flag
transition therefore implies the rotation went through the
validated path.

### 5. Server admin log confirms owner-override

    docker logs deeptutor | grep -iE "pin_reset|owner_override"
    → admin_action ok action=pin_reset actor=mrw target=bella

This line is emitted only at `deeptutor/api/routers/users.py`
in the `change_pin` handler's owner-override branch, AFTER
the owner-PIN verification and `set_pin` have succeeded
(lines ~265-270). The absence of any `admin_action denied
…reason=bad_owner_pin` line for this actor/target pair in the
same log window confirms Mr W's current PIN was accepted on
the first try in this successful attempt.

### 6. Mr W's prior rotation is untouched by this lane

`mrw.pin_is_default=False` remains from the earlier owner-PIN
rotation closeout, and the factory-default sweep
(`mrw pin=1234` → 403, documented in the prior closeout
artifact) still holds. This lane did not touch Mr W's PIN.

### 7. Diagnostic note (why the earlier `rotated` signals failed)

The first two `rotated` replies from the operator reported
success, but server-side probes showed Bella still on the
factory default. Container log inspection confirmed: no
`POST /api/v1/users/bella/pin` request had reached the backend
in those attempts. The third attempt used the curl path
explicitly, which produced the `HTTP 200` operator-side
receipt and the `admin_action ok action=pin_reset` audit line.
The AdminPanel-side failure mode from the earlier attempts
was not root-caused in this lane (candidates: owner-PIN field
client-side validator aborting silently, stale cookie, or
browser quirk) — **filed as a separate follow-up only if the
operator observes it repeatably; not in this lane's scope**.

### 8. Agent secret-handling discipline

- No curl command the agent executed carried either PIN value.
  The probe curls carried only factory defaults (all doomed to
  fail).
- No PIN value — Mr W's current, Bella's new, or any other —
  appears in this artifact, in
  `.cto/03_state/last_evidence.json`, in any other
  `.cto/03_state/*.md`, or in any file the agent has written
  this session.
- The operator's curl output is quoted above only by HTTP
  status code; the two `read -s` prompts wrote nothing to
  stdout.

## Verified scope

- Server rejects old PIN `5678` and every weak default
  candidate for Bella.
- Server flag `bella.pin_is_default` transitioned `True →
  False`, a state change gated by a successful `set_pin`.
- Container admin log records the successful owner-override
  `pin_reset` with `actor=mrw target=bella`.
- Mr W's prior rotation intact.
- No agent-side secret handling; no code edited; no commit;
  no push; no rebuild; no force op.
- Rotation went entirely through existing documented
  endpoints: `POST /api/v1/users/switch` +
  `POST /api/v1/users/{id}/pin` (owner-override branch).

## Not yet verified

1. **"New Bella PIN succeeds" signed by the agent.** The
   agent cannot verify a positive sign-in without learning
   the new PIN. Operator-side authoritative confirmation is
   the `HTTP 200` line from their `bella pin change` curl
   call — already reported. If desired, the operator can do a
   fresh sign-in as Bella in a browser to double-check.
2. **PIN hash strength.** PBKDF2-SHA256 + per-user salt + 50k
   iterations per `SECURITY_BASELINE.md:22-24`. Not re-proven
   here.
3. **Root cause of the earlier two AdminPanel failures.** The
   AdminPanel code path
   (`web/app/(utility)/settings/AdminPanel.tsx::resetPin`)
   hits the same endpoint as the curl path, so the most
   likely explanation is a client-side validator abort
   (empty/short `ownerPin` field) that surfaced a soft
   `setErr(...)` the operator didn't notice. Not confirmed
   and not investigated in this lane — would need a fresh
   repro with DevTools.
4. **Operator shell hygiene.** The `history -c` + `unset` +
   `rm -f /tmp/wt-bella.jar` finish was part of the
   instructions; actual execution is the operator's. If any
   terminal recorder or `~/.bash_history` was live, residue
   may still exist on that host.
5. **Publication to `origin`.** Not performed; founder-only
   per `CLAUDE.md — Git rules`.

## Files changed

- **New:**
  `.cto/03_state/WISE_TUTOR_BELLA_PIN_ROTATION_CLOSEOUT_v1.md`
  (this document).
- **No source code was modified** by this lane. No commits on
  any branch. No push. No rebase. No force op. No rebuild.
- **Data state:** Bella's user entry in `data/users.json` had
  `pin_hash`, `pin_salt`, and `pin_is_default` updated by the
  backend as a side effect of `set_pin`. Agent did not read
  or write that file directly.

## Manual action required

Founder-only, all optional / non-blocking:

1. **Optional doc update.** Append a
   `2026-04-19 — Bella child PIN rotated off default` entry
   to `DECISIONS_LOG.md` alongside the Mr W rotation entry
   from earlier today.
2. **Optional browser sign-in sanity.** Open the app as
   Bella, confirm that UserGate no longer forces a change-PIN
   modal (because `pin_is_default=False`) and that sign-in
   with the new PIN succeeds.
3. **Optional diagnostic.** If the AdminPanel `Reset PIN`
   control failed silently on the earlier two attempts,
   reproduce once with DevTools Network open to confirm
   whether the fetch was ever fired. Not blocking.

## Next move

- Factory-default PIN exposure is now closed for both Mr W
  and Bella. The single remaining user (`mrw`) and
  (`bella`) both have `pin_is_default=False` and every weak
  default candidate is rejected.
- Do not, in this session, open any new lane (reopen
  001/002/003/004/005, touch 006/010/011/012/014/017/021/
  026/027, open 008, Multica, Archon, or any product-slice
  follow-on). Do not push. The natural next bounded
  candidates (each its own brief) are the optional items
  above plus the four post-004 follow-ups still listed in
  `.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_HOTFIX_v1.md`
  (optional Playwright sign-off, integration-test re-run,
  DECISIONS_LOG entry, 004 worktree cleanup).
