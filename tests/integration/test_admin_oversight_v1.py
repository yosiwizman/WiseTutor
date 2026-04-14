"""Admin oversight v1 — owner cross-user read of memory + knowledge.

Asserts the new GET-only oversight contract:
  - GET /api/v1/memory?as_user=<child_id> — owner OK, child 403
  - GET /api/v1/knowledge/list?as_user=<child_id> — owner OK, child 403
  - GET /api/v1/knowledge/{kb_name}?as_user=<child_id> — owner OK, child 403

Mutating endpoints are explicitly NOT extended with as_user in this slice.
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import urllib.error
import urllib.request

BASE = "http://localhost:8001"
MRW_PIN = os.environ.get("WT_MRW_PIN", "2468")
BELLA_PIN = os.environ.get("WT_BELLA_PIN", "1357")


def _client():
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)), cj


def _req(opener, method, path, body=None, content_type="application/json"):
    if body is None:
        data = None
        headers = {}
    elif content_type == "application/json":
        data = json.dumps(body).encode()
        headers = {"Content-Type": "application/json"}
    else:
        data = body
        headers = {"Content-Type": content_type}
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


# ── memory inspect ──────────────────────────────────────────────────────

def test_child_cannot_inspect_other_user_memory():
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    code, _ = _req(bella, "GET", "/api/v1/memory?as_user=mrw")
    assert code == 403


def test_owner_can_inspect_child_memory_readonly():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "GET", "/api/v1/memory?as_user=bella")
    assert code == 200, f"owner inspect failed: {code} {body}"
    # Snapshot fields must be present, even if empty
    assert isinstance(body, dict)
    assert "summary" in body and "profile" in body


def test_owner_self_memory_still_works():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "GET", "/api/v1/memory")
    assert code == 200
    assert isinstance(body, dict)


def test_owner_inspect_unknown_user_returns_404():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, _ = _req(mrw, "GET", "/api/v1/memory?as_user=does-not-exist")
    assert code == 404


# ── knowledge inspect ───────────────────────────────────────────────────

def test_child_cannot_inspect_other_user_knowledge_list():
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    code, _ = _req(bella, "GET", "/api/v1/knowledge/list?as_user=mrw")
    assert code == 403


def test_child_cannot_inspect_other_user_knowledge_details():
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    code, _ = _req(bella, "GET", "/api/v1/knowledge/some_kb_name?as_user=mrw")
    assert code == 403


def test_owner_can_inspect_child_knowledge_list_readonly():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "GET", "/api/v1/knowledge/list?as_user=bella")
    assert code == 200, f"owner knowledge inspect failed: {code} {body}"
    assert isinstance(body, list)


# ── confirm mutating endpoints do NOT honor as_user ────────────────────

def test_mutating_endpoints_ignore_as_user_for_inspect_safety():
    """PUT /memory must not be redirectable into a child's memory via
    as_user — the param is intentionally ignored on writes. We just
    confirm the endpoint still resolves to the caller's own scope and
    rejects child auth as before."""
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    # PUT /memory does not accept as_user. Even if we sneak it in the URL,
    # the endpoint signature has no such param, so it's silently ignored
    # and the write goes to Mr W's own memory.
    code, body = _req(
        mrw,
        "PUT",
        "/api/v1/memory?as_user=bella",
        {"file": "summary", "content": "## audit_marker\n- mrw_only\n"},
    )
    assert code == 200, f"owner self write failed: {code} {body}"
    # Re-read Bella's memory; must NOT contain the marker.
    code, bella_view = _req(mrw, "GET", "/api/v1/memory?as_user=bella")
    assert code == 200
    assert "audit_marker" not in (bella_view.get("summary") or ""), (
        "as_user on PUT must NOT redirect writes; Bella's memory was mutated"
    )
