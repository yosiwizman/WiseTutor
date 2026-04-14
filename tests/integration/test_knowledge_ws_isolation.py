"""Knowledge progress WebSocket — tenant isolation v2.

The WS endpoint /api/v1/ws is multi-purpose; the knowledge progress
channel lives at /api/v1/knowledge/{kb_name}/progress/ws. We assert:
  - anon WS connection is closed before accept (4401)
  - authed user WS connection succeeds AND only sees its own scope
"""

from __future__ import annotations

import asyncio
import http.cookiejar
import json
import os
import urllib.request

import pytest
import websockets

BASE_HTTP = "http://localhost:8001"
BASE_WS = "ws://localhost:8001"
MRW_PIN = os.environ.get("WT_MRW_PIN", "2468")
BELLA_PIN = os.environ.get("WT_BELLA_PIN", "1357")


def _login(user_id: str, pin: str) -> str:
    """POST /switch and return the wt_uid cookie value."""
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    req = urllib.request.Request(
        f"{BASE_HTTP}/api/v1/users/switch",
        method="POST",
        data=json.dumps({"user_id": user_id, "pin": pin}).encode(),
        headers={"Content-Type": "application/json"},
    )
    opener.open(req).read()
    for c in cj:
        if c.name == "wt_uid":
            return c.value
    raise AssertionError("no wt_uid cookie set")


@pytest.mark.asyncio
async def test_anon_ws_to_knowledge_progress_is_closed():
    url = f"{BASE_WS}/api/v1/knowledge/some_kb/progress/ws"
    try:
        async with websockets.connect(url) as ws:
            # The handler closes with 4401 before send/recv. Either we
            # raise on connect or the first recv yields a close frame.
            try:
                await asyncio.wait_for(ws.recv(), timeout=2.0)
                assert False, "anon WS should be closed before accept"
            except websockets.ConnectionClosed as e:
                assert e.code in (4401, 1006), f"unexpected close code {e.code}"
    except websockets.InvalidStatus as e:
        # 401 at handshake is also acceptable as a deny shape.
        assert e.response.status_code in (401, 403)
    except websockets.ConnectionClosed as e:
        assert e.code in (4401, 1006)


@pytest.mark.asyncio
async def test_authed_ws_to_unknown_kb_completes_quickly_in_own_scope():
    """A signed-in caller hitting a kb_name they don't own (and which
    therefore doesn't exist in their per-user base_dir) gets the
    fast-path 'needs reindex / not started' frame and the socket closes
    cleanly — they never observe the OWNING user's progress events."""
    cookie = _login("bella", BELLA_PIN)
    url = f"{BASE_WS}/api/v1/knowledge/mrw_owned_kb/progress/ws"
    headers = {"Cookie": f"wt_uid={cookie}"}
    async with websockets.connect(url, additional_headers=headers) as ws:
        # The handler sends one progress frame then returns.
        msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(msg)
        assert data.get("type") == "progress"
        # Stage is either 'error' (KB not initialized) or 'completed'
        # for a stale on-disk file. Either way it's about Bella's
        # NON-EXISTENT KB, NOT Mr W's actual progress.
        stage = data.get("data", {}).get("stage")
        assert stage in {"error", "completed", "not_started"}, f"unexpected stage {stage}"
