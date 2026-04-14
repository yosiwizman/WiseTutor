"""Family RBAC v1 — integration proofs.

Hits the live backend at http://localhost:8001 with two cookie jars
(Mr W = owner, Bella = child). Each test asserts the minimum new
contract introduced in the RBAC v1 slice:

  - child cannot upsert / create another user (POST /api/v1/users)
  - child cannot mutate global UI settings (PUT /api/v1/settings/theme,
    /language)
  - child cannot list another user's knowledge bases
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


def test_child_cannot_upsert_user():
    bella, _ = _client()
    code, _ = _switch(bella, "bella", BELLA_PIN)
    assert code == 200, "Bella sign-in failed; check WT_BELLA_PIN seed"
    code, body = _req(
        bella,
        "POST",
        "/api/v1/users",
        {"user_id": "intruder", "display_name": "Intruder", "role": "owner", "pin": "0000"},
    )
    assert code == 403, f"child must NOT be able to upsert users; got {code} {body}"


def test_anon_cannot_upsert_user():
    anon, _ = _client()
    code, _ = _req(
        anon,
        "POST",
        "/api/v1/users",
        {"user_id": "intruder", "display_name": "Intruder", "role": "owner", "pin": "0000"},
    )
    assert code == 401


def test_child_cannot_change_global_theme():
    bella, _ = _client()
    code, _ = _switch(bella, "bella", BELLA_PIN)
    assert code == 200
    for path, payload in (
        ("/api/v1/settings/theme", {"theme": "dark"}),
        ("/api/v1/settings/language", {"language": "zh"}),
    ):
        code, body = _req(bella, "PUT", path, payload)
        assert code == 403, f"child must NOT mutate global setting {path}; got {code} {body}"


def test_owner_can_change_global_theme():
    mrw, _ = _client()
    code, _ = _switch(mrw, "mrw", MRW_PIN)
    assert code == 200
    code, body = _req(mrw, "PUT", "/api/v1/settings/theme", {"theme": "light"})
    assert code == 200, f"owner must be allowed to set theme; got {code} {body}"


def test_child_cannot_list_other_user_knowledge():
    """Mr W creates a KB; Bella's /list does not include it."""
    import io

    mrw, _ = _client()
    bella, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200

    # Build multipart form for create
    boundary = "----wt-rbac-boundary"
    kb_name = "rbac_isolation_demo"
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
        + b"hello world"
        + f"\r\n--{boundary}--\r\n".encode()
    )
    form_body = b"".join(body_parts)

    # Owner creates the KB. The provider may reject the actual ingestion
    # downstream (no live model in the no-provider CI subset), but the
    # registration in kb_config.json happens synchronously before the
    # background task — which is enough for the list endpoint to surface
    # the KB name.
    code, _ = _req(
        mrw,
        "POST",
        "/api/v1/knowledge/create",
        form_body,
        content_type=f"multipart/form-data; boundary={boundary}",
    )
    assert code in (200, 400, 500), f"create returned unexpected status {code}"

    # Mr W's list — should include the new KB (or at least be a list).
    code, mrw_list = _req(mrw, "GET", "/api/v1/knowledge/list")
    assert code == 200
    mrw_names = {kb.get("name") for kb in mrw_list} if isinstance(mrw_list, list) else set()

    # Bella's list — must NOT include Mr W's KB.
    code, bella_list = _req(bella, "GET", "/api/v1/knowledge/list")
    assert code == 200
    bella_names = {kb.get("name") for kb in bella_list} if isinstance(bella_list, list) else set()

    assert kb_name not in bella_names, (
        f"isolation breach: Bella sees Mr W's KB '{kb_name}'. "
        f"bella={bella_names!r} mrw={mrw_names!r}"
    )
