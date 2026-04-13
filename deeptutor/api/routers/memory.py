"""
Two-file public memory API: SUMMARY and PROFILE.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from deeptutor.services.memory import MemoryFile, get_memory_service
from deeptutor.services.session import get_sqlite_session_store
from deeptutor.services.users.identity import resolve_request_user

router = APIRouter()


def _mem_for(request: Request):
    uid = resolve_request_user(request)
    if not uid:
        raise HTTPException(status_code=401, detail="no_user")
    return get_memory_service(user_id=uid)


def _store_for(request: Request):
    uid = resolve_request_user(request)
    if not uid:
        raise HTTPException(status_code=401, detail="no_user")
    return get_sqlite_session_store(user_id=uid)

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
async def get_memory(request: Request):
    return _snap_dict(_mem_for(request).read_snapshot())


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
