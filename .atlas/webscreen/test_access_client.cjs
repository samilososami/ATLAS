const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'static/access.js'), 'utf8');
const markup = fs.readFileSync(path.join(__dirname, 'static/index.html'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function client(options = {}) {
  let now = 100, idle = true, suspended = 0;
  let reply = { owner: true, token: 'page-token' };
  let replyStatus = 200, failure = null, bodyFailure = null;
  let transport = null, idleFailure = options.idleFailure;
  const calls = [], timers = [], timeouts = [], warnings = [], events = new Map(), nodes = new Map();
  const documentEvents = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { events: {}, addEventListener(name, fn) { this.events[name] = fn; } });
    return nodes.get(id);
  };
  const window = { location: { hostname: '192.168.1.50', search: '' },
    addEventListener: (name, fn) => events.set(name, fn), dispatchEvent() {} };
  const document = { querySelector: node, visibilityState: 'visible',
    addEventListener: (name, fn) => documentEvents.set(name, fn) };
  vm.runInNewContext(source, { window, Event, Headers, AbortSignal, AbortController,
    console: { warn: (...args) => warnings.push(args) },
    performance: { now: () => now },
    document,
    setInterval: (fn, delay) => timers.push({ fn, delay }),
    setTimeout: (fn, delay) => {
      const timeout = { fn, delay, active: true };
      timeouts.push(timeout);
      return timeout;
    },
    clearTimeout: timeout => { if (timeout) timeout.active = false; },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (transport) return transport(url, options);
      if (failure) throw failure;
      return { ok: replyStatus < 400, status: replyStatus, json: async () => {
        if (bodyFailure) throw bodyFailure;
        return reply;
      } };
    },
  });
  window.atlasAccess.bind({ isIdle: () => { if (idleFailure) throw idleFailure; return idle; },
    suspend() { suspended++; if (options.suspendFailure) throw options.suspendFailure; },
    acquired() { if (options.acquiredFailure) throw options.acquiredFailure; } });
  return { window, node, calls, timers, timeouts, events, document, documentEvents, warnings,
    get suspended() { return suspended; }, setFetch: value => { transport = value; },
    expireRequest() { const timeout = timeouts.find(t => t.active); assert.ok(timeout); timeout.fn(); },
    setIdleFailure: value => { idleFailure = value; },
    setIdle: value => { idle = value; }, setReply: value => { reply = value; },
    setStatus: value => { replyStatus = value; }, setFailure: value => { failure = value; },
    setBodyFailure: value => { bodyFailure = value; },
    setTime: value => { now = value; } };
}

test('loss of ownership hides controls, suspends audio/mic and rejects API calls', async () => {
  const c = client(); await tick();
  assert.equal(c.node('#webscreen-content').hidden, false);
  await c.window.atlasAccess.fetch('/api/settings');
  assert.equal(c.calls.at(-1).options.headers.get('X-Atlas-Client'), 'page-token');
  c.setReply({ owner: false });
  c.setTime(1700);
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

test('A1 activation lives in the owned assistant topbar, not the blocked page', () => {
  const blocked = markup.match(/<section class="access-blocked"[\s\S]*?<\/section>/)?.[0] || '';
  const topbar = markup.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0] || '';
  assert.doesNotMatch(blocked, /access-activate-a1/);
  assert.match(topbar, /id="access-activate-a1"/);
  assert.match(topbar, /codex-usage[\s\S]*access-activate-a1/);
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

test('one lost heartbeat preserves ongoing audio; recovery clears stale failure', async () => {
  const c = client(); await tick();
  c.setTime(1700); c.setFailure(new TypeError('network lost'));
  c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.suspended, 0);
  assert.equal(c.window.atlasAccess.hasControl(), true);
  c.setTime(2500); c.setFailure(null);
  c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.suspended, 0);
  assert.doesNotMatch(c.node('#access-detail').textContent, /Sin conexión/);
});

test('expired token recovers through connect even when 401 body cannot be read', async () => {
  const c = client(); await tick();
  c.setTime(1700); c.setStatus(401); c.setBodyFailure(new Error('broken response'));
  c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.suspended, 1);
  c.setTime(2200); c.setStatus(200); c.setBodyFailure(null);
  c.setReply({ owner: true, token: 'renewed-token' });
  c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.calls.at(-1).url, '/api/access/connect');
  assert.equal(c.calls.at(-1).options.headers['X-Atlas-Client'], '');
  assert.equal(c.window.atlasAccess.hasControl(), true);
});

test('heartbeat polling is bounded and page lifecycle reacquires instead of reusing lease', async () => {
  const c = client(); await tick();
  const heartbeat = c.timers.find(t => t.delay === 500).fn;
  for (const time of [500, 1000, 1500]) { c.setTime(time); heartbeat(); await tick(); }
  assert.equal(c.calls.length, 1);
  c.events.get('pagehide')(); await tick();
  c.events.get('pageshow')({ persisted: true }); await tick();
  assert.equal(c.calls.at(-1).url, '/api/access/connect');
});

test('a throwing idle predicate cannot permanently latch heartbeat polling', async () => {
  const c = client({ idleFailure: new Error('missing UI state') }); await tick();
  assert.equal(c.window.atlasAccess.hasControl(), true);
  assert.equal(JSON.parse(c.calls[0].options.body).idle, false);
  assert.equal(c.node('#access-takeover').disabled, false);
  c.setTime(1700); c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.calls.at(-1).url, '/api/access/heartbeat');
  assert.equal(c.calls.length, 2);
  assert.equal(c.warnings.length, 1, 'repeated callback failure does not flood logs');
  assert.equal(c.node('#access-takeover').disabled, false);
});

test('throwing acquired/suspend callbacks do not hide network recovery or leave controls enabled', async () => {
  const c = client({ acquiredFailure: new Error('initialization failed'),
    suspendFailure: new Error('cleanup failed') }); await tick();
  assert.equal(c.window.atlasAccess.hasControl(), true);
  assert.doesNotMatch(c.node('#access-title').textContent, /Reconectando/);
  c.setReply({ owner: false });
  c.setTime(1700); c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.window.atlasAccess.hasControl(), false);
  assert.equal(c.node('#webscreen-content').hidden, true);
  assert.equal(c.node('#webscreen-content').inert, true);
  assert.equal(c.node('#access-takeover').disabled, false);
  assert.equal(c.warnings.length, 2);
});

test('whole-request deadline releases a fetch that never settles despite abort', async () => {
  const c = client(); await tick();
  let resolveStale;
  c.setFetch(() => new Promise(resolve => { resolveStale = resolve; }));
  c.setTime(1700); c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.node('#access-takeover').disabled, true);
  c.setTime(5700); c.expireRequest(); await tick();
  assert.equal(c.calls.at(-1).options.signal.aborted, true);
  assert.equal(c.node('#access-takeover').disabled, false);
  c.setFetch(null); c.setTime(6300);
  c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.window.atlasAccess.hasControl(), true);
  resolveStale({ status: 200, ok: true, json: async () => ({ owner: false }) }); await tick();
  assert.equal(c.window.atlasAccess.hasControl(), true, 'late expired reply cannot revoke current owner');
  assert.equal(c.suspended, 0);
});

test('whole-request deadline also bounds a stalled JSON body and ignores late grants', async () => {
  const c = client(); await tick();
  let resolveBody;
  c.setFetch(async () => ({ status: 200, ok: true,
    json: () => new Promise(resolve => { resolveBody = resolve; }) }));
  c.setTime(1700); c.timers.find(t => t.delay === 500).fn(); await tick();
  c.setTime(5700); c.expireRequest(); await tick();
  assert.equal(c.node('#access-takeover').disabled, false);
  c.setFetch(null); c.setReply({ owner: false }); c.setTime(6300);
  c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.window.atlasAccess.hasControl(), false);
  resolveBody({ owner: true }); await tick();
  assert.equal(c.window.atlasAccess.hasControl(), false, 'late grant cannot restore an expired request');
});

test('pagehide cancels hung control requests and old cleanup cannot unlatch a new request', async () => {
  const c = client(); await tick();
  c.setFetch(() => new Promise(() => {}));
  c.setTime(1700); c.timers.find(t => t.delay === 500).fn(); await tick();
  const oldSignal = c.calls.at(-1).options.signal;
  c.events.get('pagehide')();
  c.events.get('pageshow')({ persisted: true }); await tick();
  assert.equal(oldSignal.aborted, true);
  assert.equal(c.calls.at(-1).url, '/api/access/connect');
  assert.equal(c.node('#access-takeover').disabled, true);
  c.setTime(2200); c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.calls.length, 4, 'old request finally must not allow concurrent heartbeat');
  c.expireRequest(); await tick();
});

test('an API 401 cancels a hung heartbeat and reconnects without automatic takeover', async () => {
  const c = client(); await tick();
  c.setFetch(async url => url === '/api/settings'
    ? { status: 401, ok: false } : new Promise(() => {}));
  c.setTime(1700); c.timers.find(t => t.delay === 500).fn(); await tick();
  const oldSignal = c.calls.at(-1).options.signal;
  await c.window.atlasAccess.fetch('/api/settings'); await tick();
  assert.equal(oldSignal.aborted, true);
  c.setFetch(null); c.setReply({ owner: false, token: 'fresh-token' });
  c.setTime(2200); c.timers.find(t => t.delay === 500).fn(); await tick();
  assert.equal(c.calls.at(-1).url, '/api/access/connect');
  assert.equal(c.window.atlasAccess.hasControl(), false);
  assert.equal(c.calls.some(call => call.url === '/api/access/takeover'), false);
});

test('online and visibility recovery bypass backoff without producing request storms', async () => {
  const c = client(); await tick();
  c.setTime(1700); c.setFailure(new TypeError('offline'));
  c.timers.find(t => t.delay === 500).fn(); await tick();
  c.setFailure(null); c.setTime(1800);
  c.events.get('online')(); await tick();
  assert.equal(c.calls.length, 3);
  for (let index = 0; index < 20; index++) {
    c.events.get('online')();
    c.documentEvents.get('visibilitychange')();
    await tick();
  }
  assert.equal(c.calls.length, 3);
  assert.equal(c.window.atlasAccess.hasControl(), true);
});
