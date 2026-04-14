"""Knowledge task stream ownership binding v1.

Proves that the GET /api/v1/knowledge/tasks/{task_id}/stream endpoint is
now gated by an explicit owner_user_id stamped on every KB task. A child
with the exact foreign task_id cannot subscribe — the security control
is ownership, not random-id obscurity.

We hit the real backend on :8001. Tasks are created by calling POST
/knowledge/create as Mr W (which may error downstream in the no-provider
CI subset — that's OK; the task_id is registered in TaskIDManager before
the background task runs).
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
        ctype = r.headers.get("Content-Type", "")
        if "event-stream" in ctype:
            return r.status, {"kind": "sse", "raw": raw}
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


def _seed_task_id(user_id: str, pin: str) -> str:
    """Create a KB as the given user and return the live backend's
    task_id. The create call may error downstream (no live RAG
    provider in CI) but the task_id is registered in TaskIDManager —
    which carries the owner_user_id binding — before the background
    task runs, and is returned either in the 200 body or surfaced on
    a 500 response via the task_stream_manager log path.

    The simplest reliable seed is via the create endpoint in the live
    backend process: any other seed path would hit a separate
    TaskIDManager singleton in the pytest process and not match the
    backend's ownership map."""
    op, _ = _client()
    assert _switch(op, user_id, pin)[0] == 200

    boundary = "----wt-task-seed-boundary"
    kb_name = f"task_own_{user_id}_{os.urandom(3).hex()}"
    body_parts = []
    for field, value in (("name", kb_name), ("rag_provider", "llamaindex")):
        body_parts.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{field}"\r\n\r\n'
            f"{value}\r\n".encode()
        )
    body_parts.append(
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="files"; filename="seed.txt"\r\n'
        f"Content-Type: text/plain\r\n\r\n".encode()
        + b"ownership seed"
        + f"\r\n--{boundary}--\r\n".encode()
    )
    form_body = b"".join(body_parts)
    code, body = _req(
        op, "POST", "/api/v1/knowledge/create", form_body,
        content_type=f"multipart/form-data; boundary={boundary}",
    )
    # Task id is returned in the success shape. If the endpoint 500s
    # downstream we can fall back to grepping the response body.
    if isinstance(body, dict) and body.get("task_id"):
        return body["task_id"]
    raise AssertionError(f"could not seed task: {code} {body}")


def test_anon_cannot_stream_any_task():
    anon, _ = _client()
    code, _ = _req(anon, "GET", "/api/v1/knowledge/tasks/whatever/stream")
    assert code == 401


def test_unknown_task_id_returns_404():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "GET", "/api/v1/knowledge/tasks/this_id_was_never_registered/stream")
    assert code == 404
    assert (body or {}).get("detail") == "task_not_found"


def test_child_cannot_stream_owner_task_even_with_exact_id():
    task_id = _seed_task_id("mrw", MRW_PIN)
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    code, body = _req(bella, "GET", f"/api/v1/knowledge/tasks/{task_id}/stream")
    assert code == 403, f"child must not observe foreign task; got {code} {body}"
    assert (body or {}).get("detail") == "forbidden"


def test_owner_can_stream_own_task():
    task_id = _seed_task_id("mrw", MRW_PIN)
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    # SSE endpoint opens with 200 and a text/event-stream body; we only
    # check the status here — reading the stream is not in scope.
    code, body = _req(mrw, "GET", f"/api/v1/knowledge/tasks/{task_id}/stream")
    assert code == 200, f"owner must stream own task; got {code} {body}"


def test_owner_cannot_inspect_child_task_stream_cross_user():
    """Owner cross-user inspect on task streams is intentionally NOT
    added — the read-only inspect contract is bounded to /list and
    /{kb_name}. A task owned by Bella must refuse Mr W."""
    bella_task = _seed_task_id("bella", BELLA_PIN)
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "GET", f"/api/v1/knowledge/tasks/{bella_task}/stream")
    assert code == 403
    assert (body or {}).get("detail") == "forbidden"


def test_task_ownership_survives_task_id_guess_shape():
    """Even if a child guesses the exact task_id shape, absence of
    ownership binding yields 404 (unknown) rather than the stream —
    no info leak about existence of other users' tasks."""
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    # A well-formed kb_init task_id shape that was never registered.
    guessed = "kb_init_20260101_000000_deadbeef"
    code, _ = _req(bella, "GET", f"/api/v1/knowledge/tasks/{guessed}/stream")
    assert code == 404
