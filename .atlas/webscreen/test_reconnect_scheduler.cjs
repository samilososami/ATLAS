const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/static/app.js`, 'utf8');
const schedule = source.slice(source.indexOf('function scheduleRealtimeReconnect('), source.indexOf('\nrealtimeController = window.AtlasRealtime'));

function setup() {
  let now = 1000, sequence = 0;
  const timers = new Map(), logs = [], screens = [];
  const context = vm.createContext({
    REALTIME_PRIMARY: true, activeView: 'atlas', realtimeFallbackActive: false,
    realtimeReconnectTimer: 0, realtimeReconnectAttempts: 0, realtimeReadyAt: null,
    REALTIME_RECONNECT_STABLE_MS: 20000, realtimeController: { closed: true, state: 'stopped' },
    control: true, hasControl: () => context.control,
    performance: { now: () => now },
    window: {
      setTimeout(fn, ms) { timers.set(++sequence, { fn, ms }); return sequence; },
      clearTimeout(id) { timers.delete(id); },
    },
    setScreen: (...args) => screens.push(args), addLog: (...args) => logs.push(args),
    activatePrimaryMicrophone: async () => {},
  });
  vm.runInContext(schedule, context);
  return { context, timers, logs, screens,
    retry: () => context.scheduleRealtimeReconnect(new Error('test transport failure')),
    readyFor(ms) { context.realtimeReadyAt = now; now += ms; },
    fire() { const [id, timer] = [...timers][0]; timers.delete(id); timer.fn(); },
  };
}

test('duplicate fallback and rejected startup share one retry and one screen update', () => {
  const p = setup(); p.retry(); const first = p.context.realtimeReconnectTimer;
  p.retry(); p.retry();
  assert.equal(p.context.realtimeReconnectTimer, first);
  assert.equal(p.context.realtimeReconnectAttempts, 1);
  assert.equal(p.timers.size, 1); assert.equal(p.screens.length, 1);
  assert.equal(p.logs.length, 1); assert.equal([...p.timers.values()][0].ms, 1000);
});

test('short ready intervals preserve bounded exponential retry backoff', () => {
  const p = setup();
  for (const expected of [1000, 2000, 4000, 8000, 8000]) {
    p.retry(); assert.equal([...p.timers.values()][0].ms, expected);
    p.fire(); p.readyFor(1000);
  }
});

test('twenty seconds of stable readiness resets the next retry budget', () => {
  const p = setup(); p.context.realtimeReconnectAttempts = 4;
  p.readyFor(20000); p.retry();
  assert.equal([...p.timers.values()][0].ms, 1000);
  assert.equal(p.context.realtimeReconnectAttempts, 1);
});

test('stale startup failure cannot disturb a ready replacement', () => {
  const p = setup(); p.context.realtimeController = { closed: false, state: 'ready' };
  p.retry(); assert.equal(p.timers.size, 0); assert.equal(p.screens.length, 0);
});

test('retry cannot restart after ownership is revoked or the view changes', () => {
  for (const field of ['control', 'activeView']) {
    const p = setup(); let starts = 0;
    p.context.activatePrimaryMicrophone = () => starts++;
    p.retry(); p.context[field] = field === 'control' ? false : 'settings'; p.fire();
    assert.equal(starts, 0);
  }
});

test('ready callback records stability without immediately erasing retry history', () => {
  const onReady = source.slice(source.indexOf('    onReady({'), source.indexOf('    onContextStats('));
  assert.match(onReady, /realtimeReadyAt = performance\.now\(\)/);
  assert.doesNotMatch(onReady, /realtimeReconnectAttempts = 0/);
});
