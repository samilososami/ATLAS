import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket from "ws";

const port = 8976;
const origin = `http://127.0.0.1:${port}`;
const socketUrl = `ws://127.0.0.1:${port}/connect`;
const testDevices = JSON.stringify({
  "room-one": "9717951d703ed271a4407971aac6c21c5f963b592abc52a2aa1be9b50105f4f1",
  "room-two": "0000000000000000000000000000000000000000000000000000000000000000"
});
const worker = spawn(process.execPath, [
  "node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--port", String(port),
  "--var", `ATLAS_RELAY_DEVICES:${testDevices}`
], {
  cwd: new URL("..", import.meta.url),
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
worker.stdout.on("data", (chunk) => { output += chunk; });
worker.stderr.on("data", (chunk) => { output += chunk; });

async function ready() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch { /* starting */ }
    await delay(250);
  }
  throw new Error(`Wrangler did not start:\n${output}`);
}

function connect(hello) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(socketUrl);
    const timer = setTimeout(() => reject(new Error("WebSocket timeout")), 3000);
    socket.once("open", () => socket.send(JSON.stringify(hello)));
    socket.once("message", (raw) => {
      clearTimeout(timer);
      resolve({ socket, hello: JSON.parse(raw.toString()) });
    });
    socket.once("error", reject);
    socket.once("close", (code) => {
      if (code === 1008) {
        clearTimeout(timer);
        resolve({ socket, closed: true });
      }
    });
  });
}

function message(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Message timeout")), 3000);
    socket.once("message", (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()));
    });
  });
}

try {
  await ready();
  const health = await (await fetch(`${origin}/health`)).json();
  assert.equal(health.service, "atlas-relay");

  const invalid = await connect({ role: "pi", room: "room-one", password: "wrong" });
  assert.equal(invalid.closed, true);

  const presenceApp = await connect({ role: "app", room: "room-one" });
  assert.equal(presenceApp.hello.online, false);
  const onlinePresence = message(presenceApp.socket);
  const pi = await connect({ role: "pi", room: "room-one", password: "pi-password" });
  assert.equal(pi.hello.ok, true);
  assert.deepEqual(await onlinePresence, { presence: true, online: true });
  const app = await connect({ role: "app", room: "room-one" });
  assert.deepEqual(app.hello, { ok: true, online: true });

  const forwardedPromise = message(pi.socket);
  app.socket.send(JSON.stringify({ box: "opaque-request" }));
  const forwarded = await forwardedPromise;
  assert.equal(forwarded.box, "opaque-request");
  assert.match(forwarded.peer, /^[a-f0-9]{32}$/);

  const responsePromise = message(app.socket);
  pi.socket.send(JSON.stringify({ peer: forwarded.peer, box: "opaque-response" }));
  assert.deepEqual(await responsePromise, { box: "opaque-response" });

  const offlineRoom = await connect({ role: "app", room: "room-two" });
  assert.equal(offlineRoom.hello.online, false);
  const offlinePromise = message(offlineRoom.socket);
  offlineRoom.socket.send(JSON.stringify({ box: "opaque" }));
  assert.deepEqual(await offlinePromise, { error: "A1 desconectado" });

  const offlinePresence = message(presenceApp.socket);
  pi.socket.close();
  assert.deepEqual(await offlinePresence, { presence: true, online: false });
  for (const socket of [presenceApp.socket, app.socket, offlineRoom.socket]) socket.close();
  console.log("ATLAS Cloudflare relay integration tests passed");
} finally {
  worker.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => worker.once("exit", resolve)),
    delay(3000).then(() => worker.kill("SIGKILL"))
  ]);
}
