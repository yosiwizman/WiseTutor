"use client";

/**
 * Phase 5 Slice 2 — Whisper local fallback adapter.
 *
 * Activates when the browser does not support Web Speech API but can
 * still capture audio via MediaRecorder + getUserMedia. On stop, the
 * captured blob is POSTed to the local backend `/api/v1/voice/transcribe`
 * endpoint and the returned text is surfaced as a single final
 * transcript. Interim text is NOT produced (Whisper transcribes the
 * whole clip after recording ends) — the UI simply holds the listening
 * state until the round-trip completes.
 *
 * Deterministic test seam: when `window.__wt_test_fallback` is set,
 * start/stop are driven by `window.__wt_test_fallback_driver` instead of
 * real recording. No fetch is made. This lets Playwright prove the UI
 * wiring without MediaRecorder, real audio, or the backend model.
 */

import type { SpeechAdapter, SpeechAdapterEvents } from "./speech-recognition";

type WtTestFallback = { supported: boolean };

declare global {
  interface Window {
    __wt_test_fallback?: WtTestFallback;
    __wt_test_fallback_driver?: {
      emitStart: () => void;
      emitFinal: (text: string) => void;
      emitEnd: () => void;
      emitBackendError: () => void;
      emitPermissionDenied: () => void;
    };
  }
}

function fallbackSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__wt_test_fallback) return !!window.__wt_test_fallback.supported;
  const hasMR = typeof window.MediaRecorder !== "undefined";
  const hasMD =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";
  return hasMR && hasMD;
}

export function isWhisperFallbackSupported(): boolean {
  return fallbackSupported();
}

export function createWhisperFallbackAdapter(
  events: SpeechAdapterEvents,
  opts: { apiBase?: string } = {},
): SpeechAdapter {
  if (!fallbackSupported()) {
    return {
      supported: false,
      start() {
        events.onError("error-unsupported");
      },
      stop() {},
    };
  }

  // Deterministic test path — no real recording, no real fetch.
  if (typeof window !== "undefined" && window.__wt_test_fallback) {
    let running = false;
    return {
      supported: true,
      start() {
        if (running) return;
        running = true;
        window.__wt_test_fallback_driver = {
          emitStart: () => events.onStart(),
          emitFinal: (t) => events.onFinal(t),
          emitEnd: () => {
            running = false;
            events.onEnd();
          },
          emitBackendError: () => {
            running = false;
            events.onError("error-generic");
          },
          emitPermissionDenied: () => {
            running = false;
            events.onError("error-permission");
          },
        };
        events.onStart();
      },
      stop() {
        if (!running) return;
        running = false;
        events.onEnd();
      },
    };
  }

  const apiBase =
    opts.apiBase ||
    (typeof process !== "undefined" && process.env && process.env.NEXT_PUBLIC_API_BASE) ||
    "";

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let stopping = false;

  const cleanupStream = () => {
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      stream = null;
    }
  };

  const postAudio = async (blob: Blob) => {
    try {
      const fd = new FormData();
      fd.append("audio", blob, "clip.webm");
      const res = await fetch(`${apiBase}/api/v1/voice/transcribe`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        events.onError("error-generic");
        return;
      }
      const data = (await res.json()) as { text?: string };
      const text = (data.text || "").trim();
      if (text) events.onFinal(text);
    } catch {
      events.onError("error-generic");
    } finally {
      events.onEnd();
    }
  };

  return {
    supported: true,
    async start() {
      if (recorder) return;
      stopping = false;
      chunks = [];
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        events.onError("error-permission");
        return;
      }
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        cleanupStream();
        events.onError("error-generic");
        return;
      }
      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
        recorder = null;
        cleanupStream();
        if (!blob.size) {
          events.onEnd();
          return;
        }
        void postAudio(blob);
      };
      recorder.start();
      events.onStart();
    },
    stop() {
      if (!recorder) return;
      if (stopping) return;
      stopping = true;
      try {
        recorder.stop();
      } catch {
        cleanupStream();
        recorder = null;
        events.onEnd();
      }
    },
  };
}
