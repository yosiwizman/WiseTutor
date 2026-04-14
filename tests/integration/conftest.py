"""Restore per-user catalog snapshots before each test run so destructive
tests don't pollute subsequent ones."""

import os
import shutil
from pathlib import Path

import pytest

REPO = Path(os.environ.get("WISETUTOR_REPO") or "/home/ai-desktop/projects/WiseTutor")
CI_SKIP_PROVIDER = os.environ.get("WT_CI_SKIP_PROVIDER_TESTS") == "1"


def requires_provider(reason: str = "requires a live provider (OpenAI/Anthropic/Ollama)"):
    """Decorator/helper: skip the test if CI environment set
    WT_CI_SKIP_PROVIDER_TESTS=1. Local full-runtime runs still execute it."""
    return pytest.mark.skipif(CI_SKIP_PROVIDER, reason=reason)
LEGACY = REPO / "data/users/_legacy"
MRW_CATALOG = REPO / "data/users/mrw/settings/model_catalog.json"
BELLA_CATALOG = REPO / "data/users/bella/settings/model_catalog.json"


def _pick_mrw_snapshot() -> Path | None:
    if not LEGACY.is_dir():
        return None
    # Use the oldest archived snapshot (original migrated catalog).
    for snap in sorted(LEGACY.iterdir()):
        candidate = snap / "user" / "settings" / "model_catalog.json"
        if candidate.exists():
            return candidate
    return None


def _reset_user_preferences():
    """Clear per-user preference overrides before each test so they always
    start at role defaults."""
    try:
        import json as _json
        users_path = REPO / "data" / "users.json"
        if not users_path.exists():
            return
        doc = _json.loads(users_path.read_text())
        changed = False
        for u in doc.get("users", []):
            if u.get("preferences"):
                u["preferences"] = {}
                changed = True
        if changed:
            users_path.write_text(_json.dumps(doc, indent=2))
            # Ask the live backend to reload by asking UserService fresh via
            # a lightweight ping. We use the environment-held singleton and
            # a force-reload hint if available.
            import urllib.request
            try:
                urllib.request.urlopen(
                    "http://localhost:8001/api/v1/users", timeout=1,
                )
            except Exception:
                pass
    except Exception:
        pass


_MRW_CI_SEED_CATALOG = {
    "version": 1,
    "services": {
        "llm": {
            "active_profile_id": "llm-profile-openai",
            "active_model_id": "llm-model-openai-4o-mini",
            "profiles": [
                {
                    "id": "llm-profile-openai", "name": "OpenAI", "binding": "openai",
                    "base_url": "https://api.openai.com/v1",
                    "api_key": "ci-placeholder", "api_version": "", "extra_headers": {},
                    "models": [{"id": "llm-model-openai-4o-mini", "name": "gpt-4o-mini", "model": "gpt-4o-mini"}],
                },
                {
                    "id": "llm-profile-ci-fallback", "name": "Local Ollama", "binding": "ollama",
                    "base_url": "http://localhost:11434/v1",
                    "api_key": "ollama-local", "api_version": "", "extra_headers": {},
                    "models": [{"id": "llm-model-ci-qwen", "name": "qwen2.5:72b", "model": "qwen2.5:72b"}],
                },
            ],
        },
        "embedding": {"active_profile_id": None, "active_model_id": None, "profiles": []},
        "search": {"active_profile_id": None, "profiles": []},
    },
}


@pytest.fixture(autouse=True)
def _restore_user_catalogs_before_each_test():
    """Restore Mr W's catalog before each test so any prior test's incidental
    catalog-load (which can wipe profiles when env keys aren't materialized,
    e.g. on CI with placeholder keys) does not bleed into the legacy-shared
    catalog assertion downstream. Uses _legacy snapshot when present, else
    the CI-seeded shape, so both local + CI runs have a stable baseline."""
    import json as _json

    snap = _pick_mrw_snapshot()
    if snap and MRW_CATALOG.exists():
        shutil.copy2(str(snap), str(MRW_CATALOG))
    elif MRW_CATALOG.parent.exists():
        # No legacy snapshot: re-seed from the CI shape so the assertion
        # in test_legacy_shared_catalog_is_off_the_live_path still holds.
        MRW_CATALOG.write_text(_json.dumps(_MRW_CI_SEED_CATALOG, indent=2))
    # Bella's catalog gets reset to a Bella-specific default shape so the
    # tests have a stable starting point.
    if BELLA_CATALOG.exists():
        import json
        BELLA_CATALOG.write_text(json.dumps({
            "version": 1,
            "services": {
                "llm": {
                    "active_profile_id": "llm-profile-default",
                    "active_model_id": "llm-model-bella",
                    "profiles": [{
                        "id": "llm-profile-default", "name": "Bella",
                        "binding": "ollama",
                        "base_url": "http://localhost:11434/v1",
                        "api_key": "local", "api_version": "", "extra_headers": {},
                        "models": [{
                            "id": "llm-model-bella", "name": "qwen2.5:7b",
                            "model": "qwen2.5:7b",
                        }],
                    }],
                },
                "embedding": {"active_profile_id": None, "active_model_id": None, "profiles": []},
                "search": {"active_profile_id": None, "profiles": []},
            },
        }, indent=2))
    # Invalidate per-user caches so the backend rereads the fresh files.
    try:
        import urllib.request, json as _json
        # We can't touch the backend's memory directly; rely on mtime-change to
        # make the resolver load again.
    except Exception:
        pass
    yield
