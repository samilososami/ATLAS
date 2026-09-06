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
});

test('unchanged idle telemetry causes no DOM writes or animation frame requests', () => {
  const p = setup(); const face = p.window.AtlasFace;
  face.update({ state: 'idle' }); face.connection({ healthy: true, label: 'Ready' });
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
});
