"use client";

import { useEffect, useRef, useState } from "react";
import { createTtsAdapter, type TTSAdapter, type TTSEngine } from "@/lib/tts";

/**
 * Phase 5 Slice 3A — single-active-utterance hook for assistant TTS.
 * Phase 5 Slice 3B — adds engine + ttsState to the return type.
 *
 * Returns:
 *  - supported: whether any TTS engine is available (null until mount)
 *  - engine: which adapter is active ("browser-native" | "piper-fallback" | "unsupported")
 *  - speakingKey: identifier of the message currently being spoken, or null
 *  - ttsState: "idle" | "speaking" | "error-generic"
 *  - speak(key, text): start speaking a message. Always cancels any current
 *    utterance first.
 *  - stop(): cancel the active utterance, if any.
 *
 * Cleanup: cancels on unmount and on the `wt:user-switched` event, so
 * stale speech cannot leak across user switches or component teardown.
 */
export function useAssistantTts() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [engine, setEngine] = useState<TTSEngine>("unsupported");
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [ttsState, setTtsState] = useState<"idle" | "speaking" | "error-generic">("idle");
  const adapterRef = useRef<TTSAdapter | null>(null);
  const speakingKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const adapter = createTtsAdapter({
      onStart: () => {
        // The start event confirms playback began for whatever key was
        // most recently requested — stored in speakingKeyRef.
        setSpeakingKey(speakingKeyRef.current);
        setTtsState("speaking");
      },
      onEnd: () => {
        speakingKeyRef.current = null;
        setSpeakingKey(null);
        setTtsState("idle");
      },
      onError: () => {
        speakingKeyRef.current = null;
        setSpeakingKey(null);
        setTtsState("error-generic");
      },
    });
    adapterRef.current = adapter;
    setSupported(adapter.supported);
    setEngine(adapter.engine);

    const onUserSwitched = () => {
      adapter.cancel();
      speakingKeyRef.current = null;
      setSpeakingKey(null);
      setTtsState("idle");
    };
    window.addEventListener("wt:user-switched", onUserSwitched);
    return () => {
      window.removeEventListener("wt:user-switched", onUserSwitched);
      adapter.cancel();
      adapterRef.current = null;
    };
  }, []);

  const speak = (key: string, text: string) => {
    const a = adapterRef.current;
    if (!a || !a.supported) return;
    // Toggle semantics: clicking the active message's listen button
    // stops playback. Clicking a different message cancels and speaks.
    if (speakingKeyRef.current === key) {
      a.cancel();
      setTtsState("idle");
      return;
    }
    speakingKeyRef.current = key;
    a.speak(text);
  };

  const stop = () => {
    const a = adapterRef.current;
    if (!a) return;
    a.cancel();
    setTtsState("idle");
  };

  return { supported, engine, speakingKey, ttsState, speak, stop };
}
