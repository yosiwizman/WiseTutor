"use client";

/**
 * Phase 5 Slice 4A — push-to-talk voice turn harness.
 *
 * Deterministic test page wiring the useVoiceTurn hook to a controllable
 * submit function. Playwright controls the submit mode via:
 *   window.__wt_test_voice_turn_submit = { mode: "ok"|"fail"|"empty", reply: string }
 *
 * DOM contract (exact testids) — do not rename without updating Agent C's tests:
 *   [data-testid="voice-turn-harness-ready"]  container, always present
 *   [data-testid="vt-state"]                  current state string
 *   [data-testid="vt-error-reason"]           errorReason or ""
 *   [data-testid="vt-last-transcript"]        lastTranscript or ""
 *   [data-testid="vt-last-reply"]             lastReply or ""
 *   [data-testid="vt-start"]                  button → hook.start()
 *   [data-testid="vt-cancel"]                 button → hook.cancel()
 *   [data-testid="vt-reset"]                  button → hook.reset()
 */

import { useVoiceTurn } from "@/hooks/useVoiceTurn";

// The Playwright-injected submit seam lives on `window` as
// `__wt_test_voice_turn_submit`. We intentionally do NOT use a
// `declare global` here because other canonical seam declarations in
// web/lib/tts.ts / speech-recognition.ts use slightly different modifier
// shapes, and duplicate declarations trip TS2687. Read via an `any` cast
// at call time — the seam is test-only and unused in production.
type VoiceTurnSubmitSeam = {
  mode: "ok" | "fail" | "empty";
  reply: string;
};

const DEFAULT_REPLY = "default assistant reply";

function makeSubmit() {
  return (text: string): Promise<{ reply: string }> => {
    // Read seam at call time so Playwright can set it before clicking start.
    const seam: VoiceTurnSubmitSeam | undefined =
      typeof window !== "undefined"
        ? (window as unknown as { __wt_test_voice_turn_submit?: VoiceTurnSubmitSeam })
            .__wt_test_voice_turn_submit
        : undefined;
    const mode = seam?.mode ?? "ok";
    const reply = seam?.reply ?? DEFAULT_REPLY;

    // Suppress unused-variable warning — text is part of the required signature.
    void text;

    if (mode === "fail") {
      return Promise.reject(new Error("submit-failed (injected)"));
    }
    if (mode === "empty") {
      return Promise.resolve({ reply: "   " });
    }
    // mode === "ok"
    return Promise.resolve({ reply });
  };
}

export default function VoiceTurnHarnessPage() {
  const vt = useVoiceTurn({ submit: makeSubmit() });

  return (
    <div className="p-6 font-mono text-sm" data-testid="voice-turn-harness-ready">
      <h1 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Voice Turn Harness
      </h1>

      {/* State readouts */}
      <div className="mb-4 space-y-1">
        <p>
          state:{" "}
          <span data-testid="vt-state" className="font-bold">
            {vt.state}
          </span>
        </p>
        <p>
          error:{" "}
          <span data-testid="vt-error-reason">
            {vt.errorReason ?? ""}
          </span>
        </p>
        <p>
          transcript:{" "}
          <span data-testid="vt-last-transcript">{vt.lastTranscript}</span>
        </p>
        <p>
          reply:{" "}
          <span data-testid="vt-last-reply">{vt.lastReply}</span>
        </p>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="vt-start"
          onClick={vt.start}
          className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100"
        >
          Start
        </button>
        <button
          type="button"
          data-testid="vt-cancel"
          onClick={vt.cancel}
          className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          type="button"
          data-testid="vt-reset"
          onClick={vt.reset}
          className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
