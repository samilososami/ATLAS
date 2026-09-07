const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup({ design = 'new', bridge = true, renderer = true } = {}) {
  const sent = [], painted = [], requests = [], timers = new Map();
  let timerId = 0;
  const window = {
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  if (bridge) window.AtlasFaceBridge = {
    expressionsAvailable: () => renderer,
    expression(value) { painted.push(JSON.parse(JSON.stringify(value))); return true; },
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), {
    window, document: { body: { dataset: { design } } }, navigator: {},
    crypto: { randomUUID: () => '00000000-0000-0000-0000-000000000001' },
    performance: { now: () => 1000 }, AbortController, console,
  });
  const realtime = window.AtlasRealtime;
  const c = realtime.create({ fetch: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return { ok: true, text: async () => '{}', json: async () => ({ ok: true, output: 'fixture' }) };
  } });
  c.channel = { readyState: 'open', send: value => sent.push(JSON.parse(value)), close() {} };
  c.closed = false;
  c.state = 'ready';
  c.conversationActive = true;
  c.currentRequestId = 'user-turn';
  c.currentInteractionId = 'interaction';
  c.persistCompletedTurn = async () => {};
  const tools = c.configureFaceTools();
  const event = value => c.handleEvent(JSON.stringify(value));
  const response = (id = 'r1') => event({ type: 'response.created', response: { id } });
  const call = (args = { expression: 'delighted' }, callId = 'call-face', responseId = c.currentResponseId) => event({
    type: 'response.function_call_arguments.done', name: 'atlas_face', item_id: `item-${callId}`,
    call_id: callId, response_id: responseId, arguments: typeof args === 'string' ? args : JSON.stringify(args),
  });
  const done = (output = [], status = 'completed', id = c.currentResponseId) => event({
    type: 'response.done', response: { id, status, output },
  });
  const outputs = () => sent.filter(e => e.item?.type === 'function_call_output');
  const creates = () => sent.filter(e => e.type === 'response.create');
  return { c, window, realtime, sent, painted, requests, timers, tools, event, response, call, done, outputs, creates };
}

test('only the new surface with a functioning bridge advertises the optional local tool', () => {
  for (const opts of [{ design: 'debug' }, { bridge: false }, { renderer: false }]) {
    const p = setup(opts);
    assert.deepEqual(Array.from(p.tools, tool => tool.name), ['atlas_shell', 'atlas_web_search', 'atlas_routine']);
    p.response(); p.call(); p.done();
    assert.equal(p.painted.length, 0);
    assert.equal(p.outputs().length, 0);
    assert.equal(p.creates().length, 0);
    p.c.stop(false);
  }
  const p = setup();
  assert.deepEqual(Array.from(p.tools, tool => tool.name), ['atlas_shell', 'atlas_web_search', 'atlas_routine', 'atlas_face']);
  assert.equal(p.realtime.model, 'gpt-realtime-2.1');
  assert.equal(p.realtime._test.realtimeTools.length, 3); // no global debug mutation
  assert.equal(p.realtime._test.faceTool.parameters.properties.expression.enum.length, 13);
  assert.match(p.realtime._test.faceInstructions, /semánticamente/);
  p.c.stop(false);
});

test('the model-selected expression paints locally and immediately ACKs without another response', async () => {
  const p = setup(); p.response(); p.call({ expression: 'curious', duration_ms: 9000 });
  assert.deepEqual(p.painted, [{ expression: 'curious', source: 'model', durationMs: 9000 }]);
  assert.deepEqual(JSON.parse(p.outputs()[0].item.output), { ok: true, expression: 'curious' });
  assert.equal(p.creates().length, 0);
  assert.equal(p.c.responseActive, true);
  assert.ok(p.requests.every(r => r.url === '/api/realtime/event')); // no classifier/backend tool call
  assert.ok(p.requests.some(r => r.body.stage === 'face.expression' && r.body.expression === 'curious'));
  p.c.stop(false);
});

test('a face-only response gets exactly one normal continuation with only visual tool excluded', () => {
  const p = setup(); p.response(); p.call(); p.done();
  assert.equal(p.creates().length, 1);
  assert.deepEqual(p.creates()[0].response.tools.map(t => t.name), ['atlas_shell', 'atlas_web_search', 'atlas_routine']);
  p.done();
  assert.equal(p.creates().length, 1);
  p.response('r2');
  p.event({ type: 'response.output_audio_transcript.delta', response_id: 'r2', delta: 'Gracias.' });
  p.done();
  assert.equal(p.creates().length, 1);
  assert.equal(p.c.conversationActive, false); // completed answer returns to fresh wake
  p.c.stop(false);
});

test('one semantic selection per explicit turn, even if provider emits a second different call ID', () => {
  const p = setup(); p.response(); p.call(); p.call({ expression: 'angry' }, 'second-call');
  assert.equal(p.painted.length, 1);
  assert.equal(JSON.parse(p.outputs()[1].item.output).error, 'expression_already_selected');
  p.done(); assert.equal(p.creates().length, 1);
  p.response('r2'); p.call({ expression: 'laughing' }, 'third-call'); p.done();
  assert.equal(p.painted.length, 1);
  assert.equal(p.creates().length, 1); // no function-only cosmetic loop
  p.c.stop(false);
});

test('new explicitly submitted Chrome request re-enables the visual choice, including without a fresh VAD ID', () => {
  const p = setup(); p.response(); p.call();
  p.event({ type: 'response.output_text.delta', response_id: 'r1', delta: 'Hola.' }); p.done();
  p.c.localWakeFallbackText = 'Una nueva petición';
  p.c.submitLocalWakeRequest();
  assert.equal(p.c.faceToolUsedThisTurn, false);
  assert.equal(p.creates().at(-1).response, undefined); // use full advertised session tools again
  p.response('r2'); p.call({ expression: 'surprised' }, 'new-call');
  assert.equal(p.painted.at(-1).expression, 'surprised');
  p.c.stop(false);
});

for (const modality of ['text', 'audio-transcript', 'buffer', 'completed-audio-item']) {
  test(`multimodal ${modality} plus face does not generate duplicate speech/response.create`, () => {
    const p = setup(); p.response(); p.call();
    if (modality === 'text') p.event({ type: 'response.output_text.delta', response_id: 'r1', delta: 'Gracias.' });
    if (modality === 'audio-transcript') p.event({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Gracias.' });
    if (modality === 'buffer') p.event({ type: 'output_audio_buffer.started', response_id: 'r1' });
    const output = modality === 'completed-audio-item'
      ? [{ type: 'message', role: 'assistant', content: [{ type: 'audio', transcript: 'Gracias.' }] }] : [];
    p.done(output);
    assert.equal(p.creates().length, 0);
    if (modality === 'buffer') p.event({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
    assert.equal(p.creates().length, 0);
    p.c.stop(false);
  });
}

test('buffered native speech that ended before response.done still suppresses visual continuation', () => {
  const p = setup(); p.response(); p.call();
  p.event({ type: 'output_audio_buffer.started', response_id: 'r1' });
  p.event({ type: 'output_audio_buffer.stopped', response_id: 'r1' });
  p.done(); assert.equal(p.creates().length, 0);
  p.c.stop(false);
});

test('external synthesis remains speaking after model completion, with no extra visual continuation', () => {
  const p = setup(); p.response(); p.call(); p.c.externalPlaybackActive = true;
  p.done();
  assert.equal(p.creates().length, 0);
  assert.equal(p.c.externalPlaybackActive, true);
  p.c.stop(false);
});

test('face plus real tool uses only the existing tool continuation, with shell/search retained', async () => {
  const p = setup(); p.response(); p.call();
  await p.c.handleTool({ name: 'atlas_shell', call_id: 'shell-call', item_id: 'shell-item',
    response_id: 'r1', arguments: '{"command":"printf fixture"}' });
  assert.equal(p.c.pendingToolResponse, true);
  p.done([{ type: 'function_call', name: 'atlas_shell' }]);
  assert.equal(p.creates().length, 1);
  assert.deepEqual(p.creates()[0].response.tools.map(t => t.name), ['atlas_shell', 'atlas_web_search', 'atlas_routine']);
  p.c.stop(false);
});

test('duplicate call IDs/delta completion events never repaint or ACK twice', () => {
  const p = setup(); p.response();
  p.event({ type: 'response.function_call_arguments.delta', name: 'atlas_face', call_id: 'c1',
    item_id: 'item-c1', response_id: 'r1', delta: '{"expression":"wink"}' });
  p.call({}, 'c1'); p.call({ expression: 'angry' }, 'c1');
  assert.equal(p.painted.length, 1);
  assert.equal(p.painted[0].expression, 'wink');
  assert.equal(p.outputs().length, 1);
  p.c.stop(false);
});

test('stale, finished, unsolicited and cancelled tool calls cannot change the face or speak', () => {
  for (const mode of ['stale', 'finished', 'cancelled', 'no-response-id', 'no-admission']) {
    const p = setup(); p.response();
    if (mode === 'stale') p.c.currentResponseId = 'new-response';
    if (mode === 'finished') p.c.finishedResponseIds.add('r1');
    if (mode === 'cancelled') p.c.cancel();
    if (mode === 'no-admission') p.c.conversationActive = false;
    const before = p.painted.length;
    p.call({ expression: 'angry' }, 'stale-call', mode === 'no-response-id' ? '' : 'r1');
    assert.equal(p.painted.length, before, mode);
    assert.equal(p.outputs().length, 0, mode);
    assert.equal(p.creates().length, 0, mode);
    p.c.stop(false);
  }
});

for (const args of [{ expression: 'command' }, { expression: 'angry', command: 'poweroff' },
  { expression: 'shy', duration_ms: 0 }, { expression: 'shy', duration_ms: 30001 },
  { expression: 'shy', duration_ms: '5000' }, { expression: 'shy', duration_ms: 1.2 },
  [], null, '{bad-json']) {
  test(`invalid visual payload is rejected without cancelling voice: ${JSON.stringify(args)}`, () => {
    const p = setup(); p.response(); p.call(args);
    assert.equal(p.painted.length, 0);
    assert.equal(JSON.parse(p.outputs()[0].item.output).error, 'invalid_expression');
    assert.equal(p.c.responseActive, true);
    assert.equal(p.sent.some(e => ['response.cancel', 'output_audio_buffer.clear'].includes(e.type)), false);
    p.event({ type: 'response.output_text.delta', response_id: 'r1', delta: 'Continúo.' });
    p.done(); assert.equal(p.creates().length, 0);
    p.c.stop(false);
  });
}

test('renderer exceptions do not break a normal function ACK or create cancellation', () => {
  const p = setup(); p.window.AtlasFaceBridge.expression = () => { throw new Error('render only'); };
  p.response(); p.call();
  assert.equal(JSON.parse(p.outputs()[0].item.output).error, 'expression_unavailable');
  assert.equal(p.c.responseActive, true);
  p.done(); assert.equal(p.creates().length, 1);
  p.c.stop(false);
});

test('a capability probe exception disables the optional tool, without disabling Realtime', () => {
  const p = setup();
  p.window.AtlasFaceBridge.expressionsAvailable = () => { throw new Error('optional renderer'); };
  assert.deepEqual(Array.from(p.c.configureFaceTools(), tool => tool.name), ['atlas_shell', 'atlas_web_search', 'atlas_routine']);
  assert.equal(p.c.closed, false);
  p.c.stop(false);
});

test('a closed or throwing data channel cannot create an unacknowledged cosmetic continuation', async () => {
  const p = setup(); p.response();
  p.c.channel.readyState = 'closing'; p.call();
  assert.equal(p.painted.length, 0);
  p.c.channel.readyState = 'open';
  p.c.channel.send = () => { throw new Error('channel closed during ACK'); };
  await p.c.handleTool({ name: 'atlas_face', call_id: 'throwing-call', item_id: 'throwing-item',
    response_id: 'r1', arguments: '{"expression":"wink"}' });
  assert.equal(p.c.faceToolResponseId, '');
  assert.equal(p.c.responseActive, true);
  p.c.channel.send = value => p.sent.push(JSON.parse(value));
  p.done(); assert.equal(p.creates().length, 0);
  p.c.stop(false);
});

test('failure/cancel never continue a visual-only response; interruption resets only visual state', () => {
  for (const status of ['cancelled', 'failed', 'incomplete']) {
    const p = setup(); p.response(); p.call(); p.done([], status);
    assert.equal(p.creates().length, 0);
    p.c.stop(false);
  }
  const p = setup(); p.response(); p.call(); p.c.cancel();
  assert.equal(p.painted.at(-1).expression, 'neutral');
  assert.equal(p.c.faceToolResponseId, '');
  p.done(); assert.equal(p.creates().length, 0);
  p.c.stop(false);
});

test('stop clears expression bookkeeping and timers; caller tool overrides are never widened', () => {
  const p = setup(); p.response(); p.call();
  p.c.responseActive = false;
  p.c.createResponse({ tools: [], tool_choice: 'none', output_modalities: ['text'] });
  assert.deepEqual(p.creates()[0].response.tools, []);
  assert.equal(p.creates()[0].response.tool_choice, 'none');
  p.c.stop(false);
  assert.equal(p.c.faceToolEnabled, false);
  assert.equal(p.c.faceToolCalls.size, 0);
  assert.equal(p.c.faceToolResponseId, '');
  assert.equal(p.painted.at(-1).expression, 'neutral');
});
