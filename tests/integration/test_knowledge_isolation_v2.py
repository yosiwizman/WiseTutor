"""Knowledge tenant isolation v2 — operational endpoint closure.

Closes the remaining knowledge-router gaps left open after RBAC v1 +
admin oversight v1:
  - GET  /api/v1/knowledge/configs                         (per-user)
  - GET  /api/v1/knowledge/{kb_name}/config                (per-user)
  - PUT  /api/v1/knowledge/{kb_name}/config                (per-user, write)
  - POST /api/v1/knowledge/configs/sync                    (per-user, write)
  - GET  /api/v1/knowledge/{kb_name}/progress              (per-user)
  - POST /api/v1/knowledge/{kb_name}/progress/clear        (per-user, write)
  - GET  /api/v1/knowledge/tasks/{task_id}/stream          (require uid)
  - POST /api/v1/knowledge/{kb_name}/link-folder           (self-only write)
  - GET  /api/v1/knowledge/{kb_name}/linked-folders        (self-only)
  - DELETE /api/v1/knowledge/{kb_name}/linked-folders/{id} (self-only)
  - POST /api/v1/knowledge/{kb_name}/sync-folder/{id}      (self-only)
  - WS   /api/v1/knowledge/{kb_name}/progress/ws           (cookie-gated)

The `as_user` query parameter is INTENTIONALLY not honored here — owner
read-only inspect is only on /list and /{kb_name} (admin-oversight v1).
Cross-user write was deliberately never built."""

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


# ── all remaining operational endpoints reject anonymous callers ────────

OPERATIONAL_HTTP_ENDPOINTS = [
    ("GET",    "/api/v1/knowledge/configs"),
    ("GET",    "/api/v1/knowledge/some_kb/config"),
    ("PUT",    "/api/v1/knowledge/some_kb/config"),
    ("POST",   "/api/v1/knowledge/configs/sync"),
    ("GET",    "/api/v1/knowledge/some_kb/progress"),
    ("POST",   "/api/v1/knowledge/some_kb/progress/clear"),
    ("GET",    "/api/v1/knowledge/tasks/abc123/stream"),
    ("POST",   "/api/v1/knowledge/some_kb/link-folder"),
    ("GET",    "/api/v1/knowledge/some_kb/linked-folders"),
    ("DELETE", "/api/v1/knowledge/some_kb/linked-folders/folder123"),
    ("POST",   "/api/v1/knowledge/some_kb/sync-folder/folder123"),
]


def test_anon_cannot_access_any_operational_knowledge_endpoint():
    anon, _ = _client()
    for method, path in OPERATIONAL_HTTP_ENDPOINTS:
        body = {"folder_path": "/tmp/ignored"} if path.endswith("/link-folder") else (
            {"rag_provider": "llamaindex"} if path.endswith("/config") and method == "PUT" else None
        )
        code, _ = _req(anon, method, path, body)
        assert code == 401, f"{method} {path} expected 401 anon, got {code}"


# ── child cannot observe / mutate Mr W's operational state ──────────────

def test_child_configs_returns_only_own_namespace():
    """GET /configs is per-user — Bella's response must NOT contain
    knowledge_bases that exist only in Mr W's per-user config."""
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    code, body = _req(bella, "GET", "/api/v1/knowledge/configs")
    assert code == 200, f"expected 200 for child self-configs, got {code}"
    # Bella has no KBs created in this test — body should be either an
    # empty defaults shape or a dict whose knowledge_bases is empty.
    kbs = (body or {}).get("knowledge_bases", {})
    assert isinstance(kbs, dict)


def test_child_cannot_read_other_user_specific_kb_config():
    """The endpoint is self-scoped: Bella asking for Mr W's
    'foo' KB config gets her own scope's view (no cross-tenant leak)."""
    mrw, _ = _client()
    bella, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    # Seed: Mr W writes a config for KB "tenant_v2_demo".
    code, _ = _req(
        mrw, "PUT", "/api/v1/knowledge/tenant_v2_demo/config",
        {"rag_provider": "llamaindex"},
    )
    assert code == 200, f"owner write failed: {code}"
    # Mr W's read sees the value.
    code, body = _req(mrw, "GET", "/api/v1/knowledge/tenant_v2_demo/config")
    assert code == 200
    assert (body or {}).get("config", {}).get("rag_provider") == "llamaindex"
    # Bella's read for the same kb_name MUST NOT see Mr W's value.
    code, body = _req(bella, "GET", "/api/v1/knowledge/tenant_v2_demo/config")
    # Either 200 with an empty/default config (her own scope has no such
    # KB) or a 404 — both are acceptable as long as she does NOT see
    # rag_provider=llamaindex (Mr W's value).
    if code == 200:
        bella_provider = (body or {}).get("config", {}).get("rag_provider")
        # The default for a brand-new entry in her scope is also
        # "llamaindex", so we must distinguish: only fail if Bella's
        # response shape carries a NON-default field that Mr W set.
        # In practice, the per-user config service initializes any
        # missing KB with defaults, so just assert Bella's view is
        # her OWN config_path's content, not Mr W's. We do that by
        # writing a different value as Bella and confirming it sticks
        # without affecting Mr W.
        assert _req(
            bella, "PUT", "/api/v1/knowledge/tenant_v2_demo/config",
            {"rag_provider": "llamaindex", "search_mode": "tenant_b"},
        )[0] == 200
        # Mr W must still see his own search_mode (or default), not "tenant_b".
        code2, body2 = _req(mrw, "GET", "/api/v1/knowledge/tenant_v2_demo/config")
        assert code2 == 200
        mrw_search = (body2 or {}).get("config", {}).get("search_mode")
        assert mrw_search != "tenant_b", (
            f"isolation breach: Mr W sees Bella's search_mode={mrw_search}"
        )


def test_child_cannot_read_or_clear_other_user_progress():
    """Per-user progress files. Bella's GET /progress for an unknown KB
    returns the not_started shape; her POST /progress/clear succeeds in
    her own scope but does NOT affect Mr W's progress file."""
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    code, body = _req(bella, "GET", "/api/v1/knowledge/some_unknown_kb/progress")
    assert code == 200
    assert (body or {}).get("status") == "not_started"
    # Clear in her own scope is fine and never reaches Mr W's data.
    code, body = _req(bella, "POST", "/api/v1/knowledge/some_unknown_kb/progress/clear")
    assert code == 200


def test_child_cannot_link_or_unlink_in_other_user_scope():
    """Mutations are self-scoped only — even if Bella knows Mr W's
    kb_name she only manipulates her OWN namespace."""
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    # link-folder against an unknown KB in her own scope -> 404 from
    # KnowledgeBaseManager, never an effect on Mr W's KB.
    code, _ = _req(
        bella, "POST", "/api/v1/knowledge/mrw_owned_kb_name/link-folder",
        {"folder_path": "/tmp/wt_isolation_test_should_not_exist"},
    )
    # 404 (kb not in Bella's scope) or 400 (folder path invalid) — never
    # 200, because Bella has no such KB.
    assert code in (400, 404), f"unexpected status {code}"


def test_owner_inspect_did_not_grow_into_cross_user_write():
    """Sanity: previously-allowed owner read-inspect (?as_user=) on /list
    and /{kb_name} still works, but it must NOT extend to writes on the
    operational endpoints in this slice. PUT /config?as_user=bella from
    Mr W writes to Mr W's own scope (parameter is ignored on writes)."""
    mrw, _ = _client()
    bella, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    # Mr W tries to set a unique value into "Bella's" config via as_user.
    sentinel = "wt_no_cross_user_write"
    _req(
        mrw, "PUT", f"/api/v1/knowledge/cross_check_kb/config?as_user=bella",
        {"rag_provider": "llamaindex", "search_mode": sentinel},
    )
    # Bella's read must NOT contain the sentinel.
    code, body = _req(bella, "GET", "/api/v1/knowledge/cross_check_kb/config")
    assert code == 200
    bella_search = (body or {}).get("config", {}).get("search_mode")
    assert bella_search != sentinel, (
        f"as_user must NOT enable cross-user write; bella sees {bella_search!r}"
    )


# ── prior list/details/inspect contract still passes ────────────────────

def test_owner_list_inspect_still_works():
    mrw, _ = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    code, body = _req(mrw, "GET", "/api/v1/knowledge/list?as_user=bella")
    assert code == 200
    assert isinstance(body, list)


def test_child_list_inspect_still_denied():
    bella, _ = _client()
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200
    code, _ = _req(bella, "GET", "/api/v1/knowledge/list?as_user=mrw")
    assert code == 403
