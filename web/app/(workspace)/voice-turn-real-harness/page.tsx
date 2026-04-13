"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVoiceTurnProduction, type ChatAdapter } from "@/hooks/useVoiceTurnProduction";

type Msg = { role: "user" | "assistant"; content: string };

export default function VoiceTurnRealHarnessPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const listenersRef = useRef(new Set<() => void>());

  // Mirror live state into refs so chatAdapter.getState() reads the
  // latest values even when the subscriber closure captured an older
  // chatAdapter instance. Using state directly in getState() created a
  // stale-closure bug where setMessages → re-render → new chatAdapter,
  // but the in-flight submit was still calling the old getState.
  const messagesRef = useRef<Msg[]>([]);
  const isStreamingRef = useRef(false);
  useEffect(() => {
    messagesRef.current = messages;
    isStreamingRef.current = isStreaming;
    for (const cb of listenersRef.current) cb();
  }, [messages, isStreaming]);

  const chatAdapter = useMemo<ChatAdapter>(() => ({
    sendMessage: (text: string) => {
      setMessages((m) => [...m, { role: "user", content: text }]);
      setIsStreaming(true);
    },
    subscribe: (cb) => {
      listenersRef.current.add(cb);
      return () => {
        listenersRef.current.delete(cb);
      };
    },
    getState: () => {
      const ams = messagesRef.current.filter((m) => m.role === "assistant");
      return {
        isStreaming: isStreamingRef.current,
        lastAssistantContent: ams[ams.length - 1]?.content || "",
        assistantCount: ams.length,
      };
    },
  }), []);

  const voiceTurn = useVoiceTurnProduction(chatAdapter, { timeoutMs: 5_000 });

  // Playwright-controlled seams for simulating chat lifecycle:
  useEffect(() => {
    (window as any).__wt_test_chat_complete = (reply: string) => {
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      setIsStreaming(false);
    };
    (window as any).__wt_test_chat_fail = () => {
      setIsStreaming(false);  // flips off without appending an assistant message
    };
    return () => {
      delete (window as any).__wt_test_chat_complete;
      delete (window as any).__wt_test_chat_fail;
    };
  }, []);

  return (
    <div className="p-6" data-testid="voice-turn-real-harness-ready">
      <div data-testid="vt-state">{voiceTurn.state}</div>
      <div data-testid="vt-error-reason">{voiceTurn.errorReason ?? ""}</div>
      <div data-testid="vt-last-transcript">{voiceTurn.lastTranscript}</div>
      <div data-testid="vt-last-reply">{voiceTurn.lastReply}</div>
      <div data-testid="vt-is-streaming">{String(isStreaming)}</div>
      <button data-testid="vt-start" onClick={voiceTurn.start}>start</button>
      <button data-testid="vt-cancel" onClick={voiceTurn.cancel}>cancel</button>
      <button data-testid="vt-reset" onClick={voiceTurn.reset}>reset</button>
    </div>
  );
}
