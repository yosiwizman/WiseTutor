"""Per-user theme isolation v1 — backend contract.

Proves the new self-theme endpoint and the existing per-user `User.theme`
field together form a truthful per-user isolation model:
  - PUT /api/v1/users/me/theme persists the caller's own theme
  - GET /api/v1/users/active returns the caller's own theme
  - Writing Mr W's theme does NOT mutate Bella's, and vice versa
  - Anon is 401
  - Owner cross-user write via /me/theme is impossible (there is no
    as_user parameter on /me/theme)
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


def _active_theme(opener) -> str | None:
    code, body = _req(opener, "GET", "/api/v1/users/active")
    if code != 200 or not isinstance(body, dict):
        return None
    return body.get("theme")


@pytest.fixture(autouse=True)
def _restore_original_themes():
    """Snapshot both users' themes before each test and restore after.
    Keeps this suite idempotent across test order and repeat runs."""
    op_mrw, _ = _client()
    op_bella, _ = _client()
    _switch(op_mrw, "mrw", MRW_PIN)
    _switch(op_bella, "bella", BELLA_PIN)
    before_mrw = _active_theme(op_mrw)
    before_bella = _active_theme(op_bella)
    yield
    # Restore best-effort.
    op_mrw, _ = _client()
    op_bella, _ = _client()
    if _switch(op_mrw, "mrw", MRW_PIN)[0] == 200 and before_mrw:
        _req(op_mrw, "PUT", "/api/v1/users/me/theme", {"theme": before_mrw})
    if _switch(op_bella, "bella", BELLA_PIN)[0] == 200 and before_bella:
        _req(op_bella, "PUT", "/api/v1/users/me/theme", {"theme": before_bella})


def test_anon_cannot_set_theme():
    anon, _ = _client()
    code, _ = _req(anon, "PUT", "/api/v1/users/me/theme", {"theme": "dark"})
    assert code == 401


def test_invalid_theme_rejected():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, _ = _req(mrw, "PUT", "/api/v1/users/me/theme", {"theme": "neon"})
    assert code == 422  # pydantic Literal validation


def test_self_theme_persists_and_is_isolated():
    mrw, _ = _client()
    bella, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200

    # Mr W sets dark, Bella sets bella.
    assert _req(mrw, "PUT", "/api/v1/users/me/theme", {"theme": "dark"})[0] == 200
    assert _req(bella, "PUT", "/api/v1/users/me/theme", {"theme": "bella"})[0] == 200

    assert _active_theme(mrw) == "dark"
    assert _active_theme(bella) == "bella"

    # Mr W flips to light — must not affect Bella.
    assert _req(mrw, "PUT", "/api/v1/users/me/theme", {"theme": "light"})[0] == 200
    assert _active_theme(mrw) == "light"
    assert _active_theme(bella) == "bella", "owner theme change bled into child"


def test_child_theme_write_does_not_affect_owner():
    mrw, _ = _client()
    bella, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    assert _req(mrw, "PUT", "/api/v1/users/me/theme", {"theme": "dark"})[0] == 200
    assert _req(bella, "PUT", "/api/v1/users/me/theme", {"theme": "light"})[0] == 200
    assert _active_theme(bella) == "light"
    assert _active_theme(mrw) == "dark", "child theme change bled into owner"


def test_me_theme_route_has_no_as_user_escape_hatch():
    """Sanity: the self-theme endpoint must not honor any query param
    that would let an owner cross-user-write via it. Route path is
    literally /me/theme — there is no `user_id` in the signature —
    but assert by behavior: owner PUT with ?as_user=bella still only
    touches owner's own theme."""
    mrw, _ = _client()
    bella, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    # Seed Bella at "light".
    assert _req(bella, "PUT", "/api/v1/users/me/theme", {"theme": "light"})[0] == 200
    # Owner tries to sneak an as_user into the /me/theme write.
    assert _req(mrw, "PUT", "/api/v1/users/me/theme?as_user=bella", {"theme": "dark"})[0] == 200
    # Mr W's own theme is now dark; Bella's is still light.
    assert _active_theme(mrw) == "dark"
    assert _active_theme(bella) == "light", (
        "as_user on /me/theme must NOT redirect the write to another user"
    )
