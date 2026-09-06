const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  let now = 0, id = 0;
  const timers = new Map();
  const window = {
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(key) { timers.delete(key); },
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), {
    window, AbortController, performance: { now: () => now }, crypto: { randomUUID: () => 'test' },
  });
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const advance = async ms => {
    now += ms;
    for (const [key, timer] of [...timers]) {
      if (timer.at > now) continue;
      timers.delete(key); timer.fn();
    }
    await flush();
  };
  return { window, send: window.AtlasRealtime.sendAcknowledgement, timers, flush, advance };
}

for (const status of [200, 204, 401, 423, 500]) {
  test(`fire-and-forget acknowledgement explicitly consumes HTTP ${status} body`, async () => {
    const p = setup(); let reads = 0, requests = 0, signal;
    await p.send((url, options) => {
      requests++; signal = options.signal;
      assert.equal(url, '/api/realtime/event'); assert.equal(options.body, '{"stage":"test"}');
      return Promise.resolve({ status, text: async () => { reads++; return '{}'; } });
    }, '/api/realtime/event', { method: 'POST', body: '{"stage":"test"}' });
    assert.equal(reads, 1); assert.equal(requests, 1); assert.equal(p.timers.size, 0);
    assert.equal(signal.aborted, true);
  });
}

test('acknowledgement body is cancelled when only a readable stream is available', async () => {
  const p = setup(); let cancelled = 0;
  await p.send(() => ({ body: { cancel: async () => { cancelled++; } } }), '/api/cancel');
  assert.equal(cancelled, 1); assert.equal(p.timers.size, 0);
});

test('header deadline resolves and aborts even if fetch ignores the abort; late body is cancelled', async () => {
  const p = setup(); let complete, signal, requests = 0, cancelled = 0, read = 0, finished = false;
  const work = p.send((url, options) => {
    signal = options.signal; requests++;
    return new Promise(resolve => { complete = resolve; });
  }, '/api/realtime/event').then(() => { finished = true; });
  await p.advance(3999); assert.equal(finished, false);
  await p.advance(1); await work;
  assert.equal(signal.aborted, true); assert.equal(finished, true); assert.equal(p.timers.size, 0);
  complete({ text: async () => { read++; }, body: { cancel: async () => { cancelled++; } } });
  await p.flush();
  assert.equal(cancelled, 1); assert.equal(read, 0); assert.equal(requests, 1);
});

test('body deadline aborts a stalled drain without holding the public promise or replaying', async () => {
  const p = setup(); let signal, reads = 0, requests = 0;
  const work = p.send((url, options) => {
    signal = options.signal; requests++;
    return { text() { reads++; return new Promise(() => {}); } };
  }, '/api/client-event');
  await p.flush(); assert.equal(reads, 1);
  await p.advance(4000); await work;
  assert.equal(signal.aborted, true); assert.equal(requests, 1); assert.equal(p.timers.size, 0);
});

test('rejected fetch, synchronous throw, rejected drain and late cancel never escape', async () => {
  const p = setup();
  for (const fetcher of [
    () => { throw new Error('sync failure'); },
    () => Promise.reject(new Error('network down')),
    () => ({ text: () => Promise.reject(new Error('interrupted body')) }),
    () => ({ body: { cancel: () => Promise.reject(new Error('closed body')) } }),
  ]) await assert.doesNotReject(p.send(fetcher, '/api/realtime/event'));
  let complete;
  const work = p.send(() => new Promise(resolve => { complete = resolve; }), '/api/realtime/event');
  await p.advance(4000); await work;
  complete({ body: { cancel: () => Promise.reject(new Error('late closed body')) } });
  await p.flush(); assert.equal(p.timers.size, 0);
});

test('offline telemetry has a finite in-flight ceiling, no queue, and never blocks cancellation', async () => {
  const p = setup(); let telemetry = 0, cancellations = 0;
  const fetcher = url => {
    if (url === '/api/cancel') cancellations++; else telemetry++;
    return new Promise(() => {});
  };
  for (let i = 0; i < 90; i++) void p.send(fetcher, '/api/realtime/event');
  void p.send(fetcher, '/api/cancel', { method: 'POST', keepalive: true });
  assert.equal(telemetry, 64); assert.equal(cancellations, 1); assert.equal(p.timers.size, 65);
  await p.advance(4000); assert.equal(p.timers.size, 0);
  await p.advance(20000); assert.equal(telemetry, 64, 'no deferred replay after recovery');
  void p.send(fetcher, '/api/client-event'); assert.equal(telemetry, 65, 'new logs can be sent after expiry');
});

test('Realtime event logging and backend cancellation both release acknowledgement bodies', async () => {
  const p = setup(), routes = [], reads = [];
  const c = p.window.AtlasRealtime.create({ fetch(url) {
    routes.push(url); return Promise.resolve({ text: async () => { reads.push(url); return '{}'; } });
  } });
  c.currentInteractionId = 'test'; c.currentRequestId = 'operation';
  c.postEvent('input.speech_stopped', 'Silencio'); c.interruptLocalWork();
  await p.flush(); await p.advance(0); // retire the unrelated zero-delay input-resume callback
  assert.deepEqual(routes, ['/api/realtime/event', '/api/cancel']);
  assert.deepEqual(reads, routes); assert.equal(p.timers.size, 0);
});

test('app client event and cancellation helpers use the same bounded acknowledgement cleanup', async () => {
  const p = setup(), routes = [], reads = [];
  const app = fs.readFileSync(`${__dirname}/static/app.js`, 'utf8');
  const fetcher = (url, options) => {
    routes.push(url); assert.ok(options.signal);
    return { text: async () => { reads.push(url); return '{}'; } };
  };
  const context = vm.createContext({ window: p.window, accessFetch: fetcher, CLIENT_BUILD: 'fixture' });
  for (const name of ['sendBrowserAcknowledgement', 'reportBrowserEventFor', 'requestServerCancellation']) {
    const declaration = app.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))?.[0];
    assert.ok(declaration, name); vm.runInContext(declaration, context);
  }
  await vm.runInContext('reportBrowserEventFor("id", "stage", "message")', context);
  await vm.runInContext('requestServerCancellation("operation")', context);
  assert.deepEqual(routes, ['/api/client-event', '/api/cancel']); assert.deepEqual(reads, routes);
  assert.equal(p.timers.size, 0);
});

function loadLegacyAppHelpers(p, fetcher, legacyRuntime) {
  p.window.AtlasRealtime = legacyRuntime;
  const context = vm.createContext({ window: p.window, accessFetch: fetcher, AbortController, CLIENT_BUILD: 'fixture' });
  const app = fs.readFileSync(`${__dirname}/static/app.js`, 'utf8');
  for (const name of ['sendBrowserAcknowledgement', 'reportBrowserEventFor', 'requestServerCancellation']) {
    const declaration = app.match(new RegExp(`function ${name}\\([^]*?^}`, 'm'))?.[0];
    assert.ok(declaration, name); vm.runInContext(declaration, context);
  }
  return context;
}

for (const runtime of [undefined, { create() {} }]) {
  test(`app ${runtime ? 'old' : 'missing'} Realtime bundle still disposes all acknowledgement statuses`, async () => {
    const p = setup(), routes = [], cancelled = [], signals = [];
    const ctx = loadLegacyAppHelpers(p, (url, options) => {
      routes.push(url); signals.push(options.signal);
      return { status: routes.length === 1 ? 500 : 401,
        text() { throw new Error('legacy fallback must not read acknowledgement JSON'); },
        body: { cancel: async () => { cancelled.push(url); } } };
    }, runtime);
    await vm.runInContext('reportBrowserEventFor("id", "stage", "message")', ctx);
    await vm.runInContext('requestServerCancellation("operation")', ctx);
    assert.deepEqual(routes, ['/api/client-event', '/api/cancel']); assert.deepEqual(cancelled, routes);
    assert.ok(signals.every(signal => signal.aborted)); assert.equal(p.timers.size, 0);
  });
}

test('legacy fallback bounds a hung fetch and disposes its late body without replay', async () => {
  const p = setup(); let complete, signal, requests = 0, cancelled = 0;
  const ctx = loadLegacyAppHelpers(p, (url, options) => {
    requests++; signal = options.signal;
    return new Promise(resolve => { complete = resolve; });
  });
  const work = vm.runInContext('requestServerCancellation("operation")', ctx);
  await p.advance(4000); await work;
  assert.equal(signal.aborted, true); assert.equal(p.timers.size, 0);
  complete({ body: { cancel: async () => { cancelled++; } } }); await p.flush();
  assert.equal(cancelled, 1); assert.equal(requests, 1);
});

test('legacy fallback bounds stalled body cancellation and swallows synchronous or asynchronous failures', async () => {
  const p = setup(); let signal;
  let ctx = loadLegacyAppHelpers(p, (url, options) => {
    signal = options.signal; return { body: { cancel: () => new Promise(() => {}) } };
  }, { create() {} });
  const work = vm.runInContext('reportBrowserEventFor("id", "stage", "message")', ctx);
  await p.advance(4000); await work;
  assert.equal(signal.aborted, true); assert.equal(p.timers.size, 0);
  for (const fetcher of [
    () => { throw new Error('no control'); },
    () => Promise.reject(new Error('offline')),
    () => ({ body: { cancel: () => Promise.reject(new Error('closed body')) } }),
  ]) {
    ctx = loadLegacyAppHelpers(p, fetcher);
    await assert.doesNotReject(vm.runInContext('requestServerCancellation("operation")', ctx));
  }
  assert.equal(p.timers.size, 0);
});
