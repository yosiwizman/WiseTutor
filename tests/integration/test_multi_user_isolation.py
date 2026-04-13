from .conftest import requires_provider

"""Multi-user foundation — live integration tests (Phase 2 slice 2).
These hit the running backend at http://localhost:8001 using cookie-scoped
identity. Per-request identity removes the server-global active user, so the
tests simulate two separate clients by maintaining two cookie jars.
"""
import asyncio
import http.cookiejar
import json
import urllib.request
import uuid
from pathlib import Path
import pytest
import websockets
BASE = "http://localhost:8001"
WS_BASE = "ws://localhost:8001/api/v1/ws"
def _client(cookies: http.cookiejar.CookieJar | None = None):
    cj = cookies if cookies is not None else http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)), cj
def _req(opener, method: str, path: str, body=None):
    req = urllib.request.Request(
        f"{BASE}{path}", method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        r = opener.open(req)
        return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")
def _switch(opener, user_id: str, pin: str):
    return _req(opener, "POST", "/api/v1/users/switch", {"user_id": user_id, "pin": pin})
def _ws_token(opener) -> str:
    _, body = _req(opener, "GET", "/api/v1/users/ws-token")
    return body["token"]
async def _send_turn(ws_token: str) -> str:
    async with websockets.connect(f"{WS_BASE}?wt_uid_token={ws_token}") as ws:
        await ws.send(json.dumps({
            "type": "message",
            "content": "reply only OK",
            "capability": "chat", "language": "en",
        }))
        backend_sid: str | None = None
        end = asyncio.get_event_loop().time() + 180
        while asyncio.get_event_loop().time() < end:
            try:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=30))
            except asyncio.TimeoutError:
                break
            if not backend_sid:
                backend_sid = m.get("session_id") or (m.get("metadata") or {}).get("session_id")
            if m.get("type") == "done" or (m.get("metadata") or {}).get("turn_terminal"):
                break
        assert backend_sid, "no session_id emitted"
        return backend_sid
def test_no_active_without_cookie():
    opener, _ = _client()
    code, _ = _req(opener, "GET", "/api/v1/users/active")
    assert code in (401, 403), f"expected 401/403 for anon, got {code}"
def test_wrong_pin_blocked():
    opener, _ = _client()
    code, _ = _switch(opener, "bella", "0000")
    assert code == 403
def test_two_clients_hold_independent_identities():
    mrw_op, _ = _client()
    bella_op, _ = _client()
    assert _switch(mrw_op, "mrw", "2468")[0] == 200, "mrw switch failed (did rotation happen first?)"
    assert _switch(bella_op, "bella", "1357")[0] == 200
    _, a_mrw = _req(mrw_op, "GET", "/api/v1/users/active")
    _, a_bella = _req(bella_op, "GET", "/api/v1/users/active")
    assert a_mrw["id"] == "mrw"
    assert a_bella["id"] == "bella"
    assert a_mrw["pin_is_default"] is False or a_bella["pin_is_default"] is False
@pytest.mark.asyncio
@requires_provider()
async def test_sessions_isolated_per_cookie():
    mrw_op, _ = _client()
    bella_op, _ = _client()
    assert _switch(mrw_op, "mrw", "2468")[0] == 200
    assert _switch(bella_op, "bella", "1357")[0] == 200
    mrw_tok = _ws_token(mrw_op)
    bella_tok = _ws_token(bella_op)
    mrw_sid = await _send_turn(mrw_tok)
    bella_sid = await _send_turn(bella_tok)
    _, mrw_list = _req(mrw_op, "GET", "/api/v1/sessions")
    _, bella_list = _req(bella_op, "GET", "/api/v1/sessions")
    mrw_ids = {s["id"] for s in mrw_list.get("sessions", [])}
    bella_ids = {s["id"] for s in bella_list.get("sessions", [])}
    assert mrw_sid in mrw_ids
    assert bella_sid in bella_ids
    assert mrw_sid not in bella_ids
    assert bella_sid not in mrw_ids
@requires_provider()
def test_verify_cache_is_per_user():
    mrw_op, _ = _client()
    bella_op, _ = _client()
    assert _switch(mrw_op, "mrw", "2468")[0] == 200
    assert _switch(bella_op, "bella", "1357")[0] == 200
    _req(mrw_op, "POST", "/api/v1/settings/verify", {"service": "llm"})
    _, mrw_diag = _req(mrw_op, "GET", "/api/v1/settings/diagnostics")
    _, bella_diag = _req(bella_op, "GET", "/api/v1/settings/diagnostics")
    assert mrw_diag.get("verify_cache"), "mrw should see its own verify cache"
    assert not bella_diag.get("verify_cache"), "bella must not see mrw's verify cache"
def test_legacy_dir_was_migrated_off_live_path():
    import os as _os
    repo = Path(_os.environ.get("WISETUTOR_REPO") or "/home/ai-desktop/projects/WiseTutor")
    assert not (repo / "data" / "memory").exists(), "legacy data/memory was not archived"
    archive_root = repo / "data" / "users" / "_legacy"
    assert archive_root.is_dir(), "legacy archive dir missing"
    assert any(archive_root.iterdir()), "legacy archive dir is empty"
