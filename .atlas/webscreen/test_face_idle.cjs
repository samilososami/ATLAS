const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/static/new/face.js`, 'utf8');
const css = fs.readFileSync(`${__dirname}/static/new/face.css`, 'utf8');

function setup(random = .5) {
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
      this.style = { setProperty: (name, value) => { writes++; this.attributes.set(`style:${name}`, value); } };
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
    cancelAnimationFrame: id => frames.delete(id), performance: { now: () => now }, Math: Object.assign(Object.create(Math), { random: () => random }), console });
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
    drawer(open) { const el = node('#side-panel'); open ? el.classes.add('open') : el.classes.delete('open'); for (const fn of observers.get(el) || []) fn(); },
    flushFrame() { now += 34; const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(now)); },
  };
}

test('idle blink is a sparse320ms one-shot with randomized13–16s start-to-start cadence', () => {
  const p = setup();
  assert.equal(p.stage.hasAttribute('data-blinking'), false);
  assert.equal(p.frames.size, 0);
  assert.equal(p.timers.size, 1);
  p.advance(14499); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(1); assert.equal(p.stage.getAttribute('data-blinking'), 'true');
  p.advance(319); assert.equal(p.stage.getAttribute('data-blinking'), 'true');
  p.advance(1); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(14179); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(1); assert.equal(p.stage.getAttribute('data-blinking'), 'true');
  assert.equal(p.rafRequests, 0);
  assert.match(css, /data-blinking="true".*animation: face-blink \.32s ease-in-out 1/);
  for (const line of css.split('\n').filter(line => /animation:[^;]*infinite/.test(line))) assert.ok(line.includes('[data-sleep="asleep"]'), 'continuous animation is restricted to actual decorative sleep');
  assert.match(css, /body\[data-design="new"\] \.face-character \{[^}]*transform:\s*scale\(1\.875\)/);
  assert.match(css, /data-state="working"\] \.face-character \{[^}]*transform:[^;}]*scale\(1\.875\)/);
});

test('eye spacing is native geometry so blink cannot reset horizontal translation', () => {
  const eyes = [...source.matchAll(/<ellipse class="face-eye" cx="([\d.]+)" cy="([\d.]+)" rx="([\d.]+)" ry="([\d.]+)"/g)];
  assert.equal(eyes.length, 2);
  assert.ok(Math.abs(Number(eyes[1][1]) - Number(eyes[0][1]) - 386 * .85 * .95) < .00001);
  for (const eye of eyes) assert.deepEqual(eye.slice(2), ['425', '56', '104']);
  assert.doesNotMatch(css, /\.face-eye[^{}]*\{[^}]*translate/);
  assert.match(css, /\.face-eye-blink \{ transform-box: view-box; \}/);
  assert.match(css, /\.face-eye-left \{ transform-origin: 639\.6525px 425px; \}/);
  assert.match(css, /\.face-eye-right \{ transform-origin: 951\.3475px 425px; \}/);
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
  assert.equal(p.timers.size, 1, 'repeat idle calls do not reset the coordinated blink/sleep schedule');
});

test('content/page hiding cancels blink and queued frames; return resumes only idle blink', () => {
  const p = setup(); const face = p.window.AtlasFace;
  p.advance(14500); p.hideContent(true);
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
  const p = setup(); p.advance(14500);
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
  assert.equal(p.node('.face-caption').textContent, '', 'mute status remains in original drawer controls, not the primary face');
  face.update({ state: 'working' });
  assert.equal(p.node('.face-caption').textContent, '', 'no thinking caption');
  face.update({ state: 'error', title: 'Permiso de micrófono denegado' });
  assert.equal(p.node('.face-caption').textContent, '', 'actionable errors remain in original drawer and connection dot, not primary face');
});

test('all model expressions and the local defiant gesture are native geometry and independent from voice state', () => {
  const p = setup(), face = p.window.AtlasFace;
  const names = ['neutral', 'angry', 'delighted', 'surprised', 'curious', 'skeptical', 'sad', 'worried', 'sleepy', 'wink', 'laughing', 'focused', 'shy'];
  for (const expression of names) {
    assert.equal(face.expression({ expression }), true, expression);
    assert.equal(p.stage.dataset.expression, expression);
    assert.equal(p.stage.dataset.state, 'idle');
    assert.equal(p.node('.face-caption').textContent, '');
    assert.ok(p.node('.face-mouth').getAttribute('d')?.startsWith('M ') || expression === 'neutral');
    assert.ok(p.stage.innerHTML.includes(`face-eye-${expression === 'delighted' ? 'neutral' : expression}`), expression);
    assert.ok(css.includes(`[data-expression="${expression}"] .face-eye-${expression === 'delighted' ? 'neutral' : expression}`));
  }
  assert.equal(face.expression({ expression: 'defiant' }), false, 'Realtime cannot pick the clap-only face');
  assert.equal(face.clap(), true);
  assert.equal(p.stage.dataset.expression, 'defiant');
  assert.equal(p.stage.dataset.expressionSource, 'clap');
  assert.ok(p.stage.innerHTML.includes('face-eye-defiant'));
  assert.ok(css.includes('[data-expression="defiant"] .face-eye-defiant'));
  for (const payload of [null, {}, { expression: 'happy' }, { expression: '__proto__' }, { expression: 'sad', source: 'remote' }, { expression: 'angry', source: 'petting' }]) {
    assert.equal(face.expression(payload), false);
    assert.equal(p.stage.dataset.expression, 'defiant');
  }
  assert.equal(p.rafRequests, 0, 'expression transitions use finite CSS, no render loop');
  assert.doesNotMatch(p.stage.innerHTML, /<image\b/);
});

test('double clap is a ready-only three-second expression and never changes a realtime state', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.update({ state: 'listening' });
  assert.equal(face.clap(), false);
  face.update({ state: 'idle' });
  assert.equal(face.clap(), true);
  assert.equal(p.stage.dataset.state, 'idle');
  p.advance(2999); assert.equal(p.stage.dataset.expression, 'defiant');
  p.advance(1); assert.equal(p.stage.dataset.expression, 'neutral');
  assert.equal(p.stage.getAttribute('data-clap-returning'), 'true');
  p.advance(339); assert.equal(p.stage.getAttribute('data-clap-returning'), 'true');
  p.advance(1); assert.equal(p.stage.hasAttribute('data-clap-returning'), false);
  face.update({ state: 'speaking' });
  assert.equal(face.clap(), false);
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
  assert.equal(p.node('.face-transcript').textContent, '', 'transcript is confined to shared debug UI');
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

test('sleep has two blink-gated drowsy phases and completes between100–105s', () => {
  assert.equal((source.match(/M -56 -38 H 56 L 56 0/g) || []).length, 2,
    'stage-one eyelids have a perfectly straight, symmetric top edge');
  assert.match(css, /M -53 20 H 53 L 53 42/,
    'stage-two eyelids retain the straight horizontal top edge');
  assert.equal((source.match(/M -49 3 Q 0 52 49 3/g) || []).length, 2,
    'sleeping crescents are identical and deeply curved, never inclined');
  for (const [random, firstAt, secondAt, asleepAt] of [[0, 50000, 75000, 100000], [.5, 52500, 77500, 102500], [1, 55000, 80000, 105000]]) {
    const p = setup(random), face = p.window.AtlasFace;
    face.connection({ healthy: true });
    p.advance(firstAt); assert.equal(p.stage.dataset.sleep, 'awake', 'the pose only changes at the closed midpoint');
    assert.equal(p.stage.getAttribute('data-blinking'), 'true');
    p.advance(154); assert.equal(p.stage.dataset.sleep, 'drowsy-one');
    p.advance(secondAt - firstAt - 154); assert.equal(p.stage.dataset.sleep, 'drowsy-one');
    p.advance(154); assert.equal(p.stage.dataset.sleep, 'drowsy-two');
    p.advance(asleepAt - secondAt - 154); assert.equal(p.stage.dataset.sleep, 'drowsy-two');
    p.advance(154); assert.equal(p.stage.dataset.sleep, 'asleep');
    assert.equal(p.stage.dataset.state, 'idle', 'decorative sleep never changes the voice state');
    p.advance(166);
    assert.equal(p.rafRequests, 0); assert.equal(p.timers.size, 0);
    p.advance(300000); assert.equal(p.rafRequests, 0); assert.equal(p.timers.size, 0);
  }
});

test('healthy polling, repeated idle updates and ambient RMS cannot postpone sleep', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.connection({ healthy: true });
  for (let i = 0; i < 103; i++) {
    p.advance(1000);
    face.update({ state: 'idle' }); face.connection({ healthy: true });
    face.inputLevel({ rms: .6 }); face.outputLevel({ rms: .6 });
    face.transcript('discarded ambient words');
  }
  assert.equal(p.stage.dataset.sleep, 'asleep');
  assert.equal(p.node('.face-transcript').textContent, '');
  assert.equal(p.node('.face-caption').textContent, '');
  assert.equal(p.rafRequests, 0);
});

test('phase blinks are coordinated without a second blink inside the8s guard', () => {
  const p = setup(0), face = p.window.AtlasFace;
  face.connection({ healthy: true });
  p.advance(39000); assert.equal(p.stage.getAttribute('data-blinking'), 'true');
  p.advance(320); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(10679); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(1); assert.equal(p.stage.getAttribute('data-blinking'), 'true');
  p.advance(154); assert.equal(p.stage.dataset.sleep, 'drowsy-one');
  p.advance(166); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(11679); assert.equal(p.stage.hasAttribute('data-blinking'), false);
  p.advance(1); assert.equal(p.stage.getAttribute('data-blinking'), 'true');
});

test('wake admits listening and real RMS immediately while surprise lasts only180ms', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.connection({ healthy: true }); p.advance(102654);
  face.update({ state: 'listening', phase: 'ESCUCHANDO' });
  assert.equal(p.stage.dataset.sleep, 'awake');
  assert.equal(p.stage.dataset.state, 'listening');
  assert.equal(p.stage.getAttribute('data-waking'), 'true');
  face.inputLevel({ rms: .2 }); p.flushFrame();
  assert.ok(Number(p.node('.face-wave').children[30].getAttribute('height')) > 4);
  assert.equal(p.stage.getAttribute('data-waking'), 'true', 'wave data updates before the visual surprise finishes');
  p.advance(145); assert.equal(p.stage.getAttribute('data-waking'), 'true');
  p.advance(1); assert.equal(p.stage.hasAttribute('data-waking'), false);
  assert.equal(p.stage.dataset.state, 'listening');
});

test('awake and merely drowsy wake events never add the asleep surprise pose', () => {
  for (const idleFor of [1000, 60000, 85000]) {
    const p = setup(), face = p.window.AtlasFace;
    face.connection({ healthy: true }); p.advance(idleFor);
    face.update({ state: 'listening', phase: 'ESCUCHANDO' });
    assert.equal(p.stage.dataset.sleep, 'awake');
    assert.equal(p.stage.dataset.state, 'listening');
    assert.equal(p.stage.hasAttribute('data-waking'), false);
    face.inputLevel({ rms: .2 }); p.flushFrame();
    assert.ok(Number(p.node('.face-wave').children[30].getAttribute('height')) > 4);
  }
});

test('petting contact wakes instantly without changing voice, and restarts inactivity deadline', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.connection({ healthy: true }); p.advance(102654);
  assert.equal(face.interact({ source: 'petting' }), true);
  assert.equal(p.stage.dataset.sleep, 'awake');
  assert.equal(p.stage.dataset.state, 'idle');
  assert.equal(p.stage.hasAttribute('data-waking'), false);
  assert.equal(p.frames.size, 0);
  p.advance(52653); assert.equal(p.stage.dataset.sleep, 'awake');
  p.advance(1); assert.equal(p.stage.dataset.sleep, 'drowsy-one');
  face.expression({ expression: 'delighted', source: 'petting' });
  assert.equal(p.stage.dataset.sleep, 'awake');
  assert.equal(p.stage.dataset.expression, 'delighted');
  assert.equal(face.interact({ source: 'heartbeat' }), false);
});

test('working, speaking and drawer activity keep the mascot awake without a dormant deadline', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.connection({ healthy: true }); p.advance(60000);
  face.update({ state: 'working' });
  assert.equal(p.stage.dataset.sleep, 'awake');
  p.advance(120000); assert.equal(p.stage.dataset.sleep, 'awake');
  face.update({ state: 'speaking' }); p.advance(120000);
  assert.equal(p.stage.dataset.sleep, 'awake');
  face.update({ state: 'idle' }); p.advance(60000);
  assert.equal(p.stage.dataset.sleep, 'drowsy-one');
  p.drawer(true);
  assert.equal(p.stage.dataset.sleep, 'awake');
  assert.equal(p.timers.size, 0, 'drawer cancels blink and sleep timers');
  p.advance(120000); assert.equal(p.stage.dataset.sleep, 'awake');
  p.drawer(false); p.advance(52653);
  assert.equal(p.stage.dataset.sleep, 'awake');
  p.advance(1); assert.equal(p.stage.dataset.sleep, 'drowsy-one');
});

test('disconnect, hidden content, reset and errors clear sleep and wake-transition resources', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.connection({ healthy: true }); p.advance(102654);
  face.connection({ healthy: false });
  assert.equal(p.stage.dataset.sleep, 'awake');
  p.advance(120000); assert.equal(p.stage.dataset.sleep, 'awake');
  face.connection({ healthy: true }); p.advance(102654);
  p.hideContent(true);
  assert.equal(p.stage.dataset.sleep, 'awake'); assert.equal(p.timers.size, 0);
  assert.equal(face.interact({ source: 'petting' }), false);
  p.hideContent(false); p.advance(102654);
  face.update({ state: 'listening' });
  assert.equal(p.stage.hasAttribute('data-waking'), true);
  face.update({ state: 'error' });
  assert.equal(p.stage.hasAttribute('data-waking'), false);
  assert.equal(p.timers.size, 0);
  face.update({ state: 'idle' }); p.advance(102654);
  face.reset(); assert.equal(p.stage.dataset.sleep, 'awake');
  assert.equal(p.stage.hasAttribute('data-waking'), false);
});

test('reduced motion preserves inactivity semantics but removes blink, breathing and z drift', () => {
  const p = setup(), face = p.window.AtlasFace;
  p.media.matches = true; p.media.emit('change'); face.connection({ healthy: true });
  p.advance(102501); assert.equal(p.stage.dataset.sleep, 'asleep');
  assert.equal(p.rafRequests, 0); assert.equal(p.timers.size, 0);
  face.update({ state: 'listening' });
  assert.equal(p.stage.dataset.sleep, 'awake');
  assert.equal(p.stage.hasAttribute('data-waking'), false);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
});

test('happy uses rising masks on persistent ovals, not a crossfade to replacement eyes', () => {
  const p = setup(), face = p.window.AtlasFace;
  assert.match(p.stage.innerHTML, /mask="url\(#atlas-happy-left\)"/);
  assert.match(p.stage.innerHTML, /mask="url\(#atlas-happy-right\)"/);
  assert.doesNotMatch(p.stage.innerHTML, /face-eye-variant face-eye-delighted/);
  assert.match(css, /\.face-happy-cutout \{ transform: translateY\(160px\); transition: transform \.26s/);
  assert.match(css, /data-expression="delighted"\] \.face-happy-cutout \{ transform: translateY\(0\);/);
  face.expression({ expression: 'delighted' });
  assert.equal(p.stage.getAttribute('data-happy-bounce'), 'true');
  p.advance(280); assert.equal(p.stage.hasAttribute('data-happy-bounce'), false);
  face.expression({ expression: 'neutral' });
  assert.equal(p.stage.dataset.expression, 'neutral');
  assert.equal(p.rafRequests, 0);
});
