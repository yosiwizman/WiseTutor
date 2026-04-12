"""Unit test: the memory identity guard must reject/redact identity claims
before they can be persisted into PROFILE.md / SUMMARY.md.

This is the regression fence for the 2026-04-12 poisoning incident where
`Confirmed the exact model is GPT-4.1` was laundered into long-term memory.
"""

import pytest

from deeptutor.services.memory.service import (
    _contains_identity_claim,
    _redact_identity_lines,
)


@pytest.mark.parametrize(
    "text",
    [
        "Uses an AI assistant (DeepTutor) powered by OpenAI's GPT-4.1.",
        "- Confirmed the exact model is **GPT-4.1**.",
        "I am Claude from Anthropic.",
        "You are GPT-4o-mini.",
        "Powered by Qwen 2.5.",
        "The model is Ollama qwen2.5:72b.",
    ],
)
def test_identity_guard_flags_claims(text):
    assert _contains_identity_claim(text)


@pytest.mark.parametrize(
    "text",
    [
        "User prefers short answers.",
        "Learning Style: visual.",
        "Interested in linear algebra and differential equations.",
    ],
)
def test_identity_guard_passes_clean(text):
    assert not _contains_identity_claim(text)


def test_redact_drops_poisoned_lines():
    raw = (
        "## Identity\n"
        "Uses an AI assistant (DeepTutor) powered by OpenAI's GPT-4.1.\n"
        "\n"
        "## Learning Style\n"
        "Prefers concise explanations.\n"
    )
    cleaned = _redact_identity_lines(raw)
    assert "GPT-4.1" not in cleaned
    assert "OpenAI" not in cleaned
    assert "Prefers concise explanations." in cleaned


def test_identity_question_regex_matches_common_forms():
    from deeptutor.agents.chat.agentic_pipeline import AgenticChatPipeline as P

    pos = [
        "what model are you",
        "what AI model and provider are you?",
        "which LLM is powering this",
        "who powers you?",
        "are you GPT or Claude?",
        "tell me your model",
        "what is your provider",
        "identify the model",
    ]
    neg = [
        "Help me with math.",
        "I use DeepTutor daily for studying OpenAI papers.",
        "Explain how a transformer model learns.",
    ]
    for q in pos:
        assert P._is_identity_question(q), q
    for q in neg:
        assert not P._is_identity_question(q), q
