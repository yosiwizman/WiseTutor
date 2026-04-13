"""Phase 3 slice 2 — per-user preferences + prompt identity injection."""

import http.cookiejar
import json
import urllib.request

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
    def _safe_json(raw: bytes):
        try:
            return json.loads(raw or b"null")
        except Exception:
            return None

    try:
        r = opener.open(req)
        return r.status, _safe_json(r.read())
    except urllib.error.HTTPError as e:
        return e.code, _safe_json(e.read())


def _switch(opener, user_id, pin):
    return _req(opener, "POST", "/api/v1/users/switch", {"user_id": user_id, "pin": pin})


def test_anon_prefs_blocked():
    anon = _client()
    assert _req(anon, "GET", "/api/v1/users/mrw/preferences")[0] == 401
    assert _req(anon, "PUT", "/api/v1/users/mrw/preferences", {"tone": "direct"})[0] == 401


def test_non_owner_cannot_read_other_user_prefs():
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    code, _ = _req(bella, "GET", "/api/v1/users/mrw/preferences")
    assert code == 403


def test_owner_can_read_other_user_prefs():
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)
    code, body = _req(mrw, "GET", "/api/v1/users/bella/preferences")
    assert code == 200
    prefs = body["preferences"]
    # Bella defaults
    assert prefs["safety_profile"] == "child"
    assert prefs["response_length"] == "short"
    assert "deep_research" not in prefs["allowed_capabilities"]


def test_role_defaults_differ_between_users():
    mrw = _client()
    bella = _client()
    _switch(mrw, "mrw", MRW_PIN)
    _switch(bella, "bella", BELLA_PIN)
    _, m = _req(mrw, "GET", "/api/v1/users/mrw/preferences")
    _, b = _req(bella, "GET", "/api/v1/users/bella/preferences")
    assert m["preferences"] != b["preferences"]
    assert m["preferences"]["safety_profile"] == "standard"
    assert b["preferences"]["safety_profile"] == "child"


def test_self_put_persists_and_self_read_returns_it():
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)
    try:
        code, body = _req(bella, "PUT", "/api/v1/users/bella/preferences",
                          {"tone": "warm", "display_name_override": "Bella the Bold"})
        assert code == 200
        assert body["preferences"]["tone"] == "warm"
        assert body["preferences"]["display_name_override"] == "Bella the Bold"
        _, body2 = _req(bella, "GET", "/api/v1/users/bella/preferences")
        assert body2["preferences"]["display_name_override"] == "Bella the Bold"
    finally:
        # Restore clean state so other tests (and live app) don't inherit it.
        _req(bella, "PUT", "/api/v1/users/bella/preferences",
             {"display_name_override": None})


def test_validation_rejects_bad_values():
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)
    code, body = _req(mrw, "PUT", "/api/v1/users/mrw/preferences",
                      {"tone": "not-a-tone"})
    assert code == 400


def test_prompt_builder_emits_identity_line_from_context_metadata():
    """The identity line must be built strictly from UnifiedContext.metadata,
    never from a server-global."""
    from deeptutor.agents.chat.agentic_pipeline import AgenticChatPipeline

    class _Ctx:
        def __init__(self, md):
            self.metadata = md

    ctx = _Ctx({
        "_wt_display_name": "Bella",
        "_wt_preferences": {
            "tone": "warm", "response_length": "short",
            "safety_profile": "child",
            "allowed_capabilities": ["chat", "math_animator"],
        },
    })
    line = AgenticChatPipeline._build_identity_preferences_line(ctx)
    assert "Bella" in line
    assert "child" in line or "age-appropriate" in line
    assert "short" in line or "1–3 sentences" in line
    # Mr W case
    ctx2 = _Ctx({
        "_wt_display_name": "Mr W",
        "_wt_preferences": {
            "tone": "direct", "response_length": "medium",
            "safety_profile": "standard",
            "allowed_capabilities": ["chat", "deep_research"],
        },
    })
    line2 = AgenticChatPipeline._build_identity_preferences_line(ctx2)
    assert "Mr W" in line2
    assert "child" not in line2
    assert "deep_research" in line2
