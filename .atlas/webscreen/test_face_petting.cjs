const test = require('node:test');
const assert = require('node:assert/strict');
const { createPettingDetector, install } = require('./static/new/petting.js');

function pure() {
  const calls = [];
  const detector = createPettingDetector({ onPet: () => calls.push('delighted') });
  return { detector, calls };
}
function strokes(detector, { x = 300, y = 220, start = 1000, duration = 400,
  length = 60, count = 4, vertical = false, begin = true } = {}) {
  const point = distance => vertical ? [x, y + distance] : [x + distance, y];
  if (begin) detector.begin(x, y, start);
  detector.move(...point(10), start + 20);
  for (let i = 1; i <= count; i++) detector.move(...point(i % 2 ? length : 0), start + duration * i);
}

test('four deliberate passes / three reversals produce one pet after 1.2 seconds', () => {
  const p = pure(); strokes(p.detector);
  assert.equal(p.calls.length, 1);
});
test('petting accepts different deliberate rhythms and vertical/diagonal axes', () => {
  for (const duration of [320, 470, 800]) {
    for (const vertical of [false, true]) {
      const p = pure(); strokes(p.detector, { duration, vertical });
      assert.equal(p.calls.length, 1, `duration=${duration} vertical=${vertical}`);
    }
  }
  const p = pure(); p.detector.begin(300, 200, 1000);
  p.detector.move(308, 208, 1020);
  for (let i = 1; i <= 4; i++) p.detector.move(i % 2 ? 350 : 300, i % 2 ? 250 : 200, 1000 + i * 400);
  assert.equal(p.calls.length, 1);
});
test('one, two and three passes are insufficient even when slow', () => {
  for (const count of [1, 2, 3]) {
    const p = pure(); strokes(p.detector, { count, duration: 700 });
    assert.equal(p.calls.length, 0);
  }
});
test('one long swipe is not divided into multiple strokes', () => {
  const p = pure(); p.detector.begin(0, 0, 1000);
  for (let i = 1; i <= 40; i++) p.detector.move(i * 25, 0, 1000 + i * 50);
  assert.equal(p.calls.length, 0);
});
test('jitter and tiny high-frequency reversals never count as petting', () => {
  const p = pure(); p.detector.begin(300, 220, 1000);
  for (let i = 1; i <= 120; i++) p.detector.move(300 + (i % 2 ? 7 : -7), 220 + i % 3, 1000 + i * 25);
  assert.equal(p.calls.length, 0);
  strokes(p.detector, { length: 25, count: 9, duration: 300 });
  assert.equal(p.calls.length, 0);
});
test('fast wiggles followed by holding/jitter do not satisfy active duration', () => {
  const p = pure(); strokes(p.detector, { duration: 100 });
  for (let i = 1; i <= 35; i++) p.detector.move(300 + i % 3, 220, 1400 + i * 50);
  assert.equal(p.calls.length, 0);
});
test('a long stationary contact does not count as petting time', () => {
  const p = pure(); p.detector.begin(300, 220, 0);
  for (let i = 1; i <= 4; i++) p.detector.move(i % 2 ? 360 : 300, 220, 3000 + i * 100);
  assert.equal(p.calls.length, 0);
});
test('expired four-second windows and long gaps reset accumulated passes', () => {
  const p = pure(); strokes(p.detector, { count: 3, duration: 1000 });
  p.detector.move(300, 220, 5200);
  assert.equal(p.calls.length, 0);
  strokes(p.detector, { start: 7000, count: 2 });
  p.detector.move(360, 220, 9200); p.detector.move(300, 220, 9700);
  assert.equal(p.calls.length, 0);
});
test('cooldown prevents continuous callbacks but continued petting can reactivate', () => {
  const p = pure(); strokes(p.detector);
  assert.equal(p.calls.length, 1);
  for (let i = 1; i <= 20; i++) p.detector.move(i % 2 ? 360 : 300, 220, 2600 + i * 400);
  assert.equal(p.calls.length, 2);
});
test('cancel and invalid coordinates do not preserve partial gestures', () => {
  const p = pure(); strokes(p.detector, { count: 3 }); p.detector.cancel();
  p.detector.move(300, 220, 2700); assert.equal(p.calls.length, 0);
  strokes(p.detector, { count: 3, start: 4000 }); p.detector.move(NaN, 220, 5300);
  p.detector.move(300, 220, 5600); assert.equal(p.calls.length, 0);
});
test('perpendicular wandering and time reversal invalidate the gesture', () => {
  const p = pure(); strokes(p.detector, { count: 3 });
  p.detector.move(300, 500, 2500); p.detector.move(300, 220, 2700);
  assert.equal(p.calls.length, 0);
  strokes(p.detector, { start: 4000, count: 3 }); p.detector.move(300, 220, 3000);
  p.detector.move(300, 220, 5700); assert.equal(p.calls.length, 0);
});
test('renderer exceptions never escape into pointer handling', () => {
  const detector = createPettingDetector({ onPet() { throw new Error('renderer unavailable'); } });
  assert.doesNotThrow(() => strokes(detector));
});

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, fn, options) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push({ fn, options });
  }
  removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item.fn !== fn)); }
  emit(name, event = {}) { for (const { fn } of [...(this.listeners.get(name) || [])]) fn(event); }
  count() { return [...this.listeners.values()].reduce((count, items) => count + items.length, 0); }
}
class Matrix {
  constructor(scale = 1, x = 0, y = 0) { this.scale = scale; this.x = x; this.y = y; }
  inverse() { return new Matrix(1 / this.scale, -this.x / this.scale, -this.y / this.scale); }
  multiply(other) { return new Matrix(this.scale * other.scale, this.x + this.scale * other.x, this.y + this.scale * other.y); }
}
class Point {
  constructor(x, y) { this.x = x; this.y = y; }
  matrixTransform(m) { return new Point(this.x * m.scale + m.x, this.y * m.scale + m.y); }
}
class Node extends Events {
  constructor(nodeName = 'div') { super(); this.nodeName = nodeName; this.dataset = {}; this.attributes = {}; this.isConnected = true; this.children = []; this.open = false; this.classList = { contains: () => this.open }; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  append(node) { this.children.push(node); }
  remove() { this.isConnected = false; }
  closest() { return this.forbidden ? this : null; }
}
function dom({ design = 'new', scale = 1, initiallyHidden = false } = {}) {
  let now = 1000;
  let eyeScreenScale = 1;
  const win = new Events(), doc = new Events(), calls = [], observers = [];
  win.performance = { now: () => now }; win.navigator = { onLine: true }; win.DOMPoint = Point;
  for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'fetch']) win[name] = () => { throw new Error(`Petting must not call ${name}`); };
  win.AtlasFace = { expression(value) { calls.push(value); return true; } };
  win.MutationObserver = class {
    constructor(fn) { this.fn = fn; this.nodes = []; this.disconnected = false; observers.push(this); }
    observe(...args) { this.nodes.push(args); }
    disconnect() { this.disconnected = true; }
  };
  const stage = new Node(), character = new Node(), canvas = new Node(), view = new Node(), content = new Node(), connection = new Node(), panel = new Node();
  const nodes = { '.face-stage': stage, '#view-atlas': view, '#webscreen-content': content, '.face-connection': connection, '#side-panel': panel };
  doc.body = new Node(); doc.body.dataset.design = design; doc.hidden = false;
  doc.querySelector = selector => nodes[selector];
  doc.createElementNS = (_namespace, name) => new Node(name); doc.createElement = name => new Node(name);
  stage.querySelector = selector => ({ '.face-character': character, '.face-canvas': canvas })[selector];
  stage.dataset.state = 'idle'; connection.dataset.healthy = 'true';
  content.hidden = initiallyHidden; content.inert = initiallyHidden;
  character.getScreenCTM = () => {
    if (content.hidden || content.inert) throw new Error('No SVG layout before access lease');
    return new Matrix(scale);
  };
  character.querySelectorAll = () => [{ x: 240, y: 140, width: 120, height: 220 },
    { x: 640, y: 140, width: 120, height: 220 }, { x: 450, y: 380, width: 120, height: 40 }]
    .map((box, i) => ({ getBBox: () => box,
      classList: { contains: name => name === 'face-eye' && i < 2 },
      getScreenCTM: () => new Matrix(scale * (i < 2 ? eyeScreenScale : 1)) }));
  canvas.getBoundingClientRect = () => ({ width: 1024 * scale });
  stage.setPointerCapture = id => { stage.capture = id; };
  stage.hasPointerCapture = id => stage.capture === id;
  stage.releasePointerCapture = () => { stage.capture = null; };
  const api = install(win, doc);
  function event(name, { x = 350, y = 240, time = now, id = 1, type = 'touch', target = character.children[0], ...rest } = {}) {
    now = time;
    doc.emit(name, { pointerId: id, clientX: x * scale, clientY: y * scale, pointerType: type,
      isPrimary: true, button: 0, buttons: 1, target, ...rest });
  }
  function pet({ start = now, type = 'touch', count = 4, x = 350, y = 240, down = true } = {}) {
    if (down) event('pointerdown', { x, y, time: start, type });
    event('pointermove', { x: x + 10, y, time: start + 20, type });
    for (let i = 1; i <= count; i++) event('pointermove', { x: x + (i % 2 ? 60 : 0), y, time: start + i * 400, type });
  }
  return { win, doc, stage, character, view, content, connection, panel, observers, calls, api, event, pet,
    blink(value) { eyeScreenScale = value ? 0.065 : 1; },
    mutate() { observers.forEach(observer => observer.fn([])); } };
}

test('debug route does not install global handlers or an input region', () => {
  const p = dom({ design: 'debug' });
  assert.equal(p.api, null); assert.equal(p.win.AtlasPetting, undefined);
  assert.equal(p.doc.count() + p.win.count(), 0); assert.equal(p.character.children.length, 0);
});
test('the face input region is HTML inside the SVG transform for native touch-action', () => {
  const p = dom();
  const frame = p.character.children[0], zone = frame.children[0];
  assert.equal(frame.nodeName, 'foreignObject');
  assert.equal(frame.getAttribute('class'), 'face-petting-frame');
  assert.equal(zone.nodeName, 'div');
  assert.equal(zone.getAttribute('class'), 'face-petting-zone');
  assert.equal(frame.getAttribute('aria-hidden'), 'true');
  assert.ok(Number(frame.getAttribute('width')) > 0);
  assert.ok(Number(frame.getAttribute('height')) > 0);
});
test('touch, pen and primary mouse drag call the renderer contract exactly once', () => {
  for (const type of ['touch', 'pen', 'mouse']) {
    const p = dom(); p.pet({ type });
    assert.deepEqual(p.calls, [{ expression: 'delighted', source: 'petting', durationMs: 6000 }]);
    assert.ok(p.doc.listeners.get('pointermove')[0].options.passive);
  }
});
test('hit testing and stroke distances scale with the actual SVG transform', () => {
  for (const scale of [0.4, 1, 1.4]) {
    const p = dom({ scale }); p.pet(); assert.equal(p.calls.length, 1, `scale=${scale}`);
  }
});
test('resize or pageshow during a blink cannot leave a cropped face input region', () => {
  for (const event of ['resize', 'pageshow']) {
    const p = dom({ scale: 0.4 });
    const frame = p.character.children[0];
    const original = { ...frame.attributes };
    p.blink(true);
    p.win.emit(event);
    assert.deepEqual(frame.attributes, original, event);
    p.blink(false);
    p.pet({ y: 160 });
    assert.equal(p.calls.length, 1, event);
  }
});
test('hidden lease startup refreshes the touch region when content becomes available', () => {
  const p = dom({ initiallyHidden: true });
  const frame = p.character.children[0];
  assert.equal(frame.getAttribute('width'), undefined);
  p.pet(); assert.equal(p.calls.length, 0); p.event('pointerup');
  p.content.hidden = false; p.content.inert = false; p.mutate();
  assert.ok(Number(frame.getAttribute('width')) > 0);
  assert.ok(Number(frame.getAttribute('height')) > 0);
  p.pet({ start: 4000 }); assert.equal(p.calls.length, 1);
});
test('visibility and connection restoration refresh geometry before a new gesture', () => {
  for (const [hide, restore, event] of [
    [p => { p.doc.hidden = true; }, p => { p.doc.hidden = false; }, 'visibilitychange'],
    [p => { p.view.hidden = true; }, p => { p.view.hidden = false; }, 'mutation'],
    [p => { p.connection.dataset.healthy = 'false'; }, p => { p.connection.dataset.healthy = 'true'; }, 'mutation'],
  ]) {
    const p = dom();
    hide(p); p.mutate();
    restore(p);
    if (event === 'mutation') p.mutate(); else p.doc.emit(event);
    p.pet(); assert.equal(p.calls.length, 1);
  }
});
test('tap, single swipe and double swipe do not activate an expression', () => {
  for (const count of [0, 1, 2, 3]) { const p = dom(); p.pet({ count }); assert.equal(p.calls.length, 0); }
});
test('separate short drags do not combine across pointerup', () => {
  const p = dom(); p.pet({ count: 2 }); p.event('pointerup'); p.pet({ start: 2200, count: 2 });
  assert.equal(p.calls.length, 0);
});
test('header, blank space outside the face and a submenu never accumulate petting', () => {
  for (const [x, y] of [[50, 40], [500, 550], [850, 240]]) {
    const p = dom(); p.pet({ x, y }); assert.equal(p.calls.length, 0);
  }
  const p = dom(); p.panel.open = true; p.pet(); assert.equal(p.calls.length, 0);
  p.panel.open = false;
  const button = new Node(); button.forbidden = true;
  p.event('pointerdown', { target: button }); p.pet({ down: false, start: 3000 });
  assert.equal(p.calls.length, 0);
});
test('leaving the face bounds cancels rather than counting an off-face return', () => {
  const p = dom(); p.pet({ count: 3 }); p.event('pointermove', { x: 900, time: 2300 });
  p.event('pointermove', { x: 350, time: 2700 }); assert.equal(p.calls.length, 0);
});
test('multitouch cancels all progress and waits for a fresh single contact', () => {
  const p = dom(); p.pet({ count: 3 }); p.event('pointerdown', { id: 2, isPrimary: false, time: 2300 });
  p.event('pointerup', { id: 2, time: 2400 }); p.pet({ down: false, start: 2500 });
  assert.equal(p.calls.length, 0);
  p.event('pointerup'); p.pet({ start: 5000 }); assert.equal(p.calls.length, 1);
});
test('mouse hover, right-click and releasing a mouse button cannot pet', () => {
  const p = dom(); p.pet({ down: false, type: 'mouse' }); assert.equal(p.calls.length, 0);
  p.event('pointerdown', { type: 'mouse', button: 2, buttons: 2 }); p.pet({ down: false, type: 'mouse', start: 3000 });
  assert.equal(p.calls.length, 0);
  p.event('pointerup'); p.pet({ count: 3, type: 'mouse', start: 5000 });
  p.event('pointermove', { type: 'mouse', buttons: 0, time: 6300 });
  p.event('pointermove', { x: 350, type: 'mouse', time: 6700 }); assert.equal(p.calls.length, 0);
});
test('pointercancel and lost capture immediately discard partial gestures', () => {
  for (const kind of ['pointercancel', 'lostpointercapture']) {
    const p = dom(); p.pet({ count: 3 });
    if (kind === 'pointercancel') p.event(kind); else p.stage.emit(kind);
    p.event('pointermove', { x: 350, time: 2700 }); assert.equal(p.calls.length, 0);
  }
});
test('listening waveform, connecting and error states never trigger petting', () => {
  for (const state of ['listening', 'connecting', 'error']) {
    const p = dom(); p.stage.dataset.state = state; p.pet(); assert.equal(p.calls.length, 0);
  }
});
test('working and speaking are eligible without changing their functional state', () => {
  for (const state of ['working', 'speaking']) {
    const p = dom(); p.stage.dataset.state = state; p.pet();
    assert.equal(p.calls.length, 1); assert.equal(p.stage.dataset.state, state);
  }
});
test('visibility, screen-hide, disconnect and open panel cancel in-progress petting', () => {
  for (const change of [p => { p.doc.hidden = true; }, p => { p.view.hidden = true; },
    p => { p.content.hidden = true; }, p => { p.content.inert = true; },
    p => { p.doc.body.dataset.facePaused = 'true'; }, p => { p.connection.dataset.healthy = 'false'; },
    p => { p.stage.dataset.state = 'listening'; }, p => { p.panel.open = true; },
    p => { p.stage.isConnected = false; }]) {
    const p = dom(); p.pet({ count: 3 }); change(p); p.mutate();
    p.event('pointermove', { x: 350, time: 2700 }); assert.equal(p.calls.length, 0);
  }
});
test('pagehide/restore and offline require fresh pointer contact', () => {
  for (const event of ['pagehide', 'offline', 'blur']) {
    const p = dom(); p.pet({ count: 3 }); p.win.emit(event); p.win.emit('pageshow');
    p.event('pointermove', { x: 350, time: 2700 }); assert.equal(p.calls.length, 0);
    p.event('pointerup'); p.pet({ start: 4000 }); assert.equal(p.calls.length, 1);
  }
});
test('dispose removes every listener/observer/zone and cannot trigger again', () => {
  const p = dom(); p.pet({ count: 3 }); const zone = p.character.children[0];
  p.api.disconnect(); p.api.disconnect();
  assert.equal(p.doc.count() + p.win.count() + p.stage.count(), 0);
  assert.ok(p.observers.every(observer => observer.disconnected)); assert.equal(zone.isConnected, false);
  p.pet({ start: 4000 }); assert.equal(p.calls.length, 0);
});
