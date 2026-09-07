'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  PipeClient, RecoveryPolicy, pageIsHealthy, documentProbe, recoverPage, restartDelay,
  selectedPageURL, readDesignSelection, designSelectionChanged, applySelectedDesign, PAGE_URL, NEW_PAGE_URL,
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
  assert.deepEqual(calls, [
    { method: 'Page.getNavigationHistory', params: {}, session: 's' },
    { method: 'Page.navigate', params: { url: PAGE_URL }, session: 's' },
  ]);
});

test('new design recovery stays on new; persisted design accepts no arbitrary URL', async () => {
  assert.equal(selectedPageURL(() => 'atlas-new\n'), NEW_PAGE_URL);
  assert.equal(selectedPageURL(() => 'atlas\n'), PAGE_URL);
  assert.equal(selectedPageURL(() => 'https://untrusted.example/'), PAGE_URL);
  assert.equal(selectedPageURL(() => { throw new Error('missing'); }), PAGE_URL);
  const calls = [], client = { async call(...args) { calls.push(args); return {}; } };
  await recoverPage(client, { id: 'atlas', session: 's' }, NEW_PAGE_URL);
  assert.equal(calls.at(-1)[1].url, NEW_PAGE_URL);
  await assert.rejects(recoverPage(client, { id: 'atlas', session: 's' }, 'https://example.com'), /Invalid kiosk route/);
});

test('both fixed views are healthy unless an explicit navigation is still pending', () => {
  const value = { url: NEW_PAGE_URL, title: 'ATLAS WebScreen', ready: true, app: true };
  assert.equal(pageIsHealthy(value), true);
  assert.equal(pageIsHealthy(value, NEW_PAGE_URL), true);
  assert.equal(pageIsHealthy(value, PAGE_URL), false);
  for (const url of ['http://localhost:5000/other/?kiosk=1', 'http://localhost:5001/?kiosk=1',
    'http://localhost.evil:5000/?kiosk=1', 'https://example.com/new/?kiosk=1',
    'http://localhost:5000/new/?kiosk=1&token=secret']) {
    assert.equal(pageIsHealthy({ ...value, url }), false, url);
  }
});

function documentClient(initialURL = NEW_PAGE_URL) {
  const calls = [];
  let url = initialURL, ready = true;
  let history = { currentIndex: 0, entries: [{ id: 1, url: initialURL }] };
  return { calls, setURL(value) { url = value; }, setReady(value) { ready = value; },
    setHistory(value) { history = value; },
    async call(method, params, session) {
      calls.push({ method, params, session });
      if (method === 'Target.getTargets') return { targetInfos: [{ type: 'page', targetId: 'atlas', url }] };
      if (method === 'Target.attachToTarget') return { sessionId: 'private-session' };
      if (method === 'Page.getNavigationHistory') return history;
      if (method === 'Runtime.evaluate') return { result: { value: JSON.stringify({ url, title: 'ATLAS WebScreen', ready, app: true }) } };
      return {};
    },
  };
}

test('menu new to debug and back remains healthy across watchdog polls, without navigation', async () => {
  const client = documentClient(), target = { id: '', session: '', pageURL: NEW_PAGE_URL };
  const policy = new RecoveryPolicy(0);
  for (const [index, url] of [NEW_PAGE_URL, PAGE_URL, PAGE_URL, PAGE_URL, NEW_PAGE_URL].entries()) {
    client.setURL(url);
    const healthy = await documentProbe(client, target);
    assert.equal(healthy, true);
    assert.equal(target.pageURL, url);
    assert.equal(policy.observe(healthy, 35000 + index * 5000), 'healthy');
  }
  assert.equal(client.calls.filter(c => c.method === 'Page.navigate').length, 0);
});

test('a later Chrome failure recovers the last healthy menu choice, never the error URL', async () => {
  const client = documentClient(), target = { id: '', session: '', pageURL: NEW_PAGE_URL };
  assert.equal(await documentProbe(client, target), true);
  client.setURL(PAGE_URL);
  assert.equal(await documentProbe(client, target), true);
  client.setURL('chrome-error://chromewebdata/');
  assert.equal(await documentProbe(client, target), false);
  assert.equal(target.pageURL, PAGE_URL);
  await recoverPage(client, target);
  assert.equal(client.calls.at(-1).method, 'Page.navigate');
  assert.equal(client.calls.at(-1).params.url, PAGE_URL);
  assert.equal(target.expectedURL, PAGE_URL);
});

test('replacing web-design with identical content is a new explicit choice; unchanged hide mode is not', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-watchdog-selection-'));
  const file = path.join(directory, 'web-design'), replacement = path.join(directory, 'replacement');
  try {
    fs.writeFileSync(file, 'atlas-new\n');
    const initial = readDesignSelection(file);
    assert.equal(initial.pageURL, NEW_PAGE_URL);
    assert.equal(designSelectionChanged(initial, readDesignSelection(file)), false);
    fs.writeFileSync(replacement, 'atlas-new\n');
    fs.renameSync(replacement, file);
    const repeated = readDesignSelection(file);
    assert.equal(repeated.pageURL, NEW_PAGE_URL);
    assert.equal(designSelectionChanged(initial, repeated), true);
    assert.equal(designSelectionChanged(repeated, readDesignSelection(file)), false);
    fs.writeFileSync(replacement, 'atlas\n');
    fs.renameSync(replacement, file);
    const classic = readDesignSelection(file);
    assert.equal(classic.pageURL, PAGE_URL);
    assert.equal(designSelectionChanged(repeated, classic), true);
  } finally {
    for (const filename of [file, replacement]) { if (fs.existsSync(filename)) fs.unlinkSync(filename); }
    fs.rmdirSync(directory);
  }
});

test('an explicit selection overrides manual navigation and cannot be undone by an old document', async () => {
  const client = documentClient(PAGE_URL), target = { id: '', session: '', pageURL: PAGE_URL };
  assert.equal(await applySelectedDesign(client, target, NEW_PAGE_URL), false);
  assert.equal(client.calls.at(-1).method, 'Page.navigate');
  assert.equal(client.calls.at(-1).params.url, NEW_PAGE_URL);
  assert.equal(target.expectedURL, NEW_PAGE_URL);
  assert.equal(await documentProbe(client, target), false, 'Old debug document must not consume the new explicit selection');
  assert.equal(target.expectedURL, NEW_PAGE_URL);
  client.setURL(NEW_PAGE_URL);
  assert.equal(await documentProbe(client, target), true);
  assert.equal(target.pageURL, NEW_PAGE_URL);
  assert.equal(target.expectedURL, '');
  client.setURL(PAGE_URL);
  assert.equal(await documentProbe(client, target), true, 'Once command completes, menu navigation is free again');
});

test('reselecting the already healthy view does not reload or interrupt hide/unhide', async () => {
  const client = documentClient(), target = { id: '', session: '', pageURL: NEW_PAGE_URL };
  assert.equal(await applySelectedDesign(client, target, NEW_PAGE_URL), true);
  assert.equal(client.calls.filter(c => c.method === 'Page.navigate').length, 0);
  assert.equal(target.expectedURL, '');
  await assert.rejects(applySelectedDesign(client, target, 'https://example.com'), /Invalid kiosk route/);
});

test('new selection then Debugging link before the next poll preserves the later menu choice', async () => {
  const client = documentClient(PAGE_URL), target = { id: '', session: '', pageURL: PAGE_URL };
  assert.equal(await applySelectedDesign(client, target, NEW_PAGE_URL), false);
  // Both real navigations committed between watchdog probes.
  client.setHistory({ currentIndex: 2, entries: [
    { id: 1, url: PAGE_URL }, { id: 2, url: NEW_PAGE_URL }, { id: 3, url: PAGE_URL },
  ] });
  client.setURL(PAGE_URL);
  assert.equal(await documentProbe(client, target), true);
  assert.equal(target.expectedURL, '');
  assert.equal(target.pageURL, PAGE_URL);
  const callsAfterConfirmation = client.calls.length;
  for (let attempt = 0; attempt < 3; attempt++) assert.equal(await documentProbe(client, target), true);
  assert.equal(client.calls.slice(callsAfterConfirmation).filter(c => c.method === 'Page.getNavigationHistory').length, 0);
  assert.equal(client.calls.filter(c => c.method === 'Page.navigate').length, 1, 'No bounce back to the explicit view');
  client.setURL('chrome-error://chromewebdata/');
  assert.equal(await documentProbe(client, target), false);
  await recoverPage(client, target);
  assert.equal(client.calls.at(-1).params.url, PAGE_URL, 'Crash recovery retains the later menu view');
});

test('old or failed navigation and stale execution context cannot acknowledge the new selection', async () => {
  const client = documentClient(PAGE_URL), target = { id: '', session: '', pageURL: PAGE_URL };
  // The user had gone Back before running the command; a forward entry alone
  // must not prove that this new command's navigation happened.
  client.setHistory({ currentIndex: 0, entries: [{ id: 1, url: PAGE_URL }, { id: 2, url: NEW_PAGE_URL }] });
  assert.equal(await applySelectedDesign(client, target, NEW_PAGE_URL), false);
  assert.equal(await documentProbe(client, target), false);
  client.setHistory({ currentIndex: 1, entries: [{ id: 1, url: PAGE_URL }, { id: 3, url: NEW_PAGE_URL }] });
  assert.equal(await documentProbe(client, target), false, 'Runtime still reports the old view while history points at new');
  assert.equal(target.expectedURL, NEW_PAGE_URL);
  client.setURL(NEW_PAGE_URL);
  assert.equal(await documentProbe(client, target), true);
  assert.equal(target.navigationCheckpoint, null);
});

test('repeating the same explicit command cannot reuse a previous completed history checkpoint', async () => {
  const client = documentClient(PAGE_URL), target = { id: '', session: '', pageURL: PAGE_URL };
  await applySelectedDesign(client, target, NEW_PAGE_URL);
  client.setHistory({ currentIndex: 2, entries: [
    { id: 1, url: PAGE_URL }, { id: 2, url: NEW_PAGE_URL }, { id: 3, url: PAGE_URL },
  ] });
  // The first command and later menu click have not yet been polled, but a
  // second --atlas-new must still perform its own navigation.
  assert.equal(await applySelectedDesign(client, target, NEW_PAGE_URL), false);
  assert.equal(client.calls.filter(c => c.method === 'Page.navigate').length, 2);
  assert.equal(await documentProbe(client, target), false, 'Only earlier navigation exists so far');
  client.setHistory({ currentIndex: 4, entries: [
    { id: 1, url: PAGE_URL }, { id: 2, url: NEW_PAGE_URL }, { id: 3, url: PAGE_URL },
    { id: 4, url: NEW_PAGE_URL }, { id: 5, url: PAGE_URL },
  ] });
  assert.equal(await documentProbe(client, target), true);
});

test('missing or oversized navigation history falls back to strict expected-view confirmation', async () => {
  for (const history of [{}, { currentIndex: 0, entries: Array.from({ length: 257 }, (_, id) => ({ id, url: PAGE_URL })) }]) {
    const client = documentClient(PAGE_URL), target = { id: '', session: '', pageURL: PAGE_URL };
    client.setHistory(history);
    assert.equal(await applySelectedDesign(client, target, NEW_PAGE_URL), false);
    assert.equal(target.navigationCheckpoint, null);
    assert.equal(await documentProbe(client, target), false);
    client.setURL(NEW_PAGE_URL);
    assert.equal(await documentProbe(client, target), true);
  }
});

test('production watchdog opens pipes only and never disables Chrome sandbox or touches network/audio services', () => {
  const source = fs.readFileSync(`${__dirname}/libexec/atlas-screen-browser-watchdog.cjs`, 'utf8');
  assert.ok(source.includes("stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe']"));
  assert.ok(source.includes("['--remote-debugging-pipe', ...chromeArgs, pageURL]"));
  for (const forbidden of ['--remote-debugging-port=', 'systemctl restart', 'nmcli', 'bluetoothctl', 'pactl']) {
    assert.equal(source.includes(forbidden), false);
  }
});
