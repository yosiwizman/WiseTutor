"""Restore per-user catalog snapshots before each test run so destructive
tests don't pollute subsequent ones."""

import shutil
from pathlib import Path

import pytest

REPO = Path("/home/ai-desktop/projects/WiseTutor")
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


@pytest.fixture(autouse=True)
def _restore_user_catalogs_before_each_test():
    snap = _pick_mrw_snapshot()
    if snap and MRW_CATALOG.exists():
        shutil.copy2(str(snap), str(MRW_CATALOG))
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
