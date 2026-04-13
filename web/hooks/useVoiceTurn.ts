"use client";

/**
 * Phase 5 Slice 4A — push-to-talk voice conversation hook.
 *
 * Manages the STT → submit → TTS state machine for a single voice turn.
 * No wake word, no continuous listening, no queueing.
 *
 * State machine:
 *   idle → (start()) → listening
 *   listening → (STT onFinal) → submitting
 *   listening → (cancel()) → idle
 *   listening → (STT onError) → error(stt-failed)
 *   submitting → (resolve non-empty) → speaking  [tts.speak()]
 *   submitting → (resolve empty) → error(empty-reply)
 *   submitting → (reject) → error(submit-failed)
 *   speaking → (TTS onEnd) → idle
 *   speaking → (TTS onError) → idle  [graceful]
 *   speaking → (cancel()) → idle
 *   error → (reset()) → idle
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSpeechAdapter,
  type SpeechAdapter,
} from "@/lib/speech-recognition";
import { createTtsAdapter, type TTSAdapter } from "@/lib/tts";

export type VoiceTurnState =
  | "idle"
  | "listening"
  | "submitting"
  | "awaiting_assistant"
  | "speaking"
  | "error";

export type VoiceTurnErrorReason =
  | "stt-failed"
  | "submit-failed"
  | "empty-reply"
  | "reply-timeout"
  | "reply-failed"
  | null;

export function useVoiceTurn(opts: {
  submit: (text: string) => Promise<{ reply: string }>;
}): {
  state: VoiceTurnState;
  errorReason: VoiceTurnErrorReason;
  lastTranscript: string;
  lastReply: string;
  start: () => void;
  cancel: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<VoiceTurnState>("idle");
  const [errorReason, setErrorReason] = useState<VoiceTurnErrorReason>(null);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastReply, setLastReply] = useState("");

  // Keep refs to avoid stale closures in adapter callbacks.
  const stateRef = useRef<VoiceTurnState>("idle");
  const sttRef = useRef<SpeechAdapter | null>(null);
  const ttsRef = useRef<TTSAdapter | null>(null);
  // Keep the submit function in a ref so adapters always call the latest version.
  const submitRef = useRef(opts.submit);
  useEffect(() => {
    submitRef.current = opts.submit;
  });

  const setStateSynced = useCallback(
    (next: VoiceTurnState) => {
      stateRef.current = next;
      setState(next);
    },
    [],
  );

  useEffect(() => {
    // Build STT adapter.
    const stt = createSpeechAdapter({
      onStart: () => {
        // Already transitioned to listening in start(); nothing extra needed.
      },
      onInterim: () => {
        // Interim results are intentionally ignored in push-to-talk mode.
      },
      onFinal: (text: string) => {
        if (stateRef.current !== "listening") return;
        setLastTranscript(text);
        setStateSynced("submitting");

        // Transition to awaiting_assistant immediately after calling submit.
        setStateSynced("awaiting_assistant");

        submitRef.current(text).then(
          ({ reply }) => {
            // If the user canceled while awaiting, ignore the late result.
            if (
              stateRef.current !== "submitting" &&
              stateRef.current !== "awaiting_assistant"
            ) {
              return;
            }
            const trimmed = reply?.trim() ?? "";
            if (!trimmed) {
              setErrorReason("empty-reply");
              setStateSynced("error");
              return;
            }
            setLastReply(trimmed);
            setStateSynced("speaking");
            ttsRef.current?.speak(trimmed);
          },
          (err: unknown) => {
            // Ignore late rejects after user-initiated cancel too.
            if (
              stateRef.current !== "submitting" &&
              stateRef.current !== "awaiting_assistant"
            ) {
              return;
            }
            const msg = err instanceof Error ? err.message : "";
            if (msg.startsWith("reply-timeout")) {
              setErrorReason("reply-timeout");
            } else if (msg.startsWith("reply-failed")) {
              setErrorReason("reply-failed");
            } else {
              setErrorReason("submit-failed");
            }
            setStateSynced("error");
          },
        );
      },
      onEnd: () => {
        // onEnd fires after stop() in cancel path; state is already idle.
        // If we're still in listening it means STT ended without a final
        // result (e.g., no speech detected) — stay as-is; no transition needed.
      },
      onError: () => {
        if (stateRef.current !== "listening") return;
        setErrorReason("stt-failed");
        setStateSynced("error");
      },
    });
    sttRef.current = stt;

    // Build TTS adapter.
    const tts = createTtsAdapter({
      onStart: () => {
        // Already in speaking state; nothing to do.
      },
      onEnd: () => {
        if (stateRef.current === "speaking") {
          setStateSynced("idle");
        }
      },
      onError: () => {
        // Graceful: leave lastReply visible, return to idle.
        if (stateRef.current === "speaking") {
          setStateSynced("idle");
        }
      },
    });
    ttsRef.current = tts;

    // Cleanup on unmount and user-switch.
    const cleanup = () => {
      sttRef.current?.stop();
      ttsRef.current?.cancel();
      stateRef.current = "idle";
      setState("idle");
      setErrorReason(null);
    };

    window.addEventListener("wt:user-switched", cleanup);
    return () => {
      window.removeEventListener("wt:user-switched", cleanup);
      stt.stop();
      tts.cancel();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(() => {
    // No-op if not idle.
    if (stateRef.current !== "idle") return;

    // Single-active guarantee: cancel any lingering TTS/STT first.
    ttsRef.current?.cancel();
    sttRef.current?.stop();

    setStateSynced("listening");
    sttRef.current?.start();
  }, [setStateSynced]);

  const cancel = useCallback(() => {
    const s = stateRef.current;
    if (s === "listening") {
      sttRef.current?.stop();
      setStateSynced("idle");
    } else if (s === "speaking") {
      ttsRef.current?.cancel();
      setStateSynced("idle");
    } else if (s === "submitting" || s === "awaiting_assistant") {
      // 4B: aborting the voice-turn controller while the chat turn is
      // in flight returns the orchestration to idle without canceling
      // the underlying chat turn. The in-flight submit promise will
      // still resolve in the background; the hook ignores the result
      // because stateRef is no longer in submitting/awaiting_assistant.
      setStateSynced("idle");
    }
    // No-op for other states.
  }, [setStateSynced]);

  const reset = useCallback(() => {
    sttRef.current?.stop();
    ttsRef.current?.cancel();
    setLastTranscript("");
    setLastReply("");
    setErrorReason(null);
    setStateSynced("idle");
  }, [setStateSynced]);

  return { state, errorReason, lastTranscript, lastReply, start, cancel, reset };
}
