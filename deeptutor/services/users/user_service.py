"""WiseTutor user service.

Multi-user foundation: owner-defined user profiles (Mr W, Bella, …) each with
their own memory and session namespace on disk. PIN-gated profile switching.

Storage layout:
  data/
    users.json              # registry — NOT committed (gitignored via data/)
    users/
      <user_id>/
        memory/             # PROFILE.md + SUMMARY.md per user
        sessions.db         # SQLite session store per user

This is the canonical boundary: shared tutor knowledge may live outside
`data/users/`, but anything private-to-user is under the per-user dir.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from deeptutor.services.path_service import get_path_service

USER_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,31}$")
_PIN_RE = re.compile(r"^\d{4}$")


def _hash_pin(pin: str, salt: str) -> str:
    """PBKDF2-SHA256 with per-user salt. Not a password; just raises the cost
    of brute-forcing a 4-digit PIN from a leaked registry."""
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt.encode("utf-8"), 50_000)
    return dk.hex()


def _mksalt() -> str:
    return os.urandom(8).hex()


@dataclass
class User:
    id: str
    display_name: str
    role: str = "user"  # "owner" | "user" | "child"
    pin_hash: str = ""
    pin_salt: str = ""
    theme: str = "light"
    voice: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""
    last_seen_at: str | None = None
    # True while the user still has the seeded default PIN. Blocks chat usage
    # until the owner rotates via POST /api/v1/users/{id}/pin.
    pin_is_default: bool = True

    def verify_pin(self, pin: str) -> bool:
        if not self.pin_hash or not self.pin_salt:
            return False
        return _hash_pin(pin, self.pin_salt) == self.pin_hash

    def public(self) -> dict[str, Any]:
        """Safe dict for client — never expose pin_hash/salt."""
        return {
            "id": self.id,
            "display_name": self.display_name,
            "role": self.role,
            "theme": self.theme,
            "voice": self.voice,
            "created_at": self.created_at,
            "last_seen_at": self.last_seen_at,
            "pin_set": bool(self.pin_hash),
            "pin_is_default": self.pin_is_default,
        }


class UserService:
    """Thread-safe registry + active-user state.

    Single-process scope; there is no multi-tenant session layer yet. The
    active user is a server-global and switching it affects every caller
    (the slice is local-single-desktop by design).
    """

    _lock = threading.RLock()

    def __init__(self, data_root: Path | None = None) -> None:
        self._data_root = data_root or (get_path_service().project_root / "data")
        self._registry_path = self._data_root / "users.json"
        self._users_dir = self._data_root / "users"
        self._users: dict[str, User] = {}
        self._active_id: str | None = None
        # Archive any pre-multi-user files BEFORE seeding. This keeps the live
        # path clean (nothing reads those locations any more).
        try:
            from deeptutor.services.users.legacy_migration import run_legacy_migration

            run_legacy_migration(self._data_root)
        except Exception:
            # Migration is best-effort; never block boot on it.
            import logging
            logging.getLogger(__name__).warning(
                "legacy_migration raised; continuing boot", exc_info=True,
            )
        self._load()
        self._seed_defaults()

    # ── paths ─────────────────────────────────────────────────────────────
    def user_dir(self, user_id: str) -> Path:
        return self._users_dir / user_id

    def memory_dir(self, user_id: str) -> Path:
        return self.user_dir(user_id) / "memory"

    def session_db(self, user_id: str) -> Path:
        return self.user_dir(user_id) / "sessions.db"

    # ── registry I/O ──────────────────────────────────────────────────────
    def _load(self) -> None:
        if self._registry_path.exists():
            try:
                raw = json.loads(self._registry_path.read_text())
            except Exception:
                raw = {}
            self._active_id = raw.get("active_user_id") or None
            for u in raw.get("users", []):
                try:
                    self._users[u["id"]] = User(**u)
                except TypeError:
                    continue

    def _save(self) -> None:
        self._data_root.mkdir(parents=True, exist_ok=True)
        payload = {
            "active_user_id": self._active_id,
            "users": [asdict(u) for u in self._users.values()],
        }
        self._registry_path.write_text(json.dumps(payload, indent=2))

    def _seed_defaults(self) -> None:
        """Seed Mr W + Bella on first run.

        PINs are configurable via env. On first seed the PIN is stored as a
        hash with a per-user salt. The owner must change these via
        `POST /api/v1/users/{id}/pin` before real use — dev defaults are
        intentionally weak and documented in DECISIONS_LOG.
        """
        changed = False
        default_seeds = [
            {
                "id": "mrw", "display_name": "Mr W", "role": "owner",
                "default_pin_env": "WISETUTOR_DEFAULT_PIN_MRW", "fallback_pin": "1234",
                "theme": "light",
            },
            {
                "id": "bella", "display_name": "Bella", "role": "child",
                "default_pin_env": "WISETUTOR_DEFAULT_PIN_BELLA", "fallback_pin": "5678",
                "theme": "light",
            },
        ]
        for seed in default_seeds:
            if seed["id"] in self._users:
                continue
            pin = os.environ.get(seed["default_pin_env"]) or seed["fallback_pin"]
            salt = _mksalt()
            u = User(
                id=seed["id"],
                display_name=seed["display_name"],
                role=seed["role"],
                pin_hash=_hash_pin(pin, salt),
                pin_salt=salt,
                theme=seed["theme"],
                voice={},
                created_at=datetime.now(timezone.utc).isoformat(),
            )
            self._users[u.id] = u
            self.memory_dir(u.id).mkdir(parents=True, exist_ok=True)
            (self.memory_dir(u.id) / "PROFILE.md").write_text(
                "## Identity\nN/A\n\n## Learning Style\nN/A\n\n## Knowledge Level\nN/A\n\n## Preferences\nN/A\n"
            )
            (self.memory_dir(u.id) / "SUMMARY.md").write_text(
                "## Current Focus\nN/A\n\n## Accomplishments\nN/A\n\n## Open Questions\nN/A\n"
            )
            changed = True
        if self._active_id is None and self._users:
            self._active_id = "mrw" if "mrw" in self._users else next(iter(self._users))
            changed = True
        if changed:
            self._save()

    # ── public API ────────────────────────────────────────────────────────
    def list_users(self) -> list[User]:
        return list(self._users.values())

    def get(self, user_id: str) -> User | None:
        return self._users.get(user_id)

    # ── DIAGNOSTIC ONLY — NOT read by any live HTTP/WS runtime path ─────
    # Kept so a CLI or operator diagnostic can ask "who was the last user
    # to authenticate on this machine?". Attempting to use this in a live
    # path is a bug — live paths resolve identity from the request cookie.
    def last_used_user_id(self) -> str | None:
        with self._lock:
            return self._active_id

    def last_used_user(self) -> User | None:
        with self._lock:
            return self._users.get(self._active_id) if self._active_id else None

    # Back-compat aliases, explicitly DEPRECATED. Remove in a later slice.
    def active_user(self) -> User | None:
        return self.last_used_user()

    def active_user_id(self) -> str:
        raise RuntimeError(
            "active_user_id() is removed from live paths. Use the per-request "
            "cookie resolver (resolve_request_user / resolve_headers_user). "
            "For CLI diagnostics, use last_used_user_id() and pass it explicitly."
        )

    def set_pin(self, user_id: str, new_pin: str) -> None:
        if not _PIN_RE.match(new_pin):
            raise ValueError("PIN must be 4 digits")
        with self._lock:
            u = self._users.get(user_id)
            if not u:
                raise KeyError(user_id)
            u.pin_salt = _mksalt()
            u.pin_hash = _hash_pin(new_pin, u.pin_salt)
            u.pin_is_default = False  # owner/user rotated — gate lifts
            self._save()

    def switch(self, user_id: str, pin: str) -> User:
        """Validate PIN and update last_seen. Does NOT change a process-global
        active user — identity is per-request via signed cookie. `_active_id`
        remains as a last-used hint only (for CLI / diagnostics)."""
        with self._lock:
            u = self._users.get(user_id)
            if not u:
                raise KeyError(user_id)
            if not u.verify_pin(pin):
                raise PermissionError("bad pin")
            u.last_seen_at = datetime.now(timezone.utc).isoformat()
            self._active_id = u.id  # last-used hint; not a request identity
            self._save()
            return u

    def upsert(
        self,
        *,
        user_id: str,
        display_name: str,
        role: str = "user",
        pin: str | None = None,
        theme: str | None = None,
        voice: dict[str, Any] | None = None,
    ) -> User:
        if not USER_ID_RE.match(user_id):
            raise ValueError("user_id must match [a-z0-9][a-z0-9_-]{0,31}")
        with self._lock:
            existing = self._users.get(user_id)
            if existing:
                existing.display_name = display_name
                existing.role = role
                if theme is not None:
                    existing.theme = theme
                if voice is not None:
                    existing.voice = voice
                if pin is not None:
                    if not _PIN_RE.match(pin):
                        raise ValueError("PIN must be 4 digits")
                    existing.pin_salt = _mksalt()
                    existing.pin_hash = _hash_pin(pin, existing.pin_salt)
                self._save()
                return existing
            if pin is None or not _PIN_RE.match(pin):
                raise ValueError("new user requires a 4-digit PIN")
            salt = _mksalt()
            u = User(
                id=user_id,
                display_name=display_name,
                role=role,
                pin_hash=_hash_pin(pin, salt),
                pin_salt=salt,
                theme=theme or "light",
                voice=voice or {},
                created_at=datetime.now(timezone.utc).isoformat(),
            )
            self._users[user_id] = u
            self.memory_dir(user_id).mkdir(parents=True, exist_ok=True)
            self._save()
            return u


_instance: UserService | None = None
_instance_lock = threading.Lock()


def get_user_service() -> UserService:
    global _instance
    if _instance is None:
        with _instance_lock:
            if _instance is None:
                _instance = UserService()
    return _instance


def reset_user_service() -> None:
    global _instance
    with _instance_lock:
        _instance = None
