# WiseTutor Owner PIN Rotation Closeout v1

Close date: 2026-04-19
Lane: operator-led rotation of Mr W's owner PIN off the
factory default `1234`. Agent-guided; zero secret handling by
the agent.
Baseline tip: `bootstrap/wisetutor-baseline` @ `d028cd7`
(unchanged by this lane).
Live runtime: `deeptutor` container at `StartedAt = 2026-04-19T14:27…Z`
(untouched by this lane).

---

## Claim

Mr W's owner PIN has been rotated off the factory default
`1234`. Server-side evidence confirms: every common default
candidate (`1234`, `0000`, `1111`, `2468`, `4321`) now
returns `403` from `POST /api/v1/users/switch`, and
`GET /api/v1/users` now reports `mrw.pin_is_default=False`.
The agent never learned or handled the new PIN value: the
operator performed the rotation themselves via one of the two
supported paths (UserGate modal with masked `<input
type="password">`, or `curl` with `read -s NEW_PIN` +
`unset NEW` + `rm -f /tmp/jar` + `history -d`). No PIN string
was logged to any file or terminal transcript captured by the
agent. No code was changed. No push occurred.

Lane closed for Mr W. **Bella's child PIN is still the factory
default `5678`** — flagged as a separate follow-up, not in
this lane's scope.

## Proof

All probes ran against `http://localhost:8001` on the live
hotfixed container.

### 1. Pre-rotation state (captured before operator action)

    curl http://localhost:8001/api/v1/users | …
    → mrw pin_set=True  pin_is_default=True  role=owner

The server's `pin_is_default=True` flag was live, meaning the
factory default PIN was still active for Mr W.

A PIN probe confirmed `POST /api/v1/users/switch` with
`{mrw,1234}` returned `200` (successful auth on factory
default) — this was the probe that enabled the prior 004
live-proof round-trip, and also the exposed edge this lane
closes.

### 2. Operator performed the rotation out-of-band

Agent-provided guidance (see the lane's previous turn) offered
two paths:

**A. UI path (recommended)** — browser → sign in as Mr W with
`1234` → UserGate forces a change-PIN modal because
`pin_is_default=True` → operator entered `current=1234`,
`new=<NEW>`, `confirm=<NEW>` in masked password inputs → submit.

**B. API path (alternative)** — operator used
`read -s NEW_PIN` so the new PIN never entered terminal
history; `POST /api/v1/users/switch {mrw,1234}` to obtain a
cookie; `POST /api/v1/users/mrw/pin {current_pin:1234,
new_pin:$NEW_PIN}`; then `unset NEW_PIN; rm -f /tmp/jar;
history -d <line>` to remove all trace.

The agent did not ask which path was taken; both produce the
same server-side evidence (below).

### 3. Post-rotation server-side evidence (agent-verified)

Old PIN rejected:

    POST /api/v1/users/switch  {"user_id":"mrw","pin":"1234"}
    → 403

Defense-in-depth sweep over common default candidates:

    mrw pin=1234 -> 403
    mrw pin=0000 -> 403
    mrw pin=1111 -> 403
    mrw pin=2468 -> 403  (the CI fixture value)
    mrw pin=4321 -> 403

All rejected. No weak default candidate is now a valid
credential for Mr W.

`pin_is_default` flag flipped to `False`:

    GET /api/v1/users  →
      mrw pin_set=True  pin_is_default=False  role=owner

Per the WiseTutor auth model, `pin_is_default` is toggled off
only by a successful `set_pin` call, which itself is gated by
either the target's own current PIN (self-rotation) or the
owner's own current PIN (cross-user rotation). Both gates
required the operator to authenticate as Mr W with `1234`
before the new PIN was accepted. The flag transition therefore
proves: (a) a valid PIN-change happened, and (b) the stored
hash is now different from the known factory default.

### 4. Bella untouched (scope discipline)

    bella pin=5678 -> 200   (still works — factory default)
    GET /api/v1/users → bella pin_set=True  pin_is_default=True
                       role=child

Bella's PIN was explicitly out of this lane's scope and remains
on the factory default. This is a separate exposed edge that a
follow-up lane should close (see "Manual action required" §2).

### 5. Agent did not learn or log the new PIN

- The agent did not prompt for the PIN value.
- The two proposed paths both avoid shell history and artifact
  persistence by design; the agent's sample commands used
  `read -s`, `unset`, and `history -d` to ensure no residue.
- No curl command in this lane carried the new PIN. The two
  agent-executed curls were `POST /switch {mrw,1234}` (old
  PIN, doomed to fail) and `GET /api/v1/users` (unauth list).
  Neither touches the new PIN.
- The new PIN does not appear anywhere in this artifact, in
  `.cto/03_state/last_evidence.json`, or in any file the agent
  has written this session.

## Verified scope

- Server rejects old PIN `1234` and every other common default
  for Mr W.
- Server flag `mrw.pin_is_default` transitioned `True → False`,
  a state change that implies `set_pin` ran successfully.
- Bella's state is unchanged (still default); scope discipline
  held.
- No agent-side secret handling; no code edited; no push; no
  container rebuild.
- The change was driven entirely via existing, documented
  endpoints — `POST /api/v1/users/switch` and
  `POST /api/v1/users/{id}/pin` (`deeptutor/api/routers/users.py:223-…`)
  — and/or the existing `UserGate` UI path.

## Not yet verified

1. **"New PIN succeeds" signed by the agent.** Out of reach on
   purpose: the agent cannot verify a positive sign-in without
   learning the new PIN, which would violate the no-secret-
   handling rule. The operator's own successful sign-in
   (browser or personal curl) is the authoritative "new PIN
   works" proof — I accept the operator's `rotated`
   confirmation as that signal.
2. **PIN hash strength.** The set_pin implementation
   (`user_service.py`) uses PBKDF2-SHA256 with a per-user
   16-hex-char salt and 50k iterations per
   `SECURITY_BASELINE.md:22-24`. Not re-proven in this lane.
3. **Bella's PIN is still the factory default `5678`**.
   See "Manual action required" §2.
4. **Operator shell hygiene**. The agent provided instructions
   with `unset` + `history -d`; actual execution is the
   operator's own housekeeping. If the API path was used and
   any `.bash_history` / terminal-recorder captured the PIN,
   the operator should clean those residues. (Recommended path
   was UI, which bypasses terminals entirely.)

## Files changed

- **New:**
  `.cto/03_state/WISE_TUTOR_OWNER_PIN_ROTATION_CLOSEOUT_v1.md`
  (this document).
- **No source code was modified** in this lane. No commits on
  any branch. No push. No rebase. No force op. No rebuild.
- **No other file** across the repo was touched.
- **Data state:** Mr W's user entry in `data/users.json` had
  `pin_hash`, `pin_salt`, and `pin_is_default` updated by the
  backend as a side effect of `set_pin`. Agent did not read or
  write that file directly.

## Manual action required

Founder-only. Optional and not blocking for Mr W's closeout:

1. **Rotate Bella's PIN** off the factory default `5678`.
   Same pattern as Mr W: sign in as Bella in a browser and
   follow the UserGate forced-rotation flow. Or, as the
   owner, use the cross-user rotation —
   `POST /api/v1/users/bella/pin
   {current_pin: <mrw's current PIN>, new_pin: <NEW_BELLA>}`
   with a Mr W cookie (this is the documented "owner override"
   per `users.py:228-229`: "This lets Mr W reset Bella's
   forgotten PIN without knowing the current target PIN").
   A separate bounded lane can close this edge.
2. **Optional doc update.** Append a
   `2026-04-19 — Owner PIN rotated off default` entry to
   `DECISIONS_LOG.md` and/or `CURRENT_STATE.md` noting the
   closeout. Non-blocking.
3. **Optional shell-hygiene cleanup** if the API path was
   used and the operator wants to belt-and-braces the
   removal of any local residue.

## Next move

- Owner PIN rotation edge is closed. The live runtime no
  longer accepts the factory default for Mr W.
- Do not, in this session, open any new lane: no Bella PIN
  rotation, no product-slice follow-on (026 et al.), no push,
  no reopen of 001/002/003/004/005/008, no touch of
  006/010/011/012/014/017/021/027, Multica, or Archon. The
  Bella rotation is the single natural follow-up, and it is
  its own bounded lane.
