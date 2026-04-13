"use client";

/**
 * Phase 5 Slice 3A — deterministic TTS harness.
 *
 * Test-only page that renders two fake assistant messages with Listen
 * buttons driven by the same `useAssistantTts` hook the production
 * ChatMessages uses. Lets Playwright prove start/stop/toggle, single-
 * active-utterance, cleanup, unsupported, and no-autoplay semantics
 * without needing a real LLM round-trip.
 *
 * Not linked from any nav; opens only via direct URL. Safe in prod
 * because the hook still requires a real SpeechSynthesis API, and the
 * tests inject `window.__wt_test_tts` themselves.
 */

import { Volume2, VolumeX } from "lucide-react";
import { useAssistantTts } from "@/hooks/useAssistantTts";

const HARNESS_MESSAGES = [
  { text: "alpha message body — the first fake assistant reply." },
  { text: "beta message body — the second fake assistant reply." },
];

export default function TtsHarnessPage() {
  const tts = useAssistantTts();
  return (
    <div className="p-6" data-testid="tts-harness-ready">
      <h1 className="mb-3 text-sm font-medium">TTS harness</h1>
      {HARNESS_MESSAGES.map((m, i) => (
        <div key={i} className="mb-4 w-full max-w-prose">
          <p className="mb-1 text-sm">{m.text}</p>
          {tts.engine !== "unsupported" ? (
            (() => {
              const key = `msg-${i}`;
              const active = tts.speakingKey === key;
              return (
                <button
                  type="button"
                  data-testid={`assistant-tts-${i}`}
                  data-engine={tts.engine}
                  data-tts-state={active ? "speaking" : tts.ttsState === "error-generic" ? "error-generic" : "idle"}
                  onClick={() => tts.speak(key, m.text)}
                  className="inline-flex items-center gap-1 px-0.5 py-0.5 text-[11px] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                  aria-label={active ? "Stop listening" : "Listen"}
                  title={active ? "Stop listening" : "Listen"}
                >
                  {active ? <VolumeX size={11} strokeWidth={1.5} /> : <Volume2 size={11} strokeWidth={1.5} />}
                  <span>{active ? "Stop" : "Listen"}</span>
                </button>
              );
            })()
          ) : null}
        </div>
      ))}
    </div>
  );
}
