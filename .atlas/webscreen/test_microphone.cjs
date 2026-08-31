const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'static/app.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function page({ hostname = 'localhost', search = '?kiosk=1', permission = 'granted',
                secure = true, getUserMedia } = {}) {
  let owner = false, adapter, requests = 0, starts = 0;
  const nodes = new Map(), timers = new Map(), recognizers = [];
  let timerId = 0;
  const element = () => ({ children: [], dataset: {}, hidden: false, disabled: false,
    textContent: '', value: '', events: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, addEventListener(name, fn) { this.events[name] = fn; },
    append(...items) { this.children.push(...items); },
  });
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const streams = [];
  const stream = () => {
    const track = { stopped: false, stop() { this.stopped = true; } };
    const result = { track, getTracks: () => [track] };
    streams.push(result);
    return result;
  };
  class Recognition {
    constructor() { recognizers.push(this); }
    start() { starts++; this.onstart?.(); }
    stop() {}
    abort() {}
  }
  const intervals = new Map();
  const window = {
    isSecureContext: secure, SpeechRecognition: Recognition,
    speechSynthesis: { cancel() {} },
    addEventListener() {}, cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
    setInterval(fn) { intervals.set(++timerId, fn); return timerId; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    atlasAccess: {
      hasControl: () => owner,
      bind(value) { adapter = value; },
      fetch: async url => ({ json: async () => url === '/api/health'
        ? { ready: true, openclaw: { model: 'test' } } : {} }),
    },
  };
  const context = vm.createContext({ window, location: { hostname, search }, URLSearchParams,
    crypto: { randomUUID: () => 'test-interaction-id' },
    performance: { now: () => 100 }, localStorage: { getItem: () => null },
    navigator: {
      permissions: { query: async () => ({ state: permission }) },
      mediaDevices: { getUserMedia: async constraints => {
        requests++;
        assert.equal(constraints.video, false);
        assert.equal(constraints.audio.echoCancellation, true);
        return getUserMedia ? getUserMedia(stream) : stream();
      } },
    },
    document: { querySelector: node, querySelectorAll: () => [],
      createElement: element, addEventListener() {} },
  });
  vm.runInContext(source, context);
  return { node, streams, recognizers, stream,
    get requests() { return requests; }, get starts() { return starts; },
    acquire() { owner = true; adapter.acquired(); },
    suspend() { owner = false; adapter.suspend(); },
    recognize(text, isFinal = false) {
      const result = { 0: { transcript: text }, length: 1, isFinal };
      recognizers[0].onresult({ resultIndex: 0, results: [result] });
    },
    initialize: () => context.initializeMicrophone(),
    restore: () => context.restoreMicrophone(),
    setWakeGate({ ready = true, silenceMs = 500, startedAt = 50, contextIndex = 0 } = {}) {
      vm.runInContext(`voiceGateReady = ${JSON.stringify(ready)};
        wakeBurstSilenceBeforeMs = ${Number(silenceMs)};
        wakeBurstStartedAt = ${Number(startedAt)};
        wakeContextResultIndex = ${Number(contextIndex)};`, context);
    },
    flushTimers() {
      const pending = [...timers.values()]; timers.clear();
      for (const fn of pending) fn();
    },
  };
}

test('physical kiosk opens microphone and starts recognition without a click', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  assert.equal(p.requests, 1);
  assert.equal(p.starts, 1);
  assert.equal(p.node('#main-status').textContent, 'Esperando a ATLAS');
});

test('a fresh page after restart automatically starts again', async () => {
  for (let restart = 0; restart < 2; restart++) {
    const p = page(); p.acquire(); await tick(); p.flushTimers();
    assert.equal(p.starts, 1);
    p.suspend();
    assert.equal(p.streams[0].track.stopped, true);
  }
});

test('blocked pages do not open microphone; reacquisition resumes automatically', async () => {
  const p = page(); await p.restore(); assert.equal(p.requests, 0);
  p.acquire(); await tick();
  p.suspend(); assert.equal(p.streams[0].track.stopped, true);
  p.acquire(); await tick(); p.flushTimers();
  assert.equal(p.requests, 2);
  assert.equal(p.starts, 1);
});

test('concurrent init requests cannot create duplicate captures', async () => {
  const p = page(); p.acquire(); void p.initialize(); void p.restore(); await tick();
  await p.initialize(); assert.equal(p.requests, 1);
});

test('stale pending capture is stopped even after ownership is reacquired', async () => {
  const pending = [];
  const p = page({ getUserMedia: stream => new Promise(resolve => pending.push(() => resolve(stream()))) });
  p.acquire(); p.suspend(); p.acquire();
  assert.equal(p.requests, 2);
  pending[0](); await tick();
  assert.equal(p.streams[0].track.stopped, true);
  pending[1](); await tick();
  assert.equal(p.streams[1].track.stopped, false);
});

test('LAN clients request the microphone immediately, including their first visit', async () => {
  for (const permission of ['granted', 'prompt', 'denied']) {
    const p = page({ hostname: '192.168.1.142', permission });
    p.acquire(); await tick();
    assert.equal(p.requests, 1, permission);
  }
});

test('insecure origin does not attempt capture or display a false listening state', async () => {
  const p = page({ secure: false }); p.acquire(); await tick();
  assert.equal(p.requests, 0);
  assert.equal(p.node('#phase-label').textContent, 'MICRÓFONO BLOQUEADO');
});

test('denied microphone shows Chrome guidance without an application retry button', async () => {
  const p = page({ getUserMedia: () => { const error = new Error(); error.name = 'NotAllowedError'; throw error; } });
  p.acquire(); await tick(); p.flushTimers();
  assert.equal(p.requests, 1);
  assert.equal(p.node('#main-status').textContent, 'No puedo escuchar');
});

test('recognition permission error releases the microphone capture cleanly', async () => {
  const p = page(); p.acquire(); await tick();
  p.recognizers[0].onerror({ error: 'not-allowed' });
  assert.equal(p.streams[0].track.stopped, true);
});

test('wake word and request can be spoken continuously without losing the tail', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.recognize('ATLAS, qué hora es', true); await tick();
  assert.equal(p.starts, 1, 'the active recognition session is reused');
  assert.equal(p.node('#transcript').textContent, 'qué hora es');
  assert.equal(p.node('#main-status').textContent, 'Te escucho');
});

test('an interim continuous phrase is replaced by its final form without duplication', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.recognize('ATLAS qué hora', false); await tick();
  assert.equal(p.node('#transcript').textContent, 'qué hora');
  p.recognize('ATLAS qué hora es', true); await tick();
  assert.equal(p.node('#transcript').textContent, 'qué hora es');
  assert.doesNotMatch(p.node('#transcript').textContent, /atlas/i);
});

test('a bare wake word keeps listening for the following result', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.recognize('ATLAS', true); await tick();
  assert.equal(p.node('#transcript').textContent, 'Escuchando…');
  p.recognize('qué hora es', true); await tick();
  assert.equal(p.node('#transcript').textContent, 'qué hora es');
  assert.equal(p.starts, 1);
});

test('multiple changed recognition results preserve words after the wake word', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  const wake = { 0: { transcript: 'ATLAS' }, length: 1, isFinal: true };
  const request = { 0: { transcript: 'qué tiempo hace' }, length: 1, isFinal: false };
  p.recognizers[0].onresult({ resultIndex: 0, results: [wake, request] });
  await tick();
  assert.equal(p.node('#transcript').textContent, 'qué tiempo hace');
});

test('similar words do not trigger the wake flow', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.recognize('Atlassian qué hora es', true); await tick();
  assert.equal(p.node('#main-status').textContent, 'Esperando a ATLAS');
  assert.equal(p.starts, 1);
});

test('ATLAS mentioned inside an existing sentence is ignored', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.setWakeGate();
  p.recognize('pues sigo trabajando en el proyecto de ATLAS que empecé hace tiempo', true);
  await tick();
  assert.equal(p.node('#main-status').textContent, 'Esperando a ATLAS');
  assert.equal(p.starts, 1);
});

test('a direct wake word is ignored without four hundred milliseconds of prior silence', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.setWakeGate({ silenceMs: 399 });
  p.recognize('ATLAS qué hora es', true); await tick();
  assert.equal(p.node('#main-status').textContent, 'Esperando a ATLAS');
  assert.equal(p.starts, 1);
});

test('a direct wake word is accepted after four hundred milliseconds of silence', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.setWakeGate({ silenceMs: 400 });
  p.recognize('ATLAS qué hora es', true); await tick();
  assert.equal(p.node('#transcript').textContent, 'qué hora es');
  assert.equal(p.node('#main-status').textContent, 'Te escucho');
});
