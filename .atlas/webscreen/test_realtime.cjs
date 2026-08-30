const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = { setTimeout, clearTimeout };
let now = 0;
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
  performance: { now: () => now }, fetch: async () => { throw new Error('not used'); },
  setTimeout, clearTimeout, console, JSON, String, Number, RegExp, Object, Array, Error,
});

const { wakeInvocation, wakeHasRequest, silenceInvocation, withTurnSeparator } = window.AtlasRealtime._test;
assert.equal(wakeInvocation('Atlas, qué hora es'), true);
assert.equal(wakeInvocation('Oye Atlas, dime la hora'), true);
assert.equal(wakeInvocation('Adlas, mira el almacenamiento'), true);
assert.equal(wakeInvocation('Adelast, abre Prime Video'), true);
assert.equal(wakeInvocation('Estoy trabajando en el proyecto de Atlas'), false);
assert.equal(wakeHasRequest('Atlas'), false);
assert.equal(wakeHasRequest('Atlas, qué hora es'), true);
assert.equal(silenceInvocation('Atlas, calla calla'), true);
assert.equal(silenceInvocation('Adlas, calla calla'), true);
assert.equal(silenceInvocation('Atlas, nada nada nada'), true);
assert.equal(silenceInvocation('Atlas, no quiero que borres nada'), false);
assert.equal(withTurnSeparator('Dame un momento.'), 'Dame un momento. ');
assert.equal(withTurnSeparator('Dame un momento. '), 'Dame un momento. ');
assert.equal(withTurnSeparator(''), '');

const sent = [];
const idleScreens = [];
const controller = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }),
  callbacks: { setScreen: (...args) => idleScreens.push(args) } });
controller.closed = false;
controller.state = 'ready';
controller.channel = { readyState: 'open', send: value => sent.push(JSON.parse(value)) };
controller.attachRemoteAudio({ streams: [{ id: 'remote-stream' }] });
assert.equal(fakeAudio.srcObject.id, 'remote-stream');
assert.equal(fakeAudio.muted, true);
controller.beginSpeech();
controller.endSpeech();
assert.equal(idleScreens.some(screen => screen[1] === 'Te escucho'), false);
assert.equal(idleScreens.some(screen => screen[1] === 'ATLAS te ha escuchado'), false);
controller.preSpeechSilenceMs = 1000;
controller.handleUserTranscript({ transcript: 'Estoy hablando del proyecto Atlas' });
assert.equal(sent.some(event => event.type === 'response.create'), false);
controller.handleUserTranscript({ transcript: 'Atlas, dime quién eres' });
assert.equal(sent.at(-1).type, 'response.create');
assert.equal(fakeAudio.muted, false);
controller.setOutputEnabled(false);
assert.equal(fakeAudio.muted, true);

// A full direct request must survive a noisy VAD boundary even when the
// server reports less than 0.4 s before the utterance. A bare wake still keeps
// the anti-mention silence guard.
const noisySent = [];
const noisy = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
noisy.closed = false;
noisy.state = 'ready';
noisy.channel = { readyState: 'open', send: value => noisySent.push(JSON.parse(value)) };
noisy.preSpeechSilenceMs = 75;
noisy.handleUserTranscript({ transcript: 'Atlas' });
assert.equal(noisySent.some(event => event.type === 'response.create'), false);
noisy.handleUserTranscript({ transcript: 'Adlas, mira la memoria libre' });
assert.equal(noisySent.at(-1).type, 'response.create');

const renderedSegments = [];
const segmented = window.AtlasRealtime.create({
  fetch: async () => ({ ok: true }),
  callbacks: { setResponse: text => renderedSegments.push(text) },
});
segmented.closed = false;
segmented.state = 'ready';
segmented.handleEvent(JSON.stringify({ type: 'response.created' }));
segmented.handleAssistantText('Déjame revisar el ventilador.', true);
segmented.toolActive = true;
segmented.handleEvent(JSON.stringify({ type: 'response.done', response: { status: 'completed' } }));
segmented.toolActive = false;
segmented.handleEvent(JSON.stringify({ type: 'response.created' }));
segmented.handleAssistantText('Sí, el ventilador está funcionando a un nivel bajo.', true);
assert.equal(renderedSegments.at(-1), 'Sí, el ventilador está funcionando a un nivel bajo.');

// External TTS must not alternate between ACTUANDO and RESPONDIENDO for
// silent tool-only responses. RESPONDIENDO begins with actual text.
const externalScreens = [];
const external = window.AtlasRealtime.create({
  fetch: async () => ({ ok: true }),
  callbacks: { setScreen: (...args) => externalScreens.push(args) },
});
external.closed = false;
external.state = 'ready';
external.session = { atlasOutput: 'elevenlabs' };
external.toolActive = true;
external.handleEvent(JSON.stringify({ type: 'response.created' }));
assert.equal(externalScreens.some(screen => screen[1] === 'ATLAS está respondiendo'), false);
external.toolActive = false;
external.handleAssistantText('Hecho.', false);
assert.equal(externalScreens.at(-1)[1], 'ATLAS está respondiendo');

// A fast tool result must not start a second response while the real WebRTC
// output buffer is still playing. No guessed speech duration is involved.
const sequencedSent = [];
const sequenced = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
sequenced.closed = false;
sequenced.state = 'ready';
sequenced.session = { atlasOutput: 'native' };
sequenced.channel = { readyState: 'open', send: value => sequencedSent.push(JSON.parse(value)) };
now = 1000;
sequenced.responseStartedAt = now;
sequenced.currentAssistantText = 'Claro, voy a buscar el documento y ahora te digo cuál es.';
sequenced.handleEvent(JSON.stringify({ type: 'output_audio_buffer.started' }));
now = 1100;
sequenced.submitToolResult('call-fast', { output: 'atlas-presentacion.txt' });
assert.equal(sequencedSent.filter(event => event.type === 'response.create').length, 0);
assert.equal(sequenced.pendingToolResponse, true);
sequenced.handleEvent(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
assert.equal(sequencedSent.filter(event => event.type === 'response.create').length, 1);
assert.equal(sequenced.pendingToolResponse, false);

// Raw VAD must not own barge-in on the physical A1: its HDMI speaker can be
// heard by the separate USB microphone. Wait for a transcript and only cut
// the response when the person explicitly says ATLAS.
const interruptedSent = [];
const interrupted = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
interrupted.closed = false;
interrupted.state = 'ready';
interrupted.session = { atlasOutput: 'native' };
interrupted.conversationActive = true;
interrupted.responseActive = true;
interrupted.nativePlaybackActive = true;
interrupted.currentAssistantText = 'Es como una foto reciente de tu red guardada en el sistema.';
interrupted.channel = {
  readyState: 'open',
  send: value => interruptedSent.push(JSON.parse(value)),
  close() {},
};
now = 2000;
interrupted.beginSpeech();
assert.equal(interruptedSent.some(event => event.type === 'response.cancel'), false);
assert.equal(interruptedSent.some(event => event.type === 'output_audio_buffer.clear'), false);
interrupted.handleUserTranscript({ item_id: 'echo-1', transcript: 'Es como una foto reciente' });
assert.equal(interruptedSent.some(event => event.type === 'response.cancel'), false);
assert.equal(interruptedSent.some(event => event.type === 'response.create'), false);
assert.equal(interruptedSent.some(event => event.type === 'conversation.item.delete'), true);

interrupted.beginSpeech();
interrupted.handleUserTranscript({ item_id: 'person-1', transcript: 'Atlas, espera un momento' });
assert.equal(interruptedSent.some(event => event.type === 'response.cancel'), true);
assert.equal(interruptedSent.some(event => event.type === 'output_audio_buffer.clear'), true);
assert.equal(interruptedSent.filter(event => event.type === 'response.create').length, 1);
interrupted.stop(false);

// OpenAI may finish generating before Chrome finishes playing its buffered
// audio. ATLAS must still clear that audio when sami interrupts, without
// sending an invalid response.cancel for an already-finished response.
const bufferedSent = [];
const buffered = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
buffered.closed = false;
buffered.state = 'ready';
buffered.session = { atlasOutput: 'native' };
buffered.conversationActive = true;
buffered.responseActive = false;
buffered.nativePlaybackActive = true;
buffered.currentAssistantText = 'Esta respuesta ya terminó de generarse pero sigue sonando.';
buffered.channel = {
  readyState: 'open',
  send: value => bufferedSent.push(JSON.parse(value)),
  close() {},
};
buffered.beginSpeech();
buffered.handleUserTranscript({ item_id: 'person-buffered', transcript: 'Atlas, para un momento' });
assert.equal(bufferedSent.some(event => event.type === 'response.cancel'), false);
assert.equal(bufferedSent.some(event => event.type === 'output_audio_buffer.clear'), true);
assert.equal(bufferedSent.filter(event => event.type === 'response.create').length, 1);
buffered.stop(false);

const source = fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8');
assert.match(source, /interrupt_response:\s*false/);
assert.match(source, /language:\s*"es"/);
assert.match(source, /noise_reduction:\s*\{\s*type:\s*"far_field"\s*\}/);
assert.match(source, /session\.atlasContext/);
assert.match(source, /output_audio_buffer\.stopped/);
assert.doesNotMatch(source, /estimatedSpeechMs/);
console.log('realtime wake and silence filters: ok');
