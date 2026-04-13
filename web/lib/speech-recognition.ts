"use client";

/**
 * Speech-to-text adapter for the chat composer (Phase 5 slice 1 — STT foundation).
 *
 * Two implementations behind one tiny interface:
 *  - browser: real Web Speech API (window.SpeechRecognition | webkitSpeechRecognition).
 *  - test:    deterministic adapter driven by Playwright through
 *             window.__wt_test_speech. Only activated when that key exists,
 *             so production users always get the real path.
 *
 * Out of scope for this slice: server-side STT, wake word, streaming to chat.
 */

export type SpeechAdapterState =
  | "idle"
  | "listening"
  | "error-permission"
  | "error-unsupported"
  | "error-generic";

export interface SpeechAdapter {
  /** True when a real browser or test adapter is usable. */
  readonly supported: boolean;
  start(): void;
  stop(): void;
}

export interface SpeechAdapterEvents {
  onStart: () => void;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onEnd: () => void;
  onError: (kind: Exclude<SpeechAdapterState, "idle" | "listening">) => void;
}

type WtTestSpeech = {
  supported: boolean;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    __wt_test_speech?: WtTestSpeech;
    __wt_test_speech_driver?: {
      emitStart: () => void;
      emitInterim: (text: string) => void;
      emitFinal: (text: string) => void;
      emitEnd: () => void;
      emitPermissionDenied: () => void;
      emitGenericError: () => void;
    };
  }
}

interface SpeechRecognitionResultItem {
  transcript: string;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionResultItem;
  length: number;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResult };
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: ((e: Event) => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((e: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function createSpeechAdapter(
  events: SpeechAdapterEvents,
  opts: { lang?: string } = {},
): SpeechAdapter {
  if (typeof window === "undefined") {
    return {
      supported: false,
      start() {
        events.onError("error-unsupported");
      },
      stop() {},
    };
  }

  // Deterministic test seam — only active when explicitly injected.
  if (window.__wt_test_speech) {
    return createTestAdapter(events);
  }

  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    return {
      supported: false,
      start() {
        events.onError("error-unsupported");
      },
      stop() {},
    };
  }

  let rec: SpeechRecognitionLike | null = null;
  let stopping = false;

  return {
    supported: true,
    start() {
      if (rec) return;
      stopping = false;
      try {
        rec = new Ctor();
      } catch {
        events.onError("error-generic");
        return;
      }
      rec.lang = opts.lang || (typeof navigator !== "undefined" ? navigator.language : "en-US");
      rec.continuous = false;
      rec.interimResults = true;
      rec.onstart = () => events.onStart();
      rec.onresult = (e: SpeechRecognitionEventLike) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          const txt = r[0]?.transcript ?? "";
          if (!txt) continue;
          if (r.isFinal) events.onFinal(txt);
          else events.onInterim(txt);
        }
      };
      rec.onerror = (e: SpeechRecognitionErrorEventLike) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          events.onError("error-permission");
        } else if (e.error === "aborted" && stopping) {
          // user-initiated stop — not an error
        } else {
          events.onError("error-generic");
        }
      };
      rec.onend = () => {
        rec = null;
        events.onEnd();
      };
      try {
        rec.start();
      } catch {
        rec = null;
        events.onError("error-generic");
      }
    },
    stop() {
      if (!rec) return;
      stopping = true;
      try {
        rec.stop();
      } catch {
        try {
          rec.abort();
        } catch {}
        rec = null;
        events.onEnd();
      }
    },
  };
}

function createTestAdapter(events: SpeechAdapterEvents): SpeechAdapter {
  const seam = window.__wt_test_speech!;
  let running = false;
  return {
    supported: seam.supported,
    start() {
      if (!seam.supported) {
        events.onError("error-unsupported");
        return;
      }
      if (running) return;
      running = true;
      window.__wt_test_speech_driver = {
        emitStart: () => events.onStart(),
        emitInterim: (t) => events.onInterim(t),
        emitFinal: (t) => events.onFinal(t),
        emitEnd: () => {
          running = false;
          events.onEnd();
        },
        emitPermissionDenied: () => {
          running = false;
          events.onError("error-permission");
        },
        emitGenericError: () => {
          running = false;
          events.onError("error-generic");
        },
      };
      // Fire start synchronously so the UI flips to listening.
      events.onStart();
    },
    stop() {
      if (!running) return;
      running = false;
      events.onEnd();
    },
  };
}
