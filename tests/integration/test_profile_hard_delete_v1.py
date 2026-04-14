"""Profile hard-delete v1 — owner-only permanent deletion + purge.

Proves:
  - owner can DELETE /api/v1/users/{user_id} for a non-owner target
  - child cannot delete anyone
  - owner cannot delete self (400 self_lockout_forbidden — same guard
    used by disable/enable; delete shares _require_owner_for_lifecycle)
  - deleted user cannot /switch afterward (invalid credentials 403)
  - deleted user's data dirs (data/users/<uid>, data/knowledge_bases/<uid>)
    are actually purged from disk
  - deleted user no longer appears in GET /api/v1/users list
  - deleted user cannot be inspected via owner ?as_user= on memory or
    knowledge list (404 user_not_found)

Every destructive test operates on a disposable throwaway profile — we
never delete the seeded Mr W or Bella, so repeat runs stay clean and
downstream suites don't break."""

from __future__ import annotations

import http.cookiejar
import json
import os
import shutil
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import pytest

BASE = "http://localhost:8001"
# CI and local runners have different repo roots; the conftest already
# exposes WISETUTOR_REPO (with a local default), so reuse that contract.
REPO = Path(os.environ.get("WISETUTOR_REPO") or "/home/ai-desktop/projects/WiseTutor")
MRW_PIN = os.environ.get("WT_MRW_PIN", "2468")
BELLA_PIN = os.environ.get("WT_BELLA_PIN", "1357")


def _client():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)), cj


def _req(opener, method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(f"{BASE}{path}", method=method, data=data, headers=headers)
    try:
        r = opener.open(req)
        raw = r.read()
        try:
            return r.status, json.loads(raw or b"null")
        except Exception:
            return r.status, raw
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"null")
        except Exception:
            return e.code, None


def _switch(opener, user_id, pin):
    return _req(opener, "POST", "/api/v1/users/switch", {"user_id": user_id, "pin": pin})


def _upsert_fresh_child(user_id: str, pin: str = "1111") -> None:
    """Owner creates a disposable non-owner profile for a delete test."""
    op, _ = _client()
    assert _switch(op, "mrw", MRW_PIN)[0] == 200
    code, _ = _req(
        op, "POST", "/api/v1/users",
        {"user_id": user_id, "display_name": f"Temp {user_id}", "role": "user", "pin": pin},
    )
    assert code == 200, f"failed to upsert throwaway {user_id}: {code}"


@pytest.fixture
def throwaway_user_id() -> str:
    """Unique user_id per test, auto-created before and force-cleaned
    after to keep the backend state idempotent across runs."""
    uid = f"delete_victim_{uuid.uuid4().hex[:8]}"
    _upsert_fresh_child(uid)
    yield uid
    # Best-effort cleanup in case the test skipped the delete.
    op, _ = _client()
    if _switch(op, "mrw", MRW_PIN)[0] == 200:
        _req(op, "DELETE", f"/api/v1/users/{uid}")
    # Remove any stale on-disk residue (safe even if dir is gone).
    for p in (REPO / "data/users" / uid, REPO / "data/knowledge_bases" / uid):
        if p.exists():
            shutil.rmtree(p, ignore_errors=True)


# ── happy path ──────────────────────────────────────────────────────────

def test_owner_can_permanently_delete_non_owner(throwaway_user_id):
    user_dir = REPO / "data/users" / throwaway_user_id
    assert user_dir.exists(), "upsert should have created the user dir"

    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "DELETE", f"/api/v1/users/{throwaway_user_id}")
    assert code == 200, f"owner delete failed: {code} {body}"
    assert (body or {}).get("ok") is True
    assert (body or {}).get("user_id") == throwaway_user_id

    # On-disk purge of the user's data directory.
    assert not user_dir.exists(), f"user dir must be purged: {user_dir}"
    # Knowledge dir may or may not have been created, but if it was it
    # must also be gone.
    kb_dir = REPO / "data/knowledge_bases" / throwaway_user_id
    assert not kb_dir.exists(), f"knowledge dir must be purged: {kb_dir}"


def test_deleted_user_vanishes_from_list(throwaway_user_id):
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200

    # Before delete: visible.
    code, body = _req(mrw, "GET", "/api/v1/users")
    assert code == 200
    ids_before = {u["id"] for u in (body or {}).get("users", [])}
    assert throwaway_user_id in ids_before

    assert _req(mrw, "DELETE", f"/api/v1/users/{throwaway_user_id}")[0] == 200

    # After delete: gone.
    code, body = _req(mrw, "GET", "/api/v1/users")
    ids_after = {u["id"] for u in (body or {}).get("users", [])}
    assert throwaway_user_id not in ids_after


def test_deleted_user_cannot_switch_afterward(throwaway_user_id):
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _req(mrw, "DELETE", f"/api/v1/users/{throwaway_user_id}")[0] == 200

    anon, _ = _client()
    # Attempt login with the exact prior PIN — the account is gone.
    code, body = _req(
        anon, "POST", "/api/v1/users/switch",
        {"user_id": throwaway_user_id, "pin": "1111"},
    )
    assert code == 403, f"deleted user must not be able to switch; got {code} {body}"


def test_deleted_user_owner_inspect_returns_404(throwaway_user_id):
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _req(mrw, "DELETE", f"/api/v1/users/{throwaway_user_id}")[0] == 200

    code, body = _req(mrw, "GET", f"/api/v1/memory?as_user={throwaway_user_id}")
    assert code == 404 and (body or {}).get("detail") == "user_not_found"
    code, body = _req(mrw, "GET", f"/api/v1/knowledge/list?as_user={throwaway_user_id}")
    assert code == 404 and (body or {}).get("detail") == "user_not_found"


# ── deny paths ──────────────────────────────────────────────────────────

def test_child_cannot_delete_any_user(throwaway_user_id):
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    code, _ = _req(bella, "DELETE", f"/api/v1/users/{throwaway_user_id}")
    assert code == 403
    # And target still exists.
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "GET", "/api/v1/users")
    assert throwaway_user_id in {u["id"] for u in (body or {}).get("users", [])}


def test_anon_cannot_delete_any_user(throwaway_user_id):
    anon, _ = _client()
    code, _ = _req(anon, "DELETE", f"/api/v1/users/{throwaway_user_id}")
    assert code == 401


def test_owner_cannot_delete_self():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "DELETE", "/api/v1/users/mrw")
    # Shared _require_owner_for_lifecycle guard returns
    # self_lockout_forbidden for target==caller, OR cannot_disable_owner
    # if the owner-target branch fires first. Either way: not a 200.
    assert code in (400, 403)
    assert code != 200


def test_owner_cannot_delete_another_owner(throwaway_user_id):
    """Defensive: even if someone upserts a second owner, delete must
    refuse to remove ANY owner profile. We create the throwaway, then
    promote it to owner via upsert, then try to delete it."""
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    # Promote to owner (upsert is owner-only; owner is allowed to do this).
    code, _ = _req(
        mrw, "POST", "/api/v1/users",
        {"user_id": throwaway_user_id, "display_name": "Promoted",
         "role": "owner", "pin": "1111"},
    )
    assert code == 200
    # Delete attempt on an owner-role target -> 403 cannot_disable_owner
    # (shared guard name; covers both disable and delete).
    code, body = _req(mrw, "DELETE", f"/api/v1/users/{throwaway_user_id}")
    assert code == 403
    assert (body or {}).get("detail") == "cannot_disable_owner"
    # Demote back to user so the fixture cleanup can succeed.
    _req(
        mrw, "POST", "/api/v1/users",
        {"user_id": throwaway_user_id, "display_name": "Demoted", "role": "user"},
    )


def test_delete_unknown_user_returns_404():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, _ = _req(mrw, "DELETE", "/api/v1/users/no_such_user_exists")
    assert code == 404
