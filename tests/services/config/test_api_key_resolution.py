"""Tests for API key environment variable resolution."""

from __future__ import annotations

from pathlib import Path

from deeptutor.services.config.env_store import EnvStore
from deeptutor.services.config.provider_runtime import resolve_llm_runtime_config


def _build_catalog(
    *,
    llm_profile: dict | None = None,
    llm_model: dict | None = None,
) -> dict:
    llm_profile = llm_profile or {
        "id": "llm-p",
        "name": "LLM",
        "binding": "openai",
        "base_url": "",
        "api_key": "",
        "api_version": "",
        "extra_headers": {},
        "models": [{"id": "llm-m", "name": "m", "model": "gpt-4o-mini"}],
    }
    llm_model = llm_model or llm_profile["models"][0]
    return {
        "version": 1,
        "services": {
            "llm": {
                "active_profile_id": llm_profile["id"],
                "active_model_id": llm_model["id"],
                "profiles": [llm_profile],
            },
            "embedding": {
                "active_profile_id": None,
                "active_model_id": None,
                "profiles": [],
            },
            "search": {
                "active_profile_id": None,
                "profiles": [],
            },
        },
    }


def _empty_env(tmp_path: Path) -> EnvStore:
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join(
            [
                "LLM_BINDING=",
                "LLM_MODEL=",
                "LLM_API_KEY=",
                "LLM_HOST=",
                "LLM_API_VERSION=",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return EnvStore(path=env_path)


def test_resolve_api_key_from_env_reference(tmp_path: Path, monkeypatch) -> None:
    """Test that API keys with 'env:VAR_NAME' syntax are resolved from environment variables."""
    # Set the environment variable that will be referenced
    monkeypatch.setenv("TEST_API_KEY", "secret123")

    # Create catalog with env-var reference in api_key field
    catalog = _build_catalog(
        llm_profile={
            "id": "llm-p",
            "name": "LLM",
            "binding": "openai",
            "base_url": "",
            "api_key": "env:TEST_API_KEY",
            "api_version": "",
            "extra_headers": {},
            "models": [{"id": "llm-m", "name": "m", "model": "gpt-4o-mini"}],
        }
    )

    # Resolve the runtime config
    resolved = resolve_llm_runtime_config(catalog=catalog, env_store=_empty_env(tmp_path))

    # Verify that the api_key was resolved from the environment variable
    assert resolved.api_key == "secret123"
    assert resolved.provider_name == "openai"


def test_plaintext_keys_still_work(tmp_path: Path) -> None:
    """Test that plaintext API keys (without env: prefix) are used as-is."""
    # Create catalog with plaintext api_key
    catalog = _build_catalog(
        llm_profile={
            "id": "llm-p",
            "name": "LLM",
            "binding": "openai",
            "base_url": "",
            "api_key": "my-plain-api-key",
            "api_version": "",
            "extra_headers": {},
            "models": [{"id": "llm-m", "name": "m", "model": "gpt-4o-mini"}],
        }
    )

    # Resolve the runtime config
    resolved = resolve_llm_runtime_config(catalog=catalog, env_store=_empty_env(tmp_path))

    # Verify that the plaintext api_key was used as-is
    assert resolved.api_key == "my-plain-api-key"
    assert resolved.provider_name == "openai"
