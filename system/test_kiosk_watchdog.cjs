'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const {
  PipeClient, RecoveryPolicy, pageIsHealthy, documentProbe, recoverPage, restartDelay, selectedPageURL, PAGE_URL, NEW_PAGE_URL,
} = require('./libexec/atlas-screen-browser-watchdog.cjs');

test('healthy HTTP or a surviving title alone cannot validate a crashed document', () => {
  for (const value of [null, {}, { url: PAGE_URL, title: 'ATLAS WebScreen' },
    { url: PAGE_URL, title: 'ATLAS WebScreen', ready: true, app: false },
    { url: 'chrome-error://chromewebdata/', title: 'Aw, Snap!', ready: true, app: true }]) {
    assert.equal(pageIsHealthy(value), false);
  }
  assert.equal(pageIsHealthy({ url: PAGE_URL, title: 'ATLAS WebScreen', ready: true, app: true }), true);
});

test('startup grace and two failures precede one tab recovery then bounded browser restart', () => {
  const p = new RecoveryPolicy(0);
  assert.equal(p.observe(false, 29000), 'wait');
  assert.equal(p.observe(false, 30000), 'wait');
  assert.equal(p.observe(false, 35000), 'reload');
  assert.equal(p.observe(false, 64999), 'wait');
  assert.equal(p.observe(false, 65000), 'wait');
  assert.equal(p.observe(false, 70000), 'restart');
});

test('a healthy document resets the failure count; one slow frame never causes reload', () => {
  const p = new RecoveryPolicy(0);
  assert.equal(p.observe(true, 1000), 'healthy');
  assert.equal(p.observe(false, 31000), 'wait');
  assert.equal(p.observe(true, 36000), 'healthy');
  assert.equal(p.observe(false, 41000), 'wait');
});

test('repeated browser deaths back off and three in five minutes get a minute cooldown', () => {
  assert.equal(restartDelay([], 100000).delay, 3000);
  assert.equal(restartDelay([99000], 100000).delay, 6000);
  assert.equal(restartDelay([97000, 98000, 99000], 100000).delay, 60000);
  assert.deepEqual(restartDelay([1000], 400000), { recent: [], delay: 3000 });
});

test('private pipe handles fragmented framed responses without leaking pending probes', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const p = new PipeClient(input, output, 100);
  const result = p.call('Target.getTargets');
  const request = JSON.parse(input.read().toString().replace(/\0$/, ''));
  output.write('{"id":' + request.id + ',"result":');
  output.write('{"targetInfos":[]}}\0');
  assert.deepEqual(await result, { targetInfos: [] });
  assert.equal(p.pending.size, 0); p.close();
});

test('silent renderer probe has a hard deadline and late results stay retired', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const p = new PipeClient(input, output, 5);
  await assert.rejects(p.call('Runtime.evaluate'), /timeout/);
  assert.equal(p.pending.size, 0);
  output.write('{"id":1,"result":{"result":{"value":"late"}}}\0');
  assert.equal(p.pending.size, 0); p.close();
});

test('closing a pipe retires all outstanding probes and disallows new requests', async () => {
  const p = new PipeClient(new PassThrough(), new PassThrough());
  const request = p.call('Target.getTargets'); p.close();
  await assert.rejects(request, /closed/);
  await assert.rejects(p.call('Target.getTargets'), /closed/);
  assert.equal(p.pending.size, 0);
});

test('document probe attaches only to the dedicated kiosk target and reuses its private session', async () => {
  const calls = [], state = { id: '', session: '' };
  const client = { async call(method, params, session) {
    calls.push({ method, params, session });
    if (method === 'Target.getTargets') return { targetInfos: [
      { type: 'page', targetId: 'unrelated', url: 'https://example.com/' },
      { type: 'page', targetId: 'atlas', url: PAGE_URL },
    ] };
    if (method === 'Target.attachToTarget') return { sessionId: 'private-session' };
    return { result: { value: JSON.stringify({ url: PAGE_URL, title: 'ATLAS WebScreen', ready: true, app: true }) } };
  } };
  assert.equal(await documentProbe(client, state), true);
  assert.equal(await documentProbe(client, state), true);
  assert.equal(calls.filter(c => c.method === 'Target.attachToTarget').length, 1);
  assert.equal(calls.find(c => c.method === 'Target.attachToTarget').params.targetId, 'atlas');
  assert.equal(calls.at(-1).session, 'private-session');
});

test('Chrome error page cannot become healthy just because the original URL still exists', async () => {
  const client = { async call(method) {
    if (method === 'Target.getTargets') return { targetInfos: [{ type: 'page', targetId: 'atlas', url: PAGE_URL }] };
    if (method === 'Target.attachToTarget') return { sessionId: 's' };
    return { exceptionDetails: { text: 'Renderer crashed' } };
  } };
  assert.equal(await documentProbe(client, { id: '', session: '' }), false);
});

test('recovery targets only the fixed kiosk URL, never replays a prompt or command', async () => {
  const calls = [];
  const client = { async call(method, params, session) { calls.push({ method, params, session }); return {}; } };
  await recoverPage(client, { id: 'atlas', session: 's' });
  assert.deepEqual(calls, [{ method: 'Page.navigate', params: { url: PAGE_URL }, session: 's' }]);
});

test('new design recovery stays on new; persisted design accepts no arbitrary URL', async () => {
  assert.equal(selectedPageURL(() => 'atlas-new\n'), NEW_PAGE_URL);
  assert.equal(selectedPageURL(() => 'atlas\n'), PAGE_URL);
  assert.equal(selectedPageURL(() => 'https://untrusted.example/'), PAGE_URL);
  assert.equal(selectedPageURL(() => { throw new Error('missing'); }), PAGE_URL);
  const calls = [], client = { async call(...args) { calls.push(args); return {}; } };
  await recoverPage(client, { id: 'atlas', session: 's' }, NEW_PAGE_URL);
  assert.equal(calls[0][1].url, NEW_PAGE_URL);
  await assert.rejects(recoverPage(client, { id: 'atlas', session: 's' }, 'https://example.com'), /Invalid kiosk route/);
});

test('new and debug share the health contract but do not report the wrong design as ready', () => {
  const value = { url: NEW_PAGE_URL, title: 'ATLAS WebScreen', ready: true, app: true };
  assert.equal(pageIsHealthy(value, NEW_PAGE_URL), true);
  assert.equal(pageIsHealthy(value, PAGE_URL), false);
});

test('production watchdog opens pipes only and never disables Chrome sandbox or touches network/audio services', () => {
  const source = fs.readFileSync(`${__dirname}/libexec/atlas-screen-browser-watchdog.cjs`, 'utf8');
  assert.ok(source.includes("stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe']"));
  assert.ok(source.includes("['--remote-debugging-pipe', ...chromeArgs, pageURL]"));
  for (const forbidden of ['--remote-debugging-port=', 'systemctl restart', 'nmcli', 'bluetoothctl', 'pactl']) {
    assert.equal(source.includes(forbidden), false);
  }
});
