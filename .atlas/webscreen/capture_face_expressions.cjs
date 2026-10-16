#!/usr/bin/env node
'use strict';

// Capture the real presentation assets with deterministic, local-only states.
// This fixture deliberately excludes authentication, microphones and model calls.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.join(__dirname, 'static');
const expanded = process.argv.includes('--expanded');
const fullCatalog = process.argv.includes('--catalog');
const output = path.resolve(__dirname, fullCatalog ? '../../expressions/renders' : expanded ? '../../docs/images/webscreen-expressions-20260926' : '../../docs/images/webscreen-expressions');
const expressions = fullCatalog ? require('../../expressions/catalog.json').expressions.map(entry => entry.id) : expanded
  ? ['ambitious', 'confident', 'affectionate', 'confused', 'embarrassed', 'relieved', 'bored', 'excited', 'asleep']
  : ['neutral', 'angry', 'delighted', 'surprised', 'curious',
    'skeptical', 'sad', 'worried', 'sleepy', 'wink', 'laughing', 'focused', 'shy', 'defiant'];
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace('<body>', '<body data-design="new">')
  .replace('id="webscreen-content" hidden inert', 'id="webscreen-content"')
  .replace('class="access-blocked"', 'class="access-blocked" hidden')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('</head>', '<link rel="stylesheet" href="/new/face.css"></head>')
  .replace('</body>', '<script src="/new/expressions-catalog.js"></script><script src="/new/face.js"></script><script src="/new/audio.js"></script><script src="/new/petting.js"></script><script src="/navigation.js"></script></body>');
const mime = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname.startsWith('/expressions/')) {
    const galleryRoot = path.resolve(__dirname, '../../expressions');
    const relative = url.pathname === '/expressions/' ? 'gallery.html' : decodeURIComponent(url.pathname.slice('/expressions/'.length));
    const target = path.resolve(galleryRoot, relative);
    if (!target.startsWith(galleryRoot + path.sep)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader('Content-Type', target.endsWith('.html') ? 'text/html; charset=utf-8' : mime[path.extname(target)] || 'application/octet-stream');
      response.end(fs.readFileSync(target));
    } catch { response.writeHead(404).end(); }
    return;
  }
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
        const accepted = AtlasFace.expression({ expression, source: 'command', durationMs: 30000 });
        if (!accepted) {
          throw new Error(`Expression rejected: ${expression}`);
        }
      }, expression);
      await page.waitForTimeout(650);
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.face-character')).opacity) > .999
        && Number(getComputedStyle(document.querySelector('.face-connection-visual')).opacity) < .001);
      assert.equal(await page.locator('.face-stage').getAttribute('data-state'), 'idle');
      assert.equal(await page.locator('.face-stage').getAttribute('data-expression'), expression);
      assert.equal(await page.locator('.face-stage').getAttribute('data-presentation'), 'face');
      assert.equal(await page.locator('.face-caption').textContent(), '');
      const file = fullCatalog ? `${expression}.png` : `${String(index).padStart(2, '0')}-${expression}.png`;
      await page.screenshot({ path: path.join(output, file), animations: 'allow' });
      captures.push({ expression, file });
    }
    if (fullCatalog) {
      assert.deepEqual(errors, []);
      assert.equal(captures.length, 173);
      const crypto = require('node:crypto');
      const report = { renderer: 'Chromium, real WebScreen SVG/CSS', viewport: {width:1591,height:989},
        note: 'Deterministic local states; no microphone, provider or account calls.',
        captures: captures.map(item => ({...item, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(output,item.file))).digest('hex')})), errors };
      fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(report, null, 2)+'\n');
      console.log(JSON.stringify({count: captures.length, output, errors}));
      return;
    }
    if (expanded) {
      await page.evaluate(() => {
        window.testRest = document.querySelector('.face-mouth').getAttribute('d');
        window.testUtterance = new EventTarget();
        testUtterance.text = 'Oye, ya funciona la voz sin eventos de palabras.';
        window.testStop = AtlasFaceBridge.watchUtterance(testUtterance);
        testUtterance.dispatchEvent(new Event('start'));
      });
      await page.waitForFunction(() => document.querySelector('.face-mouth').getAttribute('d') !== testRest);
      assert.equal(await page.locator('.face-stage').getAttribute('data-sleep'), 'asleep');
      assert.equal(await page.locator('.face-mouth').evaluate(el => getComputedStyle(el).opacity), '1');
      await page.screenshot({ path: path.join(output, '09-asleep-speaking.png') });
      captures.push({ expression: 'asleep speaking with no word boundaries (fixture)', file: '09-asleep-speaking.png' });
      await page.evaluate(() => { testUtterance.dispatchEvent(new Event('end')); testStop(); });
      assert.equal(await page.locator('.face-mouth').getAttribute('d'), await page.evaluate(() => testRest));
      await page.evaluate(() => AtlasFaceBridge.update({ state: 'listening', phase: 'ACTIVADO' }));
      assert.equal(await page.locator('.face-stage').getAttribute('data-sleep'), 'awake');
      await page.waitForTimeout(200); // Let the separate 180 ms wake-surprise finish.
      await page.evaluate(() => {
        AtlasFaceBridge.update({ state: 'idle', phase: 'EN ESPERA' });
        AtlasFace.expression({ expression: 'ambitious' });
      });
      await page.waitForTimeout(70);
      const transition = await page.locator('.face-eye-ambitious').first().evaluate(el => ({
        opacity: Number(getComputedStyle(el).opacity), duration: getComputedStyle(el).transitionDuration,
      }));
      assert.equal(transition.duration, '0.18s');
      assert.ok(transition.opacity > 0 && transition.opacity < 1, JSON.stringify(transition));
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.face-eye-ambitious').first().evaluate(el => getComputedStyle(el).opacity), '1');
      await page.setViewportSize({ width: 1024, height: 600 });
      await page.screenshot({ path: path.join(output, '10-ambitious-pi-1024x600.png') });
      captures.push({ expression: 'ambitious on A1 viewport', file: '10-ambitious-pi-1024x600.png' });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.evaluate(() => AtlasFace.expression({ expression: 'excited' }));
      assert.equal(await page.locator('.face-mouth').evaluate(el => getComputedStyle(el).animationName), 'none');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ captures, transition, errors,
        note: 'Real Chromium SVG/CSS; synthetic local utterance lifecycle, no audio/model call.' }, null, 2));
      return;
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
