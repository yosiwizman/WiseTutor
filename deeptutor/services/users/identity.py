"""Per-request user identity for WiseTutor.

Replaces the previous process-global "active user" with a signed-cookie
mechanism. Every HTTP and WS request resolves its own user id from the
cookie; no shared mutable state is consulted.

Cookie format: `wt_uid=<user_id>.<hex_signature>` where the signature is
HMAC-SHA256(secret, user_id). The secret is loaded from WISETUTOR_SESSION_SECRET
or auto-generated on first boot into `data/session_secret.key`.

Caveats (Tier 3 notes):
  - Single-secret, no rotation. Rotation is a future slice.
  - Cookie lifetime is a rolling 30 days; no revocation list.
  - Dev default: cookie is NOT HttpOnly-marked secure (http://localhost).
"""

from __future__ import annotations

import hashlib
import hmac
import os
from pathlib import Path
from typing import Optional

from fastapi import Request, Response

from deeptutor.services.path_service import get_path_service

COOKIE_NAME = "wt_uid"
_SECRET_ENV = "WISETUTOR_SESSION_SECRET"
_SECRET_FILE_NAME = "session_secret.key"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days


def _secret_path() -> Path:
    return get_path_service().project_root / "data" / _SECRET_FILE_NAME


def _load_secret() -> bytes:
    env_val = os.environ.get(_SECRET_ENV)
    if env_val:
        return env_val.encode("utf-8")
    p = _secret_path()
    if p.exists():
        return p.read_bytes().strip()
    p.parent.mkdir(parents=True, exist_ok=True)
    new_secret = os.urandom(32).hex().encode("utf-8")
    p.write_bytes(new_secret)
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass
    return new_secret


def sign_user_id(user_id: str) -> str:
    sig = hmac.new(_load_secret(), user_id.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{user_id}.{sig}"


def verify_cookie(raw: Optional[str]) -> Optional[str]:
    if not raw or "." not in raw:
        return None
    uid, _, sig = raw.rpartition(".")
    if not uid or not sig:
        return None
    expected = hmac.new(_load_secret(), uid.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    return uid


def resolve_request_user(request: Request) -> Optional[str]:
    """Return the validated user id from the request cookie or None."""
    return verify_cookie(request.cookies.get(COOKIE_NAME))


def resolve_headers_user(headers: dict) -> Optional[str]:
    """Resolve user id from a WS connection's Cookie header."""
    cookie_hdr = headers.get("cookie") or headers.get("Cookie") or ""
    for part in cookie_hdr.split(";"):
        part = part.strip()
        if part.startswith(COOKIE_NAME + "="):
            return verify_cookie(part[len(COOKIE_NAME) + 1 :])
    return None


def set_user_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=sign_user_id(user_id),
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,  # dev default; flip to True behind TLS
        path="/",
    )


def clear_user_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")
