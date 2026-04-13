"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import {
  createSpeechAdapter,
  type SpeechAdapter,
  type SpeechAdapterState,
} from "@/lib/speech-recognition";
import {
  createWhisperFallbackAdapter,
  isWhisperFallbackSupported,
} from "@/lib/whisper-fallback";

type MicEngine = "browser-native" | "whisper-fallback" | "unsupported";

interface Props {
  input: string;
  onInputChange: (value: string, cursorPos: number) => void;
  disabled?: boolean;
}

/**
 * MicButton — Phase 5 slice 1 STT foundation.
 *
 * Clicking starts listening via the browser Web Speech API (or the test
 * adapter when Playwright injected `window.__wt_test_speech`). Final
 * transcripts are APPENDED to the composer input with a single space
 * separator. Interim text is shown as a small status hint next to the
 * button but never written to the composer. Unsupported-browser and
 * permission-denied states surface a non-broken inline message.
 *
 * Intentionally not in this slice: auto-send, wake word, server STT,
 * transcript history, waveform visualizer.
 */
export function MicButton({ input, onInputChange, disabled }: Props) {
  const [state, setState] = useState<SpeechAdapterState>("idle");
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [engine, setEngine] = useState<MicEngine>("unsupported");
  const [failedOver, setFailedOver] = useState(false);
  const inputRef = useRef(input);
  const adapterRef = useRef<SpeechAdapter | null>(null);
  const engineRef = useRef<MicEngine>("unsupported");
  const failoverUsedRef = useRef(false);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    // Shared event handlers. `onError` implements the narrow runtime
    // failover from browser-native → Whisper fallback for recoverable
    // native errors. Permission-denied and unsupported stay terminal
    // (a surprise fallback after "permission denied" would mislead the
    // user into thinking the site just got their consent).
    const events = {
      onStart: () => {
        setState("listening");
        setInterim("");
      },
      onInterim: (t: string) => setInterim(t),
      onFinal: (t: string) => {
        const cur = inputRef.current;
        const trimmed = t.trim();
        if (!trimmed) return;
        const next = cur && !cur.endsWith(" ") ? `${cur} ${trimmed}` : `${cur}${trimmed}`;
        onInputChange(next, next.length);
        inputRef.current = next;
      },
      onEnd: () => {
        setState("idle");
        setInterim("");
      },
      onError: (kind: Exclude<SpeechAdapterState, "idle" | "listening">) => {
        // Recoverable native runtime failure → rebind to Whisper
        // fallback once per mount. Next mic click uses the fallback
        // adapter. We do NOT auto-restart recording: the user decides
        // when to try again.
        if (
          kind === "error-generic" &&
          engineRef.current === "browser-native" &&
          !failoverUsedRef.current &&
          isWhisperFallbackSupported()
        ) {
          failoverUsedRef.current = true;
          try {
            adapterRef.current?.stop();
          } catch {
            /* ignore */
          }
          const fallback = createWhisperFallbackAdapter(events);
          adapterRef.current = fallback;
          engineRef.current = fallback.supported ? "whisper-fallback" : "unsupported";
          setEngine(engineRef.current);
          setSupported(fallback.supported);
          setFailedOver(true);
          setState("idle");
          setInterim("");
          return;
        }
        setState(kind);
        setInterim("");
      },
    };

    // Primary: browser-native Web Speech API (or its deterministic test
    // seam). If that path is unsupported, fall through to the Whisper
    // local fallback adapter (or its deterministic test seam) so users
    // on Firefox / unsupported environments still get voice input.
    let adapter = createSpeechAdapter(events);
    let selectedEngine: MicEngine = adapter.supported ? "browser-native" : "unsupported";
    if (!adapter.supported && isWhisperFallbackSupported()) {
      adapter = createWhisperFallbackAdapter(events);
      selectedEngine = adapter.supported ? "whisper-fallback" : "unsupported";
    }
    adapterRef.current = adapter;
    engineRef.current = selectedEngine;
    failoverUsedRef.current = false;
    setSupported(adapter.supported);
    setEngine(selectedEngine);
    setFailedOver(false);

    const onUserSwitched = () => {
      adapterRef.current?.stop();
      setState("idle");
      setInterim("");
    };
    window.addEventListener("wt:user-switched", onUserSwitched);
    return () => {
      window.removeEventListener("wt:user-switched", onUserSwitched);
      adapterRef.current?.stop();
    };
  }, [onInputChange]);

  const listening = state === "listening";
  const isUnsupported = supported === false || state === "error-unsupported";

  const handleClick = () => {
    if (isUnsupported || disabled) return;
    const a = adapterRef.current;
    if (!a) return;
    if (listening) a.stop();
    else a.start();
  };

  const label = listening
    ? "Stop listening"
    : isUnsupported
      ? "Speech input not supported in this browser"
      : state === "error-permission"
        ? "Microphone permission denied"
        : "Start speech input";

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        data-testid="chat-composer-mic"
        data-state={state}
        data-supported={supported === null ? "pending" : String(supported)}
        data-engine={engine}
        data-failed-over={failedOver ? "true" : "false"}
        onClick={handleClick}
        disabled={isUnsupported || !!disabled}
        aria-label={label}
        title={label}
        className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
          listening
            ? "border-[var(--primary)] bg-[var(--primary)] text-white animate-pulse"
            : isUnsupported
              ? "border-[var(--border)] bg-transparent text-[var(--muted-foreground)] opacity-50 cursor-not-allowed"
              : "border-[var(--border)] bg-transparent text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        }`}
      >
        {listening ? <Mic size={14} strokeWidth={2.2} /> : isUnsupported ? <MicOff size={14} strokeWidth={2} /> : <Mic size={14} strokeWidth={2} />}
      </button>
      {(interim || state === "error-permission" || isUnsupported) && (
        <span
          data-testid="chat-composer-mic-status"
          data-status-kind={
            state === "error-permission"
              ? "permission"
              : isUnsupported
                ? "unsupported"
                : "interim"
          }
          className={`text-[11px] italic max-w-[160px] truncate ${
            state === "error-permission" || isUnsupported
              ? "text-[var(--destructive,#c2410c)]"
              : "text-[var(--muted-foreground)]"
          }`}
        >
          {state === "error-permission"
            ? "Mic permission denied"
            : isUnsupported
              ? "Voice input unavailable in this browser"
              : interim}
        </span>
      )}
    </div>
  );
}
