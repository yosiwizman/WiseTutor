"""Integration tests for pedagogy_mode preference validation."""

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


def test_valid_pedagogy_mode_values_accepted():
    """Test that all valid pedagogy_mode values (guided, direct, adaptive) are accepted."""
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)

    # Test each valid value
    for mode in ["guided", "direct", "adaptive"]:
        code, body = _req(mrw, "PUT", "/api/v1/users/mrw/preferences",
                         {"pedagogy_mode": mode})
        assert code == 200, f"Failed to set pedagogy_mode to {mode}: {body}"
        assert body["preferences"]["pedagogy_mode"] == mode


def test_invalid_pedagogy_mode_rejected():
    """Test that invalid pedagogy_mode values are rejected with 400."""
    mrw = _client()
    _switch(mrw, "mrw", MRW_PIN)

    code, body = _req(mrw, "PUT", "/api/v1/users/mrw/preferences",
                     {"pedagogy_mode": "invalid_mode"})
    assert code == 400


def test_pedagogy_mode_persists_and_can_be_read():
    """Test that pedagogy_mode persists and can be read back."""
    bella = _client()
    _switch(bella, "bella", BELLA_PIN)

    try:
        # Set pedagogy_mode to 'guided'
        code, body = _req(bella, "PUT", "/api/v1/users/bella/preferences",
                         {"pedagogy_mode": "guided"})
        assert code == 200
        assert body["preferences"]["pedagogy_mode"] == "guided"

        # Read it back
        code, body = _req(bella, "GET", "/api/v1/users/bella/preferences")
        assert code == 200
        assert body["preferences"]["pedagogy_mode"] == "guided"
    finally:
        # Restore default (adaptive for child role)
        _req(bella, "PUT", "/api/v1/users/bella/preferences",
             {"pedagogy_mode": "adaptive"})


def test_pedagogy_mode_defaults_differ_by_role():
    """Test that pedagogy_mode defaults differ by role: child=adaptive, owner=direct."""
    mrw = _client()
    bella = _client()
    _switch(mrw, "mrw", MRW_PIN)
    _switch(bella, "bella", BELLA_PIN)

    # Get default preferences for both users
    _, mrw_prefs = _req(mrw, "GET", "/api/v1/users/mrw/preferences")
    _, bella_prefs = _req(bella, "GET", "/api/v1/users/bella/preferences")

    # Mr W is owner, should default to 'direct'
    assert mrw_prefs["preferences"]["pedagogy_mode"] == "direct"

    # Bella is child, should default to 'adaptive'
    assert bella_prefs["preferences"]["pedagogy_mode"] == "adaptive"


def test_prompt_builder_includes_pedagogy_mode():
    """Test that pedagogy_mode preference is included in the system prompt.
    Note: 'adaptive' mode doesn't have a specific prompt instruction (it's handled
    programmatically at runtime), so only 'guided' and 'direct' are tested here.
    """
    from deeptutor.agents.chat.agentic_pipeline import AgenticChatPipeline

    class _Ctx:
        def __init__(self, md):
            self.metadata = md

    # Test guided mode - should include Socratic/guiding language
    ctx_guided = _Ctx({
        "_wt_display_name": "Bella",
        "_wt_preferences": {
            "tone": "warm",
            "response_length": "short",
            "safety_profile": "child",
            "pedagogy_mode": "guided",
            "allowed_capabilities": ["chat", "math_animator"],
        },
    })
    line_guided = AgenticChatPipeline._build_identity_preferences_line(ctx_guided)
    assert "Socratic" in line_guided or "guiding questions" in line_guided.lower()

    # Test direct mode - should include direct/explanations language
    ctx_direct = _Ctx({
        "_wt_display_name": "Mr W",
        "_wt_preferences": {
            "tone": "direct",
            "response_length": "medium",
            "safety_profile": "standard",
            "pedagogy_mode": "direct",
            "allowed_capabilities": ["chat", "deep_research"],
        },
    })
    line_direct = AgenticChatPipeline._build_identity_preferences_line(ctx_direct)
    assert "clear" in line_direct.lower() and "explanations" in line_direct.lower()

    # Test adaptive mode - no specific prompt instruction (empty pedagogy_hint is OK)
    ctx_adaptive = _Ctx({
        "_wt_display_name": "Student",
        "_wt_preferences": {
            "tone": "warm",
            "response_length": "medium",
            "safety_profile": "child",
            "pedagogy_mode": "adaptive",
            "allowed_capabilities": ["chat"],
        },
    })
    line_adaptive = AgenticChatPipeline._build_identity_preferences_line(ctx_adaptive)
    # Adaptive mode doesn't add a specific pedagogy instruction, so just verify
    # the line is built without error and contains the user's name
    assert "Student" in line_adaptive
