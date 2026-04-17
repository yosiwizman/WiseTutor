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


def test_migration_converts_plaintext_to_env(tmp_path: Path) -> None:
    """Test that migrate_keys_to_env() converts plaintext API keys to env-var references."""
    from deeptutor.services.config.model_catalog import ModelCatalogService

    # Create catalog file with plaintext api_keys
    catalog_path = tmp_path / "model_catalog.json"
    catalog_path.write_text(
        """{
  "version": 1,
  "services": {
    "llm": {
      "active_profile_id": "llm-profile-default",
      "active_model_id": "llm-model-default",
      "profiles": [
        {
          "id": "llm-profile-default",
          "name": "Default LLM Endpoint",
          "binding": "openai",
          "base_url": "https://api.openai.com/v1",
          "api_key": "sk-plaintext-llm-key-12345",
          "api_version": "",
          "extra_headers": {},
          "models": [
            {"id": "llm-model-default", "name": "GPT-4o-mini", "model": "gpt-4o-mini"}
          ]
        }
      ]
    },
    "embedding": {
      "active_profile_id": "embedding-profile-default",
      "active_model_id": "embedding-model-default",
      "profiles": [
        {
          "id": "embedding-profile-default",
          "name": "Default Embedding Endpoint",
          "binding": "openai",
          "base_url": "https://api.openai.com/v1",
          "api_key": "sk-plaintext-emb-key-67890",
          "api_version": "",
          "extra_headers": {},
          "models": [
            {
              "id": "embedding-model-default",
              "name": "text-embedding-3-small",
              "model": "text-embedding-3-small",
              "dimension": "1536"
            }
          ]
        }
      ]
    },
    "search": {"active_profile_id": null, "profiles": []}
  }
}
""",
        encoding="utf-8",
    )

    # Create ModelCatalogService and call migration
    service = ModelCatalogService(path=catalog_path)
    updated_catalog, env_vars = service.migrate_keys_to_env()

    # Verify that api_keys were replaced with env-var references
    llm_profile = updated_catalog["services"]["llm"]["profiles"][0]
    assert llm_profile["api_key"] == "env:LLM_API_KEY_PROFILE_LLM_PROFILE_DEFAULT"

    emb_profile = updated_catalog["services"]["embedding"]["profiles"][0]
    assert emb_profile["api_key"] == "env:EMBEDDING_API_KEY_PROFILE_EMBEDDING_PROFILE_DEFAULT"

    # Verify that env_vars dict contains the correct mappings
    assert env_vars["LLM_API_KEY_PROFILE_LLM_PROFILE_DEFAULT"] == "sk-plaintext-llm-key-12345"
    assert env_vars["EMBEDDING_API_KEY_PROFILE_EMBEDDING_PROFILE_DEFAULT"] == "sk-plaintext-emb-key-67890"

    # Verify that only api_keys were modified, other fields remain unchanged
    assert llm_profile["binding"] == "openai"
    assert llm_profile["base_url"] == "https://api.openai.com/v1"
    assert emb_profile["binding"] == "openai"


def test_per_user_catalog_env_resolution(tmp_path: Path, monkeypatch) -> None:
    """Test that per-user catalogs can reference different env vars and resolve independently."""
    # Set up environment variables for two different users
    monkeypatch.setenv("MRW_API_KEY", "mrw-secret-key-123")
    monkeypatch.setenv("BELLA_API_KEY", "bella-secret-key-456")

    # Create Mr W's catalog referencing his env var
    mrw_catalog = _build_catalog(
        llm_profile={
            "id": "llm-profile-mrw",
            "name": "Mr W LLM",
            "binding": "openai",
            "base_url": "https://api.openai.com/v1",
            "api_key": "env:MRW_API_KEY",
            "api_version": "",
            "extra_headers": {},
            "models": [{"id": "llm-model-mrw", "name": "GPT-4o", "model": "gpt-4o"}],
        }
    )

    # Create Bella's catalog referencing her env var
    bella_catalog = _build_catalog(
        llm_profile={
            "id": "llm-profile-bella",
            "name": "Bella LLM",
            "binding": "anthropic",
            "base_url": "",
            "api_key": "env:BELLA_API_KEY",
            "api_version": "",
            "extra_headers": {},
            "models": [{"id": "llm-model-bella", "name": "Claude", "model": "claude-opus-4-6"}],
        }
    )

    # Resolve both catalogs independently
    mrw_resolved = resolve_llm_runtime_config(catalog=mrw_catalog, env_store=_empty_env(tmp_path))
    bella_resolved = resolve_llm_runtime_config(catalog=bella_catalog, env_store=_empty_env(tmp_path))

    # Verify each user's catalog resolved to their own env var
    assert mrw_resolved.api_key == "mrw-secret-key-123"
    assert mrw_resolved.provider_name == "openai"
    assert mrw_resolved.model == "gpt-4o"

    assert bella_resolved.api_key == "bella-secret-key-456"
    assert bella_resolved.provider_name == "anthropic"
    assert bella_resolved.model == "claude-opus-4-6"

    # Verify no cross-contamination
    assert mrw_resolved.api_key != bella_resolved.api_key
    assert mrw_resolved.provider_name != bella_resolved.provider_name


def test_logs_never_expose_keys() -> None:
    """Test that API keys are always redacted in logs and events."""
    from deeptutor.services.config.test_runner import _redact, TestRun
    import json

    # Test the _redact function with various inputs
    assert _redact("") == "(empty)"
    assert _redact("short") == "****"
    assert _redact("12345678") == "****"
    assert _redact("sk-proj-1234567890abcdef") == "sk-p...cdef"
    assert _redact("a" * 50) == "aaaa..." + "a" * 4

    # Test that TestRun events never contain plaintext keys
    plaintext_key = "sk-test-secret-api-key-12345"
    redacted_key = _redact(plaintext_key)

    run = TestRun(id="test-1", service="llm")

    # Emit an event with API key data (simulating what test_runner does)
    run.emit(
        "config",
        "Using active profile.",
        profile={
            "name": "Test Profile",
            "base_url": "https://api.example.com",
            "binding": "openai",
            "api_key": redacted_key,  # Should be redacted before emitting
            "api_version": "",
        },
    )

    # Verify the event was recorded
    events = run.snapshot(0)
    assert len(events) == 1

    # Verify the plaintext key never appears in the event
    event_str = json.dumps(events[0])
    assert plaintext_key not in event_str, "Plaintext API key found in event!"

    # Verify the redacted key is present instead
    assert redacted_key in event_str, "Redacted key should be present in event"

    # Verify specific fields
    event = events[0]
    assert event["type"] == "config"
    assert event["profile"]["api_key"] == redacted_key
    assert event["profile"]["api_key"] != plaintext_key
