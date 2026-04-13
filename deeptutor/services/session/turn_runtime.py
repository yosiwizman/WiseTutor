"""
Turn-level runtime manager for unified chat streaming.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from deeptutor.core.stream import StreamEvent, StreamEventType
from deeptutor.services.path_service import get_path_service
from deeptutor.services.session.sqlite_store import SQLiteSessionStore, get_sqlite_session_store

logger = logging.getLogger(__name__)


def _should_capture_assistant_content(event: StreamEvent) -> bool:
    if event.type != StreamEventType.CONTENT:
        return False
    metadata = event.metadata or {}
    call_id = metadata.get("call_id")
    if not call_id:
        return True
    return metadata.get("call_kind") == "llm_final_response"


def _clip_text(value: str, limit: int = 4000) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n...[truncated]"


def _extract_followup_question_context(
    config: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not isinstance(config, dict):
        return None
    raw = config.pop("followup_question_context", None)
    if not isinstance(raw, dict):
        return None

    question = str(raw.get("question", "") or "").strip()
    question_id = str(raw.get("question_id", "") or "").strip()
    if not question:
        return None

    options = raw.get("options")
    normalized_options: dict[str, str] | None = None
    if isinstance(options, dict):
        normalized_options = {
            str(key).strip().upper()[:1]: str(value or "").strip()
            for key, value in options.items()
            if str(value or "").strip()
        }

    return {
        "parent_quiz_session_id": str(raw.get("parent_quiz_session_id", "") or "").strip(),
        "question_id": question_id,
        "question": question,
        "question_type": str(raw.get("question_type", "") or "").strip(),
        "options": normalized_options,
        "correct_answer": str(raw.get("correct_answer", "") or "").strip(),
        "explanation": str(raw.get("explanation", "") or "").strip(),
        "difficulty": str(raw.get("difficulty", "") or "").strip(),
        "concentration": str(raw.get("concentration", "") or "").strip(),
        "knowledge_context": _clip_text(str(raw.get("knowledge_context", "") or "").strip()),
        "user_answer": str(raw.get("user_answer", "") or "").strip(),
        "is_correct": raw.get("is_correct"),
    }


def _extract_persist_user_message(config: dict[str, Any] | None) -> bool:
    if not isinstance(config, dict):
        return True
    raw = config.pop("_persist_user_message", True)
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        return raw.strip().lower() not in {"false", "0", "no"}
    return bool(raw)


def _format_followup_question_context(context: dict[str, Any], language: str = "en") -> str:
    options = context.get("options") or {}
    option_lines = []
    if isinstance(options, dict) and options:
        for key, value in options.items():
            if value:
                option_lines.append(f"{key}. {value}")
    correctness = context.get("is_correct")
    correctness_text = (
        "correct"
        if correctness is True
        else "incorrect"
        if correctness is False
        else "unknown"
    )

    if str(language or "en").lower().startswith("zh"):
        lines = [
            "你正在处理一道测验题的后续追问。",
            "下面是本题上下文，请在后续回答中优先围绕这道题进行解释、纠错、延展和追问。",
            "如果用户提出超出本题的内容，也可以正常回答，但要保持和本题的连续性。",
            "",
            "[Question Follow-up Context]",
            f"Question ID: {context.get('question_id') or '(none)'}",
            f"Parent quiz session: {context.get('parent_quiz_session_id') or '(none)'}",
            f"Question type: {context.get('question_type') or '(none)'}",
            f"Difficulty: {context.get('difficulty') or '(none)'}",
            f"Concentration: {context.get('concentration') or '(none)'}",
            "",
            "Question:",
            context.get("question") or "(none)",
        ]
        if option_lines:
            lines.extend(["", "Options:", *option_lines])
        lines.extend(
            [
                "",
                f"User answer: {context.get('user_answer') or '(not provided)'}",
                f"User result: {correctness_text}",
                f"Reference answer: {context.get('correct_answer') or '(none)'}",
                "",
                "Explanation:",
                context.get("explanation") or "(none)",
            ]
        )
        if context.get("knowledge_context"):
            lines.extend(
                [
                    "",
                    "Knowledge context:",
                    context["knowledge_context"],
                ]
            )
        return "\n".join(lines).strip()

    lines = [
        "You are handling follow-up questions about a single quiz item.",
        "Use the question context below as the primary grounding for future turns in this session.",
        "If the user asks something broader, you may answer normally, but maintain continuity with this quiz item.",
        "",
        "[Question Follow-up Context]",
        f"Question ID: {context.get('question_id') or '(none)'}",
        f"Parent quiz session: {context.get('parent_quiz_session_id') or '(none)'}",
        f"Question type: {context.get('question_type') or '(none)'}",
        f"Difficulty: {context.get('difficulty') or '(none)'}",
        f"Concentration: {context.get('concentration') or '(none)'}",
        "",
        "Question:",
        context.get("question") or "(none)",
    ]
    if option_lines:
        lines.extend(["", "Options:", *option_lines])
    lines.extend(
        [
            "",
            f"User answer: {context.get('user_answer') or '(not provided)'}",
            f"User result: {correctness_text}",
            f"Reference answer: {context.get('correct_answer') or '(none)'}",
            "",
            "Explanation:",
            context.get("explanation") or "(none)",
        ]
    )
    if context.get("knowledge_context"):
        lines.extend(
            [
                "",
                "Knowledge context:",
                context["knowledge_context"],
            ]
        )
    return "\n".join(lines).strip()


@dataclass
class _LiveSubscriber:
    queue: asyncio.Queue[dict[str, Any]]


@dataclass
class _TurnExecution:
    turn_id: str
    session_id: str
    capability: str
    payload: dict[str, Any]
    task: asyncio.Task[None] | None = None
    subscribers: list[_LiveSubscriber] = field(default_factory=list)


class TurnRuntimeManager:
    """Run one turn in the background and multiplex persisted/live events."""

    def __init__(self, store: SQLiteSessionStore | None = None) -> None:
        self.store = store or get_sqlite_session_store()
        self._lock = asyncio.Lock()
        self._executions: dict[str, _TurnExecution] = {}

    async def start_turn(self, payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        capability = str(payload.get("capability") or "chat")
        raw_config = dict(payload.get("config", {}) or {})
        runtime_only_keys = ("_persist_user_message", "followup_question_context")
        runtime_only_config = {
            key: raw_config.pop(key)
            for key in runtime_only_keys
            if key in raw_config
        }
        try:
            from deeptutor.capabilities.request_contracts import validate_capability_config

            validated_public_config = validate_capability_config(capability, raw_config)
        except ValueError as exc:
            raise RuntimeError(str(exc)) from exc
        payload = {
            **payload,
            "capability": capability,
            "config": {**validated_public_config, **runtime_only_config},
        }
        session = await self.store.ensure_session(payload.get("session_id"))
        await self.store.update_session_preferences(
            session["id"],
            {
                "capability": capability,
                "tools": list(payload.get("tools") or []),
                "knowledge_bases": list(payload.get("knowledge_bases") or []),
                "language": str(payload.get("language") or "en"),
            },
        )
        turn = await self.store.create_turn(session["id"], capability=capability)
        execution = _TurnExecution(
            turn_id=turn["id"],
            session_id=session["id"],
            capability=capability,
            payload=dict(payload),
        )
        await self._persist_and_publish(
            execution,
            StreamEvent(
                type=StreamEventType.SESSION,
                source="turn_runtime",
                metadata={"session_id": session["id"], "turn_id": turn["id"]},
            ),
        )
        async with self._lock:
            self._executions[turn["id"]] = execution
            execution.task = asyncio.create_task(self._run_turn(execution))
        return session, turn

    async def cancel_turn(self, turn_id: str) -> bool:
        async with self._lock:
            execution = self._executions.get(turn_id)
        if execution is None or execution.task is None or execution.task.done():
            turn = await self.store.get_turn(turn_id)
            if turn is None or turn.get("status") != "running":
                return False
            await self.store.update_turn_status(turn_id, "cancelled", "Turn cancelled")
            return True
        execution.task.cancel()
        return True

    async def subscribe_turn(
        self,
        turn_id: str,
        after_seq: int = 0,
    ) -> AsyncIterator[dict[str, Any]]:
        backlog = await self.store.get_turn_events(turn_id, after_seq=after_seq)
        last_seq = after_seq
        for item in backlog:
            last_seq = max(last_seq, int(item.get("seq") or 0))
            yield item

        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        subscriber = _LiveSubscriber(queue=queue)
        execution: _TurnExecution | None = None
        async with self._lock:
            execution = self._executions.get(turn_id)
            if execution is not None:
                execution.subscribers.append(subscriber)

        catchup = await self.store.get_turn_events(turn_id, after_seq=last_seq)
        for item in catchup:
            seq = int(item.get("seq") or 0)
            if seq <= last_seq:
                continue
            last_seq = seq
            if execution is None:
                yield item
            else:
                queue.put_nowait(item)

        turn = await self.store.get_turn(turn_id)
        if execution is None:
            if turn is None or turn.get("status") != "running":
                return
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                seq = int(item.get("seq") or 0)
                if seq <= last_seq:
                    continue
                last_seq = seq
                yield item
        finally:
            async with self._lock:
                execution = self._executions.get(turn_id)
                if execution is not None:
                    execution.subscribers = [sub for sub in execution.subscribers if sub is not subscriber]

    async def subscribe_session(
        self,
        session_id: str,
        after_seq: int = 0,
    ) -> AsyncIterator[dict[str, Any]]:
        active_turn = await self.store.get_active_turn(session_id)
        if active_turn is None:
            return
        async for item in self.subscribe_turn(active_turn["id"], after_seq=after_seq):
            yield item

    async def _run_turn(self, execution: _TurnExecution) -> None:
        payload = execution.payload
        session_id = execution.session_id
        capability_name = execution.capability
        turn_id = execution.turn_id
        attachments = []
        attachment_records = []
        assistant_events: list[dict[str, Any]] = []
        assistant_content = ""

        # Server-side capability-allowlist safety net. The WS boundary also
        # enforces this; we re-check here so that any future code path that
        # constructs a turn (CLI, internal scheduler) cannot bypass it. Only
        # enforced when a user id is stamped — CLI/test paths without a user
        # remain unaffected.
        _stamped_uid = payload.get("_wt_user_id")
        if _stamped_uid:
            _prefs = payload.get("_wt_preferences") or {}
            _allowed = set(_prefs.get("allowed_capabilities") or [])
            if _allowed and capability_name not in _allowed:
                await self._persist_and_publish(
                    execution,
                    StreamEvent(
                        type=StreamEventType.ERROR,
                        source=capability_name or "chat",
                        content="capability_not_allowed",
                        metadata={
                            "turn_terminal": True, "status": "rejected",
                            "reason": "capability_not_allowed",
                            "requested_capability": capability_name,
                            "allowed_capabilities": sorted(_allowed),
                            "user_id": _stamped_uid,
                        },
                    ),
                )
                await self.store.update_turn_status(
                    turn_id, "rejected", "capability_not_allowed",
                )
                return

        try:
            from deeptutor.core.context import Attachment, UnifiedContext
            from deeptutor.runtime.orchestrator import ChatOrchestrator
            from deeptutor.agents.notebook import NotebookAnalysisAgent
            from deeptutor.services.memory import get_memory_service
            from deeptutor.services.notebook import notebook_manager
            from deeptutor.services.llm.config import get_llm_config
            from deeptutor.services.session.context_builder import ContextBuilder

            request_config = dict(payload.get("config", {}) or {})
            followup_question_context = _extract_followup_question_context(request_config)
            persist_user_message = _extract_persist_user_message(request_config)
            raw_user_content = str(payload.get("content", "") or "")
            notebook_references = payload.get("notebook_references", []) or []
            history_references = payload.get("history_references", []) or []
            notebook_context = ""
            history_context = ""

            for item in payload.get("attachments", []):
                record = {
                    "type": item.get("type", "file"),
                    "url": item.get("url", ""),
                    "base64": item.get("base64", ""),
                    "filename": item.get("filename", ""),
                    "mime_type": item.get("mime_type", ""),
                }
                attachment_records.append(record)
                attachments.append(Attachment(**record))

            if followup_question_context:
                existing_messages = await self.store.get_messages_for_context(session_id)
                if not existing_messages:
                    await self.store.add_message(
                        session_id=session_id,
                        role="system",
                        content=_format_followup_question_context(
                            followup_question_context,
                            language=str(payload.get("language", "en") or "en"),
                        ),
                        capability=capability_name or "chat",
                    )

            llm_config = get_llm_config()
            builder = ContextBuilder(self.store)
            history_result = await builder.build(
                session_id=session_id,
                llm_config=llm_config,
                language=payload.get("language", "en"),
                on_event=lambda event: self._persist_and_publish(execution, event),
            )
            # Per-request user id stamped by unified_ws from the connection's
            # signed cookie. No fallback to a server-global active user here.
            _wt_user_id = payload.get("_wt_user_id") or execution.payload.get("_wt_user_id")
            memory_service = get_memory_service(user_id=_wt_user_id)
            memory_context = memory_service.build_memory_context()

            if notebook_references:
                referenced_records = notebook_manager.get_records_by_references(notebook_references)
                if referenced_records:
                    analysis_agent = NotebookAnalysisAgent(
                        language=str(payload.get("language", "en") or "en")
                    )
                    notebook_context = await analysis_agent.analyze(
                        user_question=raw_user_content,
                        records=referenced_records,
                        emit=lambda event: self._persist_and_publish(execution, event),
                    )

            if history_references:
                history_records: list[dict[str, Any]] = []
                for session_ref in history_references:
                    history_session_id = str(session_ref or "").strip()
                    if not history_session_id:
                        continue

                    history_session = await self.store.get_session(history_session_id)
                    if not history_session:
                        continue

                    history_messages = await self.store.get_messages_for_context(history_session_id)
                    transcript_lines = [
                        f"## {str(message.get('role', '')).title()}\n{message.get('content', '')}"
                        for message in history_messages
                        if str(message.get("content", "") or "").strip()
                    ]
                    if not transcript_lines:
                        continue

                    history_summary = str(history_session.get("compressed_summary", "") or "").strip()
                    if not history_summary:
                        history_summary = _clip_text(
                            " ".join(
                                str(message.get("content", "") or "").strip()
                                for message in history_messages[-4:]
                                if str(message.get("content", "") or "").strip()
                            ),
                            limit=400,
                        )
                    if not history_summary:
                        history_summary = f"{len(history_messages)} messages"

                    history_records.append(
                        {
                            "id": history_session_id,
                            "notebook_id": "__history__",
                            "notebook_name": "History",
                            "title": str(history_session.get("title", "") or "Untitled session"),
                            "summary": history_summary,
                            "output": "\n\n".join(transcript_lines),
                            "metadata": {
                                "session_id": history_session_id,
                                "source": "history",
                            },
                        }
                    )

                if history_records:
                    analysis_agent = NotebookAnalysisAgent(
                        language=str(payload.get("language", "en") or "en")
                    )
                    history_context = await analysis_agent.analyze(
                        user_question=raw_user_content,
                        records=history_records,
                        emit=lambda event: self._persist_and_publish(execution, event),
                    )

            effective_user_message = raw_user_content
            context_parts: list[str] = []
            if notebook_context:
                context_parts.append(f"[Notebook Context]\n{notebook_context}")
            if history_context:
                context_parts.append(f"[History Context]\n{history_context}")
            if context_parts:
                context_parts.append(f"[User Question]\n{raw_user_content}")
                effective_user_message = "\n\n".join(context_parts)

            conversation_history = list(history_result.conversation_history)
            conversation_context_text = history_result.context_text

            if persist_user_message:
                await self.store.add_message(
                    session_id=session_id,
                    role="user",
                    content=raw_user_content,
                    capability=capability_name,
                    attachments=attachment_records,
                )

            context = UnifiedContext(
                session_id=session_id,
                user_message=effective_user_message,
                conversation_history=conversation_history,
                enabled_tools=payload.get("tools"),
                active_capability=payload.get("capability"),
                knowledge_bases=payload.get("knowledge_bases", []),
                attachments=attachments,
                config_overrides=request_config,
                language=payload.get("language", "en"),
                notebook_context=notebook_context,
                history_context=history_context,
                memory_context=memory_context,
                metadata={
                    "conversation_summary": history_result.conversation_summary,
                    "conversation_context_text": conversation_context_text,
                    "history_token_count": history_result.token_count,
                    "history_budget": history_result.budget,
                    "turn_id": turn_id,
                    "question_followup_context": followup_question_context or {},
                    "notebook_references": notebook_references,
                    "history_references": history_references,
                    "memory_context": memory_context,
                    "_wt_user_id": _wt_user_id,
                    "_wt_preferences": payload.get("_wt_preferences") or {},
                    "_wt_display_name": payload.get("_wt_display_name") or "",
                },
            )

            # TEST-ONLY seam: when the process is in test mode and the payload
            # carries _wt_test_inject_output, skip orchestration and use the
            # injected string as assistant_content. The post-generation safety
            # gate below then runs on it just like a real model output. The
            # seam is stripped at the WS boundary in production.
            import os as _os_mod
            _inject = payload.get("_wt_test_inject_output")
            if _inject is not None and _os_mod.environ.get("WISETUTOR_TEST_MODE") == "1":
                assistant_content = str(_inject)
                await self._persist_and_publish(
                    execution,
                    StreamEvent(
                        type=StreamEventType.CONTENT,
                        source="chat",
                        stage="responding",
                        content=assistant_content,
                        metadata={"test_inject": True},
                    ),
                )
            else:
                orch = ChatOrchestrator()
                async for event in orch.handle(context):
                    if event.type == StreamEventType.SESSION:
                        continue
                    payload_event = await self._persist_and_publish(execution, event)
                    if payload_event.get("type") not in {"done", "session"}:
                        assistant_events.append(payload_event)
                    if _should_capture_assistant_content(event):
                        assistant_content += event.content

            # Post-generation child-safety gate. For users with
            # safety_profile=child, inspect the assembled assistant content;
            # if it matches a blocked category, replace with a child-safe
            # redirect and emit an explicit terminal safety event.
            _prefs_post = payload.get("_wt_preferences") or {}
            _safety_post = _prefs_post.get("safety_profile") or "standard"
            if _safety_post == "child" and assistant_content:
                from deeptutor.services.safety import (
                    screen_output, safe_child_redirect, log_safety_event,
                )
                _out = screen_output(assistant_content)
                if not _out.ok:
                    log_safety_event(
                        path="output",
                        category=_out.category,
                        user_id=payload.get("_wt_user_id") or "",
                        safety_profile=_safety_post,
                        turn_id=turn_id,
                        matched_pattern=_out.matched_pattern,
                    )
                    safe_msg = safe_child_redirect(_out.category)
                    await self._persist_and_publish(
                        execution,
                        StreamEvent(
                            type=StreamEventType.ERROR,
                            source="safety",
                            content="safety_filter_output",
                            metadata={
                                "turn_terminal": True,
                                "status": "rejected",
                                "reason": "safety_filter_output",
                                "category": _out.category,
                                "user_id": payload.get("_wt_user_id") or "",
                                "safety_profile": _safety_post,
                                "redacted_message": safe_msg,
                            },
                        ),
                    )
                    assistant_content = safe_msg
                    assistant_events.append({
                        "type": "safety_filter_output",
                        "category": _out.category,
                    })

            await self.store.add_message(
                session_id=session_id,
                role="assistant",
                content=assistant_content,
                capability=capability_name,
                events=assistant_events,
            )
            await self.store.update_turn_status(turn_id, "completed")
            # Memory auto-refresh on every turn is the lie-laundering vector
            # discovered in the 2026-04-12 audit. Gated off by default; opt in
            # with DEEPTUTOR_MEMORY_AUTO_REFRESH=1.
            from deeptutor.services.memory.service import MEMORY_AUTO_REFRESH_ENABLED

            if MEMORY_AUTO_REFRESH_ENABLED:
                try:
                    await memory_service.refresh_from_turn(
                        user_message=raw_user_content,
                        assistant_message=assistant_content,
                        session_id=session_id,
                        capability=capability_name or "chat",
                        language=str(payload.get("language", "en") or "en"),
                    )
                except Exception:
                    logger.debug("Failed to refresh lightweight memory", exc_info=True)
        except asyncio.CancelledError:
            await self.store.update_turn_status(turn_id, "cancelled", "Turn cancelled")
            await self._persist_and_publish(
                execution,
                StreamEvent(
                    type=StreamEventType.ERROR,
                    source=capability_name,
                    content="Turn cancelled",
                    metadata={"turn_terminal": True, "status": "cancelled"},
                ),
            )
            await self._persist_and_publish(
                execution,
                StreamEvent(
                    type=StreamEventType.DONE,
                    source=capability_name,
                    metadata={"status": "cancelled"},
                ),
            )
            raise
        except Exception as exc:
            logger.error("Turn %s failed: %s", turn_id, exc, exc_info=True)
            await self.store.update_turn_status(turn_id, "failed", str(exc))
            await self._persist_and_publish(
                execution,
                StreamEvent(
                    type=StreamEventType.ERROR,
                    source=capability_name,
                    content=str(exc),
                    metadata={"turn_terminal": True, "status": "failed"},
                ),
            )
            await self._persist_and_publish(
                execution,
                StreamEvent(
                    type=StreamEventType.DONE,
                    source=capability_name,
                    metadata={"status": "failed"},
                ),
            )
        finally:
            async with self._lock:
                current = self._executions.get(turn_id)
                if current is not None:
                    for subscriber in current.subscribers:
                        with contextlib.suppress(asyncio.QueueFull):
                            subscriber.queue.put_nowait(None)
                    self._executions.pop(turn_id, None)

    async def _persist_and_publish(
        self,
        execution: _TurnExecution,
        event: StreamEvent,
    ) -> dict[str, Any]:
        if event.type == StreamEventType.DONE and not event.metadata.get("status"):
            event.metadata = {**event.metadata, "status": "completed"}
        event.session_id = execution.session_id
        event.turn_id = execution.turn_id
        payload = event.to_dict()
        try:
            persisted = await self.store.append_turn_event(execution.turn_id, payload)
        except ValueError as exc:
            # A turn can disappear when the session is deleted while the turn task
            # is still draining events. Avoid cascading failures in the error path.
            if "Turn not found:" not in str(exc):
                raise
            logger.warning(
                "Skip persisting event for missing turn %s (%s)",
                execution.turn_id,
                event.type.value,
            )
            persisted = payload
        self._mirror_event_to_workspace(execution, persisted)
        async with self._lock:
            subscribers = list(self._executions.get(execution.turn_id, execution).subscribers)
        for subscriber in subscribers:
            with contextlib.suppress(asyncio.QueueFull):
                subscriber.queue.put_nowait(persisted)
        return persisted

    @staticmethod
    def _mirror_event_to_workspace(execution: _TurnExecution, payload: dict[str, Any]) -> None:
        """Mirror turn events to task-local ``events.jsonl`` files under ``data/user/workspace``."""
        try:
            path_service = get_path_service()
            task_dir = path_service.get_task_workspace(execution.capability, execution.turn_id)
            task_dir.mkdir(parents=True, exist_ok=True)
            event_file = task_dir / "events.jsonl"
            with open(event_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(payload, ensure_ascii=False) + "\n")
        except Exception:
            logger.debug("Failed to mirror turn event to workspace", exc_info=True)


_RUNTIMES: dict[str, TurnRuntimeManager] = {}


def reset_turn_runtime_manager(user_id: str | None = None) -> None:
    if user_id is None:
        _RUNTIMES.clear()
    else:
        _RUNTIMES.pop(user_id, None)


def get_turn_runtime_manager(user_id: str | None = None) -> TurnRuntimeManager:
    """Per-user TurnRuntimeManager. Requires an explicit user_id."""
    from deeptutor.services.session.sqlite_store import get_sqlite_session_store

    if not user_id:
        raise RuntimeError(
            "get_turn_runtime_manager requires an explicit user_id; no global active user."
        )
    uid = user_id
    inst = _RUNTIMES.get(uid)
    if inst is not None:
        return inst
    inst = TurnRuntimeManager(store=get_sqlite_session_store(uid))
    _RUNTIMES[uid] = inst
    return inst


__all__ = [
    "TurnRuntimeManager",
    "get_turn_runtime_manager",
    "reset_turn_runtime_manager",
]
