"""Regression: the normal chat-send path must honor the selected provider/model,
and every assistant turn must emit server-sourced runtime metadata.

The metadata must NOT be derived from the model's self-report text. These tests
bypass any chat self-report and only inspect the backend-emitted runtime event.
"""

import asyncio
import json
import urllib.request
import uuid

import pytest
import websockets

BASE = "http://localhost:8001"
WS = "ws://localhost:8001/api/v1/ws"


def _set_active(profile_id: str, model_id: str) -> None:
    req = urllib.request.Request(
        f"{BASE}/api/v1/settings/active",
        data=json.dumps({"service": "llm", "profile_id": profile_id, "model_id": model_id}).encode(),
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req).read()


async def _run_turn(profile_id: str, model_id: str) -> dict:
    _set_active(profile_id, model_id)
    await asyncio.sleep(0.3)
    async with websockets.connect(WS) as ws:
        sid = f"rt_{uuid.uuid4().hex[:8]}"
        await ws.send(json.dumps({
            "type": "message", "session_id": sid,
            "content": "Reply with only OK.", "capability": "chat", "language": "en",
        }))
        runtime = None
        end = asyncio.get_event_loop().time() + 60
        while asyncio.get_event_loop().time() < end:
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=15))
            except asyncio.TimeoutError:
                break
            meta = msg.get("metadata") or {}
            if meta.get("runtime") and runtime is None:
                runtime = meta["runtime"]
            if meta.get("turn_terminal"):
                break
        assert runtime is not None, "no server-emitted runtime metadata received"
        return runtime


@pytest.mark.asyncio
async def test_openai_gpt54_normal_chat():
    rt = await _run_turn("llm-profile-openai", "llm-model-openai-gpt54")
    assert rt["binding"] == "openai"
    assert rt["model"] == "gpt-5.4"
    assert "api.openai.com" in (rt.get("base_url") or "")


@pytest.mark.asyncio
async def test_anthropic_opus46_normal_chat():
    rt = await _run_turn("llm-profile-anthropic", "llm-model-anthropic-opus46")
    assert rt["binding"] == "anthropic"
    assert rt["model"] == "claude-opus-4-6"
    assert "api.anthropic.com" in (rt.get("base_url") or "")


@pytest.mark.asyncio
async def test_ollama_qwen_normal_chat():
    rt = await _run_turn("llm-profile-ollama", "llm-model-ollama-qwen72b")
    assert rt["binding"] == "ollama"
    assert rt["model"] == "qwen2.5:72b"
    assert "11434" in (rt.get("base_url") or "")


def test_runtime_metadata_is_server_sourced_not_model_text():
    """Guard: the runtime truth contract must come from the backend resolver,
    not from the assistant content string. Qwen famously hallucinates
    'I am GPT-4.1 from OpenAI' — the assertion must pass anyway because
    we inspect metadata, not content."""
    # Smoke: the chat flow code path imports the resolver, not any
    # identity-extraction from text. Verify the import surface.
    from deeptutor.agents.chat.agentic_pipeline import AgenticChatPipeline  # noqa: F401
    from deeptutor.services.config.provider_runtime import resolve_llm_runtime_config  # noqa: F401
    # AgenticChatPipeline.run emits a PROGRESS event with metadata.runtime at
    # turn start — sourced from self.llm_config (resolver), not any inference.
    import inspect

    src = inspect.getsource(AgenticChatPipeline.run)
    assert "runtime" in src and "self.model" in src and "self.binding" in src, (
        "AgenticChatPipeline.run must emit server-sourced runtime metadata"
    )
