"""
Phase 5 Slice 2 — local Whisper fallback endpoint.

This endpoint exists only for the fallback path: when a browser cannot
use the Web Speech API, the frontend captures a short audio clip and
POSTs it here for local transcription. The browser-native path does not
use this endpoint.

Design:
- lazy-loaded faster-whisper engine (tiny model by default, CPU device)
- short-audio guardrails (configurable hard cap on bytes)
- narrow test seam: WISETUTOR_VOICE_STT_TEST_MODE=1 skips any model load
  and echoes back the X-WT-Test-Transcript header (or a fixed stub),
  letting Playwright and pytest prove the wiring without shipping a
  model binary in CI
"""

from __future__ import annotations

import os
import tempfile
from typing import Optional

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from pydantic import BaseModel

from deeptutor.logging import get_logger

router = APIRouter()
logger = get_logger("api.voice")

# Hard byte cap for a single fallback clip. Keeps the endpoint defensive
# without forcing the frontend to ship a duration probe. ~5 MB is enough
# for ~30 seconds of opus-encoded speech.
_MAX_BYTES = int(os.environ.get("WISETUTOR_VOICE_STT_MAX_BYTES", str(5 * 1024 * 1024)))
_WHISPER_MODEL = os.environ.get("WISETUTOR_WHISPER_MODEL", "tiny")
_WHISPER_DEVICE = os.environ.get("WISETUTOR_WHISPER_DEVICE", "cpu")
_WHISPER_COMPUTE_TYPE = os.environ.get("WISETUTOR_WHISPER_COMPUTE_TYPE", "int8")

_engine = None  # lazy faster-whisper WhisperModel instance


def _test_mode() -> bool:
    return os.environ.get("WISETUTOR_VOICE_STT_TEST_MODE") == "1"


def _get_engine():
    global _engine
    if _engine is not None:
        return _engine
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as exc:  # pragma: no cover — exercised only on real installs
        raise HTTPException(
            status_code=503,
            detail=(
                "local_whisper_unavailable: faster-whisper is not installed on this "
                "backend. Install it or run with WISETUTOR_VOICE_STT_TEST_MODE=1."
            ),
        ) from exc
    logger.info(
        f"Loading faster-whisper model={_WHISPER_MODEL} "
        f"device={_WHISPER_DEVICE} compute_type={_WHISPER_COMPUTE_TYPE}"
    )
    _engine = WhisperModel(
        _WHISPER_MODEL, device=_WHISPER_DEVICE, compute_type=_WHISPER_COMPUTE_TYPE
    )
    return _engine


class TranscribeResponse(BaseModel):
    text: str
    engine: str  # "test-stub" | "faster-whisper"
    model: Optional[str] = None


@router.get("/status")
async def voice_status():
    """Cheap status probe the frontend can use to decide capability."""
    return {
        "test_mode": _test_mode(),
        "model": _WHISPER_MODEL,
        "device": _WHISPER_DEVICE,
        "max_bytes": _MAX_BYTES,
    }


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    audio: UploadFile = File(...),
    x_wt_test_transcript: Optional[str] = Header(default=None),
):
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty_audio")
    if len(data) > _MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"audio_too_large: {len(data)} > {_MAX_BYTES}",
        )

    if _test_mode():
        # Deterministic seam — used by Playwright and pytest. The header
        # lets each test assert its own text; absent header falls back to
        # a fixed stub so accidental prod hits stay obviously synthetic.
        stub = (x_wt_test_transcript or "test stub transcript").strip()
        logger.info(f"voice.transcribe TEST_MODE bytes={len(data)} stub={stub!r}")
        return TranscribeResponse(text=stub, engine="test-stub", model=None)

    engine = _get_engine()
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
        tmp_path = f.name
    try:
        segments, _info = engine.transcribe(tmp_path, beam_size=1, vad_filter=True)
        text = " ".join((s.text or "").strip() for s in segments).strip()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return TranscribeResponse(text=text, engine="faster-whisper", model=_WHISPER_MODEL)
