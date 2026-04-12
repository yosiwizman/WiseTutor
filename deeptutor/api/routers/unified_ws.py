"""
Unified WebSocket Endpoint
==========================

Single ``/api/v1/ws`` endpoint for turn-based execution and replayable streaming.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws")
async def unified_websocket(ws: WebSocket) -> None:
    await ws.accept()
    closed = False
    subscription_tasks: dict[str, asyncio.Task[None]] = {}

    # Per-connection user identity, resolved once at accept and used for the
    # lifetime of this socket. No shared "active user" is consulted.
    from deeptutor.services.users.identity import resolve_headers_user
    from deeptutor.services.users import get_user_service

    _cookies = {k.decode() if isinstance(k, bytes) else k:
                v.decode() if isinstance(v, bytes) else v
                for k, v in (ws.headers.raw if hasattr(ws.headers, "raw") else [])}
    # Preferred: signed cookie from a same-origin request. Fallback: signed
    # token in the query param `wt_uid_token=<user.sig>` so the WS can be
    # identified even when the browser reaches the backend through a reverse
    # proxy that drops cross-origin cookies on the WS upgrade.
    ws_uid = resolve_headers_user(dict(ws.headers)) or None
    if not ws_uid:
        from deeptutor.services.users.identity import verify_cookie as _verify

        token = ws.query_params.get("wt_uid_token") if hasattr(ws, "query_params") else None
        if token:
            ws_uid = _verify(token)
    if ws_uid and get_user_service().get(ws_uid) is None:
        ws_uid = None

    async def safe_send(data: dict[str, Any]) -> None:
        nonlocal closed
        if closed:
            return
        try:
            await ws.send_json(data)
        except Exception:
            closed = True

    async def stop_subscription(key: str) -> None:
        task = subscription_tasks.pop(key, None)
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def subscribe_turn(turn_id: str, after_seq: int = 0) -> None:
        from deeptutor.services.session import get_turn_runtime_manager

        async def _forward() -> None:
            runtime = get_turn_runtime_manager(user_id=ws_uid)
            async for event in runtime.subscribe_turn(turn_id, after_seq=after_seq):
                await safe_send(event)

        await stop_subscription(turn_id)
        subscription_tasks[turn_id] = asyncio.create_task(_forward())

    async def subscribe_session(session_id: str, after_seq: int = 0) -> None:
        from deeptutor.services.session import get_turn_runtime_manager

        async def _forward() -> None:
            runtime = get_turn_runtime_manager(user_id=ws_uid)
            async for event in runtime.subscribe_session(session_id, after_seq=after_seq):
                await safe_send(event)

        key = f"session:{session_id}"
        await stop_subscription(key)
        subscription_tasks[key] = asyncio.create_task(_forward())

    try:
        while not closed:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await safe_send({"type": "error", "content": "Invalid JSON."})
                continue

            msg_type = msg.get("type")

            if msg_type in {"message", "start_turn"}:
                from deeptutor.services.session import get_turn_runtime_manager

                # Gate: require a resolved user on the socket and enforce PIN
                # rotation if still on the seeded default.
                if not ws_uid:
                    await safe_send({
                        "type": "error", "source": "unified_ws",
                        "content": "no_user",
                        "metadata": {"turn_terminal": True, "status": "rejected", "reason": "no_user"},
                    })
                    continue
                _user = get_user_service().get(ws_uid)
                if _user and _user.pin_is_default:
                    await safe_send({
                        "type": "error", "source": "unified_ws",
                        "content": "pin_rotation_required",
                        "metadata": {"turn_terminal": True, "status": "rejected",
                                     "reason": "pin_rotation_required", "user_id": ws_uid},
                    })
                    continue

                runtime = get_turn_runtime_manager(user_id=ws_uid)
                # Stamp the user id into the payload so turn_runtime and the
                # chat pipeline can read it without going through any global.
                msg["_wt_user_id"] = ws_uid
                try:
                    _, turn = await runtime.start_turn(msg)
                except RuntimeError as exc:
                    await safe_send(
                        {
                            "type": "error",
                            "source": "unified_ws",
                            "stage": "",
                            "content": str(exc),
                            "metadata": {"turn_terminal": True, "status": "rejected"},
                            "session_id": str(msg.get("session_id") or ""),
                            "turn_id": "",
                            "seq": 0,
                        }
                    )
                    continue
                await subscribe_turn(turn["id"], after_seq=0)
                continue

            if msg_type == "subscribe_turn":
                turn_id = str(msg.get("turn_id") or "").strip()
                if not turn_id:
                    await safe_send({"type": "error", "content": "Missing turn_id."})
                    continue
                await subscribe_turn(turn_id, after_seq=int(msg.get("after_seq") or 0))
                continue

            if msg_type == "subscribe_session":
                session_id = str(msg.get("session_id") or "").strip()
                if not session_id:
                    await safe_send({"type": "error", "content": "Missing session_id."})
                    continue
                await subscribe_session(session_id, after_seq=int(msg.get("after_seq") or 0))
                continue

            if msg_type == "resume_from":
                turn_id = str(msg.get("turn_id") or "").strip()
                if not turn_id:
                    await safe_send({"type": "error", "content": "Missing turn_id."})
                    continue
                await subscribe_turn(turn_id, after_seq=int(msg.get("seq") or 0))
                continue

            if msg_type == "unsubscribe":
                turn_id = str(msg.get("turn_id") or "").strip()
                if turn_id:
                    await stop_subscription(turn_id)
                session_id = str(msg.get("session_id") or "").strip()
                if session_id:
                    await stop_subscription(f"session:{session_id}")
                continue

            if msg_type == "cancel_turn":
                turn_id = str(msg.get("turn_id") or "").strip()
                if not turn_id:
                    await safe_send({"type": "error", "content": "Missing turn_id."})
                    continue
                from deeptutor.services.session import get_turn_runtime_manager

                runtime = get_turn_runtime_manager(user_id=ws_uid)
                cancelled = await runtime.cancel_turn(turn_id)
                if not cancelled:
                    await safe_send({"type": "error", "content": f"Turn not found: {turn_id}"})
                continue

            await safe_send({"type": "error", "content": f"Unknown type: {msg_type}"})

    except WebSocketDisconnect:
        logger.debug("Client disconnected from /ws")
    except Exception as exc:
        logger.error("Unified WS error: %s", exc, exc_info=True)
        await safe_send({"type": "error", "content": str(exc)})
    finally:
        closed = True
        for key in list(subscription_tasks.keys()):
            await stop_subscription(key)
