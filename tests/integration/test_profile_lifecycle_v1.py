"""Profile lifecycle v1 — owner disable/re-enable family profiles.

Asserts:
  - owner can disable a child profile (POST /api/v1/users/{id}/disable)
  - owner can re-enable a child profile (POST /api/v1/users/{id}/enable)
  - child cannot disable any other user
  - child cannot re-enable themselves
  - disabled child receives a consistent deny on protected API access AND
    cannot acquire a fresh session via /switch even with the right PIN
  - owner self-disable is forbidden (no self-lockout via this slice)

The autouse fixture below RE-ENABLES Bella before AND after each test so
no test can leave Bella disabled and break unrelated downstream tests.
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import urllib.error
import urllib.request

import pytest

BASE = "http://localhost:8001"
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


def _ensure_bella_enabled():
    """Owner-enabled Bella before/after each test. Best-effort; ignores
    failure so a broken test cannot cascade-block the rest of the file."""
    try:
        op, _ = _client()
        if _switch(op, "mrw", MRW_PIN)[0] == 200:
            _req(op, "POST", "/api/v1/users/bella/enable")
    except Exception:
        pass


@pytest.fixture(autouse=True)
def _bella_lifecycle_isolation():
    _ensure_bella_enabled()
    yield
    _ensure_bella_enabled()


# ── happy paths ─────────────────────────────────────────────────────────

def test_owner_can_disable_child():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "POST", "/api/v1/users/bella/disable")
    assert code == 200, f"disable failed: {code} {body}"
    assert body.get("disabled") is True


def test_owner_can_reenable_child():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _req(mrw, "POST", "/api/v1/users/bella/disable")[0] == 200
    code, body = _req(mrw, "POST", "/api/v1/users/bella/enable")
    assert code == 200, f"enable failed: {code} {body}"
    assert body.get("disabled") is False


# ── deny paths ──────────────────────────────────────────────────────────

def test_child_cannot_disable_another_user():
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    code, _ = _req(bella, "POST", "/api/v1/users/mrw/disable")
    assert code == 403


def test_child_cannot_reenable_themselves():
    """First Mr W disables Bella; then with no session (Bella can't even
    acquire one once disabled), POST /bella/enable must 401. With a stale
    Bella session attempting it before the disable, the call still 403s
    because Bella is not owner."""
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    # Bella tries to enable herself BEFORE disable — must 403 (not owner).
    code, _ = _req(bella, "POST", "/api/v1/users/bella/enable")
    assert code == 403
    # Owner disables Bella; Bella's existing session loses identity.
    assert _req(mrw, "POST", "/api/v1/users/bella/disable")[0] == 200
    code, _ = _req(bella, "POST", "/api/v1/users/bella/enable")
    assert code in (401, 403), f"disabled bella must not self-enable; got {code}"


def test_owner_cannot_self_disable():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "POST", "/api/v1/users/mrw/disable")
    assert code == 400, f"owner self-disable must be 400; got {code} {body}"
    assert (body or {}).get("detail") == "self_lockout_forbidden"


# ── enforcement on existing session ─────────────────────────────────────

def test_disabled_child_session_loses_access_to_protected_routes():
    mrw, _ = _client()
    bella, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    # Pre-disable: Bella can read her own memory.
    assert _req(bella, "GET", "/api/v1/memory")[0] == 200
    # Owner disables.
    assert _req(mrw, "POST", "/api/v1/users/bella/disable")[0] == 200
    # Post-disable: Bella's protected reads must fail (resolve_request_user
    # now returns None -> _require_uid -> 401).
    assert _req(bella, "GET", "/api/v1/memory")[0] == 401
    assert _req(bella, "GET", "/api/v1/knowledge/list")[0] == 401
    # /active is special-cased: 403 with a detail object carrying
    # {"detail": "disabled", "user_id": "bella", "display_name": "..."}
    # so the UI can render a personalized blocked-state screen.
    code, body = _req(bella, "GET", "/api/v1/users/active")
    assert code == 403
    detail = (body or {}).get("detail")
    if isinstance(detail, dict):
        assert detail.get("detail") == "disabled"
        assert detail.get("user_id") == "bella"
    else:
        assert detail == "disabled"


def test_disabled_child_cannot_acquire_new_session_via_switch():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _req(mrw, "POST", "/api/v1/users/bella/disable")[0] == 200
    fresh, _ = _client()
    code, body = _req(fresh, "POST", "/api/v1/users/switch",
                      {"user_id": "bella", "pin": BELLA_PIN})
    assert code == 403
    assert (body or {}).get("detail") == "disabled"
