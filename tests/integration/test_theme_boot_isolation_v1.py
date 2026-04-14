"""Theme boot isolation v1 — cookie-carried boot theme contract.

Asserts:
  - /users/switch sets wt_theme cookie to the switched user's theme
  - PUT /users/me/theme refreshes wt_theme cookie
  - /users/logout clears wt_theme cookie (and wt_uid)
  - the removed orphan PUT /api/v1/settings/theme returns 404/405
  - theme mutual isolation (regression from v1) still holds
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


def _cookie_value(cj: http.cookiejar.CookieJar, name: str) -> str | None:
    for c in cj:
        if c.name == name:
            return c.value
    return None


@pytest.fixture(autouse=True)
def _restore_themes():
    op_m, _ = _client()
    op_b, _ = _client()
    _switch(op_m, "mrw", MRW_PIN)
    _switch(op_b, "bella", BELLA_PIN)
    before_m = _req(op_m, "GET", "/api/v1/users/active")[1].get("theme")
    before_b = _req(op_b, "GET", "/api/v1/users/active")[1].get("theme")
    yield
    op_m, _ = _client()
    op_b, _ = _client()
    if _switch(op_m, "mrw", MRW_PIN)[0] == 200 and before_m:
        _req(op_m, "PUT", "/api/v1/users/me/theme", {"theme": before_m})
    if _switch(op_b, "bella", BELLA_PIN)[0] == 200 and before_b:
        _req(op_b, "PUT", "/api/v1/users/me/theme", {"theme": before_b})


def test_switch_sets_wt_theme_cookie_to_user_theme():
    op, cj = _client()
    # Seed Mr W at "dark".
    assert _switch(op, "mrw", MRW_PIN)[0] == 200
    assert _req(op, "PUT", "/api/v1/users/me/theme", {"theme": "dark"})[0] == 200
    # Fresh context: /switch mrw must stamp wt_theme=dark.
    op2, cj2 = _client()
    assert _switch(op2, "mrw", MRW_PIN)[0] == 200
    assert _cookie_value(cj2, "wt_theme") == "dark"


def test_switch_rotates_wt_theme_across_users_in_same_context():
    op, cj = _client()
    # Seed: Mr W dark, Bella bella.
    assert _switch(op, "mrw", MRW_PIN)[0] == 200
    assert _req(op, "PUT", "/api/v1/users/me/theme", {"theme": "dark"})[0] == 200
    assert _switch(op, "bella", BELLA_PIN)[0] == 200
    assert _req(op, "PUT", "/api/v1/users/me/theme", {"theme": "bella"})[0] == 200

    op2, cj2 = _client()
    assert _switch(op2, "mrw", MRW_PIN)[0] == 200
    assert _cookie_value(cj2, "wt_theme") == "dark"
    # Same context, switch to Bella — wt_theme must rotate to bella.
    assert _switch(op2, "bella", BELLA_PIN)[0] == 200
    assert _cookie_value(cj2, "wt_theme") == "bella"


def test_me_theme_put_refreshes_wt_theme_cookie():
    op, cj = _client()
    assert _switch(op, "mrw", MRW_PIN)[0] == 200
    assert _req(op, "PUT", "/api/v1/users/me/theme", {"theme": "light"})[0] == 200
    assert _cookie_value(cj, "wt_theme") == "light"
    assert _req(op, "PUT", "/api/v1/users/me/theme", {"theme": "dark"})[0] == 200
    assert _cookie_value(cj, "wt_theme") == "dark"


def test_logout_clears_wt_theme_cookie():
    op, cj = _client()
    assert _switch(op, "mrw", MRW_PIN)[0] == 200
    assert _cookie_value(cj, "wt_theme") is not None
    assert _req(op, "POST", "/api/v1/users/logout")[0] == 200
    # After logout the jar must no longer carry a LIVE wt_theme.
    assert _cookie_value(cj, "wt_theme") in (None, "")


def test_orphan_settings_theme_route_is_gone():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, _ = _req(mrw, "PUT", "/api/v1/settings/theme", {"theme": "dark"})
    # FastAPI returns 405 when a path no longer has the method, 404 when
    # the path itself is gone. Either is acceptable — the important bit
    # is: no 200.
    assert code in (404, 405), f"orphan route must not respond; got {code}"


def test_theme_mutual_isolation_regression_holds():
    mrw, _ = _client()
    bella, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    assert _req(mrw, "PUT", "/api/v1/users/me/theme", {"theme": "dark"})[0] == 200
    assert _req(bella, "PUT", "/api/v1/users/me/theme", {"theme": "light"})[0] == 200
    mrw_theme = _req(mrw, "GET", "/api/v1/users/active")[1].get("theme")
    bella_theme = _req(bella, "GET", "/api/v1/users/active")[1].get("theme")
    assert mrw_theme == "dark"
    assert bella_theme == "light"
