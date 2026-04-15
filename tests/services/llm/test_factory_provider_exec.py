"""Tests for provider-backed execution in llm.factory."""

from __future__ import annotations

import pytest

from deeptutor.services.llm.config import LLMConfig
from deeptutor.services.llm.factory import complete, stream


@pytest.mark.asyncio
async def test_factory_complete_uses_litellm(monkeypatch) -> None:
    cfg = LLMConfig(
        model="google/gemini-2.5-pro",
        api_key="sk-or-test",
        base_url="https://openrouter.ai/api/v1",
        binding="openrouter",
        provider_name="openrouter",
        provider_mode="gateway",
    )
    captured: dict[str, object] = {}

    async def _fake_litellm_complete(**kwargs):
        captured.update(kwargs)
        return "ok"

    # The litellm gateway path was removed when the provider-SDK
    # executor layer landed ("no litellm" per
    # deeptutor/services/llm/executors.py:1). The factory now routes
    # non-direct provider modes through sdk_complete imported from
    # .executors (factory.py:57-59, :270-283). Patch that symbol
    # instead of the retired litellm_available / litellm_complete.
    monkeypatch.setattr("deeptutor.services.llm.factory.get_llm_config", lambda: cfg)
    monkeypatch.setattr(
        "deeptutor.services.llm.factory.sdk_complete", _fake_litellm_complete
    )

    result = await complete("hello")
    assert result == "ok"
    assert captured["provider_name"] == "openrouter"
    assert captured["model"] == "google/gemini-2.5-pro"


@pytest.mark.asyncio
async def test_factory_complete_uses_direct_azure(monkeypatch) -> None:
    cfg = LLMConfig(
        model="gpt-4o-mini",
        api_key="azure-key",
        base_url="https://example.openai.azure.com/openai/deployments/demo",
        binding="azure_openai",
        provider_name="azure_openai",
        provider_mode="direct",
        api_version="2024-10-21",
    )
    captured: dict[str, object] = {}

    async def _fake_cloud_complete(**kwargs):
        captured.update(kwargs)
        return "ok"

    # provider_mode="direct" takes the cloud_provider.complete branch
    # (factory.py:295-309). No litellm toggle exists; the removed
    # monkeypatch of `litellm_available` is dropped.
    monkeypatch.setattr("deeptutor.services.llm.factory.get_llm_config", lambda: cfg)
    monkeypatch.setattr("deeptutor.services.llm.cloud_provider.complete", _fake_cloud_complete)

    result = await complete("hello")
    assert result == "ok"
    assert captured["binding"] == "azure_openai"


@pytest.mark.asyncio
async def test_factory_complete_openai_codex_requires_oauth(monkeypatch) -> None:
    cfg = LLMConfig(
        model="openai_codex/codex-mini-latest",
        api_key="",
        base_url="https://chatgpt.com/backend-api",
        binding="openai_codex",
        provider_name="openai_codex",
        provider_mode="oauth",
    )
    # provider_mode="oauth" now raises LLMConfigError before touching
    # any executor (factory.py:260-269). No litellm toggle to patch.
    monkeypatch.setattr("deeptutor.services.llm.factory.get_llm_config", lambda: cfg)

    with pytest.raises(Exception):
        await complete("hello", max_retries=0)


@pytest.mark.asyncio
async def test_factory_stream_uses_litellm(monkeypatch) -> None:
    cfg = LLMConfig(
        model="deepseek-chat",
        api_key="deep-key",
        base_url="https://api.deepseek.com/v1",
        binding="deepseek",
        provider_name="deepseek",
        provider_mode="standard",
    )

    async def _fake_litellm_stream(**kwargs):
        _ = kwargs
        yield "a"
        yield "b"

    # Streaming-side counterpart of the sdk_complete migration:
    # factory.stream() now routes non-direct provider modes through
    # sdk_stream imported from .executors (factory.py:57-59,
    # :400-413). Patch that symbol; retired litellm toggle dropped.
    monkeypatch.setattr("deeptutor.services.llm.factory.get_llm_config", lambda: cfg)
    monkeypatch.setattr(
        "deeptutor.services.llm.factory.sdk_stream", _fake_litellm_stream
    )

    chunks = []
    async for item in stream("hello"):
        chunks.append(item)
    assert "".join(chunks) == "ab"
