"""
Settings API Router
===================

UI preferences, configuration catalog management, and detailed streamed tests.
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, List, Literal, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from deeptutor.logging import get_logger
from deeptutor.services.config import get_config_test_runner, get_model_catalog_service
from deeptutor.services.embedding.client import reset_embedding_client
from deeptutor.services.llm.client import reset_llm_client
from deeptutor.services.llm.config import clear_llm_config_cache
from deeptutor.services.path_service import get_path_service

logger = get_logger(__name__)

router = APIRouter()

# Per-user last-verified cache. Outer key is user_id from the signed cookie,
# so two browser contexts can hold independent verify states.
_VERIFY_CACHE_BY_USER: dict[str, dict[str, dict[str, Any]]] = {}


def _user_cache(user_id: str | None) -> dict[str, dict[str, Any]]:
    uid = user_id or "_anon"
    bucket = _VERIFY_CACHE_BY_USER.get(uid)
    if bucket is None:
        bucket = {}
        _VERIFY_CACHE_BY_USER[uid] = bucket
    return bucket


def _verify_key(service: str, profile_id: str, model_id: str) -> str:
    return f"{service}:{profile_id}:{model_id}"


def _resolve_uid_from_request(request) -> str | None:
    try:
        from deeptutor.services.users.identity import resolve_request_user

        return resolve_request_user(request)
    except Exception:
        return None


def _set_active(catalog: dict[str, Any], service: str, profile_id: str, model_id: str) -> dict[str, Any]:
    svc = catalog.get("services", {}).get(service, {})
    svc["active_profile_id"] = profile_id
    svc["active_model_id"] = model_id
    return catalog

_path_service = get_path_service()
SETTINGS_FILE = _path_service.get_settings_file("interface")

DEFAULT_SIDEBAR_NAV_ORDER = {
    "start": ["/", "/history", "/knowledge", "/notebook"],
    "learnResearch": ["/question", "/solver", "/guide", "/research", "/co_writer"],
}

DEFAULT_UI_SETTINGS = {
    "theme": "light",
    "language": "en",
    "sidebar_description": "✨ Data Intelligence Lab @ HKU",
    "sidebar_nav_order": DEFAULT_SIDEBAR_NAV_ORDER,
}


class SidebarNavOrder(BaseModel):
    start: List[str]
    learnResearch: List[str]


class UISettings(BaseModel):
    theme: Literal["light", "dark"] = "light"
    language: Literal["zh", "en"] = "en"
    sidebar_description: Optional[str] = None
    sidebar_nav_order: Optional[SidebarNavOrder] = None


class ThemeUpdate(BaseModel):
    theme: Literal["light", "dark"]


class LanguageUpdate(BaseModel):
    language: Literal["zh", "en"]


class SidebarDescriptionUpdate(BaseModel):
    description: str


class SidebarNavOrderUpdate(BaseModel):
    nav_order: SidebarNavOrder


class CatalogPayload(BaseModel):
    catalog: dict[str, Any]


def _invalidate_runtime_caches() -> None:
    """Force runtime clients/config to pick up the latest saved catalog."""
    clear_llm_config_cache()
    reset_llm_client()
    reset_embedding_client()


def load_ui_settings() -> dict[str, Any]:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as handle:
                saved = json.load(handle)
                return {**DEFAULT_UI_SETTINGS, **saved}
        except Exception:
            pass
    return DEFAULT_UI_SETTINGS.copy()


def save_ui_settings(settings: dict[str, Any]) -> None:
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w", encoding="utf-8") as handle:
        json.dump(settings, handle, ensure_ascii=False, indent=2)


def _provider_choices() -> dict[str, list[dict[str, str]]]:
    """Build dropdown options for provider selection, keyed by service type."""
    from deeptutor.services.provider_registry import PROVIDERS

    llm = sorted(
        [{"value": s.name, "label": s.label, "base_url": s.default_api_base} for s in PROVIDERS],
        key=lambda p: p["label"].lower(),
    )
    search = [
        {"value": "brave", "label": "Brave", "base_url": ""},
        {"value": "tavily", "label": "Tavily", "base_url": ""},
        {"value": "jina", "label": "Jina", "base_url": ""},
        {"value": "searxng", "label": "SearXNG", "base_url": ""},
        {"value": "duckduckgo", "label": "DuckDuckGo", "base_url": ""},
        {"value": "perplexity", "label": "Perplexity", "base_url": ""},
    ]
    return {"llm": llm, "embedding": llm, "search": search}


def _require_uid(request: Request) -> str:
    from fastapi import HTTPException
    uid = _resolve_uid_from_request(request)
    if not uid:
        raise HTTPException(status_code=401, detail="no_user")
    return uid


def _require_owner(request: Request) -> str:
    """Only role=owner callers may mutate global UI settings.

    theme / language / reset / sidebar writes land in a global settings
    file. A child account flipping the tutor into dark mode for everyone
    (or worse, resetting preferences) would be a cross-user effect, so
    these mutations are owner-only. Reads stay open."""
    from fastapi import HTTPException

    uid = _require_uid(request)
    from deeptutor.services.users import get_user_service

    u = get_user_service().get(uid)
    if u is None or u.role != "owner":
        raise HTTPException(status_code=403, detail="forbidden")
    return uid


@router.get("")
async def get_settings(request: Request):
    uid = _require_uid(request)
    return {
        "ui": load_ui_settings(),
        "catalog": get_model_catalog_service(user_id=uid).load(),
        "providers": _provider_choices(),
        "user_id": uid,
    }


@router.get("/catalog")
async def get_catalog(request: Request):
    uid = _require_uid(request)
    return {"catalog": get_model_catalog_service(user_id=uid).load(), "user_id": uid}


class ActiveSelection(BaseModel):
    service: Literal["llm", "embedding"] = "llm"
    profile_id: str
    model_id: str


class VerifyRequest(BaseModel):
    service: Literal["llm", "embedding"] = "llm"
    profile_id: Optional[str] = None
    model_id: Optional[str] = None


@router.post("/active")
async def set_active_selection(payload: ActiveSelection, request: Request):
    """Switch the active profile/model for the request's user."""
    uid = _require_uid(request)
    svc = get_model_catalog_service(user_id=uid)
    catalog = svc.load()
    _set_active(catalog, payload.service, payload.profile_id, payload.model_id)
    catalog = svc.save(catalog)
    _invalidate_runtime_caches()
    return {"catalog": catalog, "user_id": uid}


@router.post("/verify")
async def verify_selection(payload: VerifyRequest, request: Request):
    """Run a real provider call against a selection and record the result."""
    from deeptutor.services.config.provider_runtime import (
        resolve_embedding_runtime_config,
        resolve_llm_runtime_config,
    )

    uid = _require_uid(request)
    svc = get_model_catalog_service(user_id=uid)
    catalog = svc.load()
    if payload.profile_id and payload.model_id:
        catalog = svc.save(_set_active(catalog, payload.service, payload.profile_id, payload.model_id))
        _invalidate_runtime_caches()

    service_ll = catalog.get("services", {}).get(payload.service, {})
    pid = service_ll.get("active_profile_id") or ""
    mid = service_ll.get("active_model_id") or ""
    key = _verify_key(payload.service, pid, mid)
    ok = False
    error: Optional[str] = None
    snippet: Optional[str] = None
    try:
        if payload.service == "llm":
            from deeptutor.services.llm.factory import complete as llm_complete

            resolved = resolve_llm_runtime_config(catalog=catalog, user_id=uid)
            snippet = await llm_complete(
                prompt="Reply with the single word OK.",
                system_prompt="Reply briefly.",
                model=resolved.model,
                api_key=resolved.api_key or "sk-no-key-required",
                base_url=resolved.base_url or "",
                binding=resolved.binding,
                temperature=0.0,
                max_tokens=16,
            )
            ok = bool((snippet or "").strip())
        else:
            from deeptutor.services.embedding.client import EmbeddingClient
            from deeptutor.services.embedding.config import EmbeddingConfig

            r = resolve_embedding_runtime_config(catalog=catalog, user_id=uid)
            cfg = EmbeddingConfig(
                model=r.model, api_key=r.api_key, base_url=r.base_url,
                effective_url=r.effective_url, binding=r.binding,
                provider_name=r.provider_name, provider_mode=r.provider_mode,
                api_version=r.api_version, extra_headers=r.extra_headers,
                dim=r.dimension, request_timeout=max(1, r.request_timeout),
                batch_size=max(1, r.batch_size), batch_delay=max(0.0, r.batch_delay),
            )
            client = EmbeddingClient(cfg)
            out = await client.embed(["ok"])
            ok = bool(out and out[0])
    except Exception as exc:  # noqa: BLE001
        error = str(exc)[:400]
        ok = False

    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).isoformat()
    _user_cache(_resolve_uid_from_request(request))[key] = {"ok": ok, "at": ts, "error": error}
    return {"ok": ok, "at": ts, "error": error, "service": payload.service,
            "profile_id": pid, "model_id": mid, "snippet": (snippet or "")[:120] if ok else None}


@router.get("/diagnostics")
async def get_diagnostics(request: Request):
    """Runtime truth: active provider/model actually resolved by the runtime resolver.
    Never returns API keys. Independent of what a chat response self-reports."""
    from deeptutor.services.config.provider_runtime import (
        resolve_embedding_runtime_config,
        resolve_llm_runtime_config,
    )

    uid = _require_uid(request)
    catalog = get_model_catalog_service(user_id=uid).load()
    try:
        llm = resolve_llm_runtime_config(catalog=catalog, user_id=uid)
        llm_info = {
            "model": llm.model,
            "binding": llm.binding,
            "provider_name": llm.provider_name,
            "provider_mode": llm.provider_mode,
            "base_url": llm.base_url,
            "api_key_present": bool(llm.api_key),
        }
    except Exception as exc:  # noqa: BLE001
        llm_info = {"error": str(exc)}
    try:
        emb = resolve_embedding_runtime_config(catalog=catalog, user_id=uid)
        emb_info = {
            "model": emb.model,
            "binding": emb.binding,
            "provider_name": emb.provider_name,
            "base_url": emb.base_url,
            "dimension": emb.dimension,
            "api_key_present": bool(emb.api_key),
        }
    except Exception as exc:  # noqa: BLE001
        emb_info = {"error": str(exc)}
    llm_svc = catalog.get("services", {}).get("llm", {})
    emb_svc = catalog.get("services", {}).get("embedding", {})
    llm_key = _verify_key("llm", llm_svc.get("active_profile_id") or "", llm_svc.get("active_model_id") or "")
    emb_key = _verify_key("embedding", emb_svc.get("active_profile_id") or "", emb_svc.get("active_model_id") or "")
    uid = _resolve_uid_from_request(request)
    user_bucket = _user_cache(uid)
    llm_info["last_verified"] = user_bucket.get(llm_key)
    emb_info["last_verified"] = user_bucket.get(emb_key)
    search_svc = catalog.get("services", {}).get("search", {})
    search_profile = next((p for p in search_svc.get("profiles", []) if p.get("id") == search_svc.get("active_profile_id")), None) or (search_svc.get("profiles", [None])[0])
    search_info = None
    if search_profile:
        provider = (search_profile.get("provider") or "").lower()
        has_key = bool(search_profile.get("api_key"))
        search_info = {
            "provider": provider or "duckduckgo",
            "configured": bool(provider),
            "api_key_present": has_key,
            "fallback": "duckduckgo",
        }
    try:
        from deeptutor.services.memory import get_memory_service
        memory_info = get_memory_service().health()
    except Exception as exc:  # noqa: BLE001
        memory_info = {"status": "unknown", "error": str(exc)}
    return {
        "llm": llm_info,
        "embedding": emb_info,
        "search": search_info,
        "memory": memory_info,
        "verify_cache": {k: v for k, v in user_bucket.items()},
    }


@router.post("/memory/quarantine")
async def quarantine_memory():
    """Move current PROFILE/SUMMARY into a timestamped quarantine dir and reset."""
    from datetime import datetime
    import shutil
    from deeptutor.services.path_service import get_path_service

    mem_dir = get_path_service().get_memory_dir()
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    dest = mem_dir / "_quarantined" / ts
    dest.mkdir(parents=True, exist_ok=True)
    moved: list[str] = []
    for fname in ("PROFILE.md", "SUMMARY.md"):
        src = mem_dir / fname
        if src.exists():
            shutil.move(str(src), str(dest / fname))
            moved.append(fname)
    (mem_dir / "PROFILE.md").write_text(
        "## Identity\nN/A\n\n## Learning Style\nN/A\n\n## Knowledge Level\nN/A\n\n## Preferences\nN/A\n"
    )
    (mem_dir / "SUMMARY.md").write_text(
        "## Current Focus\nN/A\n\n## Accomplishments\nN/A\n\n## Open Questions\nN/A\n"
    )
    return {"quarantined": moved, "quarantine_dir": str(dest)}


@router.put("/catalog")
async def update_catalog(payload: CatalogPayload, request: Request):
    uid = _require_uid(request)
    svc = get_model_catalog_service(user_id=uid)
    catalog = svc.save(payload.catalog)
    _invalidate_runtime_caches()
    return {"catalog": catalog, "user_id": uid}


@router.post("/apply")
async def apply_catalog(request: Request, payload: CatalogPayload | None = None):
    uid = _require_uid(request)
    svc = get_model_catalog_service(user_id=uid)
    catalog = payload.catalog if payload is not None else svc.load()
    rendered = svc.apply(catalog)
    _invalidate_runtime_caches()
    return {
        "message": "Catalog applied to the active configuration.",
        "catalog": svc.load(),
        "env": rendered,
        "user_id": uid,
    }


# NOTE: PUT /api/v1/settings/theme removed in theme-boot-isolation v1.
# The route wrote to the shared `data/user/settings/interface.json`
# global file that no live render path ever read. Zero callers existed
# in the frontend or backend at the time of removal. Per-user theme is
# now entirely owned by User.theme + PUT /api/v1/users/me/theme +
# the wt_theme boot cookie. If a future feature needs a global theme
# override it must come back with a DECISIONS_LOG entry.


@router.put("/language")
async def update_language(update: LanguageUpdate, request: Request):
    _require_owner(request)
    current_ui = load_ui_settings()
    current_ui["language"] = update.language
    save_ui_settings(current_ui)
    return {"language": update.language}


@router.put("/ui")
async def update_ui_settings(update: UISettings, request: Request):
    _require_owner(request)
    current_ui = load_ui_settings()
    current_ui.update(update.model_dump(exclude_none=True))
    save_ui_settings(current_ui)
    return current_ui


@router.post("/reset")
async def reset_settings(request: Request):
    _require_owner(request)
    save_ui_settings(DEFAULT_UI_SETTINGS)
    return DEFAULT_UI_SETTINGS


@router.get("/themes")
async def get_themes():
    return {
        "themes": [
            {"id": "light", "name": "Light"},
            {"id": "dark", "name": "Dark"},
        ]
    }


@router.get("/sidebar")
async def get_sidebar_settings():
    current_ui = load_ui_settings()
    return {
        "description": current_ui.get(
            "sidebar_description", DEFAULT_UI_SETTINGS["sidebar_description"]
        ),
        "nav_order": current_ui.get("sidebar_nav_order", DEFAULT_UI_SETTINGS["sidebar_nav_order"]),
    }


@router.put("/sidebar/description")
async def update_sidebar_description(update: SidebarDescriptionUpdate):
    current_ui = load_ui_settings()
    current_ui["sidebar_description"] = update.description
    save_ui_settings(current_ui)
    return {"description": update.description}


@router.put("/sidebar/nav-order")
async def update_sidebar_nav_order(update: SidebarNavOrderUpdate):
    current_ui = load_ui_settings()
    current_ui["sidebar_nav_order"] = update.nav_order.model_dump()
    save_ui_settings(current_ui)
    return {"nav_order": update.nav_order.model_dump()}


@router.post("/tests/{service}/start")
async def start_service_test(service: str, payload: CatalogPayload | None = None):
    run = get_config_test_runner().start(service, payload.catalog if payload else None)
    return {"run_id": run.id}


@router.get("/tests/{service}/{run_id}/events")
async def stream_service_test_events(service: str, run_id: str, request: Request):
    runner = get_config_test_runner()
    run = runner.get(run_id)

    async def event_stream():
        sent = 0
        while True:
            if await request.is_disconnected():
                return
            events = run.snapshot(sent)
            if events:
                for event in events:
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                sent += len(events)
                if events[-1]["type"] in {"completed", "failed"}:
                    return
            else:
                yield "event: heartbeat\ndata: {}\n\n"
            await asyncio.sleep(0.35)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/tests/{service}/{run_id}/cancel")
async def cancel_service_test(service: str, run_id: str):
    get_config_test_runner().cancel(run_id)
    return {"message": "Cancelled"}


TOUR_CACHE = _path_service.get_settings_dir() / ".tour_cache.json"


@router.get("/tour/status")
async def tour_status():
    if TOUR_CACHE.exists():
        try:
            cache = json.loads(TOUR_CACHE.read_text(encoding="utf-8"))
            return {
                "active": True,
                "status": cache.get("status", "unknown"),
                "launch_at": cache.get("launch_at"),
                "redirect_at": cache.get("redirect_at"),
            }
        except Exception:
            pass
    return {"active": False, "status": "none", "launch_at": None, "redirect_at": None}


class TourCompletePayload(BaseModel):
    catalog: dict[str, Any] | None = None
    test_results: dict[str, str] | None = None


@router.post("/tour/complete")
async def complete_tour(request: Request, payload: TourCompletePayload | None = None):
    uid = _require_uid(request)
    svc = get_model_catalog_service(user_id=uid)
    catalog = payload.catalog if payload and payload.catalog else svc.load()
    rendered = svc.apply(catalog)
    _invalidate_runtime_caches()
    now = int(time.time())
    launch_at = now + 3
    redirect_at = now + 5

    if TOUR_CACHE.exists():
        try:
            cache = json.loads(TOUR_CACHE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
        cache["status"] = "completed"
        cache["launch_at"] = launch_at
        cache["redirect_at"] = redirect_at
        if payload and payload.test_results:
            cache["test_results"] = payload.test_results
        TOUR_CACHE.write_text(json.dumps(cache, indent=2), encoding="utf-8")

    return {
        "status": "completed",
        "message": "Configuration saved. DeepTutor will restart shortly.",
        "launch_at": launch_at,
        "redirect_at": redirect_at,
        "env": rendered,
    }


@router.post("/tour/reopen")
async def reopen_tour():
    return {
        "message": "Run the terminal setup guide from the project root to re-open the guided setup.",
        "command": "python scripts/start_tour.py",
    }


@router.post("/catalog/migrate-keys")
async def migrate_catalog_keys(request: Request):
    """Migrate plaintext API keys to environment variable references.

    Scans the user's catalog for plaintext api_key values, generates unique
    environment variable names, and writes them to a secure temporary file.

    SECURITY: API keys are written to a 0600-permissions temp file, NOT returned
    in the HTTP response. This prevents key exposure in logs, browser cache, etc.

    Returns:
        - migrated_catalog: Preview of catalog with env:VAR_NAME references
        - env_file_path: Path to secure temp file containing env vars
        - count: Number of keys migrated
        - message: Instructions for manual application
    """
    uid = _require_uid(request)
    svc = get_model_catalog_service(user_id=uid)

    # Call the migration method
    migrated_catalog, env_file_path, key_count = svc.migrate_keys_to_env()

    # Audit log: record invocation without any key material (only user + count + target path).
    logger.info(
        "migrate-keys endpoint invoked: user=%s count=%d file=%s",
        uid,
        key_count,
        env_file_path or "(none)",
    )

    return {
        "migrated_catalog": migrated_catalog,
        "env_file_path": env_file_path,
        "count": key_count,
        "message": (
            f"Migration file written to: {env_file_path}\n"
            "NEXT STEPS:\n"
            f"1. Review the file contents: cat {env_file_path}\n"
            "2. Copy env vars to your .env file\n"
            f"3. DELETE the temp file: rm {env_file_path}\n"
            "4. Save the migrated catalog to model_catalog.json\n"
            "5. Restart the backend to load new env vars"
        ) if env_file_path else "No keys to migrate",
        "user_id": uid,
    }
