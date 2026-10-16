const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const calls = [], pending = [], timers = new Map(), events = new Map();
  let timer = 0;
  const content = { hidden: false };
  const document = { body: { dataset: { design: 'new' } }, hidden: false,
    querySelector: () => content, addEventListener: (name, cb) => events.set(name, cb) };
  const window = { addEventListener: (name, cb) => events.set(name, cb),
    AtlasFace: { expression: value => calls.push(value.expression), reset: () => calls.push('reset'), clearCommand: () => calls.push('clear') },
    atlasAccess: { hasControl: () => true, fetch: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('aborted')));
      pending.push({ url, options, resolve, reject });
    }) } };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/new/face-events.js`, 'utf8'), {
    window, document, AbortController, MutationObserver: class { observe() {} },
    setTimeout: (fn, delay) => { timers.set(++timer, { fn, delay }); return timer; },
    clearTimeout: id => timers.delete(id), console,
  });
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { calls, pending, timers, events, document, window, flush,
    async reply(state) { pending.shift().resolve({ ok: true, json: async () => state }); await flush(); },
    async next() { const entry = [...timers.entries()].find(([, t]) => t.delay === 0); assert.ok(entry); timers.delete(entry[0]); entry[1].fn(); await flush(); },
  };
}

test('latest-only events do not replay the same command after wake and visibility reconnect', async () => {
  const p = setup();
  const sleep = { cursor: 'epoch:1', sequence: 1, operation: 'set', expression: 'asleep', remainingMs: 10000 };
  await p.reply(sleep);
  assert.deepEqual(p.calls, ['asleep']);
  await p.next();
  p.document.hidden = true; p.events.get('visibilitychange')(); await p.flush();
  p.pending.shift(); // cancelled request
  p.document.hidden = false; p.events.get('visibilitychange')();
  await p.reply(sleep);
  assert.deepEqual(p.calls, ['asleep']);
  await p.next();
  await p.reply({ ...sleep, cursor: 'epoch:2', sequence: 2, expression: 'excited' });
  assert.deepEqual(p.calls, ['asleep', 'excited']);
  await p.next();
  await p.reply({ cursor: 'epoch:3', sequence: 3, operation: 'expired', expression: 'neutral', remainingMs: 0 });
  assert.deepEqual(p.calls, ['asleep', 'excited', 'clear']);
  await p.next();
  await p.reply({ cursor: 'epoch:4', sequence: 4, operation: 'reset', expression: 'neutral', remainingMs: 0 });
  assert.equal(p.calls.at(-1), 'reset');
  p.events.get('pagehide')();
  assert.equal(p.timers.size, 0);
});

test('failed channel backs off and a late aborted response cannot paint', async () => {
  const p = setup();
  p.pending.shift().reject(new Error('network')); await p.flush();
  assert.ok([...p.timers.values()].some(t => t.delay === 500));
  p.events.get('online')();
  const request = p.pending[0];
  p.events.get('pagehide')();
  request.resolve({ ok: true, json: async () => ({ expression: 'angry', cursor: 'stale:1', remainingMs: 10000 }) });
  await p.flush();
  assert.deepEqual(p.calls, []);
  assert.equal(p.timers.size, 0);
});
