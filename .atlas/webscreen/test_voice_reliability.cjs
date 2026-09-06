const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ a1 = true, output = 'native', mediaDevices, fetchOverride } = {}) {
  let now = 10000, id = 0;
  const timers = new Map(), sent = [], logs = [], screens = [], fallbacks = [], followups = [];
  const window = { isSecureContext: true,
    setTimeout(fn, ms) { timers.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout(key) { timers.delete(key); },
  };
  const context = { window, AbortController, performance: { now: () => now },
    crypto: { randomUUID: () => `uuid-${++id}` },
    navigator: { mediaDevices }, RTCPeerConnection: class { addEventListener() {} close() {} },
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), context);
  const c = window.AtlasRealtime.create({ physicalAtlasA1: a1,
    fetch: fetchOverride || (async (url, options) => {
      if (url === '/api/realtime/event') logs.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({}) };
    }),
    callbacks: { setScreen: (...args) => screens.push(args),
      onFallback: error => fallbacks.push(error.message), onFollowUp: () => followups.push(now) },
  });
  c.closed = false; c.state = 'ready'; c.conversationActive = true;
  c.session = { atlasOutput: output };
  c.channel = { readyState: 'open', send: raw => sent.push(JSON.parse(raw)), close() {} };
  c.currentInteractionId = 'test';
  const event = (type, extra = {}) => c.handleEvent(JSON.stringify({ type, ...extra }));
  const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
  async function advance(ms) {
    const until = now + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [key, t] = next; timers.delete(key); now = t.at; t.fn(); await flush();
    }
    now = until; await flush();
  }
  return { c, event, sent, logs, screens, fallbacks, followups, advance, flush, timers,
    responses: () => sent.filter(e => e.type === 'response.create'),
    requests: () => sent.filter(e => e.type === 'conversation.item.create' && e.item.role === 'user'),
  };
}

test('transient ICE disconnection recovers the same session without replay', async () => {
  const p = setup(); p.c.peer = { connectionState: 'disconnected', close() {} };
  p.c.handlePeerConnectionState(); await p.advance(7900);
  assert.equal(p.c.closed, false); assert.equal(p.fallbacks.length, 0);
  p.c.peer.connectionState = 'connected'; p.c.handlePeerConnectionState(); await p.advance(2000);
  assert.equal(p.c.closed, false); assert.equal(p.responses().length, 0);
  assert.ok(p.logs.some(e => e.stage === 'session.transport_recovered'));
});

test('persistent ICE loss gets one bounded reconnect after eight seconds', async () => {
  const p = setup(); p.c.peer = { connectionState: 'disconnected', close() {} };
  p.c.handlePeerConnectionState(); p.c.handlePeerConnectionState();
  await p.advance(8000); assert.equal(p.fallbacks.length, 1); assert.equal(p.c.closed, true);
  await p.advance(20000); assert.equal(p.fallbacks.length, 1); assert.equal(p.responses().length, 0);
});

test('ICE reconnecting preserves the admitted turn and recovers the same peer', async () => {
  const p = setup(), peer = { connectionState: 'disconnected', close() {} };
  p.c.peer = peer; p.c.currentUserText = 'enciende la luz';
  p.c.localWakeAuthorizedUntil = 45000; p.c.pendingTranscripts = 1;
  p.c.handlePeerConnectionState(); const timer = p.c.disconnectTimer;
  await p.advance(3500); peer.connectionState = 'connecting'; p.c.handlePeerConnectionState();
  assert.equal(p.c.disconnectTimer, timer, 'checking another route does not extend recovery forever');
  await p.advance(4000); peer.connectionState = 'connected'; p.c.handlePeerConnectionState();
  await p.advance(9000);
  assert.equal(p.c.peer, peer); assert.equal(p.c.closed, false); assert.equal(p.c.state, 'ready');
  assert.equal(p.c.currentUserText, 'enciende la luz'); assert.equal(p.c.localWakeAuthorizedUntil, 45000);
  assert.equal(p.c.pendingTranscripts, 1); assert.equal(p.c.conversationActive, true);
  assert.equal(p.fallbacks.length, 0); assert.equal(p.sent.length, 0); assert.equal(p.screens.length, 0);
});

test('ICE disconnected then stuck connecting cannot silently lose its recovery deadline', async () => {
  const p = setup(); p.c.peer = { connectionState: 'disconnected', close() {} };
  p.c.handlePeerConnectionState(); await p.advance(4000);
  p.c.peer.connectionState = 'connecting'; p.c.handlePeerConnectionState();
  await p.advance(4000); assert.equal(p.c.closed, true); assert.equal(p.fallbacks.length, 1);
  await p.advance(20000); assert.equal(p.fallbacks.length, 1); assert.equal(p.sent.length, 0);
});

test('only an established peer gets a recovery deadline when connecting', async () => {
  const p = setup(); p.c.peer = { connectionState: 'connecting', close() {} };
  p.c.state = 'connecting'; p.c.handlePeerConnectionState(); await p.advance(8000);
  assert.equal(p.c.disconnectTimer, 0); assert.equal(p.fallbacks.length, 0);
  p.c.state = 'ready'; p.c.handlePeerConnectionState(); await p.advance(8000);
  assert.equal(p.fallbacks.length, 1); assert.equal(p.responses().length, 0);
});

test('a stale RTC recovery timeout cannot erase the next recovery deadline', async () => {
  const p = setup(); p.c.peer = { connectionState: 'disconnected', close() {} };
  p.c.handlePeerConnectionState(); const old = p.timers.get(p.c.disconnectTimer).fn;
  p.c.peer.connectionState = 'connected'; p.c.handlePeerConnectionState();
  p.c.peer.connectionState = 'disconnected'; p.c.handlePeerConnectionState(); const current = p.c.disconnectTimer;
  old(); assert.equal(p.c.disconnectTimer, current); assert.equal(p.c.closed, false);
  await p.advance(8000); assert.equal(p.fallbacks.length, 1);
});

test('an open data channel transport warning does not restart or replay a healthy session', async () => {
  const p = setup(), channel = p.c.channel, peer = { connectionState: 'connected', close() {} };
  p.c.peer = peer; p.c.currentUserText = 'pon música'; p.c.nativePlaybackActive = true;
  p.c.handleDataChannelError(channel, { error: { errorDetail: 'sctp-failure' } });
  await p.advance(9000);
  assert.equal(p.c.peer, peer); assert.equal(p.c.channel, channel); assert.equal(p.c.closed, false);
  assert.equal(p.c.currentUserText, 'pon música'); assert.equal(p.c.nativePlaybackActive, true);
  assert.equal(p.c.conversationActive, true); assert.equal(p.screens.length, 0); assert.equal(p.sent.length, 0);
  assert.equal(p.fallbacks.length, 0); assert.ok(p.logs.some(e => e.stage === 'session.channel_warning'));
});

test('open-channel warnings retain bounded ICE recovery and missing response acknowledgement', async () => {
  const p = setup(); p.c.peer = { connectionState: 'disconnected', close() {} };
  p.c.handleDataChannelError(); await p.advance(8000);
  assert.equal(p.fallbacks.length, 1); assert.equal(p.sent.length, 0);
  const q = setup(); q.c.peer = { connectionState: 'connected', close() {} };
  q.c.createResponse(); q.c.handleDataChannelError(); await q.advance(12000);
  assert.equal(q.fallbacks.length, 1); assert.equal(q.responses().length, 1, 'possible action is never replayed');
});

test('channel warning cannot suppress failed transport or a closing channel', () => {
  for (const connectionState of ['failed', 'closed']) {
    const p = setup(); p.c.peer = { connectionState, close() {} };
    p.c.handleDataChannelError(); assert.equal(p.fallbacks.length, 1); assert.equal(p.c.closed, true);
  }
  for (const readyState of ['connecting', 'closing', 'closed']) {
    const p = setup(); p.c.channel.readyState = readyState;
    p.c.handleDataChannelError(); assert.equal(p.fallbacks.length, 1); assert.equal(p.c.closed, true);
  }
});

test('error from an obsolete data channel cannot close its replacement', () => {
  const p = setup(); p.c.handleDataChannelError({ readyState: 'closed' });
  assert.equal(p.fallbacks.length, 0); assert.equal(p.c.closed, false); assert.equal(p.logs.length, 0);
});

test('transport warning never masks an authoritative provider authentication error', () => {
  const p = setup(); p.c.peer = { connectionState: 'connected', close() {} };
  p.c.handleDataChannelError();
  p.event('error', { error: { code: 'invalid_api_key', message: 'Invalid authentication credentials' } });
  assert.equal(p.c.closed, true); assert.equal(p.fallbacks.length, 1);
  assert.match(p.fallbacks[0], /authentication/); assert.equal(p.responses().length, 0);
});

test('events from an obsolete peer cannot close its replacement', async () => {
  const p = setup(), old = { connectionState: 'failed', close() {} };
  p.c.peer = { connectionState: 'connected', close() {} };
  p.c.handlePeerConnectionState(old); await p.advance(9000);
  assert.equal(p.c.closed, false); assert.equal(p.fallbacks.length, 0);
});

test('response acknowledgement latch prevents duplicates before response.created', () => {
  const p = setup(); assert.equal(p.c.createResponse(), true);
  assert.equal(p.c.createResponse(), false); assert.equal(p.responses().length, 1);
  p.event('response.created', { response: { id: 'r1' } });
  assert.equal(p.c.responseCreatePending, false); assert.equal(p.c.responseActive, true);
});

test('missing response acknowledgement recovers once and never repeats a possible action', async () => {
  const p = setup(); p.c.createResponse(); await p.advance(12000);
  assert.equal(p.fallbacks.length, 1); assert.equal(p.responses().length, 1);
  assert.match(p.fallbacks[0], /vuelve a pedirla/);
});

test('cancel before creation acknowledgement discards its exact late response before output or tools', () => {
  const p = setup(); let tools = 0; p.c.handleTool = () => { tools++; };
  p.c.createResponse(); p.c.cancel();
  assert.equal(p.c.responseCreatePending, true);
  p.event('response.created', { response: { id: 'cancelled-late' } });
  p.event('response.output_text.delta', { response_id: 'cancelled-late', delta: 'unwanted' });
  p.event('response.function_call_arguments.done', { response_id: 'cancelled-late', call_id: 'stale-tool' });
  assert.deepEqual(p.sent.filter(e => e.type === 'response.cancel'), [
    { type: 'response.cancel', response_id: 'cancelled-late' },
  ]);
  assert.equal(p.c.responseActive, false); assert.equal(p.c.currentAssistantText, '');
  assert.equal(tools, 0); assert.equal(p.c.conversationActive, false);
  p.event('response.done', { response: { id: 'cancelled-late', status: 'cancelled' } });
  assert.equal(p.c.responseCreatePending, false); assert.equal(p.responses().length, 1);
});

test('new explicit request waits until the provider retires the cancelled pending response', () => {
  const p = setup(); p.c.createResponse(); p.c.cancel();
  assert.equal(p.c.createResponse({ output_modalities: ['text'] }), true);
  p.event('response.created', { response: { id: 'retire-me' } });
  assert.equal(p.responses().length, 1, 'do not race response.cancel with another response.create');
  p.event('response.done', { response: { id: 'retire-me', status: 'cancelled' } });
  assert.equal(p.responses().length, 2);
  assert.deepEqual(p.responses()[1].response, { output_modalities: ['text'] });
  p.event('response.created', { response: { id: 'new-request' } });
  p.event('response.output_text.delta', { response_id: 'retire-me', delta: 'old' });
  p.event('response.output_text.delta', { response_id: 'new-request', delta: 'new' });
  assert.equal(p.c.currentAssistantText, 'new'); assert.equal(p.c.responseActive, true);
});

test('another cancel removes the explicitly queued request', () => {
  const p = setup(); p.c.createResponse(); p.c.cancel(); p.c.createResponse(); p.c.cancel();
  p.event('response.created', { response: { id: 'cancelled-twice' } });
  p.event('response.done', { response: { id: 'cancelled-twice', status: 'cancelled' } });
  assert.equal(p.responses().length, 1); assert.equal(p.c.responseCreatePending, false);
});

for (const acknowledged of [false, true]) {
  test(`cancelled creation remains bounded if its ${acknowledged ? 'completion' : 'acknowledgement'} never arrives`, async () => {
    const p = setup(); p.c.createResponse(); p.c.cancel(); p.c.createResponse();
    if (acknowledged) p.event('response.created', { response: { id: 'never-retired' } });
    await p.advance(12000);
    assert.equal(p.fallbacks.length, 1); assert.equal(p.c.closed, true);
    assert.equal(p.responses().length, 1, 'neither old nor queued request is automatically replayed');
    assert.equal(p.c.queuedResponseAfterCancel, null);
  });
}

for (const name of ['atlas_shell', 'atlas_web_search']) {
  for (const rejects of [false, true]) {
    test(`${name} late ${rejects ? 'failure' : 'result'} after cancel cannot affect a newer tool`, async () => {
      const deferred = [];
      const p = setup({ fetchOverride: async url => {
        if (!['/api/realtime/shell', '/api/realtime/web-search'].includes(url)) return { ok: true, json: async () => ({}) };
        return new Promise((resolve, reject) => deferred.push({ resolve, reject }));
      } });
      const tool = id => p.c.handleTool({ name, item_id: id, call_id: id, arguments: JSON.stringify(
        name === 'atlas_shell' ? { command: 'true' } : { query: 'test fixture' }) });
      p.event('response.created', { response: { id: 'old-response' } });
      const old = tool('old-tool'); p.c.cancel();
      p.c.conversationActive = true;
      p.event('response.created', { response: { id: 'new-response' } });
      const next = tool('new-tool'), currentController = p.c.consultController;
      if (rejects) deferred[0].reject(new Error('late network failure'));
      else deferred[0].resolve({ ok: true, json: async () => ({ output: 'old result' }) });
      await old;
      assert.equal(p.c.consultController, currentController); assert.equal(p.c.toolActive, true);
      assert.equal(p.sent.some(e => e.item?.call_id === 'old-tool'), false);
      assert.equal(p.responses().length, 0);
      deferred[1].resolve({ ok: true, json: async () => ({ output: 'new result', count: 1 }) });
      await next;
      assert.equal(p.sent.filter(e => e.item?.call_id === 'new-tool').length, 1);
      assert.equal(p.c.toolActive, false); assert.equal(p.c.consultController, null);
      assert.equal(deferred.length, 2, 'no action was replayed');
    });
  }
}

test('cancelled response deltas and done cannot corrupt a new answer', () => {
  const p = setup(); p.event('response.created', { response: { id: 'old' } });
  p.c.cancelProviderResponse(); p.event('response.created', { response: { id: 'new' } });
  p.event('response.output_audio_transcript.delta', { response_id: 'old', delta: 'obsoleto' });
  p.event('response.done', { response: { id: 'old', status: 'cancelled' } });
  assert.equal(p.c.responseActive, true); assert.equal(p.c.currentAssistantText, '');
  p.event('response.output_audio_transcript.delta', { response_id: 'new', delta: 'actual' });
  assert.equal(p.c.currentAssistantText, 'actual');
});

test('failed response.done surfaces the provider error without disconnect or replay', () => {
  const p = setup(); p.event('response.created', { response: { id: 'failed' } });
  p.event('response.done', { response: { id: 'failed', status: 'failed',
    status_details: { error: { message: 'temporary provider error' } } } });
  assert.equal(p.c.closed, false); assert.equal(p.c.responseActive, false);
  assert.equal(p.responses().length, 0); assert.equal(p.fallbacks.length, 0);
  assert.ok(p.logs.some(e => e.stage === 'response.failed' && e.detail === 'temporary provider error'));
});

test('native playback returns to wake immediately after audio ends, never opens followup', async () => {
  const p = setup(); p.c.lastSpeechEndedAt = 10000;
  p.event('response.created', { response: { id: 'spoken' } });
  await p.advance(1500); p.event('output_audio_buffer.started', { response_id: 'spoken' });
  p.c.currentAssistantText = 'Todo correcto.';
  p.event('response.done', { response: { id: 'spoken', status: 'completed' } });
  assert.equal(p.followups.length, 0);
  assert.equal(p.logs.find(e => e.stage === 'audio.playback_started').durationMs, 1500);
  p.event('output_audio_buffer.stopped', { response_id: 'spoken' });
  assert.equal(p.followups.length, 0);
  assert.equal(p.c.conversationActive, false);
  await p.advance(10000); assert.equal(p.c.conversationActive, false);
});

test('a completed statement returns to wake just like a completed question', async () => {
  const p = setup(); p.c.currentAssistantText = 'La temperatura es de cuarenta grados.';
  p.c.settleAfterResponse(); assert.equal(p.followups.length, 0);
  assert.equal(p.c.conversationActive, false);
});

test('a late ambient transcript cannot keep admission open after playback finishes', async () => {
  const p = setup({ a1: false });
  p.c.responseFinalized = true;
  p.c.turnInputPending = true; p.c.pendingTranscripts = 1;
  p.c.settleAfterResponse();
  assert.equal(p.c.conversationActive, false);
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'ambient', transcript: 'y mañana' });
  await p.advance(500);
  assert.equal(p.responses().length, 0);
  p.c.authorizeLocalWake('ATLAS, y mañana'); p.c.queueLocalWakeRequest('y mañana', true);
  await p.advance(700);
  assert.equal(p.responses().length, 1, 'a fresh explicit wake still works');
});

test('Chrome handles a remote browser wake without auxiliary transcription', async () => {
  const p = setup({ a1: false }); p.c.conversationActive = false;
  p.event('input_audio_buffer.speech_started', { item_id: 'voice' });
  p.c.authorizeLocalWake('ATLAS, hola'); p.c.queueLocalWakeRequest('hola', true);
  p.event('input_audio_buffer.speech_stopped', { item_id: 'voice' });
  p.event('conversation.item.input_audio_transcription.failed', { item_id: 'voice', error: { code: 'missing_compute_residency_info' } });
  await p.advance(180); assert.equal(p.responses().length, 1);
  assert.equal(p.requests()[0].item.content[0].text, 'hola');
});

test('speech after the completed response cannot open a turn without another ATLAS', async () => {
  const p = setup(); p.c.settleAfterResponse();
  p.event('input_audio_buffer.speech_started', { item_id: 'followup' });
  assert.equal(p.c.beginLocalFollowUp(), false); p.c.queueLocalWakeRequest('y mañana', true);
  p.event('input_audio_buffer.speech_stopped', { item_id: 'followup' });
  p.event('input_audio_buffer.committed', { item_id: 'followup' });
  p.event('conversation.item.input_audio_transcription.failed', { item_id: 'followup', error: { code: 'missing_compute_residency_info' } });
  await p.advance(180); assert.equal(p.requests().length, 0); assert.equal(p.responses().length, 0);
  p.event('conversation.item.input_audio_transcription.completed', { item_id: 'followup', transcript: 'different duplicate' });
  assert.equal(p.c.pendingTranscripts, 0); assert.equal(p.requests().length, 0);
});

test('Chrome cannot start followup outside conversation or over active output', () => {
  const p = setup(); p.c.conversationActive = false; assert.equal(p.c.beginLocalFollowUp(), false);
  p.c.conversationActive = true; p.c.nativePlaybackActive = true; assert.equal(p.c.beginLocalFollowUp(), false);
  p.c.nativePlaybackActive = false; p.c.toolActive = true; assert.equal(p.c.beginLocalFollowUp(), false);
});

test('duplicate VAD stop and transcript cannot leave ghost pending input', async () => {
  const p = setup(); p.event('input_audio_buffer.speech_started', { item_id: 'voice' });
  p.event('input_audio_buffer.speech_stopped', { item_id: 'voice' });
  p.event('input_audio_buffer.speech_stopped', { item_id: 'voice' });
  assert.equal(p.c.pendingTranscripts, 1);
  for (let i = 0; i < 2; i++) p.event('conversation.item.input_audio_transcription.completed', { item_id: 'voice', transcript: 'hola' });
  await p.advance(180); assert.equal(p.c.pendingTranscripts, 0); assert.equal(p.responses().length, 1);
});

test('empty transcript restores listening instead of leaving a processing screen', () => {
  const p = setup(); p.c.beginSpeech(); p.c.endSpeech();
  p.c.handleUserTranscript({ item_id: 'empty', transcript: '' });
  assert.equal(p.c.turnInputPending, false); assert.equal(p.screens.at(-1)[1], 'Esperando a ATLAS');
});

test('late microphone permission after stop releases capture and cannot revive the session', async () => {
  let resolveMedia, trackStopped = 0;
  const media = new Promise(resolve => { resolveMedia = resolve; });
  const p = setup({ mediaDevices: { getUserMedia: () => media },
    fetchOverride: async () => ({ ok: true, json: async () => ({ session: { transport: 'webrtc', clientSecret: 'fake-test-only' } }) }) });
  const started = p.c.startInternal(); await p.flush(); p.c.stop(false);
  resolveMedia({ getTracks: () => [{ stop() { trackStopped++; } }] });
  await assert.rejects(started, /cancelado/);
  assert.equal(trackStopped, 1); assert.equal(p.c.closed, true); assert.equal(p.c.media, null);
});

test('idle session is proactively renewed before provider maximum duration', async () => {
  const p = setup(); let renewals = 0;
  p.c.state = 'configuring'; p.c.restartForContext = async (_, options) => { assert.equal(options.whenIdle, true); renewals++; };
  p.c.markReady(); await p.advance(50 * 60 * 1000);
  assert.equal(renewals, 1);
});

test('a stalled reservation is bounded to25s and cannot retain startPromise forever', async () => {
  const p = setup({ mediaDevices: { getUserMedia: () => Promise.resolve({}) },
    fetchOverride: () => new Promise(() => {}) });
  p.c.closed = true;
  const started = p.c.start();
  const rejected = assert.rejects(started, /cancelado/);
  await p.advance(25000); await rejected;
  assert.equal(p.c.startPromise, null); assert.equal(p.c.closed, true);
  assert.equal(p.fallbacks.length, 1); assert.match(p.fallbacks[0], /25 segundos/);
});

test('startup timeout retires late microphone capture without waiting for permission', async () => {
  let resolveMedia, stopped = 0;
  const p = setup({ mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveMedia = resolve; }) },
    fetchOverride: async () => ({ ok: true, json: async () => ({ session: { transport: 'webrtc', clientSecret: 'fake-test-only' } }) }) });
  const started = p.c.startInternal(), rejected = assert.rejects(started, /cancelado/);
  await p.flush(); await p.advance(25000); await rejected;
  assert.equal(p.c.closed, true); assert.equal(p.fallbacks.length, 1);
  resolveMedia({ getTracks: () => [{ stop() { stopped++; } }] }); await p.flush();
  assert.equal(stopped, 1); assert.equal(p.c.media, null);
});

test('a model response stalled after acknowledgement gets one30s recovery without replay', async () => {
  const p = setup(); p.c.createResponse(); p.event('response.created', { response: { id: 'stalled' } });
  await p.advance(29999); assert.equal(p.c.closed, false);
  await p.advance(1); assert.equal(p.c.closed, true); assert.equal(p.fallbacks.length, 1);
  assert.equal(p.responses().length, 1); assert.match(p.fallbacks[0], /30 segundos/);
});

test('real response progress resets the stall watchdog and completion clears it', async () => {
  const p = setup(); p.event('response.created', { response: { id: 'progress' } });
  await p.advance(29000); p.event('response.output_audio_transcript.delta', { response_id: 'progress', delta: 'Una frase. ' });
  await p.advance(29000); assert.equal(p.c.closed, false);
  p.event('response.done', { response: { id: 'progress', status: 'completed' } });
  await p.advance(31000); assert.equal(p.c.closed, false); assert.equal(p.fallbacks.length, 0);
});

test('stall watchdog never cancels an actively running bounded backend tool', async () => {
  const p = setup(); p.event('response.created', { response: { id: 'tool' } }); p.c.toolActive = true;
  await p.advance(45000); assert.equal(p.c.closed, false); assert.equal(p.fallbacks.length, 0);
  p.c.toolActive = false; p.event('response.done', { response: { id: 'tool', status: 'completed' } });
  await p.advance(31000); assert.equal(p.c.closed, false);
});
