"use client";

/**
 * Phase 5 Slice 3A — browser-native TTS foundation.
 *
 * Thin adapter over `window.speechSynthesis`. Out of scope for this
 * slice: Piper / Coqui / server-side TTS, profile-scoped voice
 * selection, autoplay, queueing, pause/resume, and reading user
 * messages. The adapter speaks at most one utterance at a time; a new
 * `speak()` call always cancels any current utterance first.
 *
 * Deterministic test seam: when `window.__wt_test_tts` is present, the
 * adapter ignores the real SpeechSynthesis API and is driven by
 * `window.__wt_test_tts_driver` instead. This lets Playwright prove
 * start/stop/cancel/cleanup semantics without any audio device and
 * without racing against the real speech engine.
 */

export type TTSAdapterState = "idle" | "speaking" | "error-unsupported";

export interface TTSAdapterEvents {
  onStart: () => void;
  onEnd: () => void;
  onError: (kind: "error-unsupported" | "error-generic") => void;
}

export interface TTSAdapter {
  readonly supported: boolean;
  speak(text: string): void;
  cancel(): void;
}

type WtTestTts = { supported: boolean };

declare global {
  interface Window {
    __wt_test_tts?: WtTestTts;
    __wt_test_tts_driver?: {
      emitStart: () => void;
      emitEnd: () => void;
      emitGenericError: () => void;
      /** Text most recently passed to `speak()` — lets tests assert payload. */
      readonly lastText: string | null;
    };
  }
}

export function createTtsAdapter(events: TTSAdapterEvents): TTSAdapter {
  if (typeof window === "undefined") {
    return {
      supported: false,
      speak() {
        events.onError("error-unsupported");
      },
      cancel() {},
    };
  }

  // Deterministic seam — only active when explicitly injected.
  if (window.__wt_test_tts) {
    return createTestAdapter(events);
  }

  const synth = window.speechSynthesis;
  if (!synth || typeof window.SpeechSynthesisUtterance === "undefined") {
    return {
      supported: false,
      speak() {
        events.onError("error-unsupported");
      },
      cancel() {},
    };
  }

  let current: SpeechSynthesisUtterance | null = null;

  return {
    supported: true,
    speak(text: string) {
      if (!text || !text.trim()) return;
      // Single-active-utterance: always cancel first.
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
      const u = new SpeechSynthesisUtterance(text);
      current = u;
      u.onstart = () => {
        if (current === u) events.onStart();
      };
      u.onend = () => {
        if (current === u) {
          current = null;
          events.onEnd();
        }
      };
      u.onerror = () => {
        if (current === u) {
          current = null;
          events.onError("error-generic");
        }
      };
      try {
        synth.speak(u);
      } catch {
        current = null;
        events.onError("error-generic");
      }
    },
    cancel() {
      current = null;
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
      events.onEnd();
    },
  };
}

function createTestAdapter(events: TTSAdapterEvents): TTSAdapter {
  const seam = window.__wt_test_tts!;
  let running = false;
  let lastText: string | null = null;
  const driver = {
    emitStart: () => {
      if (!running) return;
      events.onStart();
    },
    emitEnd: () => {
      if (!running) return;
      running = false;
      events.onEnd();
    },
    emitGenericError: () => {
      if (!running) return;
      running = false;
      events.onError("error-generic");
    },
    get lastText() {
      return lastText;
    },
  };
  window.__wt_test_tts_driver = driver;
  return {
    supported: seam.supported,
    speak(text: string) {
      if (!seam.supported) {
        events.onError("error-unsupported");
        return;
      }
      if (!text || !text.trim()) return;
      // Supersede semantics: a new `speak()` while running replaces the
      // current utterance WITHOUT firing the previous utterance's onEnd.
      // Firing onEnd here would let the hook clear its speakingKeyRef
      // after the new key was already set, racing the incoming onStart.
      lastText = text;
      running = true;
      events.onStart();
    },
    cancel() {
      if (!running) return;
      running = false;
      events.onEnd();
    },
  };
}
