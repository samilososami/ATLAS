const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
const fakeAudio = {
  autoplay: false, playsInline: false, volume: 0, muted: false, paused: true,
  isConnected: true, srcObject: null, plays: 0,
  play() { this.paused = false; this.plays += 1; return Promise.resolve(); },
  pause() { this.paused = true; },
};
vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), {
  window, crypto: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
  navigator: {}, RTCPeerConnection: undefined, MediaStream: class {}, AudioContext: class {},
  document: { querySelector: () => fakeAudio, createElement: () => fakeAudio, body: { append() {} } },
  performance: { now: () => 0 }, fetch: async () => { throw new Error('not used'); },
  setTimeout, clearTimeout, console, JSON, String, Number, RegExp, Object, Array, Error,
});

const { wakeInvocation, silenceInvocation, withTurnSeparator } = window.AtlasRealtime._test;
assert.equal(wakeInvocation('Atlas, qué hora es'), true);
assert.equal(wakeInvocation('Oye Atlas, dime la hora'), true);
assert.equal(wakeInvocation('Estoy trabajando en el proyecto de Atlas'), false);
assert.equal(silenceInvocation('Atlas, calla calla'), true);
assert.equal(silenceInvocation('Atlas, nada nada nada'), true);
assert.equal(silenceInvocation('Atlas, no quiero que borres nada'), false);
assert.equal(withTurnSeparator('Dame un momento.'), 'Dame un momento. ');
assert.equal(withTurnSeparator('Dame un momento. '), 'Dame un momento. ');
assert.equal(withTurnSeparator(''), '');

const sent = [];
const controller = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
controller.closed = false;
controller.state = 'ready';
controller.channel = { readyState: 'open', send: value => sent.push(JSON.parse(value)) };
controller.attachRemoteAudio({ streams: [{ id: 'remote-stream' }] });
assert.equal(fakeAudio.srcObject.id, 'remote-stream');
assert.equal(fakeAudio.muted, true);
controller.preSpeechSilenceMs = 1000;
controller.handleUserTranscript({ transcript: 'Estoy hablando del proyecto Atlas' });
assert.equal(sent.some(event => event.type === 'response.create'), false);
controller.handleUserTranscript({ transcript: 'Atlas, dime quién eres' });
assert.equal(sent.at(-1).type, 'response.create');
assert.equal(fakeAudio.muted, false);
controller.setOutputEnabled(false);
assert.equal(fakeAudio.muted, true);
console.log('realtime wake and silence filters: ok');
