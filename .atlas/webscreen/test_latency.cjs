const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ a1 = true, output = 'browser' } = {}) {
  let now = 10000, id = 0, uuid = 0;
  const timers = new Map(), sent = [], logs = [], plays = [], gates = [], screens = [];
  let stops = 0;
  const window = {
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(key) { timers.delete(key); },
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), {
    window, crypto: { randomUUID: () => `turn-${++uuid}` }, performance: { now: () => now },
  });
  const c = window.AtlasRealtime.create({ physicalAtlasA1: a1,
    fetch: async (url, options) => {
      if (url === '/api/realtime/event') logs.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({}) };
    },
    callbacks: {
      setScreen: (...args) => screens.push(args),
      setA1MicrophoneSuppressed: blocked => gates.push({ blocked, at: now }),
      playExternalText: (text, mode, hooks) => new Promise((resolve, reject) => plays.push({ text, mode, hooks, resolve, reject })),
      stopExternalSpeech: () => { stops++; },
    },
  });
  c.closed = false; c.state = 'ready'; c.conversationActive = true;
  c.session = { atlasOutput: output, voice: 'cedar' };
  c.channel = { readyState: 'open', send: text => sent.push(JSON.parse(text)), close() {} };
  c.currentInteractionId = 'latency-test';
  const event = (type, fields = {}) => c.handleEvent(JSON.stringify({ type, ...fields }));
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  async function advance(ms) {
    const until = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [key, timer] = next; timers.delete(key); now = timer.at; timer.fn(); await flush();
    }
    now = until; await flush();
  }
  return { c, event, advance, flush, sent, logs, plays, gates, screens,
    helpers: window.AtlasRealtime._test,
    get stops() { return stops; },
    responses: () => sent.filter(e => e.type === 'response.create'),
    requests: () => sent.filter(e => e.type === 'conversation.item.create' && e.item.role === 'user').map(e => e.item.content[0].text),
  };
}

test('unchanged Chrome interim results cannot extend the 700 ms no-VAD deadline', async () => {
  const p = setup(); p.c.authorizeLocalWake('ATLAS');
  p.c.queueLocalWakeRequest('qué hora es', false);
  for (let i = 0; i < 6; i++) { await p.advance(100); p.c.queueLocalWakeRequest('qué hora es', false); }
  await p.advance(99); assert.equal(p.responses().length, 0);
  await p.advance(1); assert.equal(p.responses().length, 1);
  assert.equal(p.logs.filter(e => e.stage === 'wake.local_request_buffered').length, 1);
});

test('Chrome final promotion shortens, never restarts, the text stability deadline', async () => {
  const p = setup(); p.c.authorizeLocalWake('ATLAS');
  p.c.queueLocalWakeRequest('qué hora es', false); await p.advance(300);
  p.c.queueLocalWakeRequest('qué hora es', true);
  await p.advance(99); assert.equal(p.responses().length, 0);
  await p.advance(1); assert.equal(p.responses().length, 1);
});

test('A1 reuses VAD silence and waits only 80 ms for already stable text', async () => {
  const p = setup(); p.c.authorizeLocalWake('ATLAS'); p.c.beginSpeech();
  const interaction = p.c.currentInteractionId;
  p.c.queueLocalWakeRequest('cuánta RAM queda', false); await p.advance(500);
  assert.equal(p.responses().length, 0, 'never send while voice is active');
  p.c.endSpeech(); await p.advance(79); assert.equal(p.responses().length, 0);
  await p.advance(1); assert.equal(p.responses().length, 1);
  assert.equal(p.c.currentInteractionId, interaction);
});

test('new voice cancels the A1 deadline and preserves the whole command', async () => {
  const p = setup(); p.c.authorizeLocalWake('ATLAS');
  p.c.beginSpeech(); p.c.queueLocalWakeRequest('enciende la televisión', true); p.c.endSpeech();
  await p.advance(50); p.c.beginSpeech();
  p.c.queueLocalWakeRequest('enciende la televisión y comparte pantalla', true);
  await p.advance(1000); assert.equal(p.responses().length, 0);
  p.c.endSpeech(); await p.advance(80);
  assert.deepEqual(p.requests(), ['enciende la televisión y comparte pantalla']);
});

test('a correction near VAD end gets its own short stability window', async () => {
  const p = setup(); p.c.authorizeLocalWake('ATLAS'); p.c.beginSpeech();
  p.c.queueLocalWakeRequest('cuánta me', false); await p.advance(400); p.c.endSpeech();
  await p.advance(60); p.c.queueLocalWakeRequest('cuánta memoria RAM queda libre', false);
  await p.advance(179); assert.equal(p.responses().length, 0);
  await p.advance(1); assert.deepEqual(p.requests(), ['cuánta memoria RAM queda libre']);
});

test('bare ATLAS does not submit or cancel the follow-up listening timer', async () => {
  const p = setup(); p.c.authorizeLocalWake('ATLAS');
  const timer = p.c.followUpTimer; p.c.queueLocalWakeRequest('', true);
  assert.equal(p.c.followUpTimer, timer); await p.advance(4000);
  assert.equal(p.c.conversationActive, false); assert.equal(p.responses().length, 0);
});

test('laptop counts transcription time inside its 400 ms settling budget', async () => {
  const p = setup({ a1: false }); p.c.beginSpeech(); p.c.endSpeech(); await p.advance(350);
  p.c.handleUserTranscript({ transcript: 'qué hora es' });
  await p.advance(79); assert.equal(p.responses().length, 0);
  await p.advance(1); assert.equal(p.responses().length, 1);
  assert.equal(p.logs.find(e => e.stage === 'input.response_scheduled').durationMs, 80);
});

test('fast laptop transcription still preserves the full 400 ms continuation window', async () => {
  const p = setup({ a1: false }); p.c.beginSpeech(); p.c.endSpeech(); await p.advance(50);
  p.c.handleUserTranscript({ transcript: 'enciende la televisión' });
  await p.advance(250); p.c.beginSpeech(); await p.advance(500);
  assert.equal(p.responses().length, 0);
  p.c.endSpeech(); p.c.handleUserTranscript({ transcript: 'y comparte pantalla' });
  await p.advance(400); assert.equal(p.responses().length, 1);
});

test('speech boundaries preserve decimals, IPs and filenames', () => {
  const { speechChunkLength: cut } = setup().helpers;
  for (const text of ['Son 48.', 'La IP es 192.168.1.142', 'El archivo SOUL.md', 'Sr. Sami']) assert.equal(cut(text), 0);
  assert.equal(cut('Son 48.5 grados. Después veremos la RAM.'), 'Son 48.5 grados.'.length);
  assert.equal(cut('¿Quieres más?'), '¿Quieres más?'.length);
  assert.equal(cut('Sin puntuación', true), 14);
});

test('external TTS starts at the first sentence before text.done and logs real start', async () => {
  const p = setup(); p.c.lastSpeechEndedAt = 10000; p.event('response.created', { response: { id: 'r1' } });
  p.c.handleAssistantText('La temperatura es de cuarenta grados. ', false);
  assert.equal(p.plays.length, 1); assert.equal(p.c.responseActive, true);
  assert.equal(p.logs.some(e => e.stage === 'tts.playback_started'), false);
  await p.advance(75); p.plays[0].hooks.onStart({ voice: 'Google español', source: 'speechSynthesis.start' });
  const start = p.logs.find(e => e.stage === 'tts.playback_started');
  assert.equal(start.durationMs, 75); assert.equal(start.sinceSpeechStoppedMs, 75);
  assert.equal(start.voice, 'browser'); assert.equal(start.effectiveVoice, 'Google español');
  assert.equal(start.responseId, 'r1');
  p.c.handleAssistantText('Todo correcto.', false);
  p.c.handleAssistantText('La temperatura es de cuarenta grados. Todo correcto.', true);
  p.event('response.done', { response: { status: 'completed' } });
  assert.equal(p.plays.length, 1, 'no overlap');
  p.plays[0].resolve(); await p.flush(); assert.equal(p.plays[1].text, 'Todo correcto.');
  p.plays[1].resolve(); await p.flush();
  assert.equal(p.plays.length, 2, 'final text is not spoken twice');
  assert.equal(p.c.isA1MicrophoneBlocked(), true);
  await p.advance(199); assert.equal(p.c.isA1MicrophoneBlocked(), true);
  await p.advance(1); assert.equal(p.c.isA1MicrophoneBlocked(), false);
});

test('A1 microphone stays closed even through a long text-generation gap', async () => {
  const p = setup(); p.event('response.created'); p.c.handleAssistantText('Primera frase. ', false);
  p.plays[0].resolve(); await p.flush(); await p.advance(2000);
  assert.equal(p.c.isA1MicrophoneBlocked(), true);
  p.c.handleAssistantText('Segunda frase.', false); p.event('response.done');
  p.plays[1].resolve(); await p.flush(); await p.advance(200);
  assert.deepEqual(p.gates.map(g => g.blocked), [true, false]);
});

test('short replies without punctuation flush at done', async () => {
  const p = setup(); p.event('response.created'); p.c.handleAssistantText('Hecho', false);
  assert.equal(p.plays.length, 0); p.event('response.done'); assert.equal(p.plays[0].text, 'Hecho');
  p.plays[0].resolve(); await p.flush(); assert.equal(p.c.externalPlaybackActive, false);
});

test('tool results wait for generation and all preamble audio, then continue once', async () => {
  const p = setup(); p.event('response.created'); p.c.handleAssistantText('Voy a revisar eso. ', false);
  p.c.submitToolResult('shell1', { output: 'ok' }); assert.equal(p.responses().length, 0);
  p.event('response.done'); assert.equal(p.responses().length, 0);
  p.plays[0].resolve(); await p.flush(); assert.equal(p.responses().length, 1);
  p.event('response.created'); p.c.handleAssistantText('Listo.', true);
  assert.deepEqual(p.plays.map(e => e.text), ['Voy a revisar eso.', 'Listo.']);
});

test('remote interruption cancels queued audio and late completions cannot revive it', async () => {
  const p = setup({ a1: false }); p.event('response.created'); p.c.handleAssistantText('Primera. Segunda. ', false);
  assert.equal(p.plays.length, 1); p.c.interruptWork(); assert.equal(p.stops, 1);
  p.plays[0].hooks.onStart(); p.plays[0].resolve(); await p.flush();
  p.c.handleAssistantText('Primera. Segunda.', true); p.event('response.done');
  assert.equal(p.plays.length, 1); assert.equal(p.c.externalPlaybackActive, false);
  assert.equal(p.logs.some(e => e.stage === 'tts.playback_started'), false);
  assert.deepEqual(p.gates, []);
});

test('stopping or playback error cannot leave A1 capture stuck', async () => {
  const p = setup(); p.event('response.created'); p.c.handleAssistantText('Hecho.', true);
  p.event('response.done'); p.plays[0].reject(new Error('test synthesis failure'));
  await p.flush(); await p.advance(200); assert.equal(p.c.isA1MicrophoneBlocked(), false);
  p.event('response.created'); p.c.handleAssistantText('Más.', true); p.c.stop(false);
  p.plays[1].resolve(); await p.flush(); await p.advance(200);
  assert.equal(p.c.externalPlaybackActive, false); assert.equal(p.c.closed, true);
});

test('ElevenLabs shares incremental queue; native voices never use it', () => {
  const p = setup({ output: 'elevenlabs' }); p.event('response.created'); p.c.handleAssistantText('Primera frase. ', false);
  assert.equal(p.plays[0].mode, 'elevenlabs');
  const native = setup({ output: 'native' }); native.event('response.created'); native.c.handleAssistantText('Primera frase. ', false);
  assert.equal(native.plays.length, 0); assert.deepEqual(native.gates, []);
});
