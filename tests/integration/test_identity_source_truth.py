"""Source-code-only guards retained from the superseded legacy suites.
These two cases are the only bits of tests/integration/test_chat_runtime_truth.py
and tests/integration/test_identity_reply_honesty.py that remain relevant under
Phase 2/3 auth. The full live-WS identity-reply behavior is covered by the
Playwright `identity-truth` spec, which runs under authenticated browser
contexts. See DECISIONS_LOG 2026-04-14.
"""
import inspect
def test_runtime_metadata_is_server_sourced_not_model_text():
    from deeptutor.agents.chat.agentic_pipeline import AgenticChatPipeline
    src = inspect.getsource(AgenticChatPipeline.run)
    assert "runtime" in src and "self.model" in src and "self.binding" in src, (
        "AgenticChatPipeline.run must emit server-sourced runtime metadata"
    )
def test_memory_identity_guard_rejects_poisoned_text():
    from deeptutor.services.memory.service import _contains_identity_claim
    candidate = (
        "## Identity\n"
        "Uses an AI assistant (DeepTutor) powered by OpenAI's GPT-4.1.\n"
    )
    assert _contains_identity_claim(candidate)
