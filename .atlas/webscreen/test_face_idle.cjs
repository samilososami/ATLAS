const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/static/new/face.js`, 'utf8');
const css = fs.readFileSync(`${__dirname}/static/new/face.css`, 'utf8');

function setup() {
  let now = 0, sequence = 0, writes = 0, rafRequests = 0;
  const timers = new Map(), frames = new Map(), nodes = new Map(), observers = new Map();
  class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(name, fn) { this.listeners.set(name, [...(this.listeners.get(name) || []), fn]); }
    emit(name, value = {}) { for (const fn of this.listeners.get(name) || []) fn(value); }
  }
  class Element extends Events {
    constructor() {
      super(); this.attributes = new Map(); this.children = []; this.hidden = false;
      this.dataset = {}; this.classes = new Set();
      this.classList = { contains: name => this.classes.has(name) };
      this._text = '';
    }
    get textContent() { return this._text; }
    set textContent(value) { writes++; this._text = value; }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    setAttribute(name, value) { writes++; this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { writes++; this.attributes.delete(name); }
    querySelector(selector) { return node(selector); }
    querySelectorAll() { return []; }
    focus() {}
  }
  const node = key => { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); };
  const document = new Events(); document.hidden = false;
  document.body = new Element(); document.body.dataset.design = 'new';
  document.querySelector = node;
  document.createElement = () => new Element();
  document.createElementNS = () => new Element();
  const media = new Events(); media.matches = false;
  const window = new Events(); window.matchMedia = () => media;
  function setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay, delay }); return id; }
  function requestAnimationFrame(fn) { rafRequests++; const id = ++sequence; frames.set(id, fn); return id; }
  class Observer { constructor(fn) { this.fn = fn; } observe(el) { observers.set(el, [...(observers.get(el) || []), this.fn]); } }
  vm.runInNewContext(source, { window, document, MutationObserver: Observer,
    setTimeout, clearTimeout: id => timers.delete(id), requestAnimationFrame,
    cancelAnimationFrame: id => frames.delete(id), performance: { now: () => now }, console });
  const stage = node('#view-atlas').children.find(el => el.className === 'face-stage');
  function advance(ms) {
    const until = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = until;
  }
  return { window, document, media, node, stage, timers, frames, advance,
    get writes() { return writes; }, get rafRequests() { return rafRequests; },
    hideContent(hidden) { const el = node('#webscreen-content'); el.hidden = hidden; for (const fn of observers.get(el) || []) fn(); },
    flushFrame() { now += 34; const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(now)); },
  };
}

test('idle blink is a sparse 350ms one-shot with 8.7s start-to-start cadence', () => {
  const p = setup();
  assert.equal(p.stage.hasAttribute('data-blinking'), false);
  assert.equal(p.frames.size, 0);
  assert.equal(p.timers.size, 1);
  p.advance(8699); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(1); assert.equal(p.stage.getAttribute('data-blinking'), 'true');
  p.advance(349); assert.equal(p.stage.getAttribute('data-blinking'), 'true');
  p.advance(1); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(8349); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(1); assert.equal(p.stage.getAttribute('data-blinking'), 'true');
  assert.equal(p.rafRequests, 0);
  assert.match(css, /data-blinking="true".*animation: face-blink \.35s ease-in-out 1/);
  assert.doesNotMatch(css, /animation:[^;]*infinite/);
  assert.match(css, /body\[data-design="new"\] \.face-character \{[^}]*transform:\s*scale\(1\.875\)/);
  assert.match(css, /data-state="working"\] \.face-character \{[^}]*transform:[^;}]*scale\(1\.875\)/);
});

test('eye spacing is native geometry so blink cannot reset horizontal translation', () => {
  const eyes = [...source.matchAll(/<ellipse class="face-eye" cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g)];
  assert.equal(eyes.length, 2);
  assert.ok(Math.abs(Number(eyes[1][1]) - Number(eyes[0][1]) - 386 * .85) < .00001);
  for (const eye of eyes) assert.deepEqual(eye.slice(2), ['425', '56', '104']);
  assert.doesNotMatch(css, /\.face-eye[^{}]*\{[^}]*translate/);
  assert.match(css, /\.face-eye-blink \{ transform-box: view-box; \}/);
  assert.match(css, /\.face-eye-left \{ transform-origin: 631\.45px 425px; \}/);
  assert.match(css, /\.face-eye-right \{ transform-origin: 959\.55px 425px; \}/);
  assert.match(css, /@keyframes face-blink \{ 0%, 100% \{ transform: scaleY\(1\); \} 30%, 50% \{ transform: scaleY\(\.065\); \} \}/);
});

test('unchanged idle telemetry causes no DOM writes or animation frame requests', () => {
  const p = setup(); const face = p.window.AtlasFace;
  face.update({ state: 'idle' }); face.connection({ healthy: true, label: 'Ready' });
  assert.equal(p.node('.face-caption').textContent, '', 'ready face has no wake-word instruction');
  assert.equal(p.node('.face-transcript').textContent, '');
  const baseline = p.writes;
  for (let i = 0; i < 100; i++) {
    face.update({ state: 'idle' }); face.transcript('ambient rejected');
    face.connection({ healthy: true, label: 'Ready' });
    face.inputLevel({ rms: .1 }); face.outputLevel({ rms: .2 });
  }
  assert.equal(p.writes, baseline);
  assert.equal(p.rafRequests, 0);
  assert.equal(p.timers.size, 1, 'repeat idle calls do not reset the sparse timer');
});

test('content/page hiding cancels blink and queued frames; return resumes only idle blink', () => {
  const p = setup(); const face = p.window.AtlasFace;
  p.advance(8700); p.hideContent(true);
  assert.equal(p.timers.size, 0); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  const count = p.rafRequests;
  face.update({ state: 'listening' }); face.inputLevel({ rms: .2 }); p.advance(20000);
  assert.equal(p.rafRequests, count); assert.equal(p.frames.size, 0);
  face.update({ state: 'idle' }); p.hideContent(false);
  assert.equal(p.timers.size, 1);
  p.window.emit('pagehide'); assert.equal(p.timers.size, 0);
  p.window.emit('pageshow'); assert.equal(p.timers.size, 1);
  face.update({ state: 'listening' }); face.inputLevel({ rms: .2 });
  assert.equal(p.frames.size, 1);
  p.document.hidden = true; p.document.emit('visibilitychange');
  assert.equal(p.frames.size, 0); assert.equal(p.timers.size, 0);
});

test('nonidle and reduced-motion changes cancel active blink without starting replacements', () => {
  const p = setup(); p.advance(8700);
  p.window.AtlasFace.update({ state: 'working' });
  assert.equal(p.stage.hasAttribute('data-blinking'), false); assert.equal(p.timers.size, 0);
  p.window.AtlasFace.update({ state: 'idle' }); assert.equal(p.timers.size, 1);
  p.media.matches = true; p.media.emit('change');
  assert.equal(p.timers.size, 0); assert.equal(p.frames.size, 0);
  p.advance(20000); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.media.matches = false; p.media.emit('change'); assert.equal(p.timers.size, 1);
});

test('unchanged recognized text does not rewrite the caption or transcript', () => {
  const p = setup(); const face = p.window.AtlasFace;
  face.update({ state: 'listening' }); face.transcript('Atlas, pon música');
  const baseline = p.writes;
  face.transcript('Atlas, pon música'); face.update({ state: 'listening' });
  assert.equal(p.writes, baseline);
  face.update({ state: 'idle' });
  assert.equal(p.node('.face-caption').textContent, '', 'returning to idle does not restore the removed instruction');
  assert.equal(p.node('.face-transcript').textContent, '', 'recognized text is not left under the ready face');
  face.update({ state: 'idle', title: 'Micrófono silenciado' });
  assert.equal(p.node('.face-caption').textContent, 'Micrófono silenciado', 'removing the idle hint does not hide an explicit mute warning');
});

test('all thirteen expressions are strict, native geometry and independent from voice state', () => {
  const p = setup(), face = p.window.AtlasFace;
  const names = ['neutral', 'angry', 'delighted', 'surprised', 'curious', 'skeptical', 'sad', 'worried', 'sleepy', 'wink', 'laughing', 'focused', 'shy'];
  for (const expression of names) {
    assert.equal(face.expression({ expression }), true, expression);
    assert.equal(p.stage.dataset.expression, expression);
    assert.equal(p.stage.dataset.state, 'idle');
    assert.equal(p.node('.face-caption').textContent, '');
    assert.ok(p.node('.face-mouth').getAttribute('d')?.startsWith('M ') || expression === 'neutral');
    assert.ok(p.stage.innerHTML.includes(`face-eye-${expression}`), expression);
    assert.ok(css.includes(`[data-expression="${expression}"] .face-eye-${expression}`));
  }
  for (const payload of [null, {}, { expression: 'happy' }, { expression: '__proto__' }, { expression: 'sad', source: 'remote' }, { expression: 'angry', source: 'petting' }]) {
    assert.equal(face.expression(payload), false);
    assert.equal(p.stage.dataset.expression, 'shy');
  }
  assert.equal(p.rafRequests, 0, 'expression transitions use finite CSS, no render loop');
  assert.doesNotMatch(p.stage.innerHTML, /<image\b/);
});

test('model expressions expire after default15s, bounded1s minimum and30s maximum', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'angry' });
  p.advance(14999); assert.equal(p.stage.dataset.expression, 'angry');
  p.advance(1); assert.equal(p.stage.dataset.expression, 'neutral');
  face.expression({ expression: 'sad', durationMs: 999999 });
  p.advance(29999); assert.equal(p.stage.dataset.expression, 'sad');
  p.advance(1); assert.equal(p.stage.dataset.expression, 'neutral');
  face.expression({ expression: 'curious', durationMs: -1 });
  p.advance(999); assert.equal(p.stage.dataset.expression, 'curious');
  p.advance(1); assert.equal(p.stage.dataset.expression, 'neutral');
  face.expression({ expression: 'wink', durationMs: 'invalid' });
  p.advance(15000); assert.equal(p.stage.dataset.expression, 'neutral');
});

test('six-second petting overrides model without extending the model expiry', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'focused', durationMs: 12000 });
  p.advance(2000);
  assert.equal(face.expression({ expression: 'delighted', source: 'petting', durationMs: 30000 }), true);
  assert.equal(p.stage.dataset.expression, 'delighted');
  assert.equal(p.stage.dataset.expressionSource, 'petting');
  p.advance(5999); assert.equal(p.stage.dataset.expression, 'delighted');
  p.advance(1); assert.equal(p.stage.dataset.expression, 'focused');
  assert.equal(p.stage.dataset.expressionSource, 'model');
  p.advance(4000); assert.equal(p.stage.dataset.expression, 'neutral');
  face.expression({ expression: 'angry', durationMs: 1000 });
  face.expression({ expression: 'delighted', source: 'petting' });
  p.advance(6000);
  assert.equal(p.stage.dataset.expression, 'neutral', 'expired model expression must not revive');
});

test('model updates and neutral resets during petting are stored without stealing priority', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'delighted', source: 'petting' });
  p.advance(1000);
  face.expression({ expression: 'curious', durationMs: 12000 });
  assert.equal(p.stage.dataset.expression, 'delighted');
  p.advance(5000); assert.equal(p.stage.dataset.expression, 'curious');
  face.expression({ expression: 'delighted', source: 'petting' });
  face.expression({ expression: 'neutral' });
  assert.equal(p.stage.dataset.expression, 'delighted');
  p.advance(6000); assert.equal(p.stage.dataset.expression, 'neutral');
});

test('listening waveform and transcript take priority over expressions without altering the turn', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.update({ state: 'listening' }); face.transcript('Atlas, cómo estás');
  face.inputLevel({ rms: .18 }); p.flushFrame();
  const bars = p.node('.face-wave').children.map(node => node.getAttribute('height'));
  face.expression({ expression: 'angry' });
  face.expression({ expression: 'delighted', source: 'petting' });
  assert.equal(p.stage.dataset.state, 'listening');
  assert.equal(p.node('.face-transcript').textContent, 'Atlas, cómo estás');
  assert.deepEqual(p.node('.face-wave').children.map(node => node.getAttribute('height')), bars);
  assert.match(css, /data-state="listening"\] \.face-character \{ opacity: 0;/);
  face.update({ state: 'working' });
  assert.equal(p.stage.dataset.expression, 'delighted');
});

test('speech PCM modulates every emotional mouth and silence restores its own rest geometry', () => {
  const p = setup(), face = p.window.AtlasFace;
  for (const expression of ['angry', 'delighted', 'surprised', 'curious', 'skeptical', 'sad', 'worried', 'sleepy', 'wink', 'laughing', 'focused', 'shy', 'neutral']) {
    face.update({ state: 'idle' }); face.expression({ expression });
    const rest = p.node('.face-mouth').getAttribute('d');
    face.update({ state: 'speaking' }); face.outputLevel({ rms: .2 }); p.flushFrame();
    assert.notEqual(p.node('.face-mouth').getAttribute('d'), rest, expression);
    for (let i = 0; i < 7; i++) { face.outputLevel({ rms: 0 }); p.flushFrame(); }
    assert.equal(p.node('.face-mouth').getAttribute('d'), rest, expression);
    assert.equal(p.stage.dataset.expression, expression);
    assert.equal(p.stage.dataset.state, 'speaking');
  }
});

test('word-boundary fallback restores emotion and unavailable PCM does not cancel the word pulse', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'sad' });
  const rest = p.node('.face-mouth').getAttribute('d');
  face.update({ state: 'speaking' }); face.outputLevel({ available: false });
  face.speechBoundary({ type: 'word', charLength: 5 }); p.flushFrame();
  assert.notEqual(p.node('.face-mouth').getAttribute('d'), rest);
  face.outputLevel({ available: false, rms: 0 }); p.flushFrame();
  assert.notEqual(p.node('.face-mouth').getAttribute('d'), rest);
  p.advance(150);
  assert.equal(p.node('.face-mouth').getAttribute('d'), rest);
  assert.equal(p.stage.dataset.expression, 'sad');
});

test('repeated expression refreshes do not rewrite geometry or create idle animation loops', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'curious' }); p.advance(300);
  const baseline = p.writes;
  for (let i = 0; i < 100; i++) face.expression({ expression: 'curious' });
  assert.equal(p.writes, baseline);
  assert.equal(p.frames.size, 0);
  assert.equal(p.timers.size, 2, 'only sparse blink and a single expiry deadline remain');
  assert.equal(p.stage.hasAttribute('data-expression-transition'), false);
});

test('reset/hide cancel expression timers and transitions, never revive old expressions', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'worried' });
  face.expression({ expression: 'delighted', source: 'petting' });
  assert.equal(p.stage.hasAttribute('data-expression-transition'), true);
  face.reset();
  assert.equal(p.stage.dataset.expression, 'neutral');
  assert.equal(p.stage.hasAttribute('data-expression-transition'), false);
  assert.equal(p.timers.size, 1, 'reset leaves only the independent idle blink');
  face.expression({ expression: 'angry' });
  face.expression({ expression: 'delighted', source: 'petting' });
  p.hideContent(true);
  assert.equal(p.timers.size, 0); assert.equal(p.frames.size, 0);
  assert.equal(p.stage.dataset.expression, 'neutral');
  assert.equal(face.expression({ expression: 'sad' }), false);
  p.advance(40000); p.hideContent(false);
  assert.equal(p.stage.dataset.expression, 'neutral');
  assert.equal(p.timers.size, 1);
  face.expression({ expression: 'sad' }); p.window.emit('pagehide');
  assert.equal(p.timers.size, 0);
  p.window.emit('pageshow'); assert.equal(p.stage.dataset.expression, 'neutral');
});

test('reduced motion keeps TTL semantics without blink, crossfade or idle frames', () => {
  const p = setup(), face = p.window.AtlasFace;
  p.media.matches = true; p.media.emit('change');
  face.expression({ expression: 'delighted' });
  assert.equal(p.stage.hasAttribute('data-expression-transition'), false);
  assert.equal(p.rafRequests, 0);
  assert.equal(p.timers.size, 1);
  p.advance(15000);
  assert.equal(p.stage.dataset.expression, 'neutral');
  assert.equal(p.timers.size, 0);
});

test('focused mouth is a filled nonzero-height capsule so its gradient remains visible', () => {
  const p = setup(); p.window.AtlasFace.expression({ expression: 'focused' });
  assert.equal(p.node('.face-mouth').getAttribute('fill'), 'url(#atlas-face-blue)');
  assert.equal(p.node('.face-mouth').getAttribute('stroke-width'), '0');
  assert.equal(p.node('.face-mouth').getAttribute('d'), 'M 766 535 H 825 A 9 9 0 0 1 825 553 H 766 A 9 9 0 0 1 766 535 Z');
});
