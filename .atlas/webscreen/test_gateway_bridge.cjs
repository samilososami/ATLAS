const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

test('Gateway bridge survives initial failure, reports disconnect and recovers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-bridge-test-'));
  const runtime = path.join(dir, 'fake-runtime.mjs');
  fs.writeFileSync(runtime, `
    export class GatewayClient {
      constructor(options) { this.options = options; this.requests = 0; }
      start() {
        this.options.onConnectError(new Error('ECONNREFUSED test-only'));
        setTimeout(() => this.options.onHelloOk({ protocol: 3 }), 30);
      }
      async request(method) {
        if (method === 'usage.status' && ++this.requests === 1) {
          this.options.onClose(1006, 'test disconnect');
          setTimeout(() => this.options.onHelloOk({ protocol: 3 }), 40);
          throw new Error('Connection closed during request');
        }
        return { providers: [] };
      }
      async stopAndWait() {}
    }
  `);
  const config = path.join(dir, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ gateway: { auth: { mode: 'none' } } }));
  const child = spawn(process.execPath, [path.join(__dirname, 'gateway_bridge.mjs')], {
    env: { ...process.env, OPENCLAW_GATEWAY_RUNTIME: runtime, OPENCLAW_CONFIG: config },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '', buffer = '';
  const events = [], waiting = [];
  child.stderr.on('data', data => { stderr += data; });
  child.stdout.on('data', data => {
    buffer += data;
    while (buffer.includes('\n')) {
      const at = buffer.indexOf('\n');
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      if (!line) continue;
      const event = JSON.parse(line);
      const index = waiting.findIndex(item => item.match(event));
      if (index < 0) events.push(event);
      else { const [item] = waiting.splice(index, 1); clearTimeout(item.timer); item.resolve(event); }
    }
  });
  const next = match => new Promise((resolve, reject) => {
    const index = events.findIndex(match);
    if (index >= 0) return resolve(events.splice(index, 1)[0]);
    const item = { match, resolve, timer: null };
    item.timer = setTimeout(() => {
      waiting.splice(waiting.indexOf(item), 1);
      reject(new Error('Bridge event timed out: ' + stderr));
    }, 3000);
    waiting.push(item);
  });
  const send = value => child.stdin.write(JSON.stringify(value) + '\n');
  try {
    await next(e => e.state === 'connect_error');
    await next(e => e.type === 'bridge_ready');
    assert.equal(child.exitCode, null, 'initial connection failure must not crash Node');
    send({ command: 'usage', bridgeRequestId: 'first' });
    await next(e => e.state === 'disconnected');
    assert.equal((await next(e => e.bridgeRequestId === 'first')).type, 'error');
    send({ command: 'ping', nonce: 'offline' });
    assert.equal((await next(e => e.nonce === 'offline')).connected, false);
    // A request arriving during reconnection waits, then completes once.
    send({ command: 'usage', bridgeRequestId: 'recovered' });
    await next(e => e.type === 'bridge_ready');
    assert.equal((await next(e => e.bridgeRequestId === 'recovered')).type, 'usage');
    send({ command: 'ping', nonce: 'online' });
    assert.equal((await next(e => e.nonce === 'online')).connected, true);
    assert.doesNotMatch(stderr, /unhandled|triggerUncaughtException/i);
  } finally {
    for (const item of waiting) clearTimeout(item.timer);
    child.kill('SIGTERM');
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
