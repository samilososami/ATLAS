const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadRealtime() {
  const window = { setTimeout, clearTimeout };
  const audio = {
    isConnected: true, paused: true, muted: true,
    play: () => Promise.resolve(), pause() {},
  };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), {
    window,
    crypto: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
    navigator: {}, RTCPeerConnection: undefined, MediaStream: class {}, AudioContext: class {},
    document: { querySelector: () => audio, createElement: () => audio, body: { append() {} } },
    performance: { now: () => 1000 },
    fetch: async () => { throw new Error('Unexpected global fetch'); },
    setTimeout, clearTimeout, console, JSON, String, Number, RegExp, Object, Array, Error,
    AbortController,
  });
  return window.AtlasRealtime;
}

test('Realtime exposes shell and Tavily, but no OpenClaw agent tool', () => {
  const realtime = loadRealtime();
  const names = Array.from(realtime._test.realtimeTools, tool => tool.name);
  assert.deepEqual(names, ['atlas_shell', 'atlas_web_search']);
});

test('Tavily tool calls the dedicated backend and returns evidence to Realtime', async () => {
  const requests = [];
  const realtime = loadRealtime();
  const sent = [];
  const controller = realtime.create({ fetch: async (url, options = {}) => {
    requests.push({ url, options });
    if (url === '/api/realtime/web-search') {
      return { ok: true, json: async () => ({
        ok: true, provider: 'tavily', count: 1,
        results: [{ title: 'Result', url: 'https://example.com', content: 'Evidence' }],
      }) };
    }
    return { ok: true, json: async () => ({ saved: true }) };
  }, callbacks: {} });
  controller.closed = false;
  controller.state = 'ready';
  controller.channel = { readyState: 'open', send: value => sent.push(JSON.parse(value)) };
  await controller.handleTool({
    name: 'atlas_web_search', call_id: 'call-web-1',
    arguments: JSON.stringify({ query: 'actualidad de OpenAI', max_results: 3 }),
  });
  const webCall = requests.find(request => request.url === '/api/realtime/web-search');
  assert.ok(webCall);
  assert.equal(JSON.parse(webCall.options.body).args.query, 'actualidad de OpenAI');
  const output = sent.find(event => event.type === 'conversation.item.create');
  assert.equal(output.item.type, 'function_call_output');
  assert.equal(JSON.parse(output.item.output).provider, 'tavily');
  assert.equal(sent.at(-1).type, 'response.create');
});
