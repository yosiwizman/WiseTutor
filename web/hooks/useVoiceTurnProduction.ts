"use client";
import { useCallback, useEffect, useRef } from "react";
import { useVoiceTurn } from "@/hooks/useVoiceTurn";

export interface ChatAdapter {
  /** Synchronously trigger a chat turn with the given text. */
  sendMessage: (text: string) => void;
  /**
   * Subscribe to chat-state changes. Callback fires any time isStreaming
   * or messages change. Returns an unsubscribe function.
   */
  subscribe: (cb: () => void) => () => void;
  /** Read current chat state. */
  getState: () => { isStreaming: boolean; lastAssistantContent: string; assistantCount: number };
}

export function useVoiceTurnProduction(chat: ChatAdapter, opts: { timeoutMs?: number } = {}) {
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const submit = useCallback(
    (text: string) =>
      new Promise<{ reply: string }>((resolve, reject) => {
        const start = chat.getState();
        const preCount = start.assistantCount;
        // Reject fast if a turn is already streaming — we can't correlate.
        if (start.isStreaming) {
          reject(new Error("reply-failed: chat already streaming"));
          return;
        }
        chat.sendMessage(text);

        const timer = setTimeout(() => {
          unsubscribe();
          reject(new Error("reply-timeout"));
        }, timeoutMs);

        const unsubscribe = chat.subscribe(() => {
          const cur = chat.getState();
          // Wait until the trailing edge: streaming has stopped AND a new
          // assistant message is present.
          if (!cur.isStreaming && cur.assistantCount > preCount) {
            clearTimeout(timer);
            unsubscribe();
            const content = (cur.lastAssistantContent || "").trim();
            if (!content) {
              resolve({ reply: "" });
              return;
            }
            resolve({ reply: content });
          }
        });
      }),
    [chat, timeoutMs],
  );

  return useVoiceTurn({ submit });
}
