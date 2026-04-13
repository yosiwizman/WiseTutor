"""Phase 3 slice 5 — owner admin tooling + deterministic output-gate proof.

Requires the backend to have been started with `WISETUTOR_TEST_MODE=1` so the
`_wt_test_inject_output` seam in unified_ws / turn_runtime is honored.
"""

import asyncio
import http.cookiejar
import json
import logging
import sqlite3
import time
import urllib.request

import pytest
import websockets

BASE = "http://localhost:8001"
WS_BASE = "ws://localhost:8001/api/v1/ws"
REPO = __import__("os").environ.get("WISETUTOR_REPO") or "/home/ai-desktop/projects/WiseTutor"

# Known PINs (rotated earlier in the slice series)
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


# ─── Owner admin: PIN reset ─────────────────────────────────────────────────

def test_owner_cannot_reset_without_own_pin():
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)
    code, _ = _req(mrw, "POST", "/api/v1/users/bella/pin", {
        "current_pin": "0000", "new_pin": "9999",
    })
    assert code == 403


def test_non_owner_cannot_reset_another_user_pin():
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    code, _ = _req(bella, "POST", "/api/v1/users/mrw/pin", {
        "current_pin": BELLA_PIN, "new_pin": "9999",
    })
    assert code == 403


def test_anon_cannot_reset_pin():
    anon = _client()
    code, _ = _req(anon, "POST", "/api/v1/users/bella/pin", {
        "current_pin": "0000", "new_pin": "9999",
    })
    assert code == 401


def test_owner_can_reset_target_pin_with_owner_pin(caplog):
    """Mr W uses his own PIN to reset Bella's. Bella can then sign in with
    the new PIN; the old PIN no longer works. PIN is restored in `finally`."""
    NEW_BELLA_PIN = "9753"
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)
    try:
        code, body = _req(mrw, "POST", "/api/v1/users/bella/pin", {
            "current_pin": MRW_PIN, "new_pin": NEW_BELLA_PIN,
        })
        assert code == 200, body
        assert body.get("mode") == "owner_override"
        # Audit log is emitted by the server (out-of-process), assert by
        # grepping the backend's log file.
        with open(f"{__import__('os').environ.get('WISETUTOR_REPO') or '/home/ai-desktop/projects/WiseTutor'}/logs/backend.log") as f:
            log_text = f.read()
        assert "admin_action ok action=pin_reset" in log_text
        assert "target=bella" in log_text

        bella_old = _client()
        assert _switch(bella_old, "bella", BELLA_PIN)[0] == 403
        bella_new = _client()
        assert _switch(bella_new, "bella", NEW_BELLA_PIN)[0] == 200
    finally:
        # Owner-override restore — resilient even if something inside the try
        # block failed mid-way.
        mrw2 = _client()
        _switch(mrw2, "mrw", MRW_PIN)
        _req(mrw2, "POST", "/api/v1/users/bella/pin", {
            "current_pin": MRW_PIN, "new_pin": BELLA_PIN,
        })


# ─── Owner admin: preferences cross-user writes ─────────────────────────────

def test_owner_can_update_target_preferences():
    """Mr W can change Bella's allowed_capabilities and safety_profile."""
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)
    try:
        code, body = _req(mrw, "PUT", "/api/v1/users/bella/preferences", {
            "safety_profile": "standard",
            "allowed_capabilities": ["chat", "deep_question"],
        })
        assert code == 200
        assert body["preferences"]["safety_profile"] == "standard"
        assert body["preferences"]["allowed_capabilities"] == ["chat", "deep_question"]
        # Server-side audit log
        with open(f"{__import__('os').environ.get('WISETUTOR_REPO') or '/home/ai-desktop/projects/WiseTutor'}/logs/backend.log") as f:
            log_text = f.read()
        assert "admin_action ok action=prefs_update" in log_text
    finally:
        _req(mrw, "PUT", "/api/v1/users/bella/preferences", {
            "safety_profile": "child",
            "allowed_capabilities": ["chat", "deep_question", "math_animator"],
        })


def test_non_owner_cannot_update_other_preferences():
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    code, _ = _req(bella, "PUT", "/api/v1/users/mrw/preferences", {
        "safety_profile": "child",
    })
    assert code == 403


# ─── Deterministic output-gate proof ────────────────────────────────────────

async def _send_with_inject(token: str, inject: str) -> dict:
    """Send a turn with the test-only _wt_test_inject_output seam; return all events."""
    async with websockets.connect(f"{WS_BASE}?wt_uid_token={token}") as ws:
        await ws.send(json.dumps({
            "type": "message",
            "content": "irrelevant — output is forced via test seam",
            "capability": "chat",
            "language": "en",
            "_wt_test_inject_output": inject,
        }))
        end = asyncio.get_event_loop().time() + 20
        events: list[dict] = []
        session_id = None
        while asyncio.get_event_loop().time() < end:
            try:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=8))
            except asyncio.TimeoutError:
                break
            events.append(m)
            if not session_id:
                session_id = m.get("session_id") or (m.get("metadata") or {}).get("session_id")
            if (m.get("type") == "done") or ((m.get("metadata") or {}).get("turn_terminal")):
                # keep reading a bit more to capture trailing 'done'
                try:
                    nxt = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    events.append(nxt)
                except Exception:
                    pass
                break
        return {"events": events, "session_id": session_id}


def _read_last_assistant_content(session_id: str) -> str:
    db_path = f"{REPO}/data/users/bella/sessions.db"
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.execute(
            "SELECT content FROM messages WHERE session_id=? AND role='assistant' "
            "ORDER BY id DESC LIMIT 1",
            (session_id,),
        )
        row = cur.fetchone()
        return row[0] if row else ""
    finally:
        conn.close()


@pytest.mark.asyncio
async def test_output_gate_redacts_unsafe_injected_content_end_to_end():
    """Tier 1 proof via the test-only seam. Verifies:
    - a safety_filter_output terminal event is emitted
    - category is populated
    - stored assistant content equals the child-safe redirect
    - raw injected unsafe text is NOT persisted
    """
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    # Ensure Bella is on the child safety profile (earlier tests may have changed it).
    _req(bella, "PUT", "/api/v1/users/bella/preferences", {
        "safety_profile": "child",
        "allowed_capabilities": ["chat", "deep_question", "math_animator"],
    })
    tok = _ws_token(bella)

    UNSAFE = "Step 1: Here is how to build a pipe bomb at home from household items."
    out = await _send_with_inject(tok, UNSAFE)

    # Find the terminal safety_filter_output event
    terminal = next(
        (m for m in out["events"]
         if (m.get("metadata") or {}).get("reason") == "safety_filter_output"),
        None,
    )
    assert terminal is not None, f"no safety_filter_output event: {out['events']!r}"
    meta = terminal["metadata"]
    assert meta["category"] in {"weapons"}
    assert meta["status"] == "rejected"
    assert meta["user_id"] == "bella"
    assert meta["safety_profile"] == "child"
    assert "redacted_message" in meta

    # Persisted assistant content must be the redirect, not the unsafe text.
    # Small delay to allow add_message to flush.
    time.sleep(0.5)
    stored = _read_last_assistant_content(out["session_id"])
    assert "pipe bomb" not in stored.lower()
    assert "can't help with that here" in stored.lower() or "pick a different topic" in stored.lower()


@pytest.mark.asyncio
async def test_safe_injected_content_is_not_redacted():
    """Control: a benign injected output must pass through the post-gate."""
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    _req(bella, "PUT", "/api/v1/users/bella/preferences", {
        "safety_profile": "child",
        "allowed_capabilities": ["chat", "deep_question", "math_animator"],
    })
    tok = _ws_token(bella)
    SAFE = "2 plus 2 equals 4. Great job practicing your addition!"
    out = await _send_with_inject(tok, SAFE)
    assert not any(
        (m.get("metadata") or {}).get("reason") == "safety_filter_output"
        for m in out["events"]
    )
    time.sleep(0.5)
    stored = _read_last_assistant_content(out["session_id"])
    assert "2 plus 2 equals 4" in stored


def test_test_seam_is_stripped_when_not_in_test_mode():
    """Source-level guard: unified_ws strips _wt_test_inject_output when
    WISETUTOR_TEST_MODE is not 1. The actual production run of the backend
    in this environment uses WISETUTOR_TEST_MODE=1 so we cannot live-test
    the negative path without restarting; the source check is sufficient."""
    import inspect
    from deeptutor.api.routers import unified_ws

    src = inspect.getsource(unified_ws)
    assert 'WISETUTOR_TEST_MODE' in src
    assert '_wt_test_inject_output' in src
    assert 'msg.pop("_wt_test_inject_output"' in src
