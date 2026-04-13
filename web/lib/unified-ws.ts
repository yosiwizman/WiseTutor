/**
 * Unified WebSocket Client
 *
 * Connects to the single `/api/v1/ws` endpoint and provides
 * a typed streaming interface for the new ChatOrchestrator protocol.
 */

import { wsUrl } from "./api";

// ---- StreamEvent types (mirror Python StreamEventType) ----

export type StreamEventType =
  | "stage_start"
  | "stage_end"
  | "thinking"
  | "observation"
  | "content"
  | "tool_call"
  | "tool_result"
  | "progress"
  | "sources"
  | "result"
  | "error"
  | "session"
  | "done";

export interface StreamEvent {
  type: StreamEventType;
  source: string;
  stage: string;
  content: string;
  metadata: Record<string, unknown>;
  session_id?: string;
  turn_id?: string;
  seq?: number;
  timestamp: number;
}

// ---- Client message ----

export interface StartTurnMessage {
  type: "message" | "start_turn";
  content: string;
  tools?: string[];
  capability?: string | null;
  knowledge_bases?: string[];
  session_id?: string | null;
  attachments?: {
    type: string;
    url?: string;
    base64?: string;
    filename?: string;
    mime_type?: string;
  }[];
  language?: string;
  config?: Record<string, unknown>;
  notebook_references?: {
    notebook_id: string;
    record_ids: string[];
  }[];
  history_references?: string[];
}

export interface SubscribeTurnMessage {
  type: "subscribe_turn";
  turn_id: string;
  after_seq?: number;
}

export interface SubscribeSessionMessage {
  type: "subscribe_session";
  session_id: string;
  after_seq?: number;
}

export interface ResumeTurnMessage {
  type: "resume_from";
  turn_id: string;
  seq?: number;
}

export interface UnsubscribeMessage {
  type: "unsubscribe";
  turn_id?: string;
  session_id?: string;
}

export interface CancelTurnMessage {
  type: "cancel_turn";
  turn_id: string;
}

export type ChatMessage =
  | StartTurnMessage
  | SubscribeTurnMessage
  | SubscribeSessionMessage
  | ResumeTurnMessage
  | UnsubscribeMessage
  | CancelTurnMessage;

// ---- Connection manager ----

export type EventHandler = (event: StreamEvent) => void;

export class UnifiedWSClient {
  private ws: WebSocket | null = null;
  private onEvent: EventHandler;
  private onClose?: () => void;

  constructor(onEvent: EventHandler, onClose?: () => void) {
    this.onEvent = onEvent;
    this.onClose = onClose;
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;

    // Fetch a short-lived signed identity token. The cookie lives on the
    // app origin (:3782) but the WS goes direct to the backend (:8001), which
    // would drop the cookie cross-origin. The token covers that gap.
    let token = "";
    try {
      const r = await fetch("/api/v1/users/ws-token", { credentials: "include" });
      if (r.ok) token = (await r.json()).token || "";
    } catch { /* anon connect; backend will reject with no_user */ }

    const base = wsUrl("/api/v1/ws");
    const url = token ? `${base}?wt_uid_token=${encodeURIComponent(token)}` : base;
    this.ws = new WebSocket(url);

    this.ws.onmessage = (ev) => {
      try {
        const event: StreamEvent = JSON.parse(ev.data);
        this.onEvent(event);
      } catch {
        console.warn("Unparseable WS message:", ev.data);
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.onClose?.();
    };

    this.ws.onerror = (err) => {
      console.error("WS error:", err);
    };
  }

  send(msg: ChatMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error("WebSocket not connected");
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
