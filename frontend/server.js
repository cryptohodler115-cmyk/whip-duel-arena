// Tiny production server for the built frontend.
//
// Two jobs:
//   1. Serve the static Vite build in dist/ (with an SPA fallback to
//      index.html, since the app uses a client-side hash router).
//   2. Run a WebSocket chat room at /ws — an ephemeral, in-memory "stake
//      chat" so people can talk over a wager before either side commits
//      ETH on-chain. Messages are NOT persisted anywhere: they live only in
//      this process's memory and are lost on redeploy/restart. That's a
//      deliberate simplicity tradeoff for a v1 — swap in a real store
//      (Redis, Postgres, etc.) if you want durable chat history later.
//
// No framework here on purpose: this whole file is a handful of Node
// built-ins plus the `ws` package, so it has almost nothing that can break
// on install and doesn't require Express just to serve a few static files.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "dist");
const PORT = process.env.PORT || 4173;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function serveStatic(req, res) {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  let filePath = path.normalize(path.join(DIST_DIR, urlPath));

  // Guard against path traversal escaping dist/.
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Client-side routed path (or just "/") — fall back to index.html so
      // the React app can take over and read the URL itself.
      filePath = path.join(DIST_DIR, "index.html");
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(serveStatic);

// ---------------------------------------------------------------------
// Chat room
// ---------------------------------------------------------------------

const MAX_HISTORY = 200;
const MAX_NAME_LEN = 24;
const MAX_MESSAGE_LEN = 280;

/** @type {{ id: string, name: string, text: string, ts: number }[]} */
const history = [];

const wss = new WebSocketServer({ server, path: "/ws" });

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "history", messages: history }));

  ws.on("message", (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!parsed || parsed.type !== "send") return;

    const name = String(parsed.name ?? "Guest").slice(0, MAX_NAME_LEN).trim() || "Guest";
    const text = String(parsed.text ?? "").slice(0, MAX_MESSAGE_LEN).trim();
    if (!text) return;

    const message = { type: "message", id: randomUUID(), name, text, ts: Date.now() };
    history.push(message);
    if (history.length > MAX_HISTORY) history.shift();
    broadcast(message);
  });
});

server.listen(PORT, () => {
  console.log(`whip-duel-arena listening on :${PORT}`);
});
