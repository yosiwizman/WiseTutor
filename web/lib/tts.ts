"use client";

/**
 * Phase 5 Slice 3A — browser-native TTS foundation.
 * Phase 5 Slice 3B — Piper local TTS fallback adapter.
 *
 * Thin adapter over `window.speechSynthesis`. Out of scope for this
 * slice: profile-scoped voice selection, autoplay, queueing, pause/resume,
 * and reading user messages. The adapter speaks at most one utterance at a
 * time; a new `speak()` call always cancels any current utterance first.
 *
 * Composition order (evaluated at mount time):
 *   1. __wt_test_tts present → native test seam (unchanged)
 *   2. real speechSynthesis exists → browser-native adapter
 *   3. __wt_test_tts_piper present → Piper test seam adapter
 *   4. isPiperFallbackSupported() real → Piper real adapter
 *   5. otherwise → unsupported stub
 *
 * For rule 1/2: if __wt_test_tts.supported === false it is treated the
 * same as "native unsupported" and composition falls through to rules 3–5.
 */

export type TTSAdapterState = "idle" | "speaking" | "error-unsupported";

/** Discriminates which engine the live adapter is using. */
export type TTSEngine = "browser-native" | "piper-fallback" | "unsupported";

export interface TTSAdapterEvents {
  onStart: () => void;
  onEnd: () => void;
  onError: (kind: "error-unsupported" | "error-generic") => void;
}

export interface TTSAdapter {
  readonly supported: boolean;
  /** Which engine backs this adapter instance. */
  readonly engine: TTSEngine;
  speak(text: string): void;
  cancel(): void;
}

type WtTestTts = { supported: boolean };
type WtTestTtsPiper = { supported: boolean };

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
    __wt_test_tts_piper: WtTestTtsPiper;
    __wt_test_tts_piper_driver: {
      emitStart: () => void;
      emitEnd: () => void;
      emitBackendError: () => void;
      /** Text most recently passed to `speak()`. */
      lastText: string | null;
    } | undefined;
    /** Injected by Next.js public env or tests to override the API base URL. */
    __wt_api_base?: string;
  }
}

/** Returns the API base URL, preferring NEXT_PUBLIC_API_BASE env var. */
function getApiBase(): string {
  if (typeof window !== "undefined" && window.__wt_api_base) {
    return window.__wt_api_base;
  }
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }
  return "";
}

/**
 * True when the Piper real adapter can operate: needs fetch + Audio.
 * Also overridable by the test seam for deterministic control.
 */
export function isPiperFallbackSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__wt_test_tts_piper?.supported === true) return true;
  return (
    typeof window.Audio !== "undefined" && typeof window.fetch !== "undefined"
  );
}

export function createTtsAdapter(events: TTSAdapterEvents): TTSAdapter {
  if (typeof window === "undefined") {
    return {
      supported: false,
      engine: "unsupported",
      speak() {
        events.onError("error-unsupported");
      },
      cancel() {},
    };
  }

  // Rule 1: native test seam — only when __wt_test_tts is present AND supported.
  // If supported === false, fall through (treated as "native unsupported").
  if (window.__wt_test_tts && window.__wt_test_tts.supported !== false) {
    return createNativeTestAdapter(events);
  }

  // Rule 2: real browser speechSynthesis.
  const synth =
    !window.__wt_test_tts // skip if test seam explicitly set (supported=false)
      ? window.speechSynthesis
      : undefined;
  if (synth && typeof window.SpeechSynthesisUtterance !== "undefined") {
    return createNativeAdapter(events, synth);
  }

  // Rule 3: Piper test seam — only when present AND supported !== false.
  // `supported: false` is the "both seams off" case and must fall through
  // to the unsupported stub so the Listen button is hidden.
  if (window.__wt_test_tts_piper && window.__wt_test_tts_piper.supported !== false) {
    return createPiperTestAdapter(events);
  }

  // Rule 4: Piper real adapter — only when NOT in deterministic test mode
  // (i.e., __wt_test_tts was not injected). When __wt_test_tts is present
  // with supported=false, we are in a controlled test environment; the
  // real fetch+Audio path must not activate so the "unsupported" Playwright
  // case continues to see a hidden button.
  if (!window.__wt_test_tts && isPiperFallbackSupported()) {
    return createPiperRealAdapter(events);
  }

  // Rule 5: unsupported.
  return {
    supported: false,
    engine: "unsupported",
    speak() {
      events.onError("error-unsupported");
    },
    cancel() {},
  };
}

// ---------------------------------------------------------------------------
// Browser-native adapter
// ---------------------------------------------------------------------------

function createNativeAdapter(
  events: TTSAdapterEvents,
  synth: SpeechSynthesis,
): TTSAdapter {
  let current: SpeechSynthesisUtterance | null = null;

  return {
    supported: true,
    engine: "browser-native",
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

// ---------------------------------------------------------------------------
// Native test seam adapter (existing, unchanged semantics)
// ---------------------------------------------------------------------------

function createNativeTestAdapter(events: TTSAdapterEvents): TTSAdapter {
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
    engine: "browser-native",
    speak(text: string) {
      if (!seam.supported) {
        events.onError("error-unsupported");
        return;
      }
      if (!text || !text.trim()) return;
      // Supersede semantics: a new `speak()` while running replaces the
      // current utterance WITHOUT firing the previous utterance's onEnd.
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

// ---------------------------------------------------------------------------
// Piper real adapter
// ---------------------------------------------------------------------------

function createPiperRealAdapter(events: TTSAdapterEvents): TTSAdapter {
  let currentAudio: HTMLAudioElement | null = null;
  let currentUrl: string | null = null;

  function revokeUrl() {
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    }
  }

  return {
    supported: true,
    engine: "piper-fallback",
    speak(text: string) {
      if (!text || !text.trim()) return;
      // Cancel any existing playback first (single-active-utterance).
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
        currentAudio = null;
        revokeUrl();
        // Do NOT fire onEnd here — supersede semantics, same as native adapter.
      }

      const apiBase = getApiBase();
      fetch(`${apiBase}/api/v1/voice/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((res) => {
          if (!res.ok) {
            events.onError("error-generic");
            return;
          }
          return res.blob().then((blob) => {
            const url = URL.createObjectURL(blob);
            currentUrl = url;
            const audio = new Audio(url);
            currentAudio = audio;
            audio.onplay = () => {
              events.onStart();
            };
            audio.onended = () => {
              revokeUrl();
              currentAudio = null;
              events.onEnd();
            };
            audio.onerror = () => {
              revokeUrl();
              currentAudio = null;
              events.onError("error-generic");
            };
            audio.play().catch(() => {
              revokeUrl();
              currentAudio = null;
              events.onError("error-generic");
            });
          });
        })
        .catch(() => {
          events.onError("error-generic");
        });
    },
    cancel() {
      if (!currentAudio) return;
      currentAudio.pause();
      currentAudio.src = "";
      currentAudio = null;
      revokeUrl();
      events.onEnd();
    },
  };
}

// ---------------------------------------------------------------------------
// Piper test seam adapter (for Agent C's Playwright tests)
// ---------------------------------------------------------------------------

function createPiperTestAdapter(events: TTSAdapterEvents): TTSAdapter {
  const seam = window.__wt_test_tts_piper!;
  let lastText: string | null = null;

  const driver = {
    emitStart: () => {
      events.onStart();
    },
    emitEnd: () => {
      events.onEnd();
    },
    emitBackendError: () => {
      events.onError("error-generic");
    },
    get lastText(): string | null {
      return lastText;
    },
  };
  window.__wt_test_tts_piper_driver = driver;

  return {
    supported: seam.supported,
    engine: "piper-fallback",
    speak(text: string) {
      if (!seam.supported) {
        events.onError("error-unsupported");
        return;
      }
      if (!text || !text.trim()) return;
      // Seam: record lastText, emit nothing — driver controls all events.
      lastText = text;
    },
    cancel() {
      events.onEnd();
    },
  };
}
