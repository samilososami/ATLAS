const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/static/new/audio.js`, 'utf8');

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(fn);
  }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  emit(name, data = {}) { for (const fn of [...(this.listeners.get(name) || [])]) fn(data); }
}

function setup(design = 'new') {
  let now = 1000, timerId = 0, amplitude = 0;
  const timers = new Map(), contexts = [], calls = [];
  const window = new Events();
  window.AtlasFace = Object.fromEntries(['update', 'transcript', 'inputLevel', 'outputLevel', 'connection', 'speechBoundary', 'expression']
    .map(method => [method, value => calls.push({ method, value, at: now })]));
  window.AtlasFace.expression = value => { calls.push({ method: 'expression', value, at: now }); return true; };
  window.setInterval = (fn, ms) => { timers.set(++timerId, { fn, ms, at: now + ms }); return timerId; };
  window.clearInterval = id => timers.delete(id);
  class Context extends Events {
    constructor() { super(); this.state = 'running'; this.connections = []; this.nodes = []; this.destination = {}; this.resumes = 0; this.suspends = 0; contexts.push(this); }
    createMediaStreamSource(stream) {
      assert.ok(stream);
      const node = { connect: target => this.connections.push(target), disconnect() { this.disconnected = true; } };
      this.nodes.push(node);
      return node;
    }
    createAnalyser() {
      const node = { fftSize: 512, getFloatTimeDomainData: data => data.fill(amplitude),
        disconnect() { this.disconnected = true; } };
      this.nodes.push(node);
      return node;
    }
    resume() { this.resumes++; this.state = 'running'; this.emit('statechange'); return Promise.resolve(); }
    suspend() { this.suspends++; this.state = 'suspended'; this.emit('statechange'); return Promise.resolve(); }
    close() { this.state = 'closed'; this.emit('statechange'); return Promise.resolve(); }
  }
  window.AudioContext = Context;
  const document = new Events();
  document.body = { dataset: { design } }; document.hidden = false;
  vm.runInNewContext(source, { window, document, performance: { now: () => now }, Float32Array, console });
  function advance(ms) {
    const until = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; next[1].at += next[1].ms; next[1].fn();
    }
    now = until;
  }
  const bridge = window.AtlasFaceBridge;
  const last = method => calls.filter(call => call.method === method).at(-1)?.value;
  const audio = new Events(); audio.paused = false; audio.muted = false;
  const stream = { getTracks() { throw new Error('visuals must never stop playback tracks'); } };
  return { bridge, window, document, contexts, calls, timers, audio, stream, advance, last,
    amplitude(value) { amplitude = value; } };
}

test('debug route has no bridge, audio context, sampling or event listeners', () => {
  const p = setup('debug');
  assert.equal(p.bridge, undefined);
  assert.equal(p.contexts.length, 0);
  assert.equal(p.timers.size, 0);
  assert.equal(p.window.listeners.size, 0);
});

test('model expressions are narrow local visual data, with no audio sampling side effects', () => {
  const p = setup();
  assert.equal(p.bridge.expressionsAvailable(), true);
  assert.equal(p.bridge.expression({ expression: 'delighted', source: 'model', durationMs: 15000 }), true);
  assert.equal(p.last('expression').expression, 'delighted');
  assert.equal(p.contexts.length, 0);
  assert.equal(p.timers.size, 0);
  const before = p.calls.length;
  for (const value of [{ expression: 'invalid', source: 'model', durationMs: 1000 },
    { expression: 'angry', source: 'other', durationMs: 1000 },
    { expression: 'angry', source: 'model', durationMs: 0 },
    { expression: 'angry', source: 'model', durationMs: Infinity }]) {
    assert.equal(p.bridge.expression(value), false);
  }
  assert.equal(p.calls.length, before);
});

test('suspended/missing/failed face renderer cannot accept expressions or affect audio', () => {
  const p = setup();
  p.bridge.suspend();
  assert.equal(p.last('expression').expression, 'neutral');
  assert.equal(p.bridge.expressionsAvailable(), false);
  assert.equal(p.bridge.expression({ expression: 'angry', source: 'model', durationMs: 1000 }), false);
  p.bridge.resume();
  p.window.AtlasFace.expression = () => { throw new Error('rendering failure'); };
  assert.equal(p.bridge.expression({ expression: 'wink', source: 'model', durationMs: 1000 }), false);
  delete p.window.AtlasFace.expression;
  assert.equal(p.bridge.expressionsAvailable(), false);
  assert.equal(p.contexts.length, 0);
});

test('only wake-approved listening phases show waveform, not connecting or ambient levels', () => {
  const p = setup();
  p.bridge.update({ state: 'listening', phase: 'GPT LIVE', title: 'Conectando' });
  assert.equal(p.last('update').state, 'connecting');
  p.bridge.update({ state: 'idle', phase: 'EN ESPERA' });
  const count = p.calls.length;
  p.bridge.inputLevel({ rms: 0.3, peak: 0.8 });
  assert.equal(p.calls.length, count);
  p.bridge.update({ state: 'listening', phase: 'ESCUCHANDO' });
  assert.equal(p.last('update').state, 'listening');
  p.bridge.inputLevel({ rms: 0.1, peak: 0.2 });
  assert.equal(p.last('inputLevel').rms, 0.1);
  assert.equal(p.last('inputLevel').db, -20);
});

test('authorized input silence becomes thinking and resumed real speech becomes waveform', () => {
  const p = setup();
  p.bridge.update({ state: 'listening', phase: 'ESCUCHANDO' });
  p.bridge.inputLevel({ rms: 0.1, peak: 0.3 });
  p.advance(499); p.bridge.inputLevel({ rms: 0, peak: 0 });
  assert.equal(p.last('update').state, 'listening');
  p.advance(2); p.bridge.inputLevel({ rms: 0, peak: 0 });
  assert.equal(p.last('update').state, 'working');
  p.bridge.inputLevel({ rms: 0.08, peak: 0.2 });
  assert.equal(p.last('update').state, 'listening');
});

test('new wake clears old transcript, mutable input and microphone mute close waveform', () => {
  const p = setup();
  p.bridge.update({ state: 'listening', phase: 'ESCUCHANDO' });
  assert.equal(p.last('transcript'), '');
  p.bridge.transcript('Pon mú'); p.bridge.transcript('Pon música');
  assert.equal(p.last('transcript'), 'Pon música');
  p.bridge.microphoneMuted(true);
  assert.equal(p.last('update').state, 'idle');
  p.bridge.inputLevel({ rms: 0.6, peak: 1 });
  assert.equal(p.last('inputLevel').rms, 0);
});

test('generated text/queued speech is not playback and never moves the mouth', () => {
  const p = setup();
  p.bridge.update({ state: 'speaking', phase: 'HABLANDO' });
  assert.equal(p.last('update').state, 'working');
  assert.equal(p.timers.size, 0);
});

test('WebRTC tap reads genuine RMS and never connects to a speaker destination', () => {
  const p = setup();
  p.bridge.outputStream(p.stream, p.audio);
  p.bridge.outputEnabled(true);
  p.amplitude(0.125);
  p.bridge.outputPlayback(true);
  assert.equal(p.last('update').state, 'speaking');
  assert.equal(p.last('outputLevel').rms, 0.125);
  assert.equal(p.last('outputLevel').peak, 0.125);
  assert.ok(Math.abs(p.last('outputLevel').db - (-18.06179974)) < 0.00001);
  assert.equal(p.contexts.length, 1);
  assert.ok(p.contexts[0].connections.every(node => node !== p.contexts[0].destination));
  p.amplitude(0); p.advance(35);
  assert.equal(p.last('outputLevel').rms, 0);
  assert.equal(p.last('update').state, 'speaking'); // a spoken pause, not completed playback
});

test('buffered output survives model completion and sampling stops at actual buffer end', () => {
  const p = setup();
  p.bridge.update({ state: 'working', phase: 'RESPONDIENDO' });
  p.bridge.outputStream(p.stream, p.audio); p.bridge.outputPlayback(true);
  p.bridge.update({ state: 'idle', phase: 'EN ESPERA' });
  assert.equal(p.last('update').state, 'speaking');
  p.bridge.outputPlayback(false);
  assert.equal(p.last('update').state, 'idle');
  assert.equal(p.last('outputLevel').rms, 0);
  assert.equal(p.timers.size, 0);
});

test('native mute prevents silent playback animation and unmute resumes actual buffer', () => {
  const p = setup();
  p.audio.muted = true;
  p.bridge.outputStream(p.stream, p.audio); p.bridge.outputPlayback(true);
  assert.notEqual(p.last('update').state, 'speaking');
  assert.equal(p.timers.size, 0);
  p.audio.muted = false; p.bridge.outputEnabled(true);
  assert.equal(p.last('update').state, 'speaking');
  p.audio.muted = true; p.bridge.outputEnabled(false);
  assert.notEqual(p.last('update').state, 'speaking');
  assert.equal(p.timers.size, 0);
});

test('buffer-start preceding HTMLAudio playing waits for sound and resumes after waiting', () => {
  const p = setup();
  p.audio.paused = true;
  p.bridge.outputStream(p.stream, p.audio); p.bridge.outputPlayback(true);
  assert.equal(p.timers.size, 0);
  assert.notEqual(p.last('update').state, 'speaking');
  p.audio.paused = false; p.audio.emit('playing');
  assert.equal(p.last('update').state, 'speaking');
  assert.equal(p.timers.size, 1);
  p.audio.emit('waiting');
  assert.notEqual(p.last('update').state, 'speaking');
  assert.equal(p.timers.size, 0);
  p.audio.emit('playing'); assert.equal(p.timers.size, 1);
  p.audio.volume = 0; p.audio.emit('volumechange'); assert.equal(p.timers.size, 0);
  p.audio.volume = 1; p.audio.emit('volumechange'); assert.equal(p.timers.size, 1);
  p.bridge.reset();
  assert.ok([...p.audio.listeners.values()].every(set => set.size === 0));
  p.audio.emit('playing'); assert.equal(p.timers.size, 0);
});

test('backend health cannot show a connected dot before Realtime is ready or after error', () => {
  const p = setup();
  p.bridge.connection({ healthy: true, label: 'Backend preparado' });
  assert.equal(p.last('connection').healthy, false);
  p.bridge.update({ state: 'idle', phase: 'EN ESPERA' });
  assert.equal(p.last('connection').healthy, true);
  p.bridge.update({ state: 'error', phase: 'ERROR REALTIME' });
  assert.equal(p.last('connection').healthy, false);
});

test('stream replacement and reset disconnect taps and release context, never audio tracks', () => {
  const p = setup();
  p.bridge.outputStream(p.stream, p.audio); const oldNodes = [...p.contexts[0].nodes];
  p.bridge.outputStream(p.stream, p.audio);
  assert.ok(oldNodes.every(node => node.disconnected));
  p.bridge.outputPlayback(true); p.bridge.reset();
  assert.equal(p.timers.size, 0);
  assert.equal(p.contexts[0].state, 'closed');
  assert.ok(p.contexts[0].nodes.every(node => node.disconnected));
});

test('external player only follows playing events and keeps original playback untouched', () => {
  const p = setup();
  p.audio.captureStream = () => p.stream;
  p.audio.play = p.audio.pause = () => { throw new Error('visuals cannot control audible playback'); };
  p.bridge.update({ state: 'working', phase: 'GENERANDO VOZ' });
  const stop = p.bridge.watchAudio(p.audio);
  assert.equal(p.contexts.length, 0);
  p.audio.emit('playing');
  assert.equal(p.last('update').state, 'speaking');
  assert.equal(p.contexts.length, 1);
  p.audio.emit('waiting');
  assert.equal(p.last('update').state, 'working');
  assert.equal(p.timers.size, 0);
  p.audio.emit('playing'); p.audio.emit('ended'); stop();
  assert.equal(p.contexts[0].state, 'closed');
  assert.ok([...p.audio.listeners.values()].every(set => set.size === 0));
});

test('unsupported external capture reports unavailable instead of fabricating amplitude', () => {
  const p = setup();
  const stop = p.bridge.watchAudio(p.audio); p.audio.emit('playing');
  assert.equal(p.last('outputLevel').available, false);
  assert.equal(p.last('outputLevel').rms, 0);
  stop();
});

test('browser synthesis follows real start/word/pause/end without synthetic dB', () => {
  const p = setup(); const utterance = new Events();
  p.bridge.update({ state: 'working', phase: 'RESPONDIENDO' });
  const stop = p.bridge.watchUtterance(utterance);
  assert.equal(p.last('update').state, 'working');
  utterance.emit('start');
  assert.equal(p.last('update').state, 'speaking');
  assert.equal(p.last('outputLevel').available, false);
  utterance.emit('boundary', { name: 'word', charIndex: 6, charLength: 5 });
  assert.deepEqual({ ...p.last('speechBoundary') }, { type: 'word', charIndex: 6, charLength: 5, source: 'speechSynthesis.boundary' });
  utterance.emit('pause');
  assert.equal(p.last('update').state, 'working');
  utterance.emit('resume'); assert.equal(p.last('update').state, 'speaking');
  utterance.emit('end'); stop();
  assert.equal(p.last('speechBoundary').type, 'end');
  assert.equal(p.timers.size, 0);
});

test('ownership loss/pagehide clear meter, subscriptions and transcripts; stale events cannot resurrect', () => {
  const p = setup(); const utterance = new Events();
  p.bridge.watchUtterance(utterance); utterance.emit('start');
  p.bridge.outputStream(p.stream, p.audio); p.bridge.outputPlayback(true);
  p.window.emit('pagehide');
  assert.equal(p.timers.size, 0);
  assert.equal(p.last('update').state, 'connecting');
  assert.equal(p.last('transcript'), '');
  assert.equal(p.last('outputLevel').rms, 0);
  assert.equal(p.contexts[0].state, 'closed');
  const count = p.calls.length;
  utterance.emit('start'); utterance.emit('boundary'); p.bridge.inputLevel({ rms: 1, peak: 1 });
  assert.equal(p.calls.length, count);
  p.bridge.resume(); p.bridge.update({ state: 'idle', phase: 'EN ESPERA' });
  assert.equal(p.last('update').state, 'idle');
});

test('background visibility suspends visual sampling without stopping the speaker', () => {
  const p = setup(); p.bridge.outputStream(p.stream, p.audio); p.bridge.outputPlayback(true);
  p.document.hidden = true; p.document.emit('visibilitychange');
  assert.equal(p.timers.size, 0);
  assert.equal(p.contexts[0].state, 'suspended');
  assert.equal(p.audio.paused, false);
  p.document.hidden = false; p.document.emit('visibilitychange');
  assert.equal(p.timers.size, 1);
  assert.equal(p.contexts[0].state, 'running');
  p.bridge.reset();
});

test('private analyser context is suspended at idle and after buffer end without stopping the player', async () => {
  const p = setup(); p.bridge.outputStream(p.stream, p.audio);
  const context = p.contexts[0];
  assert.equal(context.state, 'suspended');
  assert.equal(context.resumes, 0);
  await Promise.resolve();
  p.bridge.outputPlayback(true); assert.equal(context.state, 'running');
  p.bridge.outputPlayback(false); assert.equal(context.state, 'suspended');
  assert.equal(p.audio.paused, false);
  assert.equal(p.audio.muted, false);
  assert.equal(context.connections.includes(context.destination), false);
});

test('a stalled resume cannot delay hide and its late completion is suspended again', async () => {
  const p = setup(); p.bridge.outputStream(p.stream, p.audio);
  const context = p.contexts[0];
  await Promise.resolve();
  let resume;
  context.resume = () => { context.resumes++; return new Promise(resolve => { resume = () => {
    context.state = 'running'; context.emit('statechange'); resolve();
  }; }); };
  p.bridge.outputPlayback(true);
  assert.equal(context.resumes, 1);
  p.document.hidden = true; p.document.emit('visibilitychange');
  assert.equal(context.state, 'suspended');
  assert.equal(p.timers.size, 0);
  await Promise.resolve();
  resume(); await Promise.resolve(); await Promise.resolve();
  assert.equal(context.state, 'suspended');
  assert.equal(context.resumes, 1);
  assert.equal(p.audio.paused, false);
  assert.equal(p.timers.size, 0);
});

test('late suspend cannot leave visible active playback without an analyser', async () => {
  const p = setup(); p.bridge.outputStream(p.stream, p.audio);
  const context = p.contexts[0];
  await Promise.resolve();
  p.bridge.outputPlayback(true); await Promise.resolve();
  let suspend;
  context.suspend = () => { context.suspends++; return new Promise(resolve => { suspend = () => {
    context.state = 'suspended'; context.emit('statechange'); resolve();
  }; }); };
  p.document.hidden = true; p.document.emit('visibilitychange');
  p.document.hidden = false; p.document.emit('visibilitychange');
  await Promise.resolve();
  suspend(); await Promise.resolve(); await Promise.resolve();
  assert.equal(context.state, 'running');
  assert.equal(p.timers.size, 1);
  assert.equal(p.audio.paused, false);
});

test('late context transitions after reset cannot reopen a retired analyser or sample it', async () => {
  const p = setup(); p.bridge.outputStream(p.stream, p.audio);
  const context = p.contexts[0];
  await Promise.resolve();
  let complete;
  context.resume = () => { context.resumes++; return new Promise(resolve => { complete = resolve; }); };
  p.bridge.outputPlayback(true); p.bridge.reset();
  complete(); await Promise.resolve(); await Promise.resolve();
  assert.equal(context.state, 'closed');
  assert.equal(context.resumes, 1);
  assert.equal(p.timers.size, 0);
  assert.equal(context.listeners.get('statechange').size, 0);
});

test('visual exceptions cannot propagate into the shared voice controller', () => {
  const p = setup();
  p.window.AtlasFace.update = () => { throw new Error('broken renderer'); };
  assert.doesNotThrow(() => p.bridge.update({ state: 'listening', phase: 'ESCUCHANDO' }));
  assert.doesNotThrow(() => p.bridge.inputLevel({ rms: 0.2, peak: 0.4 }));
});
