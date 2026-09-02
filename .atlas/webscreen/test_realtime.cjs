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

const { wakeInvocation, wakeHasRequest, silenceInvocation, withTurnSeparator,
  commandLabel, responseExpectsReply, likelyAssistantEcho, captureConstraints } = window.AtlasRealtime._test;
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
assert.equal(commandLabel('atlas-status'), 'atlas-status');
assert.equal(commandLabel('  vcgencmd   measure_temp\n'), 'vcgencmd measure_temp');
assert.equal(responseExpectsReply('¿Quieres que mire algo más?'), true);
assert.equal(responseExpectsReply('¿Quieres que mire algo más?»'), true);
assert.equal(responseExpectsReply('La temperatura es de 48 grados.'), false);
assert.equal(likelyAssistantEcho('El agente que', 'Soy ATLAS, el agente que vive en tu Raspberry Pi.'), true);
assert.equal(likelyAssistantEcho('El agente', 'Soy ATLAS, el agente físico de OpenATLAS.'), true);
assert.equal(likelyAssistantEcho('Espera, mira primero la memoria', 'Te estaba explicando el almacenamiento.'), false);
assert.equal(captureConstraints().audio.echoCancellation, true);

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
controller.authorizeLocalWake('ATLAS, dime quién eres');
controller.handleUserTranscript({ transcript: 'Atlas, dime quién eres' });
controller.flushResponseAfterInput();
assert.equal(sent.at(-1).type, 'response.create');
assert.equal(fakeAudio.muted, false);
controller.setOutputEnabled(false);
assert.equal(fakeAudio.muted, true);

// Only Chrome wakes ATLAS. Realtime is not a second wake detector, even if
// its background transcript contains the exact word.
const strictSent = [];
const strictScreens = [];
const strict = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }),
  callbacks: { setScreen: (...args) => strictScreens.push(args) } });
strict.closed = false;
strict.state = 'ready';
strict.channel = { readyState: 'open', send: value => strictSent.push(JSON.parse(value)) };
strict.setLocalWakeDetectorReady(true);
strict.preSpeechSilenceMs = 2000;
strict.handleUserTranscript({ item_id: 'false-atlas', transcript: 'Adlas, qué hora es' });
strict.flushResponseAfterInput();
assert.equal(strictSent.some(event => event.type === 'response.create'), false);
assert.equal(strictSent.some(event => event.type === 'conversation.item.delete'), true);
strict.handleUserTranscript({ item_id: 'mention', transcript: 'El proyecto de Atlas está listo' });
assert.equal(strict.conversationActive, false);
strict.handleUserTranscript({ item_id: 'bare-atlas', transcript: 'Atlas' });
assert.equal(strict.conversationActive, false);
assert.equal(strictSent.some(event => event.type === 'response.create'), false);
strict.authorizeLocalWake('ATLAS, qué hora es');
assert.equal(strictScreens.at(-1)[1], 'Te escucho');
strict.handleUserTranscript({ item_id: 'real-atlas', transcript: 'ATLAS, qué hora es' });
strict.flushResponseAfterInput();
assert.equal(strictSent.filter(event => event.type === 'response.create').length, 1);

// No fallback to Realtime wake detection if Chrome is unavailable. Chrome
// authorization works without a prior silence or VAD score.
const noisySent = [];
const noisy = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
noisy.closed = false;
noisy.state = 'ready';
noisy.channel = { readyState: 'open', send: value => noisySent.push(JSON.parse(value)) };
noisy.preSpeechSilenceMs = 75;
noisy.handleUserTranscript({ transcript: 'Atlas' });
assert.equal(noisySent.some(event => event.type === 'response.create'), false);
assert.equal(noisy.conversationActive, false);
noisy.authorizeLocalWake('ATLAS, mira la memoria libre');
noisy.handleUserTranscript({ transcript: 'Adlas, mira la memoria libre' });
noisy.flushResponseAfterInput();
assert.equal(noisySent.at(-1).type, 'response.create');

// Server VAD can split one natural request and deliver the first transcript
// after the second speech burst has already started. Both items must produce
// one response, and the continuation does not need to repeat ATLAS.
const splitSent = [];
const split = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
split.closed = false;
split.state = 'ready';
split.channel = { readyState: 'open', send: value => splitSent.push(JSON.parse(value)) };
now = 10000;
split.authorizeLocalWake('ATLAS');
split.beginSpeech();
split.endSpeech();
now = 10250;
split.beginSpeech();
split.handleUserTranscript({ item_id: 'split-1', transcript: 'Atlas, enciende la televisión y comparte la pantalla.' });
assert.equal(splitSent.some(event => event.type === 'response.create'), false);
now = 12000;
split.endSpeech();
split.handleUserTranscript({ item_id: 'split-2', transcript: 'Y abre Chrome en la primera mitad del escritorio.' });
assert.equal(splitSent.some(event => event.type === 'response.create'), false);
split.flushResponseAfterInput();
assert.equal(splitSent.filter(event => event.type === 'response.create').length, 1);

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

// Physical A1 playback now rejects every interruption, including explicit
// ATLAS. Remote full-duplex behavior remains covered separately below.
const interruptedSent = [];
const interrupted = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {},
  physicalAtlasA1: true, browserNativeAec: false });
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
interrupted.endSpeech();
assert.equal(interruptedSent.some(event => event.type === 'response.cancel'), false);
assert.equal(interruptedSent.some(event => event.type === 'output_audio_buffer.clear'), false);
interrupted.handleUserTranscript({ item_id: 'echo-1', transcript: 'Es como una foto reciente' });
assert.equal(interruptedSent.some(event => event.type === 'response.cancel'), false);
assert.equal(interruptedSent.some(event => event.type === 'response.create'), false);
assert.equal(interruptedSent.some(event => event.type === 'conversation.item.delete'), true);

interrupted.beginSpeech();
interrupted.endSpeech();
interrupted.handleUserTranscript({ item_id: 'person-1', transcript: 'Atlas, espera un momento' });
interrupted.flushResponseAfterInput();
assert.equal(interruptedSent.some(event => event.type === 'response.cancel'), false);
assert.equal(interruptedSent.some(event => event.type === 'output_audio_buffer.clear'), false);
assert.equal(interruptedSent.filter(event => event.type === 'response.create').length, 0);
interrupted.stop(false);

// Multiple captured fragments must not turn into ghost user turns, including
// a non-echo sentence or a differently transcribed word during A1 playback.
const naturalSent = [];
const natural = window.AtlasRealtime.create({
  fetch: async () => ({ ok: true }),
  physicalAtlasA1: true,
  browserNativeAec: false,
  callbacks: {},
});
natural.closed = false;
natural.state = 'ready';
natural.session = { atlasOutput: 'native' };
natural.conversationActive = true;
natural.responseActive = true;
natural.nativePlaybackActive = true;
natural.currentAssistantText = 'Te estaba explicando el estado del sistema.';
natural.channel = { readyState: 'open', send: value => naturalSent.push(JSON.parse(value)), close() {} };
natural.beginSpeech();
natural.endSpeech();
natural.beginSpeech();
natural.endSpeech();
assert.equal(naturalSent.some(event => event.type === 'response.cancel'), false,
  'A1 VAD alone never cuts the answer');
natural.handleUserTranscript({ item_id: 'echo-first', transcript: 'Te estaba explicando' });
natural.handleUserTranscript({ item_id: 'echo-second', transcript: 'El estado del sistema' });
natural.beginSpeech();
natural.endSpeech();
natural.handleUserTranscript({ item_id: 'echo-mistranscribed', transcript: 'Sorry.' });
assert.equal(naturalSent.some(event => event.type === 'response.cancel'), false,
  'every overlapping assistant echo remains classified as output');
assert.equal(naturalSent.filter(event => event.type === 'conversation.item.delete').length, 3);

natural.beginSpeech();
natural.endSpeech();
natural.handleUserTranscript({ item_id: 'natural-person', transcript: 'Espera, mira primero la memoria' });
assert.equal(naturalSent.some(event => event.type === 'response.cancel'), false,
  'even semantically different speech cannot interrupt A1 playback');
natural.flushResponseAfterInput();
assert.equal(naturalSent.filter(event => event.type === 'response.create').length, 0);
natural.stop(false);

// Echo reference survives response.created resets around tool calls.
const residualSent = [];
const residual = window.AtlasRealtime.create({
  fetch: async () => ({ ok: true }), physicalAtlasA1: true, browserNativeAec: false, callbacks: {},
});
residual.closed = false;
residual.state = 'ready';
residual.session = { atlasOutput: 'browser' };
residual.conversationActive = true;
residual.externalPlaybackActive = true;
residual.currentAssistantText = 'Soy ATLAS, el agente que vive en una Raspberry Pi.';
residual.channel = { readyState: 'open', send: value => residualSent.push(JSON.parse(value)), close() {} };
residual.handleEvent(JSON.stringify({ type: 'response.created' }));
residual.beginSpeech();
residual.endSpeech();
residual.handleUserTranscript({ item_id: 'residual-echo', transcript: 'El agente que' });
assert.equal(residualSent.some(event => event.type === 'response.cancel'), false);
assert.equal(residualSent.some(event => event.type === 'conversation.item.delete'), true);
residual.stop(false);

// A laptop keeps the normal provider/Chrome path: no A1 heuristics and no
// browser-side response.cancel duplicate while provider VAD owns barge-in.
const remoteSent = [];
const remote = window.AtlasRealtime.create({
  fetch: async () => ({ ok: true }), physicalAtlasA1: false,
  callbacks: {},
});
remote.closed = false;
remote.state = 'ready';
remote.session = { atlasOutput: 'native' };
remote.conversationActive = true;
remote.responseActive = true;
remote.nativePlaybackActive = true;
remote.currentAssistantText = 'Esta respuesta suena en el portátil.';
remote.firstOutputSeen = true;
remote.channel = { readyState: 'open', send: value => remoteSent.push(JSON.parse(value)), close() {} };
remote.beginSpeech();
assert.equal(remoteSent.some(event => event.type === 'response.cancel'), false);
remote.endSpeech();
remote.handleUserTranscript({ item_id: 'remote-person', transcript: 'Espera, cambia de tema' });
remote.responseActive = false;
remote.nativePlaybackActive = false;
remote.flushResponseAfterInput();
assert.equal(remoteSent.filter(event => event.type === 'response.create').length, 1);
remote.stop(false);

// Generation finishing is not playback finishing: the A1 still rejects
// interruptions while its buffered audio is playing.
const bufferedSent = [];
const buffered = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {},
  physicalAtlasA1: true, browserNativeAec: false });
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
buffered.endSpeech();
buffered.handleUserTranscript({ item_id: 'person-buffered', transcript: 'Atlas, para un momento' });
buffered.flushResponseAfterInput();
assert.equal(bufferedSent.some(event => event.type === 'response.cancel'), false);
assert.equal(bufferedSent.some(event => event.type === 'output_audio_buffer.clear'), false);
assert.equal(bufferedSent.filter(event => event.type === 'response.create').length, 0);
buffered.stop(false);

// Chrome's independent recognizer also hears the A1 speaker. If ATLAS says
// its own name, matching assistant speech must not authorize a self-barge-in.
const selfWakeSent = [];
const selfWake = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {}, physicalAtlasA1: true });
selfWake.closed = false;
selfWake.state = 'ready';
selfWake.session = { atlasOutput: 'browser' };
selfWake.conversationActive = true;
selfWake.externalPlaybackActive = true;
selfWake.currentAssistantText = 'Soy ATLAS. Puedo controlar el sistema y ayudarte con el proyecto.';
selfWake.channel = { readyState: 'open', send: value => selfWakeSent.push(JSON.parse(value)), close() {} };
assert.equal(selfWake.authorizeLocalWake('ATLAS'), false);
assert.equal(selfWake.externalPlaybackActive, true);
assert.equal(selfWakeSent.some(event => event.type === 'response.cancel'), false);
selfWake.stop(false);

const source = fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8');
const appSource = fs.readFileSync(`${__dirname}/static/app.js`, 'utf8');
assert.match(source, /interrupt_response:\s*!this\.physicalAtlasA1/);
assert.match(source, /language:\s*"es"/);
assert.match(source, /noise_reduction:\s*\{\s*type:\s*"far_field"\s*\}/);
assert.match(source, /session\.atlasContext/);
assert.match(source, /output_audio_buffer\.stopped/);
assert.match(source, /localWakeDetectorReady/);
assert.doesNotMatch(source, /prompt:\s*"Conversación en español/);
assert.doesNotMatch(source, /estimatedSpeechMs/);
assert.match(appSource, /attachRealtimeWakeInput/);
assert.match(appSource, /realtimeController\?\.authorizeLocalWake/);

// The local wake UI must remain on "Te escucho" after a bare wake instead of
// being overwritten immediately by the generic follow-up label.
const bareScreens = [];
const bare = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }),
  callbacks: { setScreen: (...args) => bareScreens.push(args) } });
bare.closed = false;
bare.state = 'ready';
bare.channel = { readyState: 'open', send() {}, close() {} };
bare.setLocalWakeDetectorReady(true);
bare.authorizeLocalWake('ATLAS');
bare.handleUserTranscript({ item_id: 'bare-wake', transcript: 'ATLAS' });
assert.equal(bareScreens.at(-1)[1], 'Te escucho');
assert.equal(bare.awaitingWakeRequest, true);
bare.stop(false);

// On the A1 the request captured alongside Chrome's wake is authoritative.
const fallbackSent = [];
const fallback = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }),
  callbacks: {}, physicalAtlasA1: true });
fallback.closed = false;
fallback.state = 'ready';
fallback.session = { atlasOutput: 'native' };
fallback.channel = { readyState: 'open', send: value => fallbackSent.push(JSON.parse(value)), close() {} };
fallback.setLocalWakeDetectorReady(true);
fallback.handleEvent(JSON.stringify({ type: 'input_audio_buffer.speech_started', item_id: 'late-copy' }));
fallback.authorizeLocalWake('ATLAS');
assert.equal(fallback.conversationActive, true);
assert.equal(fallback.awaitingWakeRequest, true);
fallback.queueLocalWakeRequest('descríbete y dime qué puedes hacer', true);
fallback.endSpeech();
fallback.submitLocalWakeRequest();
assert.equal(fallbackSent.some(event => event.type === 'conversation.item.create'
  && event.item.content[0].text === 'descríbete y dime qué puedes hacer'), true);
assert.equal(fallbackSent.filter(event => event.type === 'response.create').length, 1);
fallback.handleUserTranscript({ item_id: 'late-copy', transcript: 'Descríbete y dime qué puedes hacer.' });
assert.equal(fallbackSent.filter(event => event.type === 'response.create').length, 1);
assert.equal(fallbackSent.some(event => event.type === 'conversation.item.delete'
  && event.item_id === 'late-copy'), true);
fallback.stop(false);

// Startup is still gated until session.updated, but after that the clean AEC
// source stays attached while ATLAS speaks so natural full-duplex can work.
(async () => {
  const inputTrack = { id: 'usb-microphone' };
  const replacements = [];
  const sender = {
    track: inputTrack,
    async replaceTrack(track) { this.track = track; replacements.push(track); },
  };
  const gated = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
  gated.closed = false;
  gated.state = 'configuring';
  gated.inputTrack = inputTrack;
  await gated.gateRealtimeInputUntilReady(sender, inputTrack);
  assert.equal(sender.track, null);
  assert.equal(gated.realtimeInputEnabled, false);
  assert.equal(replacements.length, 1);
  gated.session = {};
  gated.markReady();
  await gated.inputSwitchPromise;
  assert.equal(sender.track, inputTrack);
  assert.equal(gated.realtimeInputEnabled, true);
  gated.handleEvent(JSON.stringify({ type: 'response.created' }));
  await gated.inputSwitchPromise;
  assert.equal(sender.track, inputTrack);
  assert.equal(replacements.length, 2);
  gated.responseActive = false;
  gated.resumeRealtimeInput('test');
  await gated.inputSwitchPromise;
  assert.equal(sender.track, inputTrack);
  gated.stop(false);

  const physicalTrack = { id: 'a1-usb-microphone' };
  const physicalReplacements = [];
  const physicalGates = [];
  const physicalSender = {
    track: physicalTrack,
    async replaceTrack(track) { this.track = track; physicalReplacements.push(track); },
  };
  const physical = window.AtlasRealtime.create({
    fetch: async () => ({ ok: true }), physicalAtlasA1: true,
    callbacks: {
      setA1MicrophoneSuppressed: (suppressed, options) => {
        physicalGates.push({ suppressed, options });
      },
    },
  });
  physical.closed = false;
  physical.state = 'ready';
  physical.session = { atlasOutput: 'native' };
  physical.inputTrack = physicalTrack;
  physical.inputSender = physicalSender;
  physical.conversationActive = true;
  physical.responseActive = true;
  physical.handleEvent(JSON.stringify({ type: 'output_audio_buffer.started' }));
  await physical.inputSwitchPromise;
  assert.equal(physicalSender.track, null, 'A1 uplink is detached during playback');
  assert.equal(physicalGates.at(-1).suppressed, true);
  physical.responseActive = false;
  physical.handleEvent(JSON.stringify({ type: 'output_audio_buffer.stopped' }));
  assert.equal(physicalGates.at(-1).suppressed, true, 'capture stays gated during tail');
  await new Promise(resolve => setTimeout(resolve, 220));
  await physical.inputSwitchPromise;
  assert.equal(physicalGates.at(-1).suppressed, false);
  assert.equal(physicalSender.track, physicalTrack, 'A1 uplink returns after the tail');
  assert.deepEqual(physicalReplacements, [null, physicalTrack]);
  physical.stop(false);

  const remoteTrack = { id: 'laptop-microphone' };
  const remoteGates = [];
  const remoteGate = window.AtlasRealtime.create({
    fetch: async () => ({ ok: true }), physicalAtlasA1: false,
    callbacks: { setA1MicrophoneSuppressed: value => remoteGates.push(value) },
  });
  remoteGate.closed = false;
  remoteGate.state = 'ready';
  remoteGate.session = { atlasOutput: 'native' };
  remoteGate.inputTrack = remoteTrack;
  remoteGate.inputSender = { track: remoteTrack, async replaceTrack(track) { this.track = track; } };
  remoteGate.conversationActive = true;
  remoteGate.responseActive = true;
  remoteGate.handleEvent(JSON.stringify({ type: 'output_audio_buffer.started' }));
  await remoteGate.inputSwitchPromise;
  assert.equal(remoteGate.inputSender.track, remoteTrack);
  assert.deepEqual(remoteGates, []);
  remoteGate.stop(false);
  console.log('realtime wake and speaker isolation: ok');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// A statement closes the conversational window after playback; a genuine
// question keeps the four-second follow-up available.
const statementScreens = [];
const statement = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }),
  callbacks: { setScreen: (...args) => statementScreens.push(args) } });
statement.closed = false;
statement.state = 'ready';
statement.conversationActive = true;
statement.responseFinalized = true;
statement.currentAssistantText = 'La temperatura es de 48 grados.';
statement.settleAfterResponse();
assert.equal(statement.conversationActive, false);
assert.equal(statementScreens.at(-1)[1], 'Esperando a ATLAS');
statement.stop(false);

const questionScreens = [];
const question = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }),
  callbacks: { setScreen: (...args) => questionScreens.push(args) } });
question.closed = false;
question.state = 'ready';
question.conversationActive = true;
question.responseFinalized = true;
question.currentAssistantText = 'He encontrado tres opciones. ¿Quieres que abra alguna?';
question.settleAfterResponse();
assert.equal(question.conversationActive, true);
assert.equal(questionScreens.at(-1)[1], 'Puedes seguir hablando');
question.stop(false);

const toolRaceSent = [];
const toolRace = window.AtlasRealtime.create({ fetch: async () => ({ ok: true }), callbacks: {} });
toolRace.closed = false;
toolRace.state = 'ready';
toolRace.conversationActive = true;
toolRace.responseFinalized = true;
toolRace.pendingToolResponse = true;
toolRace.channel = { readyState: 'open', send: value => toolRaceSent.push(JSON.parse(value)), close() {} };
assert.equal(toolRace.flushPendingToolResponse(), true);
toolRace.settleAfterResponse();
assert.equal(toolRace.conversationActive, true);
assert.equal(toolRaceSent.filter(event => event.type === 'response.create').length, 1);
toolRace.stop(false);
