const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'static/app.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function page({ hostname = 'localhost', search = '?kiosk=1', permission = 'granted',
                secure = true, getUserMedia, realtime = false, settingsFetch } = {}) {
  let owner = false, adapter, requests = 0, starts = 0;
  const nodes = new Map(), timers = new Map(), recognizers = [];
  let timerId = 0;
  const element = () => ({ children: [], dataset: {}, hidden: false, disabled: false,
    textContent: '', value: '', events: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, addEventListener(name, fn) { this.events[name] = fn; },
    querySelector() { return this; },
    append(...items) { this.children.push(...items); },
  });
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const streams = [];
  const stream = () => {
    const track = { stopped: false, enabled: true, stop() { this.stopped = true; } };
    const result = { track, getTracks: () => [track], getAudioTracks: () => [track] };
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
    location: { hostname, search },
    speechSynthesis: { cancel() {} },
    addEventListener() {}, cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
    setInterval(fn) { intervals.set(++timerId, fn); return timerId; },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    atlasAccess: {
      hasControl: () => owner,
      bind(value) { adapter = value; },
      fetch: settingsFetch || (async url => ({ json: async () => url === '/api/health'
        ? { ready: true, openclaw: { model: 'test' } } : {} })),
    },
  };
  let realtimeCallbacks;
  const wakeCalls = [];
  const wakeRequests = [];
  const realtimeMock = {
    acceptWake: true,
    awaitingWakeRequest: false,
    async start() { realtimeCallbacks.onInputStream(stream()); },
    isIdle: () => true, isOutputActive: () => false,
    setLocalWakeDetectorReady() {},
    queueLocalWakeRequest(text, final) { wakeRequests.push({ text, final }); },
    authorizeLocalWake(text) {
      wakeCalls.push(text);
      if (this.acceptWake) {
        this.awaitingWakeRequest = true;
        realtimeCallbacks.setScreen('ESCUCHANDO', 'Te escucho', '', 'listening');
      }
      return this.acceptWake;
    },
  };
  if (realtime) window.AtlasRealtime = {
    create({ callbacks }) { realtimeCallbacks = callbacks; return realtimeMock; },
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
  return { node, streams, recognizers, stream, realtimeMock, wakeCalls, wakeRequests,
    get requests() { return requests; }, get starts() { return starts; },
    acquire() { owner = true; adapter.acquired(); },
    suspend() { owner = false; adapter.suspend(); },
    recognize(text, isFinal = false) {
      const result = { 0: { transcript: text }, length: 1, isFinal };
      recognizers[0].onresult({ resultIndex: 0, results: [result] });
    },
    initialize: () => context.initializeMicrophone(),
    restore: () => context.restoreMicrophone(),
    mergeFragments(current, next) {
      context.__current = current; context.__next = next;
      return vm.runInContext('mergeRecognitionFragments(__current, __next)', context);
    },
    gateA1Microphone(suppressed, delayMs = 200) {
      context.__gateSuppressed = suppressed;
      context.__gateDelay = delayMs;
      vm.runInContext(
        'setA1PlaybackMicrophoneSuppressed(__gateSuppressed, { delayMs: __gateDelay })',
        context,
      );
    },
    mute: value => context.setMicrophoneMuted(value),
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

test('reasoning selector saves every level and resets the session, not the context', async () => {
  const calls = [];
  const p = page({ realtime: true, settingsFetch: async (url, options = {}) => {
    calls.push({ url, options });
    const payload = JSON.parse(options.body || '{}');
    return { ok: true, json: async () => ({ realtimeReasoningEffort: payload.realtimeReasoningEffort || 'default' }) };
  } });
  p.acquire(); await tick(); calls.length = 0;
  let stops = 0, restarts = 0;
  p.realtimeMock.stop = () => { stops++; };
  p.realtimeMock.start = async () => { restarts++; };
  const select = p.node('#reasoning-effort');
  for (const effort of ['minimal', 'low', 'medium', 'high', 'xhigh', 'default']) {
    select.value = effort;
    await select.events.change();
    assert.equal(select.dataset.activeEffort, effort);
    assert.equal(select.value, effort);
    assert.equal(select.disabled, false);
  }
  assert.equal(stops, 6);
  assert.equal(restarts, 6);
  assert.equal(calls.length, 6);
  assert(calls.every(c => c.url === '/api/settings'));
  assert.equal(JSON.parse(calls.at(-1).options.body).realtimeReasoningEffort, 'default');
});

test('reasoning selector cannot interrupt an active answer or tool', async () => {
  const p = page({ realtime: true }); p.acquire(); await tick();
  p.realtimeMock.isIdle = () => false;
  p.realtimeMock.stop = () => { throw new Error('must not interrupt'); };
  const select = p.node('#reasoning-effort');
  select.dataset.activeEffort = 'low'; select.value = 'high';
  await select.events.change();
  assert.equal(select.value, 'low');
  assert.equal(select.disabled, false);
});

test('reasoning selector restores its previous level when saving fails', async () => {
  const p = page({ realtime: true, settingsFetch: async () => ({ ok: false,
    json: async () => ({ error: 'test failure' }) }) });
  p.acquire(); await tick();
  p.realtimeMock.stop = () => { throw new Error('must not restart on error'); };
  const select = p.node('#reasoning-effort');
  select.dataset.activeEffort = 'default'; select.value = 'xhigh';
  await select.events.change();
  assert.equal(select.value, 'default');
  assert.equal(select.disabled, false);
  assert.equal(p.node('#voice-provider').disabled, false);
});

test('progressive Chrome fragments retain the complete request', () => {
  const p = page();
  let text = '';
  for (const fragment of ['qué', 'qué es', 'es una', 'una Nintendo', 'Nintendo Switch', 'Switch']) {
    text = p.mergeFragments(text, fragment);
  }
  assert.equal(text, 'qué es una Nintendo Switch');
});

test('physical kiosk opens microphone and starts recognition without a click', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  assert.equal(p.requests, 1);
  assert.equal(p.starts, 1);
  assert.equal(p.node('#main-status').textContent, 'Esperando a ATLAS');
});

test('physical A1 disables its microphone for playback plus a 200 ms tail', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.gateA1Microphone(true);
  assert.equal(p.streams[0].track.enabled, false);
  p.gateA1Microphone(false, 200);
  assert.equal(p.streams[0].track.enabled, false, 'tail keeps the microphone closed');
  p.flushTimers();
  assert.equal(p.streams[0].track.enabled, true);
});

test('remote browsers are not affected by the A1 playback gate', async () => {
  const p = page({ search: '' }); p.acquire(); await tick(); p.flushTimers();
  p.gateA1Microphone(true);
  assert.equal(p.streams[0].track.enabled, true);
});

test('playback completion never overrides the manual mute', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.gateA1Microphone(true);
  p.mute(true);
  p.gateA1Microphone(false);
  p.flushTimers();
  assert.equal(p.streams[0].track.enabled, false);
});

test('unmuting during playback cannot reopen the A1 microphone', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.gateA1Microphone(true);
  p.mute(true); p.mute(false);
  assert.equal(p.streams[0].track.enabled, false);
  p.gateA1Microphone(false); p.flushTimers();
  assert.equal(p.streams[0].track.enabled, true);
});

test('retired recognizer cannot submit delayed playback transcripts', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  const retired = p.recognizers[0];
  p.gateA1Microphone(true);
  assert.equal(retired.onresult, null);
  assert.equal(retired.onend, null);
  p.gateA1Microphone(false); p.flushTimers(); p.flushTimers();
  assert.notEqual(p.recognizers.at(-1), retired);
  assert.equal(p.starts, 2);
});

test('losing control during the tail does not revive microphone capture', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  const track = p.streams[0].track;
  p.gateA1Microphone(true); p.gateA1Microphone(false); p.suspend();
  p.flushTimers();
  assert.equal(track.enabled, false);
  assert.equal(track.stopped, true);
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

test('bare Chrome detection accepts ATLAS anywhere in the phrase', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.setWakeGate();
  p.recognize('pues sigo trabajando en el proyecto de ATLAS que empecé hace tiempo', true);
  await tick();
  assert.equal(p.node('#main-status').textContent, 'Te escucho');
  assert.equal(p.starts, 1);
});

test('a direct wake word is accepted even without prior silence', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.setWakeGate({ silenceMs: 0 });
  p.recognize('ATLAS qué hora es', true); await tick();
  assert.equal(p.node('#transcript').textContent, 'qué hora es');
  assert.equal(p.node('#main-status').textContent, 'Te escucho');
  assert.equal(p.starts, 1);
});

test('a direct wake word is accepted after four hundred milliseconds of silence', async () => {
  const p = page(); p.acquire(); await tick(); p.flushTimers();
  p.setWakeGate({ silenceMs: 400 });
  p.recognize('ATLAS qué hora es', true); await tick();
  assert.equal(p.node('#transcript').textContent, 'qué hora es');
  assert.equal(p.node('#main-status').textContent, 'Te escucho');
});

test('Realtime Chrome detector ignores old finalized background before a new exact wake', async () => {
  const p = page({ realtime: true, search: '' }); p.acquire(); await p.initialize(); await tick(); p.flushTimers();
  p.recognize('estaba hablando de otro tema', true);
  const old = { 0: { transcript: 'estaba hablando de otro tema' }, isFinal: true };
  const wake = { 0: { transcript: 'Atlas' }, isFinal: false };
  // No new acoustic VAD boundary: its context index is still zero.
  p.recognizers[0].onresult({ resultIndex: 1, results: [old, wake] });
  assert.deepEqual(p.wakeCalls, ['ATLAS']);
  assert.equal(p.node('#main-status').textContent, 'Te escucho');
});

test('a temporarily refused Chrome wake is not marked accepted forever', async () => {
  const p = page({ realtime: true, search: '' }); p.acquire(); await p.initialize(); await tick(); p.flushTimers();
  p.realtimeMock.acceptWake = false;
  p.recognize('Atlas');
  p.realtimeMock.acceptWake = true;
  p.recognize('Atlas', true);
  assert.deepEqual(p.wakeCalls, ['ATLAS', 'ATLAS']);
  assert.equal(p.node('#main-status').textContent, 'Te escucho');
  p.recognize('Atlas', true);
  assert.equal(p.wakeCalls.length, 2, 'accepted result is deduplicated');
});

test('Realtime failures never activate the legacy OpenClaw conversation path', () => {
  assert.doesNotMatch(source, /realtimeFallbackActive\s*=\s*true/u);
  assert.doesNotMatch(source, /initializeMicrophone\(true\)/u);
  assert.match(source, /scheduleRealtimeReconnect\(error\)/u);
});

test('Realtime replaces RAM interim corrections instead of accumulating drafts', async () => {
  const p = page({ realtime: true }); p.acquire(); await p.initialize(); await tick(); p.flushTimers();
  for (const text of ['Atlas cua', 'Atlas cuánta me', 'Atlas cuánta memoria ra', 'Atlas cuánta memoria RAM queda libre']) {
    p.recognize(text);
  }
  p.recognize('Atlas cuánta memoria RAM queda libre', true);
  assert.deepEqual(p.wakeRequests.at(-1), { text: 'cuánta memoria RAM queda libre', final: true });
  assert.equal(p.wakeCalls.length, 1);
});

test('Realtime retains different final indices and removes withdrawn interim indices', async () => {
  const p = page({ realtime: true }); p.acquire(); await p.initialize(); await tick(); p.flushTimers();
  const result = (text, isFinal) => ({ 0: { transcript: text }, isFinal });
  const first = result('Atlas enciende la televisión', true);
  p.recognizers[0].onresult({ resultIndex: 0, results: [first, result('y comparte la', false)] });
  p.recognizers[0].onresult({ resultIndex: 1, results: [first, result('y comparte la pantalla', true)] });
  assert.equal(p.wakeRequests.at(-1).text, 'enciende la televisión y comparte la pantalla');
  p.recognizers[0].onresult({ resultIndex: 2, results: [first, result('y comparte la pantalla', true), result('un borrador', false)] });
  p.recognizers[0].onresult({ resultIndex: 2, results: [first, result('y comparte la pantalla', true)] });
  assert.equal(p.wakeRequests.at(-1).text, 'enciende la televisión y comparte la pantalla');
  assert.equal(p.wakeRequests.at(-1).final, true);
});

test('recognizer restart preserves the request but starts a new index range', async () => {
  const p = page({ realtime: true }); p.acquire(); await p.initialize(); await tick(); p.flushTimers();
  p.recognize('Atlas enciende la televisión', true);
  p.realtimeMock.localWakeRequestPending = true;
  p.recognizers[0].onend(); p.flushTimers();
  p.recognize('y abre Chrome', true);
  assert.equal(p.wakeRequests.at(-1).text, 'enciende la televisión y abre Chrome');
});
