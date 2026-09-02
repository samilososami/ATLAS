const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tick = () => new Promise(resolve => setImmediate(resolve));

function clock() {
  let id = 0;
  const timers = new Map();
  return {
    timers,
    setTimeout(fn) { timers.set(++id, fn); return id; },
    clearTimeout(key) { timers.delete(key); },
    async step() {
      const batch = [...timers.values()]; timers.clear();
      for (const fn of batch) fn();
      await tick();
    },
  };
}

function contextPage() {
  const time = clock(), listeners = new Map(), events = [], requests = [], nodes = new Map();
  let control = true;
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: 0, textContent: '',
      setAttribute() {}, addEventListener() {}, classList: { toggle() {} } });
    return nodes.get(id);
  };
  const window = {
    setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    addEventListener(type, fn) { listeners.set(type, fn); },
    dispatchEvent(event) { events.push(event); listeners.get(event.type)?.(event); },
    atlasAccess: { hasControl: () => control,
      fetch: () => new Promise(resolve => requests.push(stats => resolve({ ok: true, json: async () => stats }))),
    },
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/context.js`, 'utf8'), {
    window, document: { querySelector: node, visibilityState: 'visible' },
    AbortSignal: { timeout() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  });
  return { time, requests, node,
    emit: (type, detail) => window.dispatchEvent({ type, detail }),
    revisions: () => events.filter(e => e.type === 'atlas-context-revision'),
    lose() { control = false; window.dispatchEvent({ type: 'atlas-access-lost' }); },
  };
}

test('normal saved turns update usage without reconnecting the current session', async () => {
  const p = contextPage();
  p.requests.shift()({ revision: 'same-session', fillerEstimatedTokens: 10 }); await tick();
  await p.time.step();
  p.requests.shift()({ revision: 'same-session', fillerEstimatedTokens: 40 }); await tick();
  assert.equal(p.revisions().length, 0);
  assert.match(p.node('#context-usage-value').textContent, /^40 /);
});

test('a stale poll cannot roll back a newer acknowledged session context', async () => {
  const p = contextPage();
  p.requests.shift()({ revision: 'old' }); await tick();
  await p.time.step();
  p.emit('atlas-context-stats', { revision: 'new', fillerEstimatedTokens: 20 });
  p.requests.shift()({ revision: 'old', fillerEstimatedTokens: 10 }); await tick();
  assert.equal(p.revisions().length, 0);
  assert.match(p.node('#context-usage-value').textContent, /^20 /);
  await p.time.step();
  p.requests.shift()({ revision: 'new', fillerEstimatedTokens: 20 }); await tick();
  assert.equal(p.revisions().length, 0);
});

test('external reset requests a reload once, not on every poll', async () => {
  const p = contextPage();
  p.requests.shift()({ revision: 'old' }); await tick();
  await p.time.step(); p.requests.shift()({ revision: 'reset' }); await tick();
  await p.time.step(); p.requests.shift()({ revision: 'reset' }); await tick();
  assert.equal(p.revisions().length, 1);
});

test('losing control retires in-flight polling and does not revive a session', async () => {
  const p = contextPage();
  p.requests.shift()({ revision: 'old' }); await tick();
  await p.time.step(); p.lose();
  p.requests.shift()({ revision: 'other-device' }); await tick();
  assert.equal(p.revisions().length, 0);
  assert.equal(p.time.timers.size, 0);
});

function controller() {
  const time = clock(), window = { setTimeout: time.setTimeout, clearTimeout: time.clearTimeout };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), {
    window, performance: { now: () => 100 }, crypto: { randomUUID: () => 'test-id' },
  });
  const c = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
  c.closed = false; c.state = 'ready';
  let starts = 0;
  c.start = async () => { starts += 1; c.closed = false; c.state = 'ready'; };
  return { c, time, starts: () => starts };
}

for (const busy of ['conversationActive', 'speechInputActive', 'pendingTranscripts',
  'responseActive', 'toolActive', 'nativePlaybackActive', 'externalPlaybackActive', 'contextCompacting']) {
  test(`context refresh waits while ${busy} is active`, async () => {
    const p = controller(); p.c[busy] = true;
    await p.c.restartForContext('external reset', { whenIdle: true });
    await p.time.step();
    assert.equal(p.starts(), 0);
    assert.equal(p.c.closed, false);
    p.c[busy] = false; await p.time.step();
    assert.equal(p.starts(), 1);
  });
}

test('stopping cancels queued context restart (access loss or tab change)', async () => {
  const p = controller(); p.c.conversationActive = true;
  await p.c.restartForContext('external reset', { whenIdle: true });
  p.c.stop(false); await p.time.step();
  assert.equal(p.starts(), 0);
});

test('an explicit reset button can intentionally restart the session immediately', async () => {
  const p = controller(); p.c.conversationActive = true;
  await p.c.restartForContext('explicit reset');
  assert.equal(p.starts(), 1);
});
