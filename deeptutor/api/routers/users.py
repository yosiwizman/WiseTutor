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
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from deeptutor.services.users import get_user_service
from deeptutor.services.users.identity import (
    clear_user_cookie,
    resolve_request_user,
    set_user_cookie,
)

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
async def list_users(request: Request):
    svc = get_user_service()
    # active_user_id in the response reflects the REQUEST's cookie, not the
    # server-global last-used. This is the shape the frontend relies on.
    uid_from_cookie = resolve_request_user(request)
    return {
        "active_user_id": uid_from_cookie,
        "users": [u.public() for u in svc.list_users()],
    }


@router.get("/active")
async def active_user(request: Request):
    uid = resolve_request_user(request)
    if not uid:
        raise HTTPException(status_code=401, detail="no_user")
    u = get_user_service().get(uid)
    if not u:
        raise HTTPException(status_code=401, detail="no_user")
    return u.public()


@router.post("/switch")
async def switch_user(req: SwitchRequest, response: Response):
    svc = get_user_service()
    try:
        u = svc.switch(req.user_id, req.pin)
    except PermissionError:
        logger.info("user switch rejected: bad PIN for user_id=%s", req.user_id)
        raise HTTPException(status_code=403, detail="invalid credentials")
    except KeyError:
        raise HTTPException(status_code=403, detail="invalid credentials")
    # Identity is carried by the signed cookie from here on. Only this request's
    # client gains the new identity; other browser contexts are unaffected.
    set_user_cookie(response, u.id)
    return {"active_user_id": u.id, "user": u.public()}


@router.get("/ws-token")
async def ws_token(request: Request):
    """Return a short signed token derived from the request's cookie, usable
    as `?wt_uid_token=...` on the WebSocket upgrade URL when the browser and
    backend are on different origins."""
    from deeptutor.services.users.identity import COOKIE_NAME, sign_user_id

    uid = resolve_request_user(request)
    if not uid:
        raise HTTPException(status_code=401, detail="no_user")
    return {"user_id": uid, "token": sign_user_id(uid), "cookie_name": COOKIE_NAME}


class PreferencesPatch(BaseModel):
    tone: Optional[str] = None
    response_length: Optional[str] = None
    allowed_capabilities: Optional[list[str]] = None
    safety_profile: Optional[str] = None
    display_name_override: Optional[str] = None
    theme: Optional[str] = None


@router.get("/{user_id}/preferences")
async def get_preferences(user_id: str, request: Request):
    """Return the resolved preferences for a user.

    Authorization:
      - Any signed-in user can read their own preferences.
      - Owners (role=owner) can read any user's preferences.
    """
    caller = resolve_request_user(request)
    if not caller:
        raise HTTPException(status_code=401, detail="no_user")
    svc = get_user_service()
    caller_u = svc.get(caller)
    target = svc.get(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    if caller != user_id and (caller_u is None or caller_u.role != "owner"):
        raise HTTPException(status_code=403, detail="forbidden")
    return {"user_id": user_id, "preferences": target.effective_preferences()}


@router.put("/{user_id}/preferences")
async def put_preferences(user_id: str, patch: PreferencesPatch, request: Request):
    caller = resolve_request_user(request)
    if not caller:
        raise HTTPException(status_code=401, detail="no_user")
    svc = get_user_service()
    caller_u = svc.get(caller)
    target = svc.get(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    # Self-writes always allowed; cross-user writes require owner role.
    if caller != user_id and (caller_u is None or caller_u.role != "owner"):
        _admin_log.warning(
            "admin_action denied action=prefs_update actor=%s target=%s reason=not_owner",
            caller, user_id,
        )
        raise HTTPException(status_code=403, detail="forbidden")
    patch_dict = {k: v for k, v in patch.model_dump().items() if v is not None}
    try:
        updated = svc.update_preferences(user_id, patch_dict)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if caller != user_id:
        _admin_log.warning(
            "admin_action ok action=prefs_update actor=%s target=%s fields=%s",
            caller, user_id, sorted(patch_dict.keys()),
        )
    return {"user_id": user_id, "preferences": updated}


@router.post("/logout")
async def logout(response: Response):
    clear_user_cookie(response)
    return {"ok": True}


_admin_log = logging.getLogger("wisetutor.admin")


@router.post("/{user_id}/pin")
async def change_pin(user_id: str, req: ChangePinRequest, request: Request):
    """Change a user's PIN.

    Self-service: caller == user_id; `current_pin` must be the target's own PIN.
    Owner override: caller is role=owner and caller != user_id; `current_pin`
    must be the OWNER'S own PIN. This lets Mr W reset Bella's forgotten PIN
    without knowing the current target PIN. Audited on wisetutor.admin.
    """
    caller_id = resolve_request_user(request)
    if not caller_id:
        raise HTTPException(status_code=401, detail="no_user")
    svc = get_user_service()
    caller = svc.get(caller_id)
    target = svc.get(user_id)
    if target is None or caller is None:
        raise HTTPException(status_code=403, detail="invalid credentials")

    if caller_id == user_id:
        # Self-rotation: current_pin is the target's own PIN.
        if not target.verify_pin(req.current_pin):
            logger.info("self pin change rejected: user_id=%s", user_id)
            raise HTTPException(status_code=403, detail="invalid credentials")
        svc.set_pin(user_id, req.new_pin)
        return {"ok": True, "mode": "self"}

    # Cross-user: must be owner, and current_pin must be CALLER'S own PIN.
    if caller.role != "owner":
        _admin_log.warning(
            "admin_action denied action=pin_reset actor=%s target=%s reason=not_owner",
            caller_id, user_id,
        )
        raise HTTPException(status_code=403, detail="forbidden")
    if not caller.verify_pin(req.current_pin):
        _admin_log.warning(
            "admin_action denied action=pin_reset actor=%s target=%s reason=bad_owner_pin",
            caller_id, user_id,
        )
        raise HTTPException(status_code=403, detail="invalid credentials")

    svc.set_pin(user_id, req.new_pin)
    _admin_log.warning(
        "admin_action ok action=pin_reset actor=%s target=%s",
        caller_id, user_id,
    )
    return {"ok": True, "mode": "owner_override"}


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
