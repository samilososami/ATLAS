#!/usr/bin/env node
'use strict';

// Capture the real presentation assets with deterministic, local-only states.
// This fixture deliberately excludes authentication, microphones and model calls.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.join(__dirname, 'static');
const output = path.resolve(__dirname, '../../docs/images/webscreen-expressions');
const expressions = ['neutral', 'angry', 'delighted', 'surprised', 'curious',
  'skeptical', 'sad', 'worried', 'sleepy', 'wink', 'laughing', 'focused', 'shy', 'defiant'];
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<body>', '<body data-design="new">')
  .replace('id="webscreen-content" hidden inert', 'id="webscreen-content"')
  .replace('class="access-blocked"', 'class="access-blocked" hidden')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('</head>', '<link rel="stylesheet" href="/new/face.css"></head>')
  .replace('</body>', '<script src="/new/face.js"></script><script src="/new/audio.js"></script><script src="/new/petting.js"></script><script src="/navigation.js"></script></body>');
const mime = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/new/' || url.pathname === '/new') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(html); return;
  }
  const target = path.resolve(root, '.' + url.pathname);
  if (!target.startsWith(root + path.sep)) { response.writeHead(404).end(); return; }
  try {
    response.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
    response.end(fs.readFileSync(target));
  } catch { response.writeHead(404).end(); }
});

async function main() {
  const serving = process.argv.includes('--serve');
  await new Promise(resolve => server.listen(serving ? 5059 : 0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/new/`;
  if (serving) { console.log(url); return; }
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true,
    ...(process.env.ATLAS_CHROME ? { executablePath: process.env.ATLAS_CHROME } : {}),
    args: ['--mute-audio'] });
  try {
    fs.mkdirSync(output, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 1591, height: 989 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const captures = [];
    for (const [index, expression] of expressions.entries()) {
      // A fresh page ensures a scheduled blink cannot spoil a gallery capture.
      await page.goto(url);
      await page.evaluate(expression => {
        AtlasFaceBridge.update({ state: 'idle', phase: 'EN ESPERA' });
        AtlasFaceBridge.connection({ healthy: true, label: 'ATLAS A1 conectado' });
        const accepted = expression === 'defiant'
          ? AtlasFace.clap()
          : AtlasFace.expression({ expression, source: 'model', durationMs: 30000 });
        if (!accepted) {
          throw new Error(`Expression rejected: ${expression}`);
        }
      }, expression);
      await page.waitForTimeout(650);
      assert.equal(await page.locator('.face-stage').getAttribute('data-state'), 'idle');
      assert.equal(await page.locator('.face-stage').getAttribute('data-expression'), expression);
      assert.equal(await page.locator('.face-caption').textContent(), '');
      const file = `${String(index).padStart(2, '0')}-${expression}.png`;
      await page.screenshot({ path: path.join(output, file), animations: 'allow' });
      captures.push({ expression, file });
    }
    // Exercise the real inactivity deadline in browser time instead of adding
    // a public "sleep now" query flag or altering production controller state.
    await page.clock.install();
    await page.goto(url);
    await page.evaluate(() => {
      AtlasFaceBridge.update({ state: 'idle', phase: 'EN ESPERA' });
      AtlasFaceBridge.connection({ healthy: true, label: 'ATLAS A1 conectado' });
    });
    await page.clock.runFor(56000);
    assert.equal(await page.locator('.face-stage').getAttribute('data-sleep'), 'drowsy-one');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, '14-drowsy-one.png'), animations: 'allow' });
    captures.push({ expression: 'drowsy stage one (inactivity)', file: '14-drowsy-one.png' });
    await page.clock.runFor(25000);
    assert.equal(await page.locator('.face-stage').getAttribute('data-sleep'), 'drowsy-two');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, '15-drowsy-two.png'), animations: 'allow' });
    captures.push({ expression: 'drowsy stage two (inactivity)', file: '15-drowsy-two.png' });
    await page.clock.runFor(25000);
    assert.equal(await page.locator('.face-stage').getAttribute('data-sleep'), 'asleep');
    await page.waitForTimeout(350);
    // Choose settled frames of the real CSS animations for a reproducible
    // static sleep illustration (the live browser continues to animate them).
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = 2200;
      }
    });
    await page.screenshot({ path: path.join(output, '13-asleep.png'), animations: 'allow' });
    captures.push({ expression: 'asleep (inactivity)', file: '13-asleep.png' });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ viewport: [1591, 989], captures, errors,
      note: 'Native WebScreen CSS/SVG in Chromium. State/connection indicator forced locally; no live voice/model claim.' }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
