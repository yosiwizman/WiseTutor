"""WiseTutor child-safety policy.

Conservative, rule-based server-side enforcement for users with
`preferences.safety_profile == "child"`. Two gates:

  screen_input(text)   — inspect the user's turn before it reaches the model.
  screen_output(text)  — inspect the assistant's completed output before publish.

Both return SafetyDecision. Decisions are intentionally narrow and testable;
a future slice can widen coverage. This module is NOT a full content-policy
engine and does not attempt to solve all safety — it is the first enforceable
layer between the prompt and the product.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger("wisetutor.safety")


@dataclass
class SafetyDecision:
    ok: bool
    category: Optional[str] = None  # "sexual" | "violence" | "self_harm" | "wrongdoing" | "weapons" | "drugs"
    matched_pattern: Optional[str] = None  # for audit; never returned to the user


# Categories use inclusive lists of conservative patterns. They match on word
# boundaries where practical and favor false positives over false negatives —
# the safety profile is for children, so over-blocking is acceptable.

_SEXUAL = [
    r"\bexplicit sex\b",
    r"\bpornograph",
    r"\bnude\s+(photo|pic|image|picture)",
    r"\bsexual (content|act|scene)",
    r"\b(child|kid)\s+porn",
    r"\berotic",
    r"\bnsfw\b",
    r"\bhentai\b",
    r"\bsex\s+stor(y|ies)\b",
]

_VIOLENCE = [
    r"\bgraphic\s+(violence|gore|torture)\b",
    r"\bhow\s+to\s+(kill|murder|stab|shoot|strangle|beat)\s+(?!.*(in\s+chess|in\s+a\s+game|a\s+monster|zombie))",
    r"\btorture\s+(someone|a\s+person|people)\b",
    r"\bdismember",
]

_SELF_HARM = [
    r"\bkill\s+myself\b",
    r"\bend\s+(my|it)\s+all\b",
    r"\bcommit\s+suicide\b",
    r"\bcut\s+myself\b",
    r"\bself[\s-]?harm\b",
    r"\bsuicide\s+(method|plan|note)\b",
    r"\bhang\s+myself\b",
]

_WRONGDOING = [
    r"\bhow\s+to\s+(hack|phish|ddos|dox)\b",
    r"\bhow\s+to\s+(steal|shoplift|pickpocket)\b",
    r"\bhow\s+to\s+(break\s+into|burglarize)\s+(a\s+)?(house|car|store|school|building)\b",
    r"\bhow\s+to\s+evade\s+(the\s+)?(police|law|arrest)\b",
    r"\bhow\s+to\s+make\s+(a\s+)?fake\s+id\b",
    r"\bhow\s+to\s+commit\s+(fraud|arson|a\s+crime)\b",
]

_WEAPONS = [
    r"\bhow\s+to\s+(make|build|assemble|construct)\s+(a\s+)?(bomb|explosive|ied|pipe\s+bomb|pressure\s+cooker\s+bomb)\b",
    r"\bhow\s+to\s+(make|build|assemble|3d[\s-]?print)\s+(a\s+)?(gun|firearm|rifle|handgun|pistol|glock|ar-?15|ghost\s+gun)\b",
    r"\bconvert\s+.*to\s+(full\s+)?auto\b",
    r"\bauto\s+sear\b",
    r"\bmake\s+a\s+silencer\b",
]

_DRUGS = [
    r"\bhow\s+to\s+(use|take|inject|smoke|shoot\s+up)\s+(meth|cocaine|heroin|fentanyl|crack|crystal|lsd|mdma|ecstasy|ketamine)\b",
    r"\bhow\s+to\s+(make|synthes[iy]ze|cook|produce)\s+(meth|cocaine|heroin|fentanyl|lsd|mdma|crystal\s+meth)\b",
    r"\bwhere\s+(can\s+i|do\s+i)\s+buy\s+(meth|cocaine|heroin|fentanyl|lsd|mdma|ecstasy|ketamine)\b",
]

_CATEGORIES: list[tuple[str, list[str]]] = [
    ("sexual", _SEXUAL),
    ("self_harm", _SELF_HARM),
    ("weapons", _WEAPONS),
    ("drugs", _DRUGS),
    ("wrongdoing", _WRONGDOING),
    ("violence", _VIOLENCE),
]

_COMPILED: list[tuple[str, list[re.Pattern]]] = [
    (name, [re.compile(p, re.IGNORECASE | re.DOTALL) for p in pats])
    for name, pats in _CATEGORIES
]


def _first_match(text: str) -> SafetyDecision:
    if not text:
        return SafetyDecision(ok=True)
    snippet = text[:4000]  # cap the scan cost
    for name, compiled in _COMPILED:
        for pat in compiled:
            if pat.search(snippet):
                return SafetyDecision(ok=False, category=name, matched_pattern=pat.pattern)
    return SafetyDecision(ok=True)


def screen_input(text: str) -> SafetyDecision:
    """Screen an incoming user message."""
    return _first_match(text)


def screen_output(text: str) -> SafetyDecision:
    """Screen a completed assistant output."""
    return _first_match(text)


def safe_child_redirect(category: Optional[str] = None) -> str:
    """Child-safe fallback reply. Never echoes the blocked content."""
    return (
        "I can't help with that here. Let's pick a different topic — "
        "try a math problem, a science question, or something you're "
        "studying, and I'll help you work through it. 🙂"
    )


def log_safety_event(
    *,
    path: str,               # "input" | "output"
    category: Optional[str],
    user_id: str,
    safety_profile: str,
    turn_id: str = "",
    matched_pattern: Optional[str] = None,
) -> None:
    """Structured audit log. Raw user text is deliberately NOT included."""
    logger.warning(
        "wisetutor_safety_event path=%s category=%s user_id=%s profile=%s turn_id=%s pattern=%s",
        path, category or "?", user_id, safety_profile, turn_id, matched_pattern or "",
    )
