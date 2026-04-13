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

import io
import os
import shutil
import subprocess
import tempfile
import wave
from typing import Optional

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
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


# ---------------------------------------------------------------------------
# Phase 5 Slice 3B — Piper local TTS fallback
# ---------------------------------------------------------------------------


def _tts_test_mode() -> bool:
    return os.environ.get("WISETUTOR_VOICE_TTS_TEST_MODE") == "1"


def _tts_max_chars() -> int:
    return int(os.environ.get("WISETUTOR_VOICE_TTS_MAX_CHARS", "5000"))


def _piper_bin() -> str:
    return os.environ.get("WISETUTOR_PIPER_BIN", "piper")


def _piper_voice_path() -> Optional[str]:
    return os.environ.get("WISETUTOR_PIPER_VOICE_PATH") or None


def _make_silent_wav(sample_rate: int = 22050, samples: int = 1000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # PCM16
        w.setframerate(sample_rate)
        w.writeframes(b"\x00\x00" * samples)
    return buf.getvalue()


class SynthesizeRequest(BaseModel):
    text: str
    voice: Optional[str] = None  # accepted but ignored in this slice


@router.get("/tts-status")
async def tts_status():
    voice_path = _piper_voice_path()
    return {
        "test_mode": _tts_test_mode(),
        "bin": _piper_bin(),
        "voice_path_set": bool(voice_path) and os.path.isfile(voice_path or ""),
        "max_chars": _tts_max_chars(),
    }


@router.post("/synthesize")
async def synthesize(req: SynthesizeRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty_text")
    max_chars = _tts_max_chars()
    if len(text) > max_chars:
        raise HTTPException(
            status_code=400, detail=f"text_too_long: {len(text)} > {max_chars}"
        )

    if _tts_test_mode():
        wav = _make_silent_wav()
        logger.info(f"voice.synthesize TEST_MODE chars={len(text)} bytes={len(wav)}")
        return Response(
            content=wav,
            media_type="audio/wav",
            headers={"X-WT-TTS-Engine": "test-stub"},
        )

    # Real mode: shell out to Piper.
    piper_bin = _piper_bin()
    if os.path.sep in piper_bin:
        resolved_bin = piper_bin if os.path.isfile(piper_bin) else None
    else:
        resolved_bin = shutil.which(piper_bin)
    if not resolved_bin:
        raise HTTPException(
            status_code=503,
            detail=f"piper_unavailable: binary not found (WISETUTOR_PIPER_BIN={piper_bin})",
        )
    voice_path = _piper_voice_path()
    if not voice_path or not os.path.isfile(voice_path):
        raise HTTPException(
            status_code=503,
            detail=f"piper_unavailable: voice model not found (WISETUTOR_PIPER_VOICE_PATH={voice_path!r})",
        )

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name
    try:
        logger.info(
            f"voice.synthesize piper chars={len(text)} bin={resolved_bin} model={voice_path}"
        )
        try:
            proc = subprocess.run(
                [resolved_bin, "--model", voice_path, "--output_file", tmp_path],
                input=text.encode("utf-8"),
                capture_output=True,
                timeout=30,
            )
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=503, detail="piper_unavailable: synthesis timeout"
            ) from exc
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=503, detail=f"piper_unavailable: exec failed ({exc})"
            ) from exc
        if proc.returncode != 0:
            stderr = proc.stderr.decode("utf-8", errors="replace")[:500]
            raise HTTPException(
                status_code=503,
                detail=f"piper_unavailable: exit={proc.returncode} stderr={stderr!r}",
            )
        with open(tmp_path, "rb") as rf:
            wav = rf.read()
        if not wav or not wav.startswith(b"RIFF"):
            raise HTTPException(
                status_code=503, detail="piper_unavailable: produced non-WAV output"
            )
        return Response(
            content=wav,
            media_type="audio/wav",
            headers={"X-WT-TTS-Engine": "piper"},
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
