"""Per-request user identity for WiseTutor.

Replaces the previous process-global "active user" with a signed-cookie
mechanism. Every HTTP and WS request resolves its own user id from the
cookie; no shared mutable state is consulted.

Cookie format: `wt_uid=<user_id>.<hex_signature>` where the signature is
HMAC-SHA256(secret, user_id). Secrets support rotation: the current secret
is used for signing, but verification tries current + previous secrets.

Secret sources (in precedence order):
  - WISETUTOR_SESSION_SECRET env (colon-separated: "current:prev1:prev2")
  - data/session_secret.key (current) + data/session_secret.key.prev (previous)

Caveats (Tier 3 notes):
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


def _load_secrets() -> list[bytes]:
    """Load all secrets (current + previous) for rotation support.

    Returns a list with the current secret first, followed by any previous
    secrets. Signing always uses the first secret; verification tries all.

    Sources (in order of precedence):
      - WISETUTOR_SESSION_SECRET env: colon-separated (current:prev1:prev2...)
      - session_secret.key file (current) + session_secret.key.prev (previous)
    """
    secrets = []

    # Try environment variable first (colon-separated for rotation)
    env_val = os.environ.get(_SECRET_ENV)
    if env_val:
        for part in env_val.split(":"):
            if part:
                secrets.append(part.encode("utf-8"))
        if secrets:
            return secrets

    # Try file-based secrets
    p = _secret_path()
    prev_path = Path(str(p) + ".prev")

    if p.exists():
        secrets.append(p.read_bytes().strip())
    else:
        # Generate new secret if none exists
        p.parent.mkdir(parents=True, exist_ok=True)
        new_secret = os.urandom(32).hex().encode("utf-8")
        p.write_bytes(new_secret)
        try:
            os.chmod(p, 0o600)
        except OSError:
            pass
        secrets.append(new_secret)

    # Load previous secret if it exists
    if prev_path.exists():
        secrets.append(prev_path.read_bytes().strip())

    return secrets


def _load_secret() -> bytes:
    """Load the current (primary) secret for signing.

    Returns the first secret from _load_secrets(), which is always the
    current/active secret used for new signatures.
    """
    return _load_secrets()[0]


def sign_user_id(user_id: str) -> str:
    sig = hmac.new(_load_secret(), user_id.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{user_id}.{sig}"


def verify_cookie(raw: Optional[str]) -> Optional[str]:
    if not raw or "." not in raw:
        return None
    uid, _, sig = raw.rpartition(".")
    if not uid or not sig:
        return None
    # Try all available secrets (current + previous) for rotation support
    for secret in _load_secrets():
        expected = hmac.new(secret, uid.encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(sig, expected):
            return uid
    return None


def resolve_request_user(request: Request) -> Optional[str]:
    """Return the validated user id from the request cookie or None.

    A disabled user resolves to None here — every protected `_require_uid`
    style helper across the API will then 401, which is the consistent
    deny shape we want at the cookie boundary. The /users/active
    endpoint bypasses this check via `verify_cookie` directly so it can
    return a more specific 403 with detail="disabled" for UX."""
    uid = verify_cookie(request.cookies.get(COOKIE_NAME))
    if not uid:
        return None
    try:
        # Local import to avoid a module-load cycle with user_service.
        from deeptutor.services.users import get_user_service

        u = get_user_service().get(uid)
        if u is None or getattr(u, "disabled", False):
            return None
    except Exception:
        # If user service is unavailable for any reason we fail closed:
        # the caller will see no identity and return 401, never elevated.
        return None
    return uid


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
    response.delete_cookie(THEME_COOKIE_NAME, path="/")


# Boot-theme cookie. Carries the active user's theme so the inline
# ThemeScript can paint the correct theme on first paint without relying
# on the shared-across-users localStorage key (which bled theme across
# users until ThemeProvider hydrated). Not httpOnly by design — the
# inline boot script runs in the browser and must be able to read it.
# Value space: "light" | "dark" | "bella". Reset on switch / /me/theme
# writes; cleared on logout.
THEME_COOKIE_NAME = "wt_theme"
_ALLOWED_THEMES = {"light", "dark", "bella"}


def set_theme_cookie(response: Response, theme: str) -> None:
    if theme not in _ALLOWED_THEMES:
        return
    response.set_cookie(
        key=THEME_COOKIE_NAME,
        value=theme,
        max_age=_COOKIE_MAX_AGE,
        httponly=False,
        samesite="lax",
        secure=False,
        path="/",
    )
