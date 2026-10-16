const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const audio = [], requests = [], logs = [];
  class Media extends EventTarget {
    constructor() { super(); audio.push(this); this.loads = 0; this.plays = 0; }
    load() { this.loads++; }
    play() { this.plays++; }
    pause() { this.paused = true; }
    removeAttribute(name) { delete this[name]; }
  }
  const source = fs.readFileSync(`${__dirname}/static/app.js`, 'utf8');
  const start = source.indexOf('function prepareRealtimeExternalText(');
  const end = source.indexOf('async function playRealtimeExternalText(', start);
  const context = {
    AbortController, Audio: Media, performance: { now: () => 100 },
    preparedRealtimeSpeech: new Set(), addLog: (...args) => logs.push(args),
    accessFetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  };
  vm.runInNewContext(source.slice(start, end), context);
  return { ...context, audio, requests, logs, prepare: context.prepareRealtimeExternalText };
}

test('ticket starts streaming preload immediately, never waits for full MP3 or plays it', async () => {
  const f = fixture(); let ready = 0;
  const handle = f.prepare('Primera frase', 'elevenlabs', { onReady: () => ready++ });
  assert.equal(f.requests[0].url, '/api/tts/stream-ticket');
  f.requests[0].resolve({ ok: true, json: async () => ({ streamUrl: '/api/tts/stream/abc_123' }) });
  await handle.ready;
  assert.equal(f.audio[0].src, '/api/tts/stream/abc_123');
  assert.equal(f.audio[0].loads, 1); assert.equal(f.audio[0].plays, 0);
  f.audio[0].dispatchEvent(new Event('canplay')); assert.equal(ready, 1);
  handle.cancel(); handle.cancel();
  assert.equal(f.audio[0].src, undefined); assert.equal(f.audio[0].loads, 2);
  assert.equal(f.preparedRealtimeSpeech.size, 0);
  assert.equal(f.requests[0].options.signal.aborted, true);
});

test('cancel during ticket request cannot revive or preload late audio', async () => {
  const f = fixture(); const handle = f.prepare('texto', 'elevenlabs');
  handle.cancel(); f.requests[0].resolve({ ok: true, json: async () => ({ streamUrl: '/api/tts/stream/abc' }) });
  await handle.ready; assert.equal(f.audio.length, 0); assert.equal(f.preparedRealtimeSpeech.size, 0);
});

test('background failure is retained once for playback with no unhandled rejection', async () => {
  const f = fixture(); const handle = f.prepare('texto', 'elevenlabs');
  f.requests[0].reject(new Error('upstream unavailable')); await handle.ready;
  assert.equal(handle.error.message, 'upstream unavailable'); handle.cancel();
});

test('preload accepts only local ticket URL; native/browser speech never preloads', async () => {
  const f = fixture(); assert.equal(f.prepare('texto', 'browser'), null);
  assert.equal(f.prepare('texto', 'native'), null);
  const handle = f.prepare('texto', 'elevenlabs');
  f.requests[0].resolve({ ok: true, json: async () => ({ streamUrl: 'https://example.test/audio' }) });
  await handle.ready; assert.match(handle.error.message, /no válida/); assert.equal(f.audio.length, 0);
  handle.cancel();
});
