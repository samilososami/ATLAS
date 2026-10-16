const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(fetch) {
  const window = { setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), {
    window, crypto: { randomUUID: () => 'capabilities-test' }, performance,
    navigator: {}, document: {}, setTimeout, clearTimeout, AbortController, console,
  });
  const controller = window.AtlasRealtime.create({ fetch, callbacks: {} });
  controller.closed = false;
  controller.state = 'ready';
  controller.postEvent = () => {};
  controller.submitToolResult = (id, result) => { controller.result = { id, result }; };
  return { controller, tools: window.AtlasRealtime._test.realtimeTools };
}

test('capability lookup is registered and never dispatches shell', async () => {
  const calls = [];
  const { controller, tools } = harness(async (url, options) => {
    calls.push([url, JSON.parse(options.body)]);
    return { ok: true, json: async () => ({ ok: true, readOnly: true, manuals: [] }) };
  });
  assert.equal(tools.filter(t => t.name === 'atlas_capabilities').length, 1);
  await controller.handleTool({ name: 'atlas_capabilities', call_id: 'lookup', arguments: '{"query":"cuota"}' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/realtime/capabilities');
  assert.equal(calls[0][1].args.query, 'cuota');
  assert.equal(controller.result.result.readOnly, true);
  assert.equal(controller.toolActive, false);
});

test('lookup failure returns evidence, not success', async () => {
  const { controller } = harness(async () => ({ ok: false, status: 400,
    json: async () => ({ error: 'Manual no disponible' }) }));
  await controller.handleTool({ name: 'atlas_capabilities', call_id: 'fail', arguments: '{"manual":"USER.md"}' });
  assert.equal(controller.result.result.error, 'Manual no disponible');
  assert.equal(controller.toolActive, false);
});

test('cancelled or stale discovery cannot inject a late tool result', async () => {
  let resolve;
  const { controller } = harness(() => new Promise(r => { resolve = r; }));
  const pending = controller.handleTool({ name: 'atlas_capabilities', call_id: 'late', arguments: '{}' });
  controller.consultController.abort();
  resolve({ ok: true, json: async () => ({ ok: true }) });
  await pending;
  assert.equal(controller.result, undefined);
});
