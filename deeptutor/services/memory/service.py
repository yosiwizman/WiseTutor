"""
Two-file public memory system: SUMMARY.md and PROFILE.md.

- SUMMARY: Running summary of the user's learning journey (auto-updated).
- PROFILE: User identity, preferences, knowledge levels (auto-updated).

Per-bot files (SOUL.md, TOOLS.md, USER.md, etc.) live in each bot's
workspace directory, not in the shared memory dir.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

from deeptutor.services.llm import stream as llm_stream
from deeptutor.services.path_service import PathService, get_path_service
from deeptutor.services.session.sqlite_store import SQLiteSessionStore, get_sqlite_session_store

MemoryFile = Literal["summary", "profile"]
MEMORY_FILES: list[MemoryFile] = ["summary", "profile"]

_NO_CHANGE = "NO_CHANGE"

# Identity-claim guard: any LLM-proposed PROFILE/SUMMARY content that references
# model/provider identity is rejected. A single hallucinated "I am GPT-4.1" must
# never be laundered into persistent memory (see audit of 2026-04-12).
_IDENTITY_GUARD = re.compile(
    r"(?i)("
    r"gpt[- ]?[0-9]|o[0-9]-(mini|preview)|"
    r"openai|anthropic|claude|gemini|llama|qwen|ollama|deepseek|mistral|"
    r"powered by|"
    r"\b(i am|i[' ]m|you are|you[' ]re)\s+(an?\s+)?(ai|llm|model|assistant)\b|"
    r"\b(my|the)\s+(model|provider|llm)\s+(is|name)\b|"
    r"\b(exact|underlying)\s+model\s+is\b"
    r")"
)


def _contains_identity_claim(text: str) -> bool:
    return bool(_IDENTITY_GUARD.search(text or ""))


def _redact_identity_lines(text: str) -> str:
    """Drop any line that references model/provider identity."""
    out: list[str] = []
    for line in (text or "").splitlines():
        if _IDENTITY_GUARD.search(line):
            continue
        out.append(line)
    # collapse doubled blanks
    cleaned = "\n".join(out)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip() + "\n"
    return cleaned


# Auto-refresh of PROFILE/SUMMARY on every turn is the lie-laundering vector.
# Default OFF; set DEEPTUTOR_MEMORY_AUTO_REFRESH=1 to re-enable.
import os as _os
MEMORY_AUTO_REFRESH_ENABLED = _os.environ.get(
    "DEEPTUTOR_MEMORY_AUTO_REFRESH", "0"
).strip() not in {"0", "false", "False", ""}

_FILENAMES: dict[MemoryFile, str] = {
    "summary": "SUMMARY.md",
    "profile": "PROFILE.md",
}


@dataclass
class MemorySnapshot:
    summary: str
    profile: str
    summary_updated_at: str | None
    profile_updated_at: str | None


@dataclass
class MemoryUpdateResult:
    content: str
    changed: bool
    updated_at: str | None


class MemoryService:
    """Two-file public memory: SUMMARY + PROFILE."""

    def __init__(
        self,
        path_service: PathService | None = None,
        store: SQLiteSessionStore | None = None,
        memory_dir: Path | None = None,
    ) -> None:
        self._path_service = path_service or get_path_service()
        self._store = store or get_sqlite_session_store()
        self._override_dir = memory_dir
        self._migrate_legacy()

    @property
    def _memory_dir(self) -> Path:
        if self._override_dir is not None:
            return self._override_dir
        return self._path_service.get_memory_dir()

    def _path(self, which: MemoryFile) -> Path:
        return self._memory_dir / _FILENAMES[which]

    def _migrate_legacy(self) -> None:
        """One-time migration from old memory.md to the two-file system."""
        legacy = self._memory_dir / "memory.md"
        if not legacy.exists():
            return
        if self._path("profile").exists() or self._path("summary").exists():
            return

        content = legacy.read_text(encoding="utf-8").strip()
        if not content:
            legacy.rename(legacy.with_suffix(".md.bak"))
            return

        preferences, context = self._extract_legacy_sections(content)
        self._memory_dir.mkdir(parents=True, exist_ok=True)
        if preferences:
            self._path("profile").write_text(
                f"## Preferences\n{preferences}", encoding="utf-8",
            )
        if context:
            self._path("summary").write_text(
                f"## Learning Journey\n{context}", encoding="utf-8",
            )
        legacy.rename(legacy.with_suffix(".md.bak"))

    # ── Read ──────────────────────────────────────────────────────────

    def read_file(self, which: MemoryFile) -> str:
        path = self._path(which)
        if not path.exists():
            return ""
        try:
            return path.read_text(encoding="utf-8").strip()
        except Exception:
            return ""

    def read_summary(self) -> str:
        return self.read_file("summary")

    def read_profile(self) -> str:
        return self.read_file("profile")

    def _file_updated_at(self, which: MemoryFile) -> str | None:
        path = self._path(which)
        if not path.exists():
            return None
        try:
            return datetime.fromtimestamp(path.stat().st_mtime).astimezone().isoformat()
        except Exception:
            return None

    def read_snapshot(self) -> MemorySnapshot:
        return MemorySnapshot(
            summary=self.read_summary(),
            profile=self.read_profile(),
            summary_updated_at=self._file_updated_at("summary"),
            profile_updated_at=self._file_updated_at("profile"),
        )

    # ── Write ─────────────────────────────────────────────────────────

    def write_file(self, which: MemoryFile, content: str) -> MemorySnapshot:
        normalized = str(content or "").strip()
        path = self._path(which)
        path.parent.mkdir(parents=True, exist_ok=True)
        if not normalized:
            if path.exists():
                path.unlink()
        else:
            path.write_text(normalized, encoding="utf-8")
        return self.read_snapshot()

    def write_memory(self, content: str) -> MemorySnapshot:
        """Legacy compat: write to profile (primary editable file)."""
        return self.write_file("profile", content)

    def clear_file(self, which: MemoryFile) -> MemorySnapshot:
        return self.write_file(which, "")

    def clear_memory(self) -> MemorySnapshot:
        for f in MEMORY_FILES:
            path = self._path(f)
            if path.exists():
                path.unlink()
        return self.read_snapshot()

    # ── Context building (injected into LLM prompts) ─────────────────

    def build_memory_context(self, max_chars: int = 4000) -> str:
        parts: list[str] = []

        profile = self.read_profile()
        if profile:
            parts.append(f"### User Profile\n{profile}")

        summary = self.read_summary()
        if summary:
            parts.append(f"### Learning Context\n{summary}")

        if not parts:
            return ""

        combined = "\n\n".join(parts)
        if len(combined) > max_chars:
            combined = combined[:max_chars].rstrip() + "\n...[truncated]"

        return (
            "## Background Memory\n"
            "Use this memory sparingly — only when directly relevant.\n\n"
            f"{combined}"
        )

    def health(self) -> dict:
        """Lightweight health snapshot for the UI."""
        snap = self.read_snapshot()
        quarantine_root = self._memory_dir / "_quarantined"
        quarantined = 0
        if quarantine_root.is_dir():
            try:
                quarantined = sum(1 for _ in quarantine_root.iterdir() if _.is_dir())
            except OSError:
                quarantined = 0
        profile_dirty = _contains_identity_claim(snap.profile)
        summary_dirty = _contains_identity_claim(snap.summary)
        status = "contaminated" if (profile_dirty or summary_dirty) else "clean"
        return {
            "status": status,
            "profile_chars": len(snap.profile or ""),
            "summary_chars": len(snap.summary or ""),
            "profile_updated_at": snap.profile_updated_at,
            "summary_updated_at": snap.summary_updated_at,
            "quarantined_generations": quarantined,
            "identity_filter_active": True,
            "auto_refresh_enabled": MEMORY_AUTO_REFRESH_ENABLED,
        }

    def get_preferences_text(self) -> str:
        profile = self.read_profile()
        return f"## User Profile\n{profile}" if profile else ""

    # ── Auto-refresh from conversation ────────────────────────────────

    async def refresh_from_turn(
        self,
        *,
        user_message: str,
        assistant_message: str,
        session_id: str = "",
        capability: str = "",
        language: str = "en",
        timestamp: str = "",
    ) -> MemoryUpdateResult:
        if not user_message.strip() or not assistant_message.strip():
            return MemoryUpdateResult(content="", changed=False, updated_at=None)

        source = (
            f"[Session] {session_id or '(unknown)'}\n"
            f"[Capability] {capability or 'chat'}\n"
            f"[Timestamp] {timestamp or datetime.now().isoformat()}\n\n"
            f"[User]\n{user_message.strip()}\n\n"
            f"[Assistant]\n{assistant_message.strip()}"
        )

        p_changed = await self._rewrite_one("profile", source, language)
        s_changed = await self._rewrite_one("summary", source, language)

        snap = self.read_snapshot()
        return MemoryUpdateResult(
            content=snap.profile,
            changed=p_changed or s_changed,
            updated_at=snap.profile_updated_at,
        )

    async def refresh_from_session(
        self,
        session_id: str | None = None,
        *,
        language: str = "en",
        max_messages: int = 10,
    ) -> MemoryUpdateResult:
        target = (session_id or "").strip()
        if not target:
            sessions = await self._store.list_sessions(limit=1)
            if sessions:
                target = str(sessions[0].get("session_id", "") or "")

        if not target:
            return MemoryUpdateResult(content="", changed=False, updated_at=None)

        messages = await self._store.get_messages_for_context(target)
        relevant = [
            m for m in messages
            if str(m.get("role", "")) in {"user", "assistant"}
            and str(m.get("content", "") or "").strip()
        ][-max_messages:]

        if not relevant:
            return MemoryUpdateResult(content="", changed=False, updated_at=None)

        transcript = "\n\n".join(
            f"{'User' if m.get('role') == 'user' else 'Assistant'}: "
            f"{str(m.get('content', '') or '').strip()}"
            for m in relevant
        )

        cap = ""
        sess = await self._store.get_session(target)
        if sess:
            cap = str(sess.get("capability", "") or "")

        source = (
            f"[Session] {target}\n"
            f"[Capability] {cap or 'chat'}\n\n"
            f"[Recent Transcript]\n{transcript}"
        )

        p_changed = await self._rewrite_one("profile", source, language)
        s_changed = await self._rewrite_one("summary", source, language)

        snap = self.read_snapshot()
        return MemoryUpdateResult(
            content=snap.profile,
            changed=p_changed or s_changed,
            updated_at=snap.profile_updated_at,
        )

    # ── LLM rewrite for individual files ──────────────────────────────

    async def _rewrite_one(self, which: MemoryFile, source: str, language: str) -> bool:
        """Rewrite a single memory file. Returns True if changed."""
        current = self.read_file(which)
        zh = str(language).lower().startswith("zh")

        if which == "profile":
            sys_prompt, user_prompt = self._profile_prompts(current, source, zh)
        else:
            sys_prompt, user_prompt = self._summary_prompts(current, source, zh)

        chunks: list[str] = []
        async for c in llm_stream(
            prompt=user_prompt,
            system_prompt=sys_prompt,
            temperature=0.2,
            max_tokens=900,
        ):
            chunks.append(c)

        raw = _strip_code_fence("".join(chunks)).strip()
        if not raw or raw == _NO_CHANGE:
            return False

        # Identity lie-laundering guard: reject any write that references model
        # or provider identity. Strip matching lines; if nothing meaningful is
        # left, skip the write entirely. Do not leak user input to logs.
        if _contains_identity_claim(raw):
            redacted = _redact_identity_lines(raw)
            import logging

            logging.getLogger(__name__).warning(
                "memory write blocked by identity guard (file=%s); "
                "lines redacted, write skipped if residue was empty",
                which,
            )
            if not redacted.strip() or redacted.strip() == current.strip():
                return False
            raw = redacted

        if raw == current:
            return False

        self.write_file(which, raw)
        return True

    @staticmethod
    def _profile_prompts(current: str, source: str, zh: bool) -> tuple[str, str]:
        if zh:
            return (
                "你负责维护一份用户画像文档。只保留稳定的用户身份、偏好、知识水平。"
                f"如果无需修改，请只返回 {_NO_CHANGE}。",
                "如果需要更新，请重写用户画像，可使用以下标题：\n"
                "## Identity\n## Learning Style\n## Knowledge Level\n## Preferences\n\n"
                "规则：保持简短，删除过时内容，不要记录临时对话。\n\n"
                f"[当前画像]\n{current or '(empty)'}\n\n"
                f"[新增材料]\n{source}"
            )
        return (
            "You maintain a user profile document. Only keep stable identity, "
            "preferences, and knowledge levels. "
            f"If nothing should change, return exactly {_NO_CHANGE}.",
            "Rewrite the user profile if needed. Suggested sections:\n"
            "## Identity\n## Learning Style\n## Knowledge Level\n## Preferences\n\n"
            "Rules: keep it short, remove stale items, no transient chatter.\n\n"
            f"[Current profile]\n{current or '(empty)'}\n\n"
            f"[New material]\n{source}"
        )

    @staticmethod
    def _summary_prompts(current: str, source: str, zh: bool) -> tuple[str, str]:
        if zh:
            return (
                "你负责维护一份学习旅程摘要。记录用户正在学什么、完成了什么、有哪些待解决的问题。"
                f"如果无需修改，请只返回 {_NO_CHANGE}。",
                "如果需要更新，请重写学习旅程摘要，可使用以下标题：\n"
                "## Current Focus\n## Accomplishments\n## Open Questions\n\n"
                "规则：保持简短，删除已完成或过时的条目。\n\n"
                f"[当前摘要]\n{current or '(empty)'}\n\n"
                f"[新增材料]\n{source}"
            )
        return (
            "You maintain a learning journey summary. Track what the user is studying, "
            "what they've accomplished, and what open questions remain. "
            f"If nothing should change, return exactly {_NO_CHANGE}.",
            "Rewrite the learning summary if needed. Suggested sections:\n"
            "## Current Focus\n## Accomplishments\n## Open Questions\n\n"
            "Rules: keep it short, remove completed/stale items.\n\n"
            f"[Current summary]\n{current or '(empty)'}\n\n"
            f"[New material]\n{source}"
        )

    # ── Helpers ───────────────────────────────────────────────────────

    @staticmethod
    def _extract_legacy_sections(content: str) -> tuple[str, str]:
        text = content.replace("\r\n", "\n").strip()
        preferences = ""
        context = ""
        pref_match = re.search(
            r"##\s*Preferences\s*(.*?)(?=\n##\s*Context\b|\Z)",
            text, flags=re.IGNORECASE | re.DOTALL,
        )
        ctx_match = re.search(
            r"##\s*Context\s*(.*)$",
            text, flags=re.IGNORECASE | re.DOTALL,
        )
        if pref_match:
            preferences = pref_match.group(1).strip()
        if ctx_match:
            context = ctx_match.group(1).strip()
        return preferences, context


def _strip_code_fence(content: str) -> str:
    cleaned = str(content or "").strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned)
    return cleaned.strip()


# Per-user MemoryService cache (keyed by user id). The old server-global
# "active user" behavior is gone; get_memory_service() now REQUIRES a user id.
# A dictionary keyed by uid holds instances — no shared mutable "active" state.
_MEMORY_SERVICES: dict[str, "MemoryService"] = {}


def get_memory_service(user_id: str | None = None) -> MemoryService:
    """Return a MemoryService scoped to the given user_id.

    If user_id is None, falls back to the UserService active id. This fallback
    exists only for code paths that cannot yet thread a request-scoped user
    through them (CLI, legacy routers). Live chat path MUST pass user_id
    explicitly.
    """
    from deeptutor.services.users import get_user_service

    uid = user_id or get_user_service().active_user_id()
    inst = _MEMORY_SERVICES.get(uid)
    if inst is not None:
        return inst
    mem_dir = get_user_service().memory_dir(uid)
    mem_dir.mkdir(parents=True, exist_ok=True)
    inst = MemoryService(memory_dir=mem_dir)
    _MEMORY_SERVICES[uid] = inst
    return inst


def reset_memory_service(user_id: str | None = None) -> None:
    """Invalidate a single user's MemoryService, or all if user_id is None."""
    if user_id is None:
        _MEMORY_SERVICES.clear()
    else:
        _MEMORY_SERVICES.pop(user_id, None)


__all__ = [
    "MemoryFile",
    "MemoryService",
    "reset_memory_service",
    "MemorySnapshot",
    "MemoryUpdateResult",
    "get_memory_service",
]
