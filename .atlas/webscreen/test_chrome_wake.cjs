const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup(physicalAtlasA1 = true) {
  let now = 0, id = 0;
  const timers = new Map(), sent = [], transcripts = [], screens = [];
  const window = {
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(key) { timers.delete(key); },
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), {
    window, crypto: { randomUUID: () => 'test-turn' }, performance: { now: () => now },
  });
  const c = window.AtlasRealtime.create({ physicalAtlasA1, fetch: async () => ({ ok: true }),
    callbacks: { setTranscript: text => transcripts.push(text), setScreen: (...args) => screens.push(args) },
  });
  c.closed = false; c.state = 'ready';
  c.session = { atlasOutput: 'native' };
  c.channel = { readyState: 'open', send: text => sent.push(JSON.parse(text)), close() {} };
  const event = (type, fields = {}) => c.handleEvent(JSON.stringify({ type, ...fields }));
  async function advance(ms) {
    const until = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [key, timer] = next; timers.delete(key); now = timer.at; timer.fn();
      await Promise.resolve();
    }
    now = until;
  }
  return { c, event, advance, sent, transcripts, screens,
    responses: () => sent.filter(e => e.type === 'response.create'),
    requests: () => sent.filter(e => e.type === 'conversation.item.create').map(e => e.item.content[0].text),
  };
}

test('Chrome time request wins over the garbled Realtime transcript from the real log', async () => {
  const p = setup();
  p.event('input_audio_buffer.speech_started', { item_id: 'voice-1' });
  p.c.authorizeLocalWake('ATLAS');
  p.c.queueLocalWakeRequest('qué hora es', true);
  p.event('input_audio_buffer.speech_stopped', { item_id: 'voice-1' });
  p.event('input_audio_buffer.committed', { item_id: 'voice-1' });
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'voice-1', transcript: 'Atlas királysz' });
  assert.equal(p.responses().length, 0);
  await p.advance(650);
  assert.deepEqual(p.requests(), ['qué hora es']);
  assert.equal(p.responses().length, 1);
  assert.equal(p.transcripts.at(-1), 'qué hora es');
  assert.equal(p.c.pendingTranscripts, 0);
  assert.equal(p.c.speechInputActive, false);
});

test('late garbled audio after Chrome submission cannot start a second response', async () => {
  const p = setup();
  p.event('input_audio_buffer.speech_started', { item_id: 'late-voice' });
  p.c.authorizeLocalWake('ATLAS'); p.c.queueLocalWakeRequest('qué hora es', true);
  p.event('input_audio_buffer.speech_stopped', { item_id: 'late-voice' });
  await p.advance(650);
  p.event('response.created');
  p.event('input_audio_buffer.speech_stopped', { item_id: 'late-voice' });
  p.event('input_audio_buffer.committed', { item_id: 'late-voice' });
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'late-voice', transcript: 'Atlas királysz' });
  await p.advance(2000);
  assert.equal(p.responses().length, 1);
  assert.equal(p.sent.some(e => e.type === 'response.cancel'), false);
  assert.equal(p.sent.filter(e => e.type === 'conversation.item.delete' && e.item_id === 'late-voice').length, 1);
  assert.equal(p.transcripts.at(-1), 'qué hora es');
});

test('Realtime transcribing Atlas never activates an idle session, even without Chrome ready', () => {
  const p = setup();
  p.c.handleUserTranscript({ item_id: 'background', transcript: 'Atlas, qué hora es' });
  assert.equal(p.c.conversationActive, false);
  assert.equal(p.responses().length, 0);
  assert.deepEqual(p.transcripts, [], 'untrusted idle transcript is not shown as user input');
});

test('late Chrome authorization still submits once after audio was already discarded', async () => {
  const p = setup();
  p.event('input_audio_buffer.speech_started', { item_id: 'early-audio' });
  p.event('input_audio_buffer.speech_stopped', { item_id: 'early-audio' });
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'early-audio', transcript: 'Atlas királysz' });
  p.c.authorizeLocalWake('ATLAS'); p.c.queueLocalWakeRequest('qué hora es', true);
  p.event('input_audio_buffer.committed', { item_id: 'early-audio' });
  await p.advance(650);
  assert.equal(p.responses().length, 1);
  assert.equal(p.sent.filter(e => e.type === 'conversation.item.delete' && e.item_id === 'early-audio').length, 1);
});

test('bare Chrome wake opens listening immediately; a repeated identical request is a new turn', async () => {
  const p = setup();
  p.c.authorizeLocalWake('ATLAS');
  assert.equal(p.screens.at(-1)[1], 'Te escucho');
  assert.equal(p.responses().length, 0);
  for (const id of ['first', 'second']) {
    p.event('input_audio_buffer.speech_started', { item_id: id });
    p.c.authorizeLocalWake('ATLAS'); p.c.queueLocalWakeRequest('qué hora es', true);
    p.event('input_audio_buffer.speech_stopped', { item_id: id });
    p.event('input_audio_buffer.committed', { item_id: id });
    await p.advance(650);
    p.c.responseActive = false;
  }
  assert.deepEqual(p.requests(), ['qué hora es', 'qué hora es']);
  assert.equal(p.responses().length, 2);
});

test('Chrome final duplicate cannot authorize the request a second time', async () => {
  const p = setup();
  p.c.authorizeLocalWake('ATLAS'); p.c.queueLocalWakeRequest('a qué día estamos', true);
  await p.advance(650);
  assert.equal(p.c.authorizeLocalWake('ATLAS, a qué día estamos'), false);
  assert.equal(p.responses().length, 1);
  assert.equal(p.sent.some(e => e.type === 'response.cancel'), false);
});

test('duplicate response.create provider error keeps Realtime alive', () => {
  const p = setup();
  p.event('error', { error: { message: 'Conversation already has an active response in progress: resp_test.' } });
  assert.equal(p.c.closed, false);
  assert.equal(p.c.state, 'ready');
});
