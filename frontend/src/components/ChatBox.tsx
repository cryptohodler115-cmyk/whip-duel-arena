import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useChat } from "../hooks/useChat";

const NAME_STORAGE_KEY = "whip-duel-chat-name";

// A small palette reminiscent of the classic in-game chat colors (yellow
// for your own name, a handful of others for everyone else) — picked
// per-name via a cheap hash so the same name always lands on the same
// color for the length of the session.
const NAME_COLORS = ["#ffcf5e", "#7fd0ff", "#8ce08c", "#ff9e6d", "#d9a8ff", "#f27fae", "#6fd6c9"];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return NAME_COLORS[hash % NAME_COLORS.length];
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatBox() {
  const { address } = useAccount();
  const { messages, status, sendMessage } = useChat();
  const [text, setText] = useState("");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const logRef = useRef<HTMLDivElement | null>(null);

  const defaultName = useMemo(() => {
    if (name.trim()) return name.trim();
    if (address) return `${address.slice(0, 6)}…${address.slice(-4)}`;
    return "Guest";
  }, [name, address]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function handleNameChange(value: string) {
    setName(value);
    try {
      localStorage.setItem(NAME_STORAGE_KEY, value);
    } catch {
      // localStorage can throw in private-browsing contexts — chat still
      // works for the session, it just won't remember the name next visit.
    }
  }

  function handleSend() {
    if (!text.trim()) return;
    sendMessage(defaultName, text);
    setText("");
  }

  return (
    <section className="panel chat-panel">
      <h2>Stake chat</h2>
      <p className="muted">
        Talk over a wager before you commit ETH — this chat is off-chain and not tied to your wallet signature, so
        it's for haggling, not proof of anything.
      </p>

      <div className="chat-status">
        <span className={`chat-status-dot ${status}`} />
        {status === "connected" && "Connected"}
        {status === "connecting" && "Connecting…"}
        {status === "disconnected" && "Reconnecting…"}
      </div>

      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && <p className="chat-empty">No one's said anything yet. Break the ice.</p>}
        {messages.map((m) => (
          <div key={m.id} className="chat-line">
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              [{formatTime(m.ts)}]{" "}
            </span>
            <span className="chat-name" style={{ color: colorForName(m.name) }}>
              {m.name}:
            </span>
            <span className="chat-text"> {m.text}</span>
          </div>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          className="chat-name-input"
          type="text"
          placeholder={address ? undefined : "Name"}
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          maxLength={24}
        />
        <input
          type="text"
          placeholder="Say what you're offering…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          maxLength={280}
        />
        <button className="btn btn-primary" disabled={!text.trim() || status !== "connected"} onClick={handleSend}>
          Send
        </button>
      </div>
    </section>
  );
}
