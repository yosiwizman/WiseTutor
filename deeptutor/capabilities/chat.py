"""Agentic chat capability."""

from __future__ import annotations

from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.agents.chat.agentic_pipeline import CHAT_OPTIONAL_TOOLS, AgenticChatPipeline
from deeptutor.capabilities.request_contracts import get_capability_request_schema


class ChatCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="chat",
        description="Agentic chat with autonomous tool selection across enabled tools.",
        stages=["thinking", "acting", "observing", "responding"],
        tools_used=CHAT_OPTIONAL_TOOLS,
        cli_aliases=["chat"],
        request_schema=get_capability_request_schema("chat"),
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        uid = (context.metadata or {}).get("_wt_user_id") if context.metadata else None
        pipeline = AgenticChatPipeline(language=context.language, user_id=uid)
        await pipeline.run(context, stream)
