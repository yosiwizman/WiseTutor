"""WiseTutor user management API.

Endpoints:
  GET  /api/v1/users             → list public profiles + active id
  GET  /api/v1/users/active      → current active user
  POST /api/v1/users/switch      → {user_id, pin} — PIN-gated switch
  POST /api/v1/users/{id}/pin    → {current_pin, new_pin} — change own PIN
  POST /api/v1/users             → {user_id, display_name, role?, pin, theme?}
                                     owner-only; creates or updates

Never returns `pin_hash` or `pin_salt`. Never logs PINs.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from deeptutor.services.users import get_user_service

router = APIRouter()
logger = logging.getLogger(__name__)


class SwitchRequest(BaseModel):
    user_id: str
    pin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class ChangePinRequest(BaseModel):
    current_pin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")
    new_pin: str = Field(min_length=4, max_length=4, pattern=r"^\d{4}$")


class UpsertRequest(BaseModel):
    user_id: str
    display_name: str
    role: Literal["owner", "user", "child"] = "user"
    pin: str | None = Field(default=None, pattern=r"^\d{4}$")
    theme: str | None = None
    voice: dict[str, Any] | None = None


@router.get("")
async def list_users():
    svc = get_user_service()
    return {
        "active_user_id": svc.active_user_id(),
        "users": [u.public() for u in svc.list_users()],
    }


@router.get("/active")
async def active_user():
    svc = get_user_service()
    u = svc.active_user()
    if not u:
        raise HTTPException(status_code=404, detail="no active user")
    return u.public()


@router.post("/switch")
async def switch_user(req: SwitchRequest):
    svc = get_user_service()
    try:
        u = svc.switch(req.user_id, req.pin)
    except PermissionError:
        logger.info("user switch rejected: bad PIN for user_id=%s", req.user_id)
        # Deliberately vague; do not reveal whether the user exists.
        raise HTTPException(status_code=403, detail="invalid credentials")
    except KeyError:
        raise HTTPException(status_code=403, detail="invalid credentials")
    return {"active_user_id": u.id, "user": u.public()}


@router.post("/{user_id}/pin")
async def change_pin(user_id: str, req: ChangePinRequest):
    svc = get_user_service()
    u = svc.get(user_id)
    if not u or not u.verify_pin(req.current_pin):
        logger.info("pin change rejected: user_id=%s", user_id)
        raise HTTPException(status_code=403, detail="invalid credentials")
    svc.set_pin(user_id, req.new_pin)
    return {"ok": True}


@router.post("")
async def upsert(req: UpsertRequest):
    svc = get_user_service()
    try:
        u = svc.upsert(
            user_id=req.user_id,
            display_name=req.display_name,
            role=req.role,
            pin=req.pin,
            theme=req.theme,
            voice=req.voice,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return u.public()
