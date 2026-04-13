"""Phase 4 slice 1 — per-user theme proofs."""

import http.cookiejar
import json
import urllib.request

BASE = "http://localhost:8001"
MRW_PIN = "2468"
BELLA_PIN = "1357"


def _client():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def _req(opener, method, path, body=None):
    req = urllib.request.Request(
        f"{BASE}{path}", method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        r = opener.open(req)
        return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        try:
            b = json.loads(e.read() or b"null")
        except Exception:
            b = None
        return e.code, b


def _switch(opener, user_id, pin):
    return _req(opener, "POST", "/api/v1/users/switch", {"user_id": user_id, "pin": pin})


def _active(opener):
    return _req(opener, "GET", "/api/v1/users/active")


def test_self_service_theme_update_persists():
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    try:
        code, _ = _req(bella, "PUT", "/api/v1/users/bella/preferences", {"theme": "bella"})
        assert code == 200
        _, u = _active(bella)
        assert u["theme"] == "bella"
    finally:
        _req(bella, "PUT", "/api/v1/users/bella/preferences", {"theme": "light"})


def test_invalid_theme_rejected():
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)
    code, _ = _req(mrw, "PUT", "/api/v1/users/mrw/preferences", {"theme": "neon-disco"})
    assert code == 400


def test_non_owner_cannot_update_other_user_theme():
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    code, _ = _req(bella, "PUT", "/api/v1/users/mrw/preferences", {"theme": "dark"})
    assert code == 403


def test_owner_can_update_another_user_theme():
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)
    try:
        code, _ = _req(mrw, "PUT", "/api/v1/users/bella/preferences", {"theme": "bella"})
        assert code == 200
        # From Bella's own cookie, the top-level theme must reflect the change.
        bella = _client()
        _switch(bella, "bella", BELLA_PIN)
        _, u = _active(bella)
        assert u["theme"] == "bella"
    finally:
        _req(mrw, "PUT", "/api/v1/users/bella/preferences", {"theme": "light"})


def test_theme_is_user_scoped_no_leak():
    mrw = _client()
    bella = _client()
    _switch(mrw, "mrw", MRW_PIN)
    _switch(bella, "bella", BELLA_PIN)
    try:
        _req(mrw, "PUT", "/api/v1/users/mrw/preferences", {"theme": "dark"})
        _req(bella, "PUT", "/api/v1/users/bella/preferences", {"theme": "bella"})
        _, m = _active(mrw)
        _, b = _active(bella)
        assert m["theme"] == "dark"
        assert b["theme"] == "bella"
        assert m["theme"] != b["theme"]
    finally:
        _req(mrw, "PUT", "/api/v1/users/mrw/preferences", {"theme": "light"})
        _req(bella, "PUT", "/api/v1/users/bella/preferences", {"theme": "light"})


def test_anon_theme_update_blocked():
    anon = _client()
    code, _ = _req(anon, "PUT", "/api/v1/users/mrw/preferences", {"theme": "dark"})
    assert code == 401


def test_theme_persists_across_cookie_reauth():
    """Set theme, reauth from a fresh cookie, theme still reported correctly."""
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)
    try:
        _req(mrw, "PUT", "/api/v1/users/mrw/preferences", {"theme": "dark"})
        # New client jar = simulates a page reload / new browser context
        mrw2 = _client()
        _switch(mrw2, "mrw", MRW_PIN)
        _, u = _active(mrw2)
        assert u["theme"] == "dark"
    finally:
        _req(mrw, "PUT", "/api/v1/users/mrw/preferences", {"theme": "light"})
