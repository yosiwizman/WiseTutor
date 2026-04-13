"""One-shot migration of legacy single-user data into data/users/_legacy/.

Prior to the per-request identity rollout, chat history and memory lived at:
  data/memory/{PROFILE,SUMMARY}.md
  data/chat_history.db                   (never used on this machine, but possible)
  data/sessions/                         (never used on this machine, but possible)
  data/user/chat_history.db              (this is the one we've actually seen)

Policy: archive them under data/users/_legacy/ with a timestamp marker. Nothing
on the live code path reads from those old locations any more, so an archive
preserves audit without polluting the live path.
"""

from __future__ import annotations

import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_SENTINEL = "MIGRATED.txt"


def run_legacy_migration(data_root: Path) -> dict[str, str]:
    """Idempotent. Returns a map of archived_src -> archived_dst."""
    legacy_root = data_root / "users" / "_legacy"
    moved: dict[str, str] = {}

    candidates = [
        data_root / "memory",                 # shared PROFILE/SUMMARY
        data_root / "chat_history.db",        # legacy flat DB
        data_root / "sessions",               # legacy dir
        data_root / "user" / "chat_history.db",
    ]
    shared_settings_dir = data_root / "user" / "settings"

    any_work = any(p.exists() for p in candidates) or shared_settings_dir.is_dir()
    if not any_work:
        return moved

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = legacy_root / ts
    dest.mkdir(parents=True, exist_ok=True)

    # Phase 3 slice 1: shared model catalog at data/user/settings/ was the
    # last user-visible shared-state surface. Policy: ASSIGN to Mr W as
    # legacy owner state (option (a)), preserving his existing provider/model
    # setup. Bella starts with an empty (default) catalog.
    if shared_settings_dir.is_dir():
        mrw_settings = data_root / "users" / "mrw" / "settings"
        mrw_settings.mkdir(parents=True, exist_ok=True)
        for fname in ("model_catalog.json",):
            src = shared_settings_dir / fname
            dst_mrw = mrw_settings / fname
            if src.exists() and not dst_mrw.exists():
                try:
                    shutil.copy2(str(src), str(dst_mrw))
                    moved[f"user/settings/{fname}->users/mrw/settings/{fname}"] = str(dst_mrw)
                    logger.warning(
                        "legacy_migration: copied shared %s to users/mrw/settings/%s", fname, fname,
                    )
                except Exception as exc:
                    logger.error("legacy_migration: failed to copy %s: %s", src, exc)
        try:
            archive_target = dest / "user" / "settings"
            archive_target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(shared_settings_dir), str(archive_target))
            moved["user/settings"] = str(archive_target)
        except Exception as exc:
            logger.error("legacy_migration: could not archive user/settings: %s", exc)

    for src in candidates:
        if not src.exists():
            continue
        rel = src.relative_to(data_root)
        dst = dest / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.move(str(src), str(dst))
            moved[str(rel)] = str(dst)
            logger.warning("legacy_migration: archived %s -> %s", rel, dst)
        except Exception as exc:  # noqa: BLE001
            logger.error("legacy_migration: failed for %s: %s", rel, exc)

    (dest / _SENTINEL).write_text(
        "WiseTutor legacy migration snapshot.\n"
        f"timestamp: {ts}\n"
        "policy: archive-under-_legacy (not assigned to a user).\n"
        "reason: prior single-user data pre-dates the per-user namespace "
        "introduced in Phase 2 slice 2.\n"
    )
    return moved
