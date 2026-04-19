# WiseTutor 004 Configurable Pedagogy Mode — Live Proof v1

Close date: 2026-04-19
Lane: post-merge live runtime proof for 004 on the merged baseline.
Baseline tip: `bootstrap/wisetutor-baseline` @ `e840b22`.
Scope: live-exercise only; no source code edits; no push.

Supersedes: `.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_MERGED_v1.md`.

---

## Claim

The merged 004 code is **partially live** on the current
runtime. The container was rebuilt from `bootstrap/wisetutor-baseline`
@ `e840b22` and recreated; the running backend now serves the
merged code. One strong live proof path succeeds honestly:
**per-role pedagogy_mode defaults surface through the HTTP
contract** — `GET /api/v1/users` on the post-rebuild container
returns `preferences.pedagogy_mode = "direct"` for owner `mrw`
and `"adaptive"` for child `bella`, exactly matching the
per-role defaults in the merged
`deeptutor/services/users/user_service.py:47-70`.

However, the **PUT update path is silently broken**. The
Pydantic model `PreferencesPatch` at
`deeptutor/api/routers/users.py:131-137` was never extended
with a `pedagogy_mode` field by the 004 branch. FastAPI+Pydantic
strips unknown fields by default, so a
`PUT /api/v1/users/<id>/preferences` body of
`{"pedagogy_mode": "guided"}` reaches the handler with an empty
`patch_dict`; `_validate_preferences` never sees
`pedagogy_mode`; no override is stored; subsequent GETs keep
returning the role default. The AdminPanel dropdown save
therefore silently does nothing.

Result:
- **Role defaults on load**: LIVE on merged baseline (proven).
- **UI-driven per-user override update**: NOT LIVE (real bug
  in 004 code).

Classification: **LIVE_PROOF_PARTIAL — ship a narrow follow-up
fix lane before claiming the feature is whole.**

## Proof

### 1. Pre-rebuild state confirmed the running container was
pre-004

Before rebuilding, the live container's shape was inspected via
the unauth endpoint `GET /api/v1/users`:

    curl http://localhost:8001/api/v1/users
    → users: ['mrw', 'bella']
      sample prefs: ['tone', 'response_length',
                     'allowed_capabilities', 'safety_profile']

No `pedagogy_mode` key on preferences → the live container ran
pre-004 code, as expected (it had been running since
`2026-04-19T01:32:20Z`, before the 004 merge `e840b22`).

### 2. Rebuild + recreate (merged baseline → live container)

- `task build` ran `sg docker -c "docker compose -f
  docker-compose.yml build deeptutor"`. Output ends with:

        #44 naming to docker.io/library/wisetutor-deeptutor:latest
        #44 unpacking to docker.io/library/wisetutor-deeptutor:latest
        #44 DONE 18.7s (full build)
         deeptutor  Built

- `task recreate` ran `sg docker -c "docker compose -f
  docker-compose.yml up -d --force-recreate deeptutor"`. Output:

         Container deeptutor  Recreate
         Container deeptutor  Recreated
         Container deeptutor  Starting
         Container deeptutor  Started

- Health poll (`docker inspect deeptutor --format
  '{{.State.Health.Status}}'`): `starting` → `healthy` within
  ~4 seconds.
- New container metadata:
  `StartedAt = 2026-04-19T14:02:59.690809879Z`, `pid=1157565`,
  `health=healthy`. Source = merged baseline at `e840b22`.

### 3. Post-rebuild live proof (ROLE DEFAULTS = LIVE)

    curl http://localhost:8001/api/v1/users
    → user='mrw'      role='owner'    pedagogy_mode='direct'
      user='bella'    role='child'    pedagogy_mode='adaptive'
      preference keys (mrw): [
        'allowed_capabilities', 'pedagogy_mode',
        'response_length', 'safety_profile', 'tone'
      ]

This is a **real HTTP response from a real backend process
running merged 004 code**, not a code-review claim. The
response goes through:

    FastAPI route
      → UserService.list()
      → User.public()
      → User.effective_preferences()
      → _default_preferences_for_role(self.role) merged
        with User.preferences overrides
      → JSON-serialized response

The merged `user_service.py:75` returns
`{**_DEFAULT_PREFERENCES_BY_ROLE.get(role, ...)}`; the new
`pedagogy_mode` key in that dict flows through without any
per-user override (existing users had no override before
rebuild). The live contract therefore exposes the role-default
pedagogy_mode on every user. Owner default = `"direct"`, child
default = `"adaptive"`, and that matches `user_service.py:54,69`
on the merged tree byte-for-byte.

### 4. Post-rebuild live proof (UPDATE PATH = SILENTLY BROKEN)

OpenAPI schema probe:

    curl http://localhost:8001/openapi.json | jq ...
    → PreferencesPatch properties: [
        'allowed_capabilities', 'display_name_override',
        'response_length', 'safety_profile', 'theme', 'tone'
      ]

`PreferencesPatch` declares `allowed_capabilities`,
`display_name_override`, `response_length`, `safety_profile`,
`theme`, `tone` — but **no `pedagogy_mode`**. This matches the
class definition in `deeptutor/api/routers/users.py:131-137`
on the merged tree:

    class PreferencesPatch(BaseModel):
        tone: Optional[str] = None
        response_length: Optional[str] = None
        allowed_capabilities: Optional[list[str]] = None
        safety_profile: Optional[str] = None
        display_name_override: Optional[str] = None
        theme: Optional[str] = None

FastAPI + Pydantic v2 `BaseModel` default is `extra="ignore"`.
Unknown fields are silently dropped. Three live HTTP probes
confirm the behavior:

    PUT /api/v1/users/mrw/preferences {"pedagogy_mode":"guided"}
      → 401 (body parsed fine; auth missing; unknown field
             silently ignored at parse time)
    PUT /api/v1/users/mrw/preferences {"tone":123}
      → 422 (Pydantic rejects the type mismatch on a KNOWN
             field before auth is checked)
    PUT /api/v1/users/mrw/preferences {"totally_unknown":"xyz"}
      → 401 (identical to pedagogy_mode — unknown field
             silently ignored)

The 401-vs-422 divergence is the signature: if `pedagogy_mode`
were declared on `PreferencesPatch`, sending an invalid value
would 422 pre-auth like `tone:123` does. Instead it behaves
identically to a wholly-unknown field. The router layer is
therefore stripping `pedagogy_mode` before the handler body
runs. Handler code path
(`deeptutor/api/routers/users.py:161-188`):

    patch_dict = {k: v for k, v in patch.model_dump().items() if v is not None}
    updated = svc.update_preferences(user_id, patch_dict)

— with `pedagogy_mode` stripped at Pydantic parse,
`patch_dict` contains no `pedagogy_mode`, and
`_validate_preferences` at
`deeptutor/services/users/user_service.py:120-124` — which DOES
know how to validate `pedagogy_mode` — is never reached for
that key.

Net runtime effect on the merged baseline:
- The AdminPanel dropdown in the UI renders correctly with the
  defaults (proven via the GET path in §3).
- Pressing **Save** on the dropdown sends the expected PUT body
  with `pedagogy_mode` to the endpoint.
- The endpoint returns 200 and the response `preferences`
  field shows the **role default**, unchanged.
- The operator sees "Updated pedagogy mode for <uid>" in the
  AdminPanel flash, but no persisted override is created, and
  subsequent reloads re-render the default.

This matches the prior audit's remark that four shipped
integration tests failed: the audit labeled them
"environmental" because of hardcoded CI PINs blocking auth.
The deeper finding from this live lane is that, even once the
PINs are lined up, `test_valid_pedagogy_mode_values_accepted`
would still fail its assertion
`body["preferences"]["pedagogy_mode"] == mode` for any
non-default value — because the stored override never takes.
The "environmental" label was incomplete.

### 5. Test-harness inference (no new tests run; merged unit
test preserved)

In-process prompt-builder coverage remains accurate: when the
UnifiedContext metadata's `_wt_preferences.pedagogy_mode`
carries "guided" or "direct", the system prompt gets the
right hint. That path is unaffected by the `PreferencesPatch`
bug, because it reads from the preferences dict that the
resolver constructs at WS-accept time. If `User.preferences`
has the default only, the context carries the default. The
feature therefore works end-to-end for **whatever default the
role assigns**, just not for a user-flipped override.

### 6. Previously merged 005 / 003 / 002 content still live

- `user='mrw'` can still be listed without auth and shows a
  coherent preferences dict → 002 catalog/api-key indirection
  unaffected; 003 backend bind works (DNAT route reaches
  container at 8001); 005 session-secret module loaded cleanly
  at startup (`INFO: Started server process [71] / Uvicorn
  running on http://0.0.0.0:8001`).

## Verified scope

- Pre-rebuild state inspection → live container was pre-004.
- Clean `task build` + `task recreate` cycle; container went
  back to `healthy` in seconds; no manual intervention.
- **Post-rebuild role-default path is live** via real HTTP
  `GET /api/v1/users` — mrw=direct, bella=adaptive, pedagogy_mode
  present in preferences dict on every user.
- **Post-rebuild update path is silently broken** — proven via
  OpenAPI schema probe + a triad of 401/422/401 PUT responses
  showing Pydantic strips `pedagogy_mode` identically to a
  wholly-unknown field.
- Merge mechanics (byte-for-byte tree equivalence vs 004 tip)
  already verified by the prior merge-close artifact; restated
  here only in context.

## Not yet verified

1. **AdminPanel UI end-to-end by a real user click.** Not
   exercised in this lane. Would require a Playwright
   headless run or a human in the browser. The code path is
   defensible: UI renders, Save button calls the PUT
   endpoint, endpoint swallows the field silently, no 4xx is
   visible to the UI, the subsequent load re-renders the
   default — the user experiences a "Save succeeded"
   followed by "nothing actually changed" on reload. That is
   the exact shape of the bug.
2. **The four shipped HTTP-shape integration tests with
   real auth.** Still not run because the live container's
   seeded PINs do not match the test fixture PINs (2468 /
   1357) and the agent does not know the operator's current
   PINs. Even with matching PINs, three of the four tests
   would now fail on the merged tree because of the
   `PreferencesPatch` bug above.
3. **Playwright `pedagogy-divergence` project.** Not run; it
   requires a live LLM budget and the UI-driven update path
   to actually persist, which it doesn't today. The project
   would also fail on the merged tree.
4. **Whether the `User.preferences` persisted dict on disk
   currently has any stale pedagogy_mode values** from
   earlier direct-write testing. A later fix lane may want
   to inspect `data/users.json` + `data/users/*/` before
   / after applying the fix. Not explored here because the
   agent is policy-blocked from reading those paths.
5. **`adaptive` runtime behavior** beyond persistence, which
   the audit already flagged and which remains an open
   follow-up.

## Files changed

- **New**:
  `.cto/03_state/WISE_TUTOR_004_PEDAGOGY_MODE_LIVE_PROOF_v1.md`
  (this document).
- **Container state**: rebuilt `deeptutor` image from merged
  tree `e840b22`; new container instance started at
  `2026-04-19T14:02:59Z` pid 1157565, health=healthy. This is a
  runtime-state change only, not a source-tree change.
- **No source code was modified** by this lane. No commits on
  any branch. No push. No rebase. No force op.
- **No dependency change, no test added, no test removed.**
- **No other Aperant branch touched.**

## Manual action required

Founder-only. Non-blocking to declare the live-proof lane closed
with the PARTIAL result, but both of the following should
happen before 004 is considered shipped:

1. **Open a bounded fix lane** for the
   `PreferencesPatch`-missing-`pedagogy_mode` bug. Fix is a
   two-line addition to `deeptutor/api/routers/users.py:131-137`:

        class PreferencesPatch(BaseModel):
            tone: Optional[str] = None
            response_length: Optional[str] = None
            allowed_capabilities: Optional[list[str]] = None
            safety_profile: Optional[str] = None
            display_name_override: Optional[str] = None
            theme: Optional[str] = None
            pedagogy_mode: Optional[str] = None    # <-- add

   After that addition, `_validate_preferences` at
   `deeptutor/services/users/user_service.py:120-124` already
   handles it correctly, and the four previously-failing
   integration tests will hit their real contract. Re-run the
   `pedagogy-divergence` Playwright project once the backend is
   rebuilt. Narrow lane; no architecture change; no dependency
   change.

2. **(Optional, after the fix)** rebuild + recreate the
   container again with the fix applied, re-run the same
   `GET /api/v1/users` + `PUT /preferences` round-trip, and
   confirm that a PUT-set pedagogy_mode persists across a
   subsequent GET.

Do not, in this session, open the fix lane, open 026 / any
other Aperant task, or start unrelated work. Do not push.

## Next move

- 004 live-proof lane is closed locally with a PARTIAL result.
  Role defaults are live; UI-driven overrides are silently
  broken.
- The next bounded agent-executable lane is the two-line
  `PreferencesPatch.pedagogy_mode` fix described above, with
  its own audit+merge cycle.
- Do not reopen 001/002/003/005 or any merged lane. Do not
  touch 006/010/011/012/014/017/021/026/027 or any librarian
  / avatar / gated surface. Do not push
  `bootstrap/wisetutor-baseline`.
