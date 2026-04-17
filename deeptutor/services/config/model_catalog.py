from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from deeptutor.services.path_service import get_path_service

from .env_store import get_env_store

CATALOG_PATH = get_path_service().get_settings_file("model_catalog")

import re as _re

_OPENAI_MODEL_PATTERN = _re.compile(
    r"^(gpt-[0-9]+(\.[0-9]+)?(-[a-z0-9.\-]+)?|o[0-9]+(-[a-z0-9.\-]+)?|text-embedding-[a-z0-9.\-]+|chatgpt-[a-z0-9.\-]+)$"
)


def _is_valid_model_id(binding: str, service_name: str, model_id: str) -> bool:
    """Reject obviously malformed model IDs before they reach the provider.
    Specifically blocks things like 'gpt5.4' (missing hyphen) on openai-like bindings.
    Non-openai bindings (ollama, etc.) are left untouched."""
    if not model_id:
        return False
    openai_like = binding in {
        "openai", "azure_openai", "openrouter", "groq", "deepseek", "moonshot",
        "mistral", "gemini", "anthropic", "xiaomi_mimo", "zhipu", "stepfun",
        "dashscope", "aihubmix", "siliconflow", "byteplus", "byteplus_coding_plan",
        "qianfan", "minimax", "volcengine", "volcengine_coding_plan",
        "github_copilot", "openai_codex",
    }
    if not openai_like:
        return True
    if binding == "openai" and model_id.lower().startswith("gpt") and "-" not in model_id and "." in model_id:
        return False
    return True



def _service_shell() -> dict[str, Any]:
    return {
        "active_profile_id": None,
        "active_model_id": None,
        "profiles": [],
    }


def _search_shell() -> dict[str, Any]:
    return {
        "active_profile_id": None,
        "profiles": [],
    }


def _default_catalog() -> dict[str, Any]:
    return {
        "version": 1,
        "services": {
            "llm": _service_shell(),
            "embedding": _service_shell(),
            "search": _search_shell(),
        },
    }


class ModelCatalogService:
    """Per-user model catalog service. `path` must be the user's catalog file.

    The legacy class-level `_instance` is RETAINED only for backward-compat
    and is NEVER used by live paths — the module-level
    `get_model_catalog_service(user_id=...)` factory below constructs a
    per-user instance keyed by user id. Live paths raise if no user_id is
    provided.
    """

    _instance: "ModelCatalogService | None" = None

    def __init__(self, path: Path | None = None):
        self.path = path or CATALOG_PATH

    @classmethod
    def get_instance(cls, path: Path | None = None) -> "ModelCatalogService":
        # Legacy — kept for import-compat. Do NOT use in live paths.
        if cls._instance is None:
            cls._instance = cls(path)
        return cls._instance

    def load(self) -> dict[str, Any]:
        if self.path.exists():
            with open(self.path, "r", encoding="utf-8") as handle:
                loaded = json.load(handle) or {}
            catalog = _default_catalog()
            catalog.update({k: v for k, v in loaded.items() if k != "services"})
            catalog["services"].update(loaded.get("services", {}))
            hydrated = self._hydrate_missing_services_from_env(catalog)
            synced = self._sync_active_services_from_env(catalog)
            self._normalize(catalog)
            if hydrated or synced:
                self.save(catalog)
            return catalog

        catalog = self._build_from_env()
        self.save(catalog)
        return catalog

    def save(self, catalog: dict[str, Any]) -> dict[str, Any]:
        normalized = deepcopy(catalog)
        self._normalize(normalized)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as handle:
            json.dump(normalized, handle, indent=2, ensure_ascii=False)
        return normalized

    def apply(self, catalog: dict[str, Any] | None = None) -> dict[str, str]:
        current = self.save(catalog or self.load())
        rendered = get_env_store().render_from_catalog(current)
        get_env_store().write(rendered)
        return rendered

    def _build_from_env(self) -> dict[str, Any]:
        summary = get_env_store().as_summary()
        catalog = _default_catalog()
        self._hydrate_missing_services_from_env(catalog)
        return catalog

    def _hydrate_missing_services_from_env(self, catalog: dict[str, Any]) -> bool:
        summary = get_env_store().as_summary()
        services = catalog.setdefault("services", {})
        changed = False

        llm_service = services.setdefault("llm", _service_shell())
        if not llm_service.get("profiles") and (summary.llm["model"] or summary.llm["host"]):
            profile_id = "llm-profile-default"
            model_id = "llm-model-default"
            services["llm"] = {
                "active_profile_id": profile_id,
                "active_model_id": model_id,
                "profiles": [
                    {
                        "id": profile_id,
                        "name": "Default LLM Endpoint",
                        "binding": summary.llm["binding"] or "openai",
                        "base_url": summary.llm["host"],
                        "api_key": summary.llm["api_key"],
                        "api_version": summary.llm["api_version"],
                        "extra_headers": {},
                        "models": [
                            {
                                "id": model_id,
                                "name": summary.llm["model"] or "Default Model",
                                "model": summary.llm["model"],
                            }
                        ],
                    }
                ],
            }
            changed = True

        embedding_service = services.setdefault("embedding", _service_shell())
        if not embedding_service.get("profiles") and (summary.embedding["model"] or summary.embedding["host"]):
            profile_id = "embedding-profile-default"
            model_id = "embedding-model-default"
            services["embedding"] = {
                "active_profile_id": profile_id,
                "active_model_id": model_id,
                "profiles": [
                    {
                        "id": profile_id,
                        "name": "Default Embedding Endpoint",
                        "binding": summary.embedding["binding"] or "openai",
                        "base_url": summary.embedding["host"],
                        "api_key": summary.embedding["api_key"],
                        "api_version": summary.embedding["api_version"],
                        "extra_headers": {},
                        "models": [
                            {
                                "id": model_id,
                                "name": summary.embedding["model"] or "Default Embedding Model",
                                "model": summary.embedding["model"],
                                "dimension": summary.embedding["dimension"] or "3072",
                            }
                        ],
                    }
                ],
            }
            changed = True

        search_service = services.setdefault("search", _search_shell())
        if not search_service.get("profiles") and (
            summary.search["provider"] or summary.search["base_url"] or summary.search["api_key"]
        ):
            profile_id = "search-profile-default"
            services["search"] = {
                "active_profile_id": profile_id,
                "profiles": [
                    {
                        "id": profile_id,
                        "name": "Default Search Provider",
                        "provider": summary.search["provider"] or "brave",
                        "base_url": summary.search["base_url"],
                        "api_key": summary.search["api_key"],
                        "api_version": "",
                        "proxy": "",
                        "models": [],
                    }
                ],
            }
            changed = True

        return changed

    def _sync_active_services_from_env(self, catalog: dict[str, Any]) -> bool:
        """
        Sync active profile/model from `.env` when keys are present.

        This makes `.env` the default source of truth so users do not need to
        manually edit or delete `model_catalog.json` after changing env values.
        """
        env_values = get_env_store().load()
        if not env_values:
            return False

        summary = get_env_store().as_summary()
        services = catalog.setdefault("services", {})
        changed = False

        def ensure_llm_profile() -> tuple[dict[str, Any], dict[str, Any]]:
            service = services.setdefault("llm", _service_shell())
            profiles = service.setdefault("profiles", [])
            if not profiles:
                profile_id = "llm-profile-default"
                model_id = "llm-model-default"
                profile = {
                    "id": profile_id,
                    "name": "Default LLM Endpoint",
                    "binding": "openai",
                    "base_url": "",
                    "api_key": "",
                    "api_version": "",
                    "extra_headers": {},
                    "models": [{"id": model_id, "name": "Default Model", "model": ""}],
                }
                service["profiles"] = [profile]
                service["active_profile_id"] = profile_id
                service["active_model_id"] = model_id
            profile = self.get_active_profile(catalog, "llm") or service["profiles"][0]
            model = self.get_active_model(catalog, "llm") or (profile.setdefault("models", [{}])[0])
            return profile, model

        def ensure_embedding_profile() -> tuple[dict[str, Any], dict[str, Any]]:
            service = services.setdefault("embedding", _service_shell())
            profiles = service.setdefault("profiles", [])
            if not profiles:
                profile_id = "embedding-profile-default"
                model_id = "embedding-model-default"
                profile = {
                    "id": profile_id,
                    "name": "Default Embedding Endpoint",
                    "binding": "openai",
                    "base_url": "",
                    "api_key": "",
                    "api_version": "",
                    "extra_headers": {},
                    "models": [
                        {
                            "id": model_id,
                            "name": "Default Embedding Model",
                            "model": "",
                            "dimension": "3072",
                        }
                    ],
                }
                service["profiles"] = [profile]
                service["active_profile_id"] = profile_id
                service["active_model_id"] = model_id
            profile = self.get_active_profile(catalog, "embedding") or service["profiles"][0]
            model = self.get_active_model(catalog, "embedding") or (profile.setdefault("models", [{}])[0])
            return profile, model

        def ensure_search_profile() -> dict[str, Any]:
            service = services.setdefault("search", _search_shell())
            profiles = service.setdefault("profiles", [])
            if not profiles:
                profile_id = "search-profile-default"
                profile = {
                    "id": profile_id,
                    "name": "Default Search Provider",
                    "provider": "brave",
                    "base_url": "",
                    "api_key": "",
                    "api_version": "",
                    "proxy": "",
                    "models": [],
                }
                service["profiles"] = [profile]
                service["active_profile_id"] = profile_id
            return self.get_active_profile(catalog, "search") or service["profiles"][0]

        llm_keys = {
            "LLM_BINDING",
            "LLM_MODEL",
            "LLM_API_KEY",
            "LLM_HOST",
            "LLM_API_VERSION",
        }
        if llm_keys.intersection(env_values.keys()):
            profile, model = ensure_llm_profile()
            # Catalog is source of truth — only seed empty fields from .env, never overwrite.
            if "LLM_BINDING" in env_values and not profile.get("binding"):
                profile["binding"] = summary.llm["binding"]
                changed = True
            if "LLM_API_KEY" in env_values and not profile.get("api_key"):
                profile["api_key"] = summary.llm["api_key"]
                changed = True
            if "LLM_HOST" in env_values and not profile.get("base_url"):
                profile["base_url"] = summary.llm["host"]
                changed = True
            if "LLM_API_VERSION" in env_values and not profile.get("api_version"):
                profile["api_version"] = summary.llm["api_version"]
                changed = True
            if "LLM_MODEL" in env_values and not model.get("model"):
                model["model"] = summary.llm["model"]
                if summary.llm["model"] and not model.get("name"):
                    model["name"] = summary.llm["model"]
                changed = True

        embedding_keys = {
            "EMBEDDING_BINDING",
            "EMBEDDING_MODEL",
            "EMBEDDING_API_KEY",
            "EMBEDDING_HOST",
            "EMBEDDING_DIMENSION",
            "EMBEDDING_API_VERSION",
        }
        if embedding_keys.intersection(env_values.keys()):
            profile, model = ensure_embedding_profile()
            # Seed only; never overwrite existing catalog values.
            if "EMBEDDING_BINDING" in env_values and not profile.get("binding"):
                profile["binding"] = summary.embedding["binding"]
                changed = True
            if "EMBEDDING_API_KEY" in env_values and not profile.get("api_key"):
                profile["api_key"] = summary.embedding["api_key"]
                changed = True
            if "EMBEDDING_HOST" in env_values and not profile.get("base_url"):
                profile["base_url"] = summary.embedding["host"]
                changed = True
            if "EMBEDDING_API_VERSION" in env_values and not profile.get("api_version"):
                profile["api_version"] = summary.embedding["api_version"]
                changed = True
            if "EMBEDDING_MODEL" in env_values and not model.get("model"):
                model["model"] = summary.embedding["model"]
                if summary.embedding["model"] and not model.get("name"):
                    model["name"] = summary.embedding["model"]
                changed = True
            if "EMBEDDING_DIMENSION" in env_values and not model.get("dimension"):
                model["dimension"] = summary.embedding["dimension"]
                changed = True

        search_keys = {
            "SEARCH_PROVIDER",
            "SEARCH_API_KEY",
            "SEARCH_BASE_URL",
            "SEARCH_PROXY",
        }
        if search_keys.intersection(env_values.keys()):
            profile = ensure_search_profile()
            if (
                "SEARCH_PROVIDER" in env_values
                and profile.get("provider") != summary.search["provider"]
            ):
                profile["provider"] = summary.search["provider"]
                changed = True
            if (
                "SEARCH_API_KEY" in env_values
                and profile.get("api_key") != summary.search["api_key"]
            ):
                profile["api_key"] = summary.search["api_key"]
                changed = True
            if (
                "SEARCH_BASE_URL" in env_values
                and profile.get("base_url") != summary.search["base_url"]
            ):
                profile["base_url"] = summary.search["base_url"]
                changed = True
            if "SEARCH_PROXY" in env_values and profile.get("proxy") != summary.search["proxy"]:
                profile["proxy"] = summary.search["proxy"]
                changed = True

        return changed

    def _normalize(self, catalog: dict[str, Any]) -> None:
        services = catalog.setdefault("services", {})
        services.setdefault("llm", _service_shell())
        services.setdefault("embedding", _service_shell())
        services.setdefault("search", _search_shell())
        for service_name in ("llm", "embedding", "search"):
            service = services[service_name]
            profiles = service.setdefault("profiles", [])
            for profile in profiles:
                profile.setdefault("id", f"{service_name}-profile-{uuid4().hex[:8]}")
                profile.setdefault("name", "Untitled Profile")
                profile.setdefault("api_version", "")
                profile.setdefault("base_url", "")
                profile.setdefault("api_key", "")
                if service_name == "search":
                    profile.setdefault("provider", "brave")
                    profile.setdefault("proxy", "")
                    profile["models"] = []
                else:
                    profile.setdefault("binding", "openai")
                    profile.setdefault("extra_headers", {})
                    models = profile.setdefault("models", [])
                    binding = profile.get("binding", "openai")
                    kept: list[dict[str, Any]] = []
                    for model in models:
                        model.setdefault("id", f"{service_name}-model-{uuid4().hex[:8]}")
                        model.setdefault("name", model.get("model") or "Untitled Model")
                        model.setdefault("model", "")
                        if service_name == "embedding":
                            model.setdefault("dimension", "3072")
                        if not _is_valid_model_id(binding, service_name, str(model.get("model", ""))):
                            continue
                        kept.append(model)
                    profile["models"] = kept
            if profiles and not service.get("active_profile_id"):
                service["active_profile_id"] = profiles[0]["id"]
            if service_name in {"llm", "embedding"}:
                active_profile = self.get_active_profile(catalog, service_name)
                active_mid = service.get("active_model_id")
                if active_profile:
                    profile_model_ids = {m.get("id") for m in active_profile.get("models", [])}
                    if not active_mid or active_mid not in profile_model_ids:
                        if active_profile.get("models"):
                            service["active_model_id"] = active_profile["models"][0]["id"]
                        else:
                            service["active_model_id"] = None

    def get_active_profile(self, catalog: dict[str, Any], service_name: str) -> dict[str, Any] | None:
        service = catalog.get("services", {}).get(service_name, {})
        active_id = service.get("active_profile_id")
        for profile in service.get("profiles", []):
            if profile.get("id") == active_id:
                return profile
        profiles = service.get("profiles", [])
        return profiles[0] if profiles else None

    def get_active_model(self, catalog: dict[str, Any], service_name: str) -> dict[str, Any] | None:
        if service_name == "search":
            return None
        service = catalog.get("services", {}).get(service_name, {})
        active_model_id = service.get("active_model_id")
        profile = self.get_active_profile(catalog, service_name)
        if not profile:
            return None
        for model in profile.get("models", []):
            if model.get("id") == active_model_id:
                return model
        models = profile.get("models", [])
        return models[0] if models else None

    def migrate_keys_to_env(self) -> tuple[dict[str, Any], dict[str, str]]:
        """Migrate plaintext API keys from catalog to environment variable references.

        Scans all profiles for plaintext api_key values, generates unique environment
        variable names, replaces keys with 'env:VAR_NAME' references, and returns
        the updated catalog along with a dict of environment variables to set.

        Does NOT automatically write to .env - operator must manually apply changes.

        Returns:
            tuple[dict, dict]: (updated_catalog, env_vars_to_set)
        """
        # Read raw catalog file to avoid processing that might modify keys
        if not self.path.exists():
            return _default_catalog(), {}

        with open(self.path, "r", encoding="utf-8") as handle:
            catalog = json.load(handle) or {}

        # Ensure we have the services structure
        services = catalog.setdefault("services", {})
        env_vars: dict[str, str] = {}

        for service_name in ("llm", "embedding", "search"):
            service = services.get(service_name, {})
            if not service:
                continue

            profiles = service.get("profiles", [])

            for profile in profiles:
                api_key = profile.get("api_key", "")

                # Skip empty keys or keys that are already env references
                if not api_key or api_key.startswith("env:"):
                    continue

                # Generate unique env var name based on service and profile ID
                profile_id = profile.get("id", "")
                if not profile_id:
                    continue

                # Normalize profile ID for env var name (uppercase, replace hyphens)
                normalized_id = profile_id.upper().replace("-", "_")
                env_var_name = f"{service_name.upper()}_API_KEY_PROFILE_{normalized_id}"

                # Store the plaintext key in env vars dict
                env_vars[env_var_name] = api_key

                # Replace with env reference
                profile["api_key"] = f"env:{env_var_name}"

        return catalog, env_vars


# Per-user catalog service cache. No process-global singleton on live paths.
_CATALOG_SERVICES: dict[str, ModelCatalogService] = {}


def get_model_catalog_service(user_id: str | None = None) -> ModelCatalogService:
    """Return the ModelCatalogService for an explicit user_id.

    Live HTTP/WS paths MUST pass user_id. Legacy/test-only callers can pass
    None to get the shared-path instance — this is preserved ONLY so imports
    don't break during migration; it is never reachable from an authenticated
    router path.
    """
    if user_id:
        inst = _CATALOG_SERVICES.get(user_id)
        if inst is not None:
            return inst
        from deeptutor.services.users import get_user_service

        user_dir = get_user_service().user_dir(user_id)
        settings_dir = user_dir / "settings"
        settings_dir.mkdir(parents=True, exist_ok=True)
        path = settings_dir / "model_catalog.json"
        inst = ModelCatalogService(path=path)
        _CATALOG_SERVICES[user_id] = inst
        return inst
    # Legacy fallback — must never be reached from authenticated live paths.
    # We deliberately do NOT raise here because some out-of-band scripts still
    # use `get_model_catalog_service()` with no args; the router-level guards
    # (401 on anon) keep this off the live path.
    return ModelCatalogService.get_instance()


def reset_model_catalog_service(user_id: str | None = None) -> None:
    if user_id is None:
        _CATALOG_SERVICES.clear()
    else:
        _CATALOG_SERVICES.pop(user_id, None)


__all__ = [
    "CATALOG_PATH",
    "ModelCatalogService",
    "get_model_catalog_service",
    "reset_model_catalog_service",
]
