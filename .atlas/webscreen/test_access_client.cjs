const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'static/access.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function client() {
  let now = 100, idle = true, suspended = 0;
  let reply = { owner: true, token: 'page-token' };
  const calls = [], timers = [], events = new Map(), nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { events: {}, addEventListener(name, fn) { this.events[name] = fn; } });
    return nodes.get(id);
  };
  const window = { location: { hostname: '192.168.1.50', search: '' },
    addEventListener: (name, fn) => events.set(name, fn), dispatchEvent() {} };
  vm.runInNewContext(source, { window, Event, Headers, AbortSignal,
    performance: { now: () => now },
    document: { querySelector: node, addEventListener() {} },
    setInterval: (fn, delay) => timers.push({ fn, delay }),
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, json: async () => reply }; },
  });
  window.atlasAccess.bind({ isIdle: () => idle, suspend: () => suspended++, acquired() {} });
  return { window, node, calls, timers, events, get suspended() { return suspended; },
    setIdle: value => { idle = value; }, setReply: value => { reply = value; },
    setTime: value => { now = value; } };
}

test('loss of ownership hides controls, suspends audio/mic and rejects API calls', async () => {
  const c = client(); await tick();
  assert.equal(c.node('#webscreen-content').hidden, false);
  await c.window.atlasAccess.fetch('/api/settings');
  assert.equal(c.calls.at(-1).options.headers.get('X-Atlas-Client'), 'page-token');
  c.setReply({ owner: false });
  c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.suspended, 1);
  assert.equal(c.node('#webscreen-content').hidden, true);
  assert.equal(c.node('#webscreen-content').inert, true);
  assert.equal(c.node('#access-blocked').hidden, false);
  await assert.rejects(c.window.atlasAccess.fetch('/api/text'));
});

test('takeover is immediate and does not require approval from the current owner', async () => {
  const c = client(); await tick();
  c.setReply({ owner: true, taken: true, replacedOwner: true });
  c.node('#access-takeover').events.click();
  await tick();
  assert.equal(c.calls.at(-1).url, '/api/access/takeover');
  assert.equal(c.window.atlasAccess.hasControl(), true);
  assert.equal(c.node('#webscreen-content').hidden, false);
});

test('remote page can send control directly to the physical A1', async () => {
  const c = client(); await tick();
  c.setReply({ owner: false, activated: true, atlasA1Available: true });
  c.node('#access-activate-a1').events.click();
  await tick();
  assert.equal(c.calls.at(-1).url, '/api/access/activate-atlas-a1');
  assert.equal(c.node('#access-blocked').hidden, false);
  assert.equal(c.node('#access-detail').textContent, 'Control activado en la pantalla de ATLAS A1.');
});

test('lease watchdog stops a disconnected client before the server lease expires', async () => {
  const c = client(); await tick();
  c.setTime(8200);
  c.timers.find(t => t.delay === 250).fn();
  assert.equal(c.suspended, 1);
  assert.equal(c.window.atlasAccess.hasControl(), false);
});

test('page close releases the lease with keepalive and no URL token', async () => {
  const c = client(); await tick();
  c.events.get('pagehide')(); await tick();
  assert.equal(c.suspended, 1);
  assert.equal(c.calls.at(-1).url, '/api/access/release');
  assert.equal(c.calls.at(-1).options.keepalive, true);
});
