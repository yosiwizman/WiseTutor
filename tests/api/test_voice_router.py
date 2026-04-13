"""Unit tests for the Phase 5 Slice 2 Whisper fallback endpoint.

These tests run the endpoint in its deterministic test-mode seam; they
do NOT exercise the real faster-whisper engine. That keeps the suite
hermetic — no model download, no audio, no CPU spike in CI.
"""

from __future__ import annotations

import importlib
import os
import sys

import pytest

FastAPI = pytest.importorskip("fastapi").FastAPI
TestClient = pytest.importorskip("fastapi.testclient").TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("WISETUTOR_VOICE_STT_TEST_MODE", "1")
    # Force re-import so the module reads the env var at import time (the
    # router itself reads it at call time, but re-importing is cheap and
    # keeps this fixture robust against future module-level state).
    sys.modules.pop("deeptutor.api.routers.voice", None)
    module = importlib.import_module("deeptutor.api.routers.voice")
    app = FastAPI()
    app.include_router(module.router, prefix="/api/v1/voice")
    with TestClient(app) as c:
        yield c


def test_status_reports_test_mode(client):
    r = client.get("/api/v1/voice/status")
    assert r.status_code == 200
    body = r.json()
    assert body["test_mode"] is True
    assert "model" in body
    assert "max_bytes" in body


def test_transcribe_returns_stub_with_header(client):
    r = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("clip.webm", b"fake-bytes", "audio/webm")},
        headers={"X-WT-Test-Transcript": "hello from pytest"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body == {"text": "hello from pytest", "engine": "test-stub", "model": None}


def test_transcribe_returns_default_stub_without_header(client):
    r = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("clip.webm", b"fake-bytes", "audio/webm")},
    )
    assert r.status_code == 200
    assert r.json()["engine"] == "test-stub"
    assert r.json()["text"]


def test_transcribe_rejects_empty_audio(client):
    r = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("clip.webm", b"", "audio/webm")},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "empty_audio"


def test_transcribe_rejects_oversize_audio(client, monkeypatch):
    # Shrink the cap for this call so we can exercise the guardrail
    # without allocating megabytes.
    from deeptutor.api.routers import voice as voice_module

    monkeypatch.setattr(voice_module, "_MAX_BYTES", 16)
    r = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("clip.webm", b"x" * 64, "audio/webm")},
    )
    assert r.status_code == 413
    assert "audio_too_large" in r.json()["detail"]


def test_transcribe_real_mode_without_faster_whisper_returns_503(monkeypatch):
    """When test-mode is off and faster-whisper is not importable the
    endpoint must surface a clear 503 rather than crash."""
    monkeypatch.delenv("WISETUTOR_VOICE_STT_TEST_MODE", raising=False)
    sys.modules.pop("deeptutor.api.routers.voice", None)
    module = importlib.import_module("deeptutor.api.routers.voice")
    # Simulate faster-whisper import failing inside _get_engine.
    monkeypatch.setattr(module, "_engine", None)
    original = module._get_engine

    def boom():
        # Mimic the ImportError branch in the real function.
        from fastapi import HTTPException

        raise HTTPException(status_code=503, detail="local_whisper_unavailable: test")

    monkeypatch.setattr(module, "_get_engine", boom)

    app = FastAPI()
    app.include_router(module.router, prefix="/api/v1/voice")
    with TestClient(app) as c:
        r = c.post(
            "/api/v1/voice/transcribe",
            files={"audio": ("clip.webm", b"abc", "audio/webm")},
        )
    assert r.status_code == 503
    assert "local_whisper_unavailable" in r.json()["detail"]

    # Restore for any future import uses.
    monkeypatch.setattr(module, "_get_engine", original)
