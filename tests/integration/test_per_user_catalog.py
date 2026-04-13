"""Phase 3 slice 1 — per-user provider/model catalog.

Proves the shared-state fix: Mr W and Bella can hold independent active
providers/models simultaneously; one user's change does not mutate the
other's; anon gets 401 from settings endpoints.
"""

import http.cookiejar
import json
import urllib.request
from pathlib import Path

REPO = Path("/home/ai-desktop/projects/WiseTutor")
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
        return e.code, json.loads(e.read() or b"null")


def _switch(opener, user_id, pin):
    return _req(opener, "POST", "/api/v1/users/switch", {"user_id": user_id, "pin": pin})


def test_anon_catalog_endpoints_return_401():
    anon = _client()
    for path in ("/api/v1/settings/catalog", "/api/v1/settings"):
        code, _ = _req(anon, "GET", path)
        assert code == 401, f"{path} expected 401 anon, got {code}"
    code, _ = _req(anon, "POST", "/api/v1/settings/active",
                   {"service": "llm", "profile_id": "x", "model_id": "y"})
    assert code == 401


def test_each_user_has_their_own_catalog_file_on_disk():
    mrw_file = REPO / "data/users/mrw/settings/model_catalog.json"
    bella_file = REPO / "data/users/bella/settings/model_catalog.json"
    assert mrw_file.is_file(), f"missing {mrw_file}"
    assert bella_file.is_file(), f"missing {bella_file}"
    assert mrw_file != bella_file


def test_legacy_shared_catalog_is_off_the_live_path():
    # The per-user paths are authoritative. A shared model_catalog.json at
    # data/user/settings must be archived, even if other settings files
    # (interface.json, tour cache) legitimately live there.
    shared_catalog = REPO / "data/user/settings/model_catalog.json"
    if shared_catalog.exists():
        # Allow only if it's a stale copy — verify the per-user versions differ
        shared_bytes = shared_catalog.read_bytes()
        mrw_bytes = (REPO / "data/users/mrw/settings/model_catalog.json").read_bytes()
        assert shared_bytes != mrw_bytes, (
            "Shared catalog still matches user catalog — authenticated paths "
            "may still be reading it."
        )
    # Archive must exist under _legacy
    legacy_root = REPO / "data/users/_legacy"
    assert legacy_root.is_dir()
    has_archived = any(
        (snap / "user" / "settings").exists() for snap in legacy_root.iterdir()
    )
    assert has_archived, "expected data/user/settings archived under _legacy"


def test_independent_active_selections_per_user():
    mrw = _client()
    bella = _client()
    assert _switch(mrw, "mrw", MRW_PIN)[0] == 200
    assert _switch(bella, "bella", BELLA_PIN)[0] == 200

    # Mr W picks Anthropic / claude-opus-4-6 (from his migrated multi-profile catalog).
    ok, _ = _req(mrw, "POST", "/api/v1/settings/active",
                 {"service": "llm", "profile_id": "llm-profile-anthropic",
                  "model_id": "llm-model-anthropic-opus46"})
    assert ok == 200
    # Bella keeps her local catalog (Ollama qwen2.5:7b).
    # Read both diagnostics with each user's cookie.
    _, mrw_diag = _req(mrw, "GET", "/api/v1/settings/diagnostics")
    _, bella_diag = _req(bella, "GET", "/api/v1/settings/diagnostics")
    assert mrw_diag["llm"]["binding"] == "anthropic"
    assert mrw_diag["llm"]["model"] == "claude-opus-4-6"
    assert bella_diag["llm"]["binding"] != "anthropic", \
        "Bella should NOT be on Anthropic — cross-user contamination"
    assert mrw_diag["llm"]["model"] != bella_diag["llm"]["model"]


def test_mrw_change_does_not_mutate_bella_on_disk():
    mrw = _client()
    bella = _client()
    _switch(mrw, "mrw", MRW_PIN)
    _switch(bella, "bella", BELLA_PIN)

    bella_before = (REPO / "data/users/bella/settings/model_catalog.json").read_text()

    # Mr W rewrites his catalog entirely.
    _req(mrw, "PUT", "/api/v1/settings/catalog", {
        "catalog": {
            "version": 1,
            "services": {
                "llm": {
                    "active_profile_id": "mrw-only",
                    "active_model_id": "mrw-model",
                    "profiles": [{
                        "id": "mrw-only", "name": "Mr W only", "binding": "openai",
                        "base_url": "https://api.openai.com/v1", "api_key": "x",
                        "api_version": "", "extra_headers": {},
                        "models": [{"id": "mrw-model", "name": "gpt-4o",
                                     "model": "gpt-4o"}],
                    }],
                },
                "embedding": {"active_profile_id": None, "active_model_id": None, "profiles": []},
                "search": {"active_profile_id": None, "profiles": []},
            },
        },
    })

    bella_after = (REPO / "data/users/bella/settings/model_catalog.json").read_text()
    assert bella_before == bella_after, "Mr W's PUT mutated Bella's catalog file"


def test_bella_change_does_not_mutate_mrw_on_disk():
    mrw = _client()
    bella = _client()
    _switch(mrw, "mrw", MRW_PIN)
    _switch(bella, "bella", BELLA_PIN)

    mrw_before = (REPO / "data/users/mrw/settings/model_catalog.json").read_text()

    _req(bella, "POST", "/api/v1/settings/active",
         {"service": "llm", "profile_id": "llm-profile-default",
          "model_id": "llm-model-bella"})

    mrw_after = (REPO / "data/users/mrw/settings/model_catalog.json").read_text()
    assert mrw_before == mrw_after, "Bella's active-switch mutated Mr W's catalog file"


def test_verify_cache_still_isolated_after_catalog_split():
    """Sanity: the per-user verify cache from slice 2 still works after the
    catalog split (no regression)."""
    mrw = _client()
    bella = _client()
    _switch(mrw, "mrw", MRW_PIN)
    _switch(bella, "bella", BELLA_PIN)
    _req(mrw, "POST", "/api/v1/settings/verify", {"service": "llm"})
    _, mrw_diag = _req(mrw, "GET", "/api/v1/settings/diagnostics")
    _, bella_diag = _req(bella, "GET", "/api/v1/settings/diagnostics")
    assert mrw_diag.get("verify_cache"), "Mr W should see his own verify cache"
    # Bella didn't verify — her cache should be empty
    assert not bella_diag.get("verify_cache"), "Bella should not see Mr W's verify cache"
