"""
Two-file public memory API: SUMMARY and PROFILE.

Admin oversight v1: GET /api/v1/memory honors `?as_user=<child_id>` for
owner-only read-only inspection of another user's snapshot. Writes
(PUT, POST /refresh, POST /clear) remain self-only by design — this slice
is read-only inspection.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from deeptutor.services.memory import MemoryFile, get_memory_service
from deeptutor.services.session import get_sqlite_session_store
from deeptutor.services.users import get_user_service
from deeptutor.services.users.identity import resolve_request_user

router = APIRouter()
_admin_log = logging.getLogger("wisetutor.admin")


def _resolve_caller(request: Request) -> str:
    uid = resolve_request_user(request)
    if not uid:
        raise HTTPException(status_code=401, detail="no_user")
    return uid


def _resolve_target(request: Request, as_user: str | None) -> tuple[str, str, bool]:
    """Returns (caller_uid, target_uid, is_admin_inspect).

    Without `as_user` -> caller acts on their own data.
    With `as_user` -> caller MUST be role=owner, target must exist; this is
    audited via wisetutor.admin. Used by GET endpoints only; mutating
    endpoints intentionally ignore as_user (read-only inspection)."""
    caller = _resolve_caller(request)
    if not as_user or as_user == caller:
        return caller, caller, False
    svc = get_user_service()
    caller_user = svc.get(caller)
    if caller_user is None or caller_user.role != "owner":
        _admin_log.warning(
            "admin_action denied action=memory_inspect actor=%s target=%s reason=not_owner",
            caller, as_user,
        )
        raise HTTPException(status_code=403, detail="forbidden")
    target = svc.get(as_user)
    if target is None:
        _admin_log.warning(
            "admin_action denied action=memory_inspect actor=%s target=%s reason=target_not_found",
            caller, as_user,
        )
        raise HTTPException(status_code=404, detail="user_not_found")
    _admin_log.warning(
        "admin_action ok action=memory_inspect actor=%s target=%s",
        caller, as_user,
    )
    return caller, as_user, True


def _mem_for(request: Request):
    return get_memory_service(user_id=_resolve_caller(request))


def _store_for(request: Request):
    return get_sqlite_session_store(user_id=_resolve_caller(request))

_VALID_FILES: set[MemoryFile] = {"summary", "profile"}


def _snap_dict(snap) -> dict:
    return {
        "summary": snap.summary,
        "profile": snap.profile,
        "summary_updated_at": snap.summary_updated_at,
        "profile_updated_at": snap.profile_updated_at,
    }


class FileUpdateRequest(BaseModel):
    file: MemoryFile
    content: str = ""


class MemoryRefreshRequest(BaseModel):
    session_id: str | None = None
    language: str = "en"


class MemoryClearRequest(BaseModel):
    file: MemoryFile | None = None


@router.get("")
async def get_memory(request: Request, as_user: str | None = None):
    _caller, target, _is_admin = _resolve_target(request, as_user)
    return _snap_dict(get_memory_service(user_id=target).read_snapshot())


@router.put("")
async def update_memory(payload: FileUpdateRequest, request: Request):
    if payload.file not in _VALID_FILES:
        raise HTTPException(status_code=400, detail=f"Invalid file: {payload.file}")
    snap = _mem_for(request).write_file(payload.file, payload.content)
    return {**_snap_dict(snap), "saved": True}


@router.post("/refresh")
async def refresh_memory(payload: MemoryRefreshRequest, request: Request):
    store = _store_for(request)
    session_id = str(payload.session_id or "").strip()
    if session_id:
        session = await store.get_session(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")

    mem = _mem_for(request)
    result = await mem.refresh_from_session(
        session_id or None,
        language=payload.language,
        store=store,  # explicit per-user store; no global fallback
    )
    snap = mem.read_snapshot()
    return {**_snap_dict(snap), "changed": result.changed}


@router.post("/clear")
async def clear_memory(request: Request, payload: MemoryClearRequest | None = None):
    svc = _mem_for(request)
    target = payload.file if payload else None
    if target and target not in _VALID_FILES:
        raise HTTPException(status_code=400, detail=f"Invalid file: {target}")

    if target:
        snap = svc.clear_file(target)
    else:
        snap = svc.clear_memory()
    return {**_snap_dict(snap), "cleared": True}
