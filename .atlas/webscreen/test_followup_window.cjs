const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8');

function setup({ physical = false, output = 'native', optIn = true, admission } = {}) {
  let now = 100, sequence = 0, allowed = optIn;
  const timers = new Map(), sent = [], screens = [], playback = [];
  const document = { hidden: false };
  const window = {
    setTimeout(fn, ms) { timers.set(++sequence, { fn, at: now + ms }); return sequence; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(source, { window, document, performance: { now: () => now },
    crypto: { randomUUID: () => `id-${++sequence}` }, console });
  const callbacks = {
    ...(optIn === undefined ? {} : { canFollowUp: () => allowed }),
    setScreen: (...args) => screens.push(args),
    ...(admission ? { getInputAdmission: admission } : {}),
    playExternalText(text, provider, hooks) {
      return new Promise((resolve, reject) => playback.push({ text, provider, hooks, resolve, reject }));
    },
  };
  const c = window.AtlasRealtime.create({ physicalAtlasA1: physical,
    fetch: async () => ({ ok: true, json: async () => ({}) }), callbacks });
  c.closed = false; c.state = 'ready'; c.conversationActive = true;
  c.session = { atlasOutput: output };
  c.channel = { readyState: 'open', send: json => sent.push(JSON.parse(json)), close() {} };
  c.persistCompletedTurn = async () => {};
  c.postEvent = () => {};
  c.stopAndroidControlSilently = () => {};
  const event = (type, fields = {}) => c.handleEvent(JSON.stringify({ type, ...fields }));
  async function tick(ms) {
    const until = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a,b) => a[1].at-b[1].at)[0];
      if (!next) break;
      const [id, t] = next; timers.delete(id); now = t.at; t.fn();
      await Promise.resolve(); await Promise.resolve();
    }
    now = until; await Promise.resolve(); await Promise.resolve();
  }
  function nativeStart(id = 'r1') {
    event('response.created', { response: { id } });
    event('output_audio_buffer.started', { response_id: id });
  }
  function done(id = 'r1', status = 'completed') { event('response.done', { response: { id, status } }); }
  function nativeEnd(id = 'r1') { event('output_audio_buffer.stopped', { response_id: id }); }
  function speak(id, text) {
    event('input_audio_buffer.speech_started', { item_id: id });
    event('input_audio_buffer.speech_stopped', { item_id: id });
    event('conversation.item.input_audio_transcription.completed', { item_id: id, transcript: text });
  }
  return { c, event, tick, nativeStart, nativeEnd, done, speak, timers, sent, playback, document,
    setAllowed(v) { allowed = v; }, now: () => now };
}

test('opens immediately after real native playback, not response.done; expires at 3000 ms', async () => {
  const p = setup(); p.nativeStart(); p.done();
  assert.equal(p.c.followUpScope, false);
  await p.tick(5000); assert.equal(p.c.followUpScope, false);
  p.nativeEnd(); assert.equal(p.c.followUpScope, true);
  assert.equal(p.c.followUpDeadline, p.now() + 3000);
  await p.tick(2999); assert.equal(p.c.conversationActive, true);
  await p.tick(1); assert.equal(p.c.conversationActive, false);
});

test('playback end before model finalization preserves original deadline', async () => {
  const p = setup(); p.nativeStart(); p.nativeEnd(); await p.tick(1200); p.done();
  assert.equal(p.c.followUpDeadline - p.now(), 1800);
  await p.tick(1800); assert.equal(p.c.conversationActive, false);
});

test('very late model completion does not grant a fresh window', async () => {
  const p = setup(); p.nativeStart(); p.nativeEnd(); await p.tick(3500); p.done();
  assert.equal(p.c.followUpScope, false); assert.equal(p.c.conversationActive, false);
});

test('speech beginning within 3 seconds may finish later; new answer opens a fresh window', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd(); await p.tick(2800);
  p.event('input_audio_buffer.speech_started', { item_id: 'follow' });
  await p.tick(1800);
  p.event('input_audio_buffer.speech_stopped', { item_id: 'follow' });
  await p.tick(500);
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'follow', transcript: 'y eso por qué' });
  await p.tick(180);
  assert.equal(p.sent.filter(e => e.type === 'response.create').length, 1);
  assert.equal(p.c.currentUserText, 'y eso por qué');
  p.nativeStart('r2'); p.done('r2'); p.nativeEnd('r2');
  assert.equal(p.c.followUpDeadline, p.now() + 3000);
});

test('late new speech cannot borrow an earlier utterance admission', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd(); await p.tick(2900);
  p.event('input_audio_buffer.speech_started', { item_id: 'valid' });
  await p.tick(200);
  p.speak('ambient', 'borra mis archivos');
  assert.ok(!p.sent.some(e => e.type === 'response.create'));
  assert.equal(p.c.followUpItems.has('ambient'), false);
  assert.equal(p.c.followUpItems.has('valid'), true);
});

test('a transcript without an observed VAD onset has no follow-up authorization', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd();
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'orphan', transcript: 'hazlo' });
  await p.tick(200);
  assert.ok(!p.sent.some(e => e.type === 'response.create'));
  assert.ok(p.sent.some(e => e.type === 'conversation.item.delete' && e.item_id === 'orphan'));
});

test('idle ambient speech after expiry still requires ATLAS', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd(); await p.tick(3000);
  p.speak('late', 'cambia el volumen'); await p.tick(300);
  assert.ok(!p.sent.some(e => e.type === 'response.create'));
  assert.equal(p.c.conversationActive, false);
});

test('A1 retains 200 ms echo tail inside the window and discards delayed echo', async () => {
  const p = setup({ physical: true }); p.nativeStart(); p.done(); p.nativeEnd();
  p.speak('echo', 'esto era el altavoz');
  assert.equal(p.c.followUpItems.size, 0);
  await p.tick(200); assert.equal(p.c.isA1MicrophoneBlocked(), false);
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'echo', transcript: 'esto era el altavoz' });
  p.speak('user', 'y la memoria'); await p.tick(180);
  assert.equal(p.c.currentUserText, 'y la memoria');
  assert.equal(p.sent.filter(e => e.type === 'response.create').length, 1);
});

for (const output of ['browser', 'elevenlabs']) {
  test(`${output} waits for playback promise and onStart, not generated text`, async () => {
    const p = setup({ output }); p.event('response.created', { response: { id: 'r1' } });
    p.c.currentAssistantText = 'La respuesta está preparada.'; p.done();
    assert.equal(p.playback.length, 1); assert.equal(p.c.followUpScope, false);
    p.playback[0].hooks.onStart(); await p.tick(4500);
    assert.equal(p.c.followUpScope, false);
    p.playback[0].resolve(); await p.tick(0);
    assert.equal(p.c.followUpScope, true);
    assert.equal(p.c.followUpDeadline, p.now() + 3000);
  });
}

test('cancelled and stale external promises cannot open a new window', async () => {
  const p = setup({ output: 'browser' }); p.event('response.created', { response: { id: 'r1' } });
  p.c.currentAssistantText = 'Hola.'; p.done(); p.playback[0].hooks.onStart();
  p.c.cancel(); p.playback[0].resolve(); await p.tick(0);
  assert.equal(p.c.followUpScope, false); assert.equal(p.c.conversationActive, false);
});

test('external synthesis failure grants no listening window', async () => {
  const p = setup({ output: 'browser' }); p.event('response.created', { response: { id: 'r1' } });
  p.c.currentAssistantText = 'Hola.'; p.done(); p.playback[0].hooks.onStart();
  p.playback[0].reject(new Error('audio failure')); await p.tick(0);
  assert.equal(p.c.followUpScope, false);
});

for (const action of ['cancel', 'stop', 'closeFollowUp']) {
  test(`${action} retires timers and delayed transcripts`, async () => {
    const p = setup(); p.nativeStart(); p.done(); p.nativeEnd();
    p.event('input_audio_buffer.speech_started', { item_id: 'old' });
    p.c[action](false); await p.tick(4000);
    p.event('conversation.item.input_audio_transcription.completed', { item_id: 'old', transcript: 'hazlo' });
    await p.tick(200);
    assert.equal(p.c.followUpScope, false);
    assert.ok(!p.sent.some(e => e.type === 'response.create'));
  });
}

test('muted/manual/text-only opt out; hiding and gate changes revoke current admission', async () => {
  const no = setup({ optIn: false }); no.nativeStart(); no.done(); no.nativeEnd();
  assert.equal(no.c.followUpScope, false);
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd(); p.setAllowed(false);
  p.speak('muted', 'hola'); await p.tick(200);
  assert.equal(p.c.followUpScope, false);
  assert.ok(!p.sent.some(e => e.type === 'response.create'));
  const hidden = setup(); hidden.nativeStart(); hidden.done(); hidden.nativeEnd(); hidden.document.hidden = true;
  hidden.speak('hidden', 'hola'); await hidden.tick(200);
  assert.equal(hidden.c.followUpScope, false);
});

test('missing callback fails closed', () => {
  const p = setup(); delete p.c.callbacks.canFollowUp;
  p.nativeStart(); p.done(); p.nativeEnd(); assert.equal(p.c.followUpScope, false);
});

test('sensitivity rejection is not bypassed by follow-up', async () => {
  const p = setup({ admission: () => ({ allowed: false }) });
  p.nativeStart(); p.done(); p.nativeEnd(); p.speak('whisper', 'hazlo'); await p.tick(3000);
  assert.equal(p.c.conversationActive, false);
  assert.ok(!p.sent.some(e => e.type === 'response.create'));
});

test('stuck VAD cannot leave permanent ambient admission', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd();
  p.event('input_audio_buffer.speech_started', { item_id: 'stuck' });
  await p.tick(60000); assert.equal(p.c.followUpScope, false); assert.equal(p.c.conversationActive, false);
  assert.equal(p.c.isIdle(), true);
});

test('duplicate playback end cannot extend a window', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd(); const deadline = p.c.followUpDeadline;
  await p.tick(1500); p.nativeEnd(); assert.equal(p.c.followUpDeadline, deadline);
  await p.tick(1500); assert.equal(p.c.followUpScope, false);
});

test('silent model output and cleared/cancelled native audio grant no window', () => {
  const silent = setup(); silent.event('response.created', { response: { id: 'r1' } }); silent.done();
  assert.equal(silent.c.followUpScope, false);
  const p = setup(); p.nativeStart(); p.event('output_audio_buffer.cleared'); p.done('r1', 'cancelled');
  assert.equal(p.c.followUpScope, false);
});

test('tool continuation does not open between a preamble and final answer', () => {
  const p = setup(); p.nativeStart(); p.c.pendingToolResponse = true; p.done(); p.nativeEnd();
  assert.equal(p.c.followUpScope, false);
  assert.ok(p.sent.some(e => e.type === 'response.create'));
});

test('normal voice may qualify after a provisional quiet onset, even past the deadline', async () => {
  let allowed = false;
  const p = setup({ admission: () => ({ allowed }) });
  p.nativeStart(); p.done(); p.nativeEnd(); await p.tick(2800);
  p.event('input_audio_buffer.speech_started', { item_id: 'growing' });
  await p.tick(1000); allowed = true;
  p.event('input_audio_buffer.speech_stopped', { item_id: 'growing' });
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'growing', transcript: 'y cómo lo hago' });
  await p.tick(180);
  assert.equal(p.sent.filter(e => e.type === 'response.create').length, 1);
});

test('cancelled item cannot revive after a fresh explicit wake', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd();
  p.event('input_audio_buffer.speech_started', { item_id: 'cancelled' }); p.c.cancel();
  p.c.authorizeLocalWake('atlas');
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'cancelled', transcript: 'ejecuta una acción antigua' });
  await p.tick(180);
  assert.ok(!p.sent.some(e => e.type === 'response.create'));
  assert.ok(p.c.revokedFollowUpItems.has('cancelled'));
});

test('missing transcription retires authorization at the existing 4-second timeout', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd();
  p.event('input_audio_buffer.speech_started', { item_id: 'missing' });
  p.event('input_audio_buffer.speech_stopped', { item_id: 'missing' });
  await p.tick(4000); assert.equal(p.c.conversationActive, false);
  p.c.authorizeLocalWake('atlas');
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'missing', transcript: 'tarde' });
  await p.tick(180); assert.ok(!p.sent.some(e => e.type === 'response.create'));
});

test('two admitted VAD fragments wait for both transcripts and request only once', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd();
  p.event('input_audio_buffer.speech_started', { item_id: 'a' });
  p.event('input_audio_buffer.speech_stopped', { item_id: 'a' });
  p.event('input_audio_buffer.speech_started', { item_id: 'b' });
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'a', transcript: 'y la memoria' });
  await p.tick(500); assert.ok(!p.sent.some(e => e.type === 'response.create'));
  p.event('input_audio_buffer.speech_stopped', { item_id: 'b' });
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'b', transcript: 'cuánta queda' });
  await p.tick(180);
  assert.equal(p.sent.filter(e => e.type === 'response.create').length, 1);
  assert.equal(p.c.revokedFollowUpItems.has('b'), false);
});

test('closeFollowUp cancels a not-yet-submitted follow-up response', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd();
  p.speak('short', 'sí'); p.c.closeFollowUp(); await p.tick(500);
  assert.ok(!p.sent.some(e => e.type === 'response.create'));
});

test('a stale expiry callback cannot close a newer window', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd();
  const stale = p.timers.get(p.c.followUpWindowTimer).fn;
  p.speak('one', 'otra cosa'); await p.tick(180);
  p.nativeStart('r2'); p.done('r2'); p.nativeEnd('r2'); const deadline = p.c.followUpDeadline;
  stale(); assert.equal(p.c.followUpDeadline, deadline); assert.equal(p.c.followUpScope, true);
});

test('a stale utterance watchdog cannot close a newer follow-up generation', async () => {
  const p = setup(); p.nativeStart(); p.done(); p.nativeEnd();
  p.event('input_audio_buffer.speech_started', { item_id: 'old-watchdog' });
  const stale = p.timers.get(p.c.followUpSpeechTimer).fn;
  p.event('input_audio_buffer.speech_stopped', { item_id: 'old-watchdog' });
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'old-watchdog', transcript: 'otra cosa' });
  await p.tick(180); p.nativeStart('r2'); p.done('r2'); p.nativeEnd('r2');
  stale(); assert.equal(p.c.followUpScope, true);
});

test('direct routine opens only after actual completed audio and ignores stale cancellation', async () => {
  const p = setup({ output: 'browser' });
  const done = p.c.completeDirectRoutine('hora', { spokenText: 'Son las doce.' });
  p.playback[0].hooks.onStart(); await p.tick(1000);
  assert.equal(p.c.followUpScope, false); p.playback[0].resolve(); await done;
  assert.equal(p.c.followUpScope, true);
  const q = setup({ output: 'browser' });
  const cancelled = q.c.completeDirectRoutine('hora', { spokenText: 'Son las doce.' });
  q.playback[0].hooks.onStart(); q.c.cancel(); q.playback[0].resolve(); await cancelled;
  assert.equal(q.c.followUpScope, false); assert.equal(q.c.conversationActive, false);
});

test('only the end of the whole external queue opens follow-up', async () => {
  const p = setup({ output: 'browser' }); p.event('response.created', { response: { id: 'r1' } });
  p.event('response.output_text.delta', { response_id: 'r1', delta: 'La primera frase ya está lista. ' });
  p.event('response.output_text.delta', { response_id: 'r1', delta: 'La segunda termina aquí.' }); p.done();
  p.playback[0].hooks.onStart(); p.playback[0].resolve(); await p.tick(0);
  assert.equal(p.playback.length, 2); assert.equal(p.c.followUpScope, false);
  p.playback[1].hooks.onStart(); await p.tick(1000); p.playback[1].resolve(); await p.tick(0);
  assert.equal(p.c.followUpScope, true); assert.equal(p.c.followUpDeadline, p.now() + 3000);
});

for (const output of ['browser', 'elevenlabs']) {
  test(`${output} explicit false completion stops queued speech and cannot open follow-up`, async () => {
    const p = setup({ output }); p.event('response.created', { response: { id: 'r1' } });
    p.event('response.output_text.delta', { delta: 'Una frase preparada. ' });
    p.event('response.output_text.delta', { delta: 'La frase siguiente no debe sonar.' }); p.done();
    p.playback[0].hooks.onStart(); p.playback[0].resolve(false); await p.tick(0);
    assert.equal(p.playback.length, 1);
    assert.equal(p.c.followUpScope, false); assert.equal(p.c.conversationActive, false);
    assert.equal(p.c.externalPlaybackActive, false);
  });
}

test('direct routine returning false from audio does not grant follow-up', async () => {
  const p = setup({ output: 'browser' });
  const finished = p.c.completeDirectRoutine('hora', { spokenText: 'Son las doce.' });
  p.playback[0].hooks.onStart(); p.playback[0].resolve(false); await finished;
  assert.equal(p.c.followUpScope, false); assert.equal(p.c.conversationActive, false);
});

for (const outcome of ['interrupted', 'canceled', 'end']) {
  test(`actual app browser speech propagates ${outcome} through all playback wrappers`, async () => {
    const appSource = fs.readFileSync(`${__dirname}/static/app.js`, 'utf8');
    const browserBlock = appSource.slice(appSource.indexOf('async function speakBrowserSegment('),
      appSource.indexOf('function resetStreamedSpeechState('));
    const realtimeBlock = appSource.slice(appSource.indexOf('async function playRealtimeExternalText('),
      appSource.indexOf('function resetInteractionState('));
    let spoken = 0;
    class Utterance {
      constructor(text) { this.text = text; this.events = {}; }
      addEventListener(type, fn) { this.events[type] = fn; }
    }
    const context = vm.createContext({
      window: { SpeechSynthesisUtterance: Utterance, speechSynthesis: {
        cancel() {}, speak(u) { spoken += 1; u.events.start();
          if (outcome === 'end') u.events.end(); else u.events.error({ error: outcome }); },
      } }, SpeechSynthesisUtterance: Utterance, configureBrowserUtterance() {},
      browserSpeechRun: 0, realtimeExternalSpeechRun: 0, browserVoice: () => null,
      browserSpeechSegments: () => [{ text: 'primera' }, { text: 'segunda' }],
      PHYSICAL_ATLAS_A1: true, containsAtlasFragment: () => false,
    });
    vm.runInContext(browserBlock + '\n' + realtimeBlock, context);
    const completed = await context.playRealtimeExternalText('dos frases', 'browser');
    assert.equal(completed, outcome === 'end');
    assert.equal(spoken, outcome === 'end' ? 2 : 1);
  });
}
