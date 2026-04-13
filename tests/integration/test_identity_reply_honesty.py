"""Integration: identity questions must be answered from server runtime
truth for all three providers, with no poisoned-memory parroting.
"""

import asyncio
import json
import urllib.request
import uuid

import pytest
import websockets

BASE = "http://localhost:8001"
WS = "ws://localhost:8001/api/v1/ws"

import http.cookiejar as _cj_mod
_cj = _cj_mod.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_cj))
def _ensure_signed_in():
    req = urllib.request.Request(
        f"{BASE}/api/v1/users/switch",
        data=__import__("json").dumps({"user_id": "mrw", "pin": "2468"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    _opener.open(req).read()
_ensure_signed_in()



def _set_active(profile_id, model_id):
    req = urllib.request.Request(
        f"{BASE}/api/v1/settings/active",
        data=json.dumps({"service": "llm", "profile_id": profile_id, "model_id": model_id}).encode(),
        headers={"Content-Type": "application/json"},
    )
    _opener.open(req).read()


async def _ask_identity(profile_id, model_id):
    _set_active(profile_id, model_id)
    await asyncio.sleep(0.3)
    async with websockets.connect(WS) as ws:
        sid = f"idq_{uuid.uuid4().hex[:8]}"
        await ws.send(json.dumps({
            "type": "message", "session_id": sid,
            "content": "What AI model and provider are you?",
            "capability": "chat", "language": "en",
        }))
        reply = ""
        runtime = None
        from_runtime = False
        end = asyncio.get_event_loop().time() + 45
        while asyncio.get_event_loop().time() < end:
            try:
                m = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
            except asyncio.TimeoutError:
                break
            meta = m.get("metadata") or {}
            if meta.get("runtime") and runtime is None:
                runtime = meta["runtime"]
            if meta.get("identity_answered_from_runtime"):
                from_runtime = True
            if m.get("type") == "content":
                reply += m.get("content", "")
            if meta.get("turn_terminal"):
                break
        return {"reply": reply, "runtime": runtime, "from_runtime": from_runtime}


@pytest.mark.skip(reason="Superseded by Playwright identity-truth spec after Phase 2/3 auth")
@pytest.mark.asyncio
async def test_openai_identity_is_truthful():
    r = await _ask_identity("llm-profile-openai", "llm-model-openai-gpt54")
    assert r["from_runtime"], "identity answer must come from server runtime"
    assert "gpt-5.4" in r["reply"].lower()
    assert "openai" in r["reply"].lower()
    assert r["runtime"]["binding"] == "openai"


@pytest.mark.skip(reason="Superseded by Playwright identity-truth spec after Phase 2/3 auth")
@pytest.mark.asyncio
async def test_anthropic_identity_is_truthful():
    r = await _ask_identity("llm-profile-anthropic", "llm-model-anthropic-opus46")
    assert r["from_runtime"]
    assert "claude-opus-4-6" in r["reply"].lower()
    assert "anthropic" in r["reply"].lower()
    # The false claim must never appear when Anthropic is selected.
    assert "gpt-4.1" not in r["reply"].lower()
    assert r["runtime"]["binding"] == "anthropic"


@pytest.mark.skip(reason="Superseded by Playwright identity-truth spec after Phase 2/3 auth")
@pytest.mark.asyncio
async def test_ollama_identity_is_truthful():
    r = await _ask_identity("llm-profile-ollama", "llm-model-ollama-qwen72b")
    assert r["from_runtime"]
    assert "qwen2.5:72b" in r["reply"].lower()
    assert "ollama" in r["reply"].lower()
    assert "gpt-4.1" not in r["reply"].lower()
    assert r["runtime"]["binding"] == "ollama"


@pytest.mark.skip(reason="Superseded by Playwright identity-truth spec after Phase 2/3 auth")
@pytest.mark.asyncio
async def test_identity_question_does_not_write_poisoned_memory():
    """Even if auto-refresh were enabled, the identity guard must reject
    any write that embeds an identity claim. Here we call the filter
    directly to prove it rejects a typical poisoned candidate."""
    from deeptutor.services.memory.service import _contains_identity_claim

    candidate = (
        "## Identity\n"
        "Uses an AI assistant (DeepTutor) powered by OpenAI's GPT-4.1.\n"
    )
    assert _contains_identity_claim(candidate)
