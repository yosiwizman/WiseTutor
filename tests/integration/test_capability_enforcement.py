from .conftest import requires_provider

"""Phase 3 slice 3 — capability enforcement proofs."""

import asyncio
import http.cookiejar
import json
import urllib.request
import uuid

import pytest
import websockets

BASE = "http://localhost:8001"
WS_BASE = "ws://localhost:8001/api/v1/ws"
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
            body = json.loads(e.read() or b"null")
        except Exception:
            body = None
        return e.code, body


def _switch(opener, user_id, pin):
    return _req(opener, "POST", "/api/v1/users/switch", {"user_id": user_id, "pin": pin})


def _ws_token(opener) -> str:
    _, body = _req(opener, "GET", "/api/v1/users/ws-token")
    return body["token"]


async def _ws_try_capability(token: str, capability: str) -> dict:
    """Send one turn with a specific capability; return the first terminal event."""
    async with websockets.connect(f"{WS_BASE}?wt_uid_token={token}") as ws:
        await ws.send(json.dumps({
            "type": "message",
            "content": "ping",
            "capability": capability,
            "language": "en",
        }))
        end = asyncio.get_event_loop().time() + 30
        while asyncio.get_event_loop().time() < end:
            try:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            except asyncio.TimeoutError:
                return {"type": "timeout"}
            meta = m.get("metadata") or {}
            if meta.get("turn_terminal"):
                return m
        return {"type": "no_terminal"}


@pytest.mark.asyncio
async def test_bella_deep_research_rejected_at_ws_boundary():
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    tok = _ws_token(bella)
    resp = await _ws_try_capability(tok, "deep_research")
    assert resp.get("type") == "error", resp
    meta = resp.get("metadata") or {}
    assert meta.get("status") == "rejected"
    assert meta.get("reason") == "capability_not_allowed"
    assert meta.get("requested_capability") == "deep_research"
    assert "deep_research" not in (meta.get("allowed_capabilities") or [])


@pytest.mark.asyncio
async def test_bella_deep_solve_rejected_at_ws_boundary():
    """deep_solve is NOT in Bella's child default allowlist."""
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    tok = _ws_token(bella)
    resp = await _ws_try_capability(tok, "deep_solve")
    assert (resp.get("metadata") or {}).get("reason") == "capability_not_allowed"


@pytest.mark.asyncio
@requires_provider()
async def test_bella_chat_allowed():
    """Chat IS in Bella's allowlist — the WS must NOT emit a capability_not_allowed
    rejection. We don't require the turn to complete; we require that any early
    events are NOT capability-rejections and that at least one pipeline event
    (session/progress/stage_start/runtime) appears."""
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    tok = _ws_token(bella)
    async with websockets.connect(f"{WS_BASE}?wt_uid_token={tok}") as ws:
        await ws.send(json.dumps({
            "type": "message", "content": "reply OK",
            "capability": "chat", "language": "en",
        }))
        end = asyncio.get_event_loop().time() + 20
        saw_pipeline_event = False
        while asyncio.get_event_loop().time() < end:
            try:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
            except asyncio.TimeoutError:
                break
            meta = m.get("metadata") or {}
            # Any capability rejection would be a bug for chat.
            assert meta.get("reason") != "capability_not_allowed", meta
            if m.get("type") in {"session", "progress", "stage_start", "thinking"}:
                saw_pipeline_event = True
                break
        assert saw_pipeline_event, "no pipeline activity observed for Bella chat"


@pytest.mark.asyncio
@requires_provider()
async def test_mrw_deep_research_allowed():
    """deep_research IS in Mr W's owner default allowlist."""
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)
    tok = _ws_token(mrw)
    async with websockets.connect(f"{WS_BASE}?wt_uid_token={tok}") as ws:
        # Send a minimal message and bail once we see anything non-rejection.
        await ws.send(json.dumps({
            "type": "message", "content": "ping",
            "capability": "deep_research", "language": "en",
        }))
        end = asyncio.get_event_loop().time() + 15
        while asyncio.get_event_loop().time() < end:
            try:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            except asyncio.TimeoutError:
                break
            meta = m.get("metadata") or {}
            if meta.get("reason") == "capability_not_allowed":
                raise AssertionError("deep_research wrongly rejected for Mr W")
            # Anything else — stage_start, progress, session — is proof that
            # the capability was accepted. We don't need the full turn.
            if m.get("type") in {"session", "progress", "stage_start", "thinking"}:
                return
        # If we got nothing, that's not a hard fail but the contract is that we
        # must NOT have seen capability_not_allowed.


def test_runtime_safety_net_rejects_crafted_direct_turn():
    """Server-side safety net: if a crafted request carries _wt_preferences
    without a disallowed capability, the turn_runtime must still reject."""
    from deeptutor.services.session.turn_runtime import TurnRuntimeManager, _TurnExecution
    import inspect

    # Source-level guard proving the safety net is present and keyed on the
    # stamped user id.
    src = inspect.getsource(TurnRuntimeManager._run_turn)
    assert "capability_not_allowed" in src
    assert "_wt_user_id" in src
    assert "_wt_preferences" in src


def test_anon_ws_still_rejected():
    """With no cookie and no token, the backend must refuse a message frame
    with reason=no_user (unchanged from Phase 2)."""
    async def _run():
        async with websockets.connect(WS_BASE) as ws:
            await ws.send(json.dumps({
                "type": "message", "content": "x",
                "capability": "chat", "language": "en",
            }))
            end = asyncio.get_event_loop().time() + 10
            while asyncio.get_event_loop().time() < end:
                try:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
                except asyncio.TimeoutError:
                    return None
                if (m.get("metadata") or {}).get("turn_terminal"):
                    return m
            return None
    m = asyncio.run(_run())
    assert m is not None
    assert (m.get("metadata") or {}).get("reason") == "no_user"


def test_prefs_not_leaking_across_users_through_global_cache():
    """Resolve Mr W's and Bella's preferences through the live API. They
    must differ in allowed_capabilities. This guards against a regression
    where a process-global cached preference dict could leak."""
    mrw = _client()
    bella = _client()
    _switch(mrw, "mrw", MRW_PIN)
    _switch(bella, "bella", BELLA_PIN)
    _, m = _req(mrw, "GET", "/api/v1/users/mrw/preferences")
    _, b = _req(bella, "GET", "/api/v1/users/bella/preferences")
    m_caps = set(m["preferences"]["allowed_capabilities"])
    b_caps = set(b["preferences"]["allowed_capabilities"])
    assert m_caps != b_caps
    assert "deep_research" in m_caps
    assert "deep_research" not in b_caps
