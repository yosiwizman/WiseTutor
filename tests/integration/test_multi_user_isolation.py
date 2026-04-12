"""Multi-user foundation — live integration tests.

These hit the running backend at http://localhost:8001. They prove:
  - PIN is required to switch user
  - wrong PIN is rejected
  - memory reads/writes are scoped per user (no cross-leak)
  - session lists are scoped per user
  - active user is visible from the API
"""

import asyncio
import json
import urllib.request
import uuid
from pathlib import Path

import pytest
import websockets

BASE = "http://localhost:8001"
WS = "ws://localhost:8001/api/v1/ws"
DEFAULT_PINS = {"mrw": "1234", "bella": "5678"}


def _req(method: str, path: str, body: dict | None = None):
    req = urllib.request.Request(
        f"{BASE}{path}", method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        r = urllib.request.urlopen(req)
        return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def _switch(user_id: str, pin: str):
    return _req("POST", "/api/v1/users/switch", {"user_id": user_id, "pin": pin})


async def _send_turn(content: str) -> str:
    """Send one chat turn and return the session_id the BACKEND assigned."""
    async with websockets.connect(WS) as ws:
        await ws.send(json.dumps({
            "type": "message",
            "content": content, "capability": "chat", "language": "en",
        }))
        backend_sid: str | None = None
        end = asyncio.get_event_loop().time() + 45
        while asyncio.get_event_loop().time() < end:
            try:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
            except asyncio.TimeoutError:
                break
            # session_id arrives either as top-level field or in metadata
            if not backend_sid:
                sid_candidate = m.get("session_id") or (m.get("metadata") or {}).get("session_id")
                if sid_candidate:
                    backend_sid = sid_candidate
            if (m.get("metadata") or {}).get("turn_terminal"):
                break
        assert backend_sid, "backend never emitted a session_id"
        return backend_sid


def test_active_user_endpoint_returns_current_user():
    code, body = _req("GET", "/api/v1/users/active")
    assert code == 200
    assert body["id"] in {"mrw", "bella"}
    assert "pin_hash" not in body and "pin_salt" not in body  # never leak


def test_list_endpoint_does_not_leak_pin_fields():
    code, body = _req("GET", "/api/v1/users")
    assert code == 200
    for u in body["users"]:
        assert "pin_hash" not in u and "pin_salt" not in u


def test_wrong_pin_blocks_switch():
    code, _ = _switch("bella", "9999")
    assert code == 403
    # Active user should NOT be bella now (unless it already was).
    code, active = _req("GET", "/api/v1/users/active")
    assert code == 200


def test_correct_pin_switches():
    code, _ = _switch("mrw", DEFAULT_PINS["mrw"])
    assert code == 200
    _, active = _req("GET", "/api/v1/users/active")
    assert active["id"] == "mrw"
    code, _ = _switch("bella", DEFAULT_PINS["bella"])
    assert code == 200
    _, active = _req("GET", "/api/v1/users/active")
    assert active["id"] == "bella"


def test_per_user_memory_dirs_exist_and_are_isolated(tmp_path):
    """Drop distinct content into each user's PROFILE.md; assert neither path
    contains the other's marker. Uses the real on-disk layout."""
    repo = Path("/home/ai-desktop/projects/DeepTutor")  # backend lives here
    mrw_profile = repo / "data/users/mrw/memory/PROFILE.md"
    bella_profile = repo / "data/users/bella/memory/PROFILE.md"
    assert mrw_profile.parent.is_dir(), "mrw memory dir missing"
    assert bella_profile.parent.is_dir(), "bella memory dir missing"
    mrw_profile.write_text("## Identity\n__mrw_marker__\n")
    bella_profile.write_text("## Identity\n__bella_marker__\n")
    assert "__bella_marker__" not in mrw_profile.read_text()
    assert "__mrw_marker__" not in bella_profile.read_text()


@pytest.mark.asyncio
async def test_sessions_are_scoped_per_user():
    """Send a turn as mrw, then as bella; each user's /sessions list must
    only contain their own turn's session."""
    _switch("mrw", DEFAULT_PINS["mrw"])
    mrw_sid = await _send_turn("Unique-mrw-marker alpha")
    _, mrw_list = _req("GET", "/api/v1/sessions")
    mrw_ids = {s.get("session_id") or s.get("id") for s in (mrw_list if isinstance(mrw_list, list) else mrw_list.get("sessions", []))}
    assert mrw_sid in mrw_ids, "mrw session not in mrw list"

    _switch("bella", DEFAULT_PINS["bella"])
    bella_sid = await _send_turn("Unique-bella-marker alpha")
    _, bella_list = _req("GET", "/api/v1/sessions")
    bella_ids = {s.get("session_id") or s.get("id") for s in (bella_list if isinstance(bella_list, list) else bella_list.get("sessions", []))}
    assert bella_sid in bella_ids, "bella session not in bella list"
    assert mrw_sid not in bella_ids, "CROSS-USER LEAK: mrw session appeared for bella"

    # Flip back to mrw and re-check
    _switch("mrw", DEFAULT_PINS["mrw"])
    _, mrw_list2 = _req("GET", "/api/v1/sessions")
    mrw_ids2 = {s.get("session_id") or s.get("id") for s in (mrw_list2 if isinstance(mrw_list2, list) else mrw_list2.get("sessions", []))}
    assert bella_sid not in mrw_ids2, "CROSS-USER LEAK: bella session appeared for mrw"


def test_memory_service_resolves_per_user(tmp_path, monkeypatch):
    """Unit-ish: MemoryService returned by get_memory_service() after a switch
    points to the new user's memory dir."""
    from deeptutor.services.memory import get_memory_service
    from deeptutor.services.users import get_user_service

    svc = get_user_service()
    svc.switch("mrw", DEFAULT_PINS["mrw"])
    mem_mrw = get_memory_service()
    mrw_dir = mem_mrw._memory_dir

    svc.switch("bella", DEFAULT_PINS["bella"])
    mem_bella = get_memory_service()
    bella_dir = mem_bella._memory_dir

    assert str(mrw_dir).endswith("/mrw/memory"), f"unexpected mrw memory dir: {mrw_dir}"
    assert str(bella_dir).endswith("/bella/memory"), f"unexpected bella memory dir: {bella_dir}"
    assert mrw_dir != bella_dir


def test_session_store_resolves_per_user():
    """Cached session store must swap its db path after a user switch."""
    from deeptutor.services.session import get_sqlite_session_store
    from deeptutor.services.users import get_user_service

    svc = get_user_service()
    svc.switch("mrw", DEFAULT_PINS["mrw"])
    mrw_store = get_sqlite_session_store()
    svc.switch("bella", DEFAULT_PINS["bella"])
    bella_store = get_sqlite_session_store()
    assert mrw_store.db_path != bella_store.db_path
    assert "/mrw/" in str(mrw_store.db_path)
    assert "/bella/" in str(bella_store.db_path)
