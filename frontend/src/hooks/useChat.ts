import { useCallback, useEffect, useRef, useState } from "react";

export type ChatMessage = {
  id: string;
  name: string;
  text: string;
  ts: number;
};

export type ChatStatus = "connecting" | "connected" | "disconnected";

const MAX_MESSAGES = 200;
const RECONNECT_DELAY_MS = 2000;

/**
 * Talks to the tiny WebSocket chat room served by server.js at /ws. This is
 * a plain, unauthenticated public chat — anyone on the page can post under
 * any display name they type in. It's meant for chatting about a wager
 * before either side commits ETH on-chain, not as a source of truth for
 * anything; nothing here touches the contract.
 *
 * Messages live only in the server's memory (see server.js) and are not
 * tied to a wallet signature, so treat names as claims, not proof.
 */
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | null = null;

    function connect() {
      if (cancelled) return;
      setStatus("connecting");

      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${scheme}//${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        if (cancelled) return;
        setStatus("connected");
      };

      socket.onmessage = (event) => {
        if (cancelled) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        const payload = parsed as { type?: string; messages?: ChatMessage[]; id?: string; name?: string; text?: string; ts?: number };

        if (payload.type === "history" && Array.isArray(payload.messages)) {
          setMessages(payload.messages.slice(-MAX_MESSAGES));
        } else if (payload.type === "message" && payload.id && payload.name && payload.text && payload.ts) {
          const msg: ChatMessage = { id: payload.id, name: payload.name, text: payload.text, ts: payload.ts };
          setMessages((prev) => {
            const next = [...prev, msg];
            return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
          });
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setStatus("disconnected");
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        // onclose fires right after and handles the reconnect; this just
        // avoids an unhandled-error console spam on every retry.
        socket?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      socketRef.current = null;
    };
  }, []);

  const sendMessage = useCallback((name: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "send", name: name.trim() || "Guest", text: trimmed }));
  }, []);

  return { messages, status, sendMessage };
}
