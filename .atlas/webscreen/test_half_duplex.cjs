const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8');

function setup(physicalAtlasA1 = true) {
  let now = 0, timerId = 0;
  const timers = new Map(), sent = [], gates = [];
  const window = {
    setTimeout(fn, ms) { timers.set(++timerId, { fn, at: now + ms }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, { window, performance: { now: () => now },
    crypto: { randomUUID: () => 'simulation-id' }, console });
  const track = { enabled: true };
  const controller = window.AtlasRealtime.create({
    physicalAtlasA1, fetch: async () => ({ ok: true }),
    callbacks: {
      setA1MicrophoneSuppressed(blocked, options) {
        gates.push({ blocked, options, at: now });
        track.enabled = !blocked;
      },
    },
  });
  controller.closed = false;
  controller.state = 'ready';
  controller.session = { atlasOutput: 'native' };
  controller.conversationActive = true;
  controller.inputTrack = track;
  controller.inputSender = { track, async replaceTrack(next) { this.track = next; } };
  controller.channel = { readyState: 'open', send: msg => sent.push(JSON.parse(msg)), close() {} };
  const event = (type, fields = {}) => controller.handleEvent(JSON.stringify({ type, ...fields }));
  async function advance(ms) {
    const until = now + ms;
    for (;;) {
      const pending = [...timers.entries()].filter(([, v]) => v.at <= until)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!pending) break;
      const [id, timer] = pending; timers.delete(id); now = timer.at; timer.fn();
      await controller.inputSwitchPromise;
    }
    now = until;
    await controller.inputSwitchPromise;
  }
  return { controller, track, sent, gates, event, advance };
}

test('native A1 output closes capture through 199 ms and restores at 200 ms', async () => {
  const p = setup();
  p.event('output_audio_buffer.started'); await p.advance(0);
  assert.equal(p.track.enabled, false);
  assert.equal(p.controller.inputSender.track, null);
  p.event('output_audio_buffer.stopped');
  await p.advance(199); assert.equal(p.track.enabled, false);
  await p.advance(1); assert.equal(p.track.enabled, true);
  assert.equal(p.controller.inputSender.track, p.track);
  assert.equal(p.gates.at(-1).at, 200);
});

test('A1 external output uses the same 200 ms playback guard', async () => {
  const p = setup();
  p.controller.setPhysicalPlaybackActive('external', true); await p.advance(0);
  assert.equal(p.track.enabled, false);
  p.controller.setPhysicalPlaybackActive('external', false);
  await p.advance(199); assert.equal(p.track.enabled, false);
  await p.advance(1); assert.equal(p.track.enabled, true);
});

test('new playback during the tail cancels the old reopening timer', async () => {
  const p = setup();
  p.event('output_audio_buffer.started'); p.event('output_audio_buffer.stopped');
  await p.advance(100); p.event('output_audio_buffer.started');
  await p.advance(150); assert.equal(p.track.enabled, false);
  p.event('output_audio_buffer.stopped');
  await p.advance(199); assert.equal(p.track.enabled, false);
  await p.advance(1); assert.equal(p.track.enabled, true);
});

test('generation completion and incidental resume cannot open a speaking A1', async () => {
  const p = setup();
  p.event('output_audio_buffer.started'); await p.advance(0);
  p.controller.responseActive = false; // model done, speakers still playing
  p.controller.resumeRealtimeInput('late-response-created');
  await p.advance(300);
  assert.equal(p.track.enabled, false);
  assert.equal(p.controller.inputSender.track, null);
  assert.equal(p.controller.authorizeLocalWake('ATLAS, calla'), false);
});

test('residual speech is dropped even if its transcript arrives after reopening', async () => {
  const p = setup();
  p.event('output_audio_buffer.started');
  p.event('input_audio_buffer.speech_started', { item_id: 'echo' });
  p.event('input_audio_buffer.speech_stopped', { item_id: 'echo' });
  p.event('output_audio_buffer.stopped'); await p.advance(200);
  p.event('conversation.item.input_audio_transcription.completed',
    { item_id: 'echo', transcript: 'Atlas, calla calla' });
  assert.equal(p.controller.pendingTranscripts, 0);
  assert.equal(p.controller.speechInputActive, false);
  assert.ok(p.sent.some(e => e.type === 'conversation.item.delete' && e.item_id === 'echo'));
  assert.ok(!p.sent.some(e => ['response.create', 'response.cancel'].includes(e.type)));
  assert.equal(p.controller.authorizeLocalWake('ATLAS'), true);
});

test('silent tool work does not postpone microphone reopening', async () => {
  const p = setup();
  p.event('output_audio_buffer.started'); p.event('output_audio_buffer.stopped');
  p.controller.toolActive = true;
  await p.advance(200);
  assert.equal(p.track.enabled, true);
  assert.equal(p.controller.inputSender.track, p.track);
});

test('overlapping output sources must both stop before reopening', async () => {
  const p = setup();
  p.controller.setPhysicalPlaybackActive('external', true);
  p.event('output_audio_buffer.started');
  p.controller.setPhysicalPlaybackActive('external', false);
  await p.advance(300); assert.equal(p.track.enabled, false);
  p.event('output_audio_buffer.stopped'); await p.advance(200);
  assert.equal(p.track.enabled, true);
});

test('remote clients retain full-duplex during native and external playback', async () => {
  const p = setup(false);
  p.event('output_audio_buffer.started');
  p.controller.setPhysicalPlaybackActive('external', true);
  await p.advance(500);
  assert.equal(p.track.enabled, true);
  assert.equal(p.controller.inputSender.track, p.track);
  assert.deepEqual(p.gates, []);
});
