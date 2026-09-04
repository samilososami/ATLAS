const MAX_MESSAGE_BYTES = 2_000_000;
const MAX_APPS = 64;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 250;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

function attachment(socket) {
  return socket.deserializeAttachment() || {
    authenticated: false,
    role: "",
    room: "",
    peer: "",
    rateStart: Date.now(),
    rateCount: 0
  };
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function peerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default {
  fetch(request, environment) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ service: "atlas-relay", version: "0.1.1" });
    if (url.pathname !== "/connect") return json({ error: "not_found" }, 404);
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);
    const relay = environment.ATLAS_RELAY.get(environment.ATLAS_RELAY.idFromName("atlas-global-relay"));
    return relay.fetch(request);
  }
};

export class AtlasRelay {
  constructor(state, environment) {
    this.state = state;
    this.devices = this.readDevices(environment.ATLAS_RELAY_DEVICES);
  }

  readDevices(raw) {
    try {
      const parsed = JSON.parse(raw || "{}");
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return {};
      return parsed;
    } catch {
      return {};
    }
  }

  fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "websocket_required" }, 426);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment(attachment(server));
    return new Response(null, { status: 101, webSocket: client });
  }

  sockets() {
    return this.state.getWebSockets();
  }

  findPi(room, except = null) {
    return this.sockets().find((socket) => {
      if (socket === except) return false;
      const value = attachment(socket);
      return value.authenticated && value.role === "pi" && value.room === room;
    });
  }

  findApp(room, peer) {
    return this.sockets().find((socket) => {
      const value = attachment(socket);
      return value.authenticated && value.role === "app" && value.room === room && value.peer === peer;
    });
  }

  notifyApps(room, online) {
    const message = JSON.stringify({ presence: true, online });
    for (const socket of this.sockets()) {
      const value = attachment(socket);
      if (value.authenticated && value.role === "app" && value.room === room) {
        try { socket.send(message); } catch { /* stale socket */ }
      }
    }
  }

  appCount() {
    return this.sockets().filter((socket) => {
      const value = attachment(socket);
      return value.authenticated && value.role === "app";
    }).length;
  }

  close(socket, code = 1008, reason = "Policy violation") {
    try { socket.close(code, reason); } catch { /* already closed */ }
  }

  async authenticate(socket, value) {
    if (!value || Array.isArray(value) || typeof value !== "object") return this.close(socket);
    const role = value.role;
    const room = value.room;
    const expected = typeof room === "string" ? this.devices[room] : undefined;
    if ((role !== "pi" && role !== "app") || typeof expected !== "string" || !/^[a-f0-9]{64}$/i.test(expected)) return this.close(socket);

    const next = attachment(socket);
    if (role === "pi") {
      if (typeof value.password !== "string" || !safeEqual(await sha256(value.password), expected.toLowerCase())) return this.close(socket);
      const previous = this.findPi(room, socket);
      if (previous) this.close(previous, 1012, "A1 reconnected");
    } else {
      if (this.appCount() >= MAX_APPS) return this.close(socket, 1013, "Try again later");
      next.peer = peerId();
    }

    next.authenticated = true;
    next.role = role;
    next.room = room;
    next.rateStart = Date.now();
    next.rateCount = 0;
    socket.serializeAttachment(next);
    socket.send(JSON.stringify({ ok: true, online: role === "pi" || Boolean(this.findPi(room)) }));
    if (role === "pi") this.notifyApps(room, true);
  }

  rateAllowed(socket, value) {
    const now = Date.now();
    if (now - value.rateStart > RATE_WINDOW_MS) {
      value.rateStart = now;
      value.rateCount = 0;
    }
    value.rateCount += 1;
    socket.serializeAttachment(value);
    if (value.rateCount > RATE_LIMIT) {
      this.close(socket);
      return false;
    }
    return true;
  }

  async webSocketMessage(socket, message) {
    if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) return this.close(socket, 1009, "Message too large");
    let value;
    try { value = JSON.parse(message); } catch { return this.close(socket); }

    const client = attachment(socket);
    if (!client.authenticated) return this.authenticate(socket, value);
    if (!this.rateAllowed(socket, client) || !value || Array.isArray(value) || typeof value !== "object") return;
    if (typeof value.box !== "string") return;

    if (client.role === "app") {
      const pi = this.findPi(client.room);
      if (pi) pi.send(JSON.stringify({ peer: client.peer, box: value.box }));
      else socket.send(JSON.stringify({ error: "A1 desconectado" }));
      return;
    }

    if (typeof value.peer !== "string") return;
    const app = this.findApp(client.room, value.peer);
    if (app) app.send(JSON.stringify({ box: value.box }));
  }

  webSocketClose(socket) {
    const value = attachment(socket);
    if (value.authenticated && value.role === "pi" && !this.findPi(value.room, socket)) {
      this.notifyApps(value.room, false);
    }
  }
  webSocketError(socket) { this.close(socket, 1011, "WebSocket error"); }
}
