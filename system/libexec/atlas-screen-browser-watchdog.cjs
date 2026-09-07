#!/usr/bin/env node
'use strict';

// Supervise the *document*, not just Chrome's process or the HTTP server.
// CDP is carried on two private inherited pipes (fds 3/4); no debug TCP port,
// profile export, HTTP credential, or network/audio reset is involved.
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const { setTimeout: sleep } = require('node:timers/promises');

const PAGE_URL = 'http://localhost:5000/?kiosk=1';
const NEW_PAGE_URL = 'http://localhost:5000/new/?kiosk=1';
const DESIGN_FILE = '/home/atlas/.atlas/screen/web-design';
const READY_FILE = '/run/atlas-screen-kiosk/ready';
const POLL_MS = 5000;
const PROBE_MS = 2500;
const GRACE_MS = 30000;
const HEALTH_EXPRESSION = `JSON.stringify({
  url: location.href, title: document.title,
  ready: document.readyState !== 'loading',
  app: Boolean(document.getElementById('webscreen-content') &&
    document.getElementById('main-status') && window.AtlasRealtime && window.atlasAccess)
})`;

class PipeClient extends EventEmitter {
  constructor(input, output, timeout = PROBE_MS) {
    super();
    this.input = input; this.timeout = timeout; this.sequence = 0;
    this.pending = new Map(); this.buffer = ''; this.closed = false;
    output.setEncoding('utf8');
    output.on('data', data => this.receive(data));
    output.on('end', () => this.close());
    output.on('error', () => this.close());
    input.on('error', () => this.close());
  }
  receive(data) {
    this.buffer += data;
    if (this.buffer.length > 2 * 1024 * 1024) return this.close();
    let separator;
    while ((separator = this.buffer.indexOf('\0')) >= 0) {
      const raw = this.buffer.slice(0, separator);
      this.buffer = this.buffer.slice(separator + 1);
      if (!raw) continue;
      let message;
      try { message = JSON.parse(raw); } catch { continue; }
      if (!message.id) { this.emit('event', message); continue; }
      const waiter = this.pending.get(message.id);
      if (!waiter) continue;
      this.pending.delete(message.id); clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(message.error.message || 'CDP error'));
      else waiter.resolve(message.result || {});
    }
  }
  call(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('Chrome pipe closed'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id); reject(new Error(`Chrome probe timeout: ${method}`));
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      const message = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.input.write(JSON.stringify(message) + '\0', error => {
        if (error) this.close();
      });
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer); waiter.reject(new Error('Chrome pipe closed'));
    }
    this.pending.clear(); this.buffer = '';
  }
}

function pageIsHealthy(value, expectedURL = '') {
  // A deliberate same-tab switch between our two fixed presentations is not a
  // renderer failure. An explicit atlas-screen selection can temporarily pin
  // the expected view until that navigation has actually loaded successfully.
  return Boolean(value && [PAGE_URL, NEW_PAGE_URL].includes(value.url)
    && (!expectedURL || value.url === expectedURL) && value.title === 'ATLAS WebScreen'
    && value.ready && value.app);
}

// Two failures protect slow page loads. A confirmed failure first navigates
// only this dedicated kiosk tab; one unsuccessful reload escalates to a
// browser-only restart. Restart cooldown belongs to the outer process loop.
class RecoveryPolicy {
  constructor(now = Date.now()) { this.graceUntil = now + GRACE_MS; this.failures = 0; this.reloaded = false; }
  observe(healthy, now = Date.now()) {
    if (healthy) { this.failures = 0; this.reloaded = false; return 'healthy'; }
    if (now < this.graceUntil || ++this.failures < 2) return 'wait';
    this.failures = 0;
    if (this.reloaded) return 'restart';
    this.reloaded = true; this.graceUntil = now + GRACE_MS;
    return 'reload';
  }
}

function restartDelay(recentRestarts, now = Date.now()) {
  const recent = recentRestarts.filter(at => now - at < 300000);
  return { recent, delay: recent.length >= 3 ? 60000 : 3000 * (2 ** recent.length) };
}

function historyCheckpoint(history, targetId, pageURL) {
  const entries = history?.entries;
  const current = entries?.[history?.currentIndex];
  // A short-lived, bounded record of entry IDs, never page content or tokens.
  // Retaining all prior IDs also excludes a pre-existing forward-history entry.
  if (!Array.isArray(entries) || entries.length > 256 || !Number.isInteger(current?.id)
      || entries.some(entry => !Number.isInteger(entry?.id))) return null;
  return { targetId, pageURL, previousEntryId: current.id, previousIds: entries.map(entry => entry.id) };
}

async function requestedNavigationCompleted(client, targetState, currentURL) {
  const checkpoint = targetState.navigationCheckpoint;
  if (!checkpoint || checkpoint.targetId !== targetState.id || checkpoint.pageURL !== targetState.expectedURL) return false;
  let history;
  try { history = await client.call('Page.getNavigationHistory', {}, targetState.session); }
  catch { return false; }
  const entries = history?.entries;
  if (!Array.isArray(entries) || entries.length > 256
      || entries?.[history?.currentIndex]?.url !== currentURL) return false;
  const previousIndex = checkpoint.previousEntryId === null ? -1
    : entries.findIndex(entry => entry.id === checkpoint.previousEntryId);
  if (checkpoint.previousEntryId !== null && previousIndex < 0) return false;
  // The requested view committed a genuinely new history entry after our
  // command, then the user followed its other-design link before a 5s poll.
  // Current history URL must agree with the runtime probe: an old execution
  // context racing the requested navigation cannot consume the selection.
  return entries.some((entry, index) => index > previousIndex
    && entry.url === checkpoint.pageURL && Number.isInteger(entry.id)
    && !checkpoint.previousIds.includes(entry.id));
}

async function documentProbe(client, targetState) {
  const { targetInfos = [] } = await client.call('Target.getTargets');
  // Remember the original page across Chrome error URLs, never attach to a
  // DevTools page, extension, unrelated desktop profile or remote site.
  const page = targetInfos.find(t => t.type === 'page' && t.targetId === targetState.id)
    || targetInfos.find(t => t.type === 'page' && (t.url === PAGE_URL || t.url === NEW_PAGE_URL));
  if (!page) { targetState.id = ''; targetState.session = ''; return false; }
  if (targetState.id !== page.targetId || !targetState.session) {
    targetState.id = page.targetId;
    const { sessionId } = await client.call('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    targetState.session = sessionId;
  }
  const reply = await client.call('Runtime.evaluate', {
    expression: HEALTH_EXPRESSION, returnByValue: true, timeout: 1500,
  }, targetState.session);
  if (reply.exceptionDetails) return false;
  try {
    const value = JSON.parse(reply.result?.value);
    if (!pageIsHealthy(value)) return false;
    if (targetState.expectedURL && value.url !== targetState.expectedURL
        && !await requestedNavigationCompleted(client, targetState, value.url)) return false;
    // Only a responsive, validated ATLAS document can replace our recovery URL;
    // neither a Chrome error URL nor a page with just the right title can do so.
    targetState.pageURL = value.url;
    targetState.expectedURL = '';
    targetState.navigationCheckpoint = null;
    return true;
  } catch { return false; }
}

async function recoverPage(client, targetState, pageURL = targetState.pageURL || PAGE_URL) {
  if (![PAGE_URL, NEW_PAGE_URL].includes(pageURL)) throw new Error('Invalid kiosk route');
  targetState.expectedURL = pageURL;
  targetState.navigationCheckpoint = null;
  if (!targetState.id) {
    const created = await client.call('Target.createTarget', { url: pageURL });
    targetState.id = created.targetId; targetState.session = '';
    targetState.navigationCheckpoint = { targetId: created.targetId, pageURL, previousEntryId: null, previousIds: [] };
    return;
  }
  if (!targetState.session) {
    const { sessionId } = await client.call('Target.attachToTarget', { targetId: targetState.id, flatten: true });
    targetState.session = sessionId;
  }
  // Navigate also repairs chrome-error://chromewebdata after a failed local
  // load. Never resend application prompts or previously queued tools.
  try {
    targetState.navigationCheckpoint = historyCheckpoint(
      await client.call('Page.getNavigationHistory', {}, targetState.session), targetState.id, pageURL);
  } catch { /* Missing history keeps the existing strict pending-view check. */ }
  await client.call('Page.navigate', { url: pageURL }, targetState.session);
}

function selectedPageURL(read = () => fs.readFileSync(DESIGN_FILE, 'utf8')) {
  try { return read().trim() === 'atlas-new' ? NEW_PAGE_URL : PAGE_URL; }
  catch { return PAGE_URL; }
}

function readDesignSelection(file = DESIGN_FILE) {
  let descriptor;
  try {
    // atlas-screen writes this file with mktemp+rename. Read content and version
    // from one descriptor so a concurrent replacement cannot mix two commands.
    descriptor = fs.openSync(file, 'r');
    const content = fs.readFileSync(descriptor, 'utf8');
    const stat = fs.fstatSync(descriptor);
    return { pageURL: selectedPageURL(() => content),
      revision: `${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}` };
  } catch { return { pageURL: PAGE_URL, revision: 'missing' }; }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}

function designSelectionChanged(previous, next) {
  return previous.pageURL !== next.pageURL || previous.revision !== next.revision;
}

async function applySelectedDesign(client, targetState, pageURL) {
  if (![PAGE_URL, NEW_PAGE_URL].includes(pageURL)) throw new Error('Invalid kiosk route');
  targetState.expectedURL = pageURL;
  // A fresh command cannot be acknowledged by an earlier command's history.
  targetState.navigationCheckpoint = null;
  let healthy = false;
  try { healthy = await documentProbe(client, targetState); }
  catch { targetState.session = ''; }
  // A repeated visible-mode command while already on that view (including
  // unhide) must not interrupt the running voice session with a needless reload.
  if (!healthy) await recoverPage(client, targetState, pageURL);
  return healthy;
}

function readyMarker(healthy, marker = READY_FILE) {
  if (healthy) {
    if (!fs.existsSync(marker)) fs.writeFileSync(marker, '', { mode: 0o600 });
  } else {
    try { fs.unlinkSync(marker); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

async function terminateBrowser(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill('SIGTERM');
  for (let attempt = 0; attempt < 25; attempt++) {
    if (child.exitCode !== null || child.signalCode) return;
    await sleep(100);
  }
  child.kill('SIGKILL');
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(1000)]);
}

async function supervise(command, args) {
  let stopping = false, browser, restarts = [];
  let selection = readDesignSelection(), pageURL = selection.pageURL;
  const log = message => console.error(`[atlas-kiosk-watchdog] ${message}`);
  const stop = () => { stopping = true; browser?.kill('SIGTERM'); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    while (!stopping) {
      readyMarker(false);
      const startupSelection = readDesignSelection();
      if (designSelectionChanged(selection, startupSelection)) {
        selection = startupSelection; pageURL = selection.pageURL;
      }
      // Keep the last healthy in-tab choice across a browser-only restart;
      // an explicit command/file replacement always supersedes it.
      const chromeArgs = args.filter(arg => arg !== PAGE_URL && arg !== NEW_PAGE_URL);
      browser = spawn(command, ['--remote-debugging-pipe', ...chromeArgs, pageURL], {
        stdio: ['ignore', 'inherit', 'inherit', 'pipe', 'pipe'],
      });
      let spawnError;
      browser.once('error', error => { spawnError = error; });
      const client = new PipeClient(browser.stdio[3], browser.stdio[4]);
      const target = { id: '', session: '', pageURL }, policy = new RecoveryPolicy();
      let lastHealthy = false;
      try {
        while (!stopping && browser.exitCode === null && !browser.signalCode && !spawnError) {
          let healthy = false;
          try {
            const requested = readDesignSelection();
            if (designSelectionChanged(selection, requested)) {
              selection = requested; pageURL = requested.pageURL;
              healthy = await applySelectedDesign(client, target, pageURL);
              if (!healthy) {
                readyMarker(false); lastHealthy = false;
                log('Applying the explicitly selected kiosk design.');
                policy.graceUntil = Date.now() + GRACE_MS;
                policy.failures = 0; policy.reloaded = false;
              }
            } else healthy = await documentProbe(client, target);
            if (healthy) pageURL = target.pageURL;
          }
          catch { target.session = ''; }
          if (stopping) break;
          const action = policy.observe(healthy);
          if (healthy !== lastHealthy) {
            log(healthy ? 'ATLAS document responding.' : 'ATLAS document stopped responding.');
            readyMarker(healthy); lastHealthy = healthy;
          }
          if (action === 'reload') {
            log('Recovering the kiosk tab; HTTP/process liveness alone is not page health.');
            try { await recoverPage(client, target, pageURL); } catch { target.session = ''; }
          } else if (action === 'restart') {
            log('Tab recovery failed; restarting only the kiosk browser.'); break;
          }
          await sleep(POLL_MS);
        }
      } finally {
        client.close(); await terminateBrowser(browser); readyMarker(false);
      }
      if (!stopping) {
        const cooldown = restartDelay(restarts); restarts = [...cooldown.recent, Date.now()];
        log(`Browser exited; retry in ${cooldown.delay / 1000}s.`);
        for (let waited = 0; waited < cooldown.delay && !stopping; waited += 250) await sleep(250);
      }
    }
  } finally { process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); }
}

module.exports = { PipeClient, RecoveryPolicy, pageIsHealthy, documentProbe, recoverPage, restartDelay,
  selectedPageURL, readDesignSelection, designSelectionChanged, applySelectedDesign, PAGE_URL, NEW_PAGE_URL, HEALTH_EXPRESSION };
if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (!command || args.some(arg => arg.startsWith('--remote-debugging-') || arg === '--no-sandbox')) {
    console.error('usage: atlas-screen-browser-watchdog.cjs google-chrome-stable [safe kiosk arguments]');
    process.exitCode = 2;
  } else supervise(command, args).catch(error => { console.error(`[atlas-kiosk-watchdog] ${error.message}`); process.exitCode = 1; });
}
