const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(`${__dirname}/static/clap.js`, 'utf8');

function setup() {
  let claps = 0;
  class Element {
    constructor() { this.children = []; this.hidden = false; this.disabled = false; this.value = 0; this.textContent = ''; this.className = ''; }
    addEventListener(name, listener) { this.listeners ||= {}; this.listeners[name] = listener; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
  }
  const nodes = new Map();
  const document = { querySelector(key) { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); }, createElement() { return new Element(); } };
  const window = {
    atlasAccess: { hasControl: () => true, fetch: async () => ({ ok: true, json: async () => ({ profile: null }) }) },
    addEventListener() {}, setTimeout() { return 0; }, clearTimeout() {}, AtlasFace: { clap() { claps += 1; return true; } },
  };
  vm.runInNewContext(source, { window, document, performance: { now: () => 1000 }, Math, Number, Date, JSON, console });
  return { clap: window.AtlasClap, window, nodes, get claps() { return claps; } };
}

function broadBandFrame({ rms = .09, peak = .28, high = true } = {}) {
  const spectrum = new Uint8Array(512);
  for (let index = 2; index < spectrum.length; index += 1) spectrum[index] = high || index < 36 ? 120 : 3;
  return { spectrum, sampleRate: 48000, rms, peak, at: 1000 };
}

test('clap metrics are extracted synchronously without retaining a waveform', () => {
  const { clap } = setup();
  const frame = broadBandFrame();
  const metrics = clap._featuresFor(frame);
  assert.ok(metrics.highBandRatio > .5);
  assert.ok(metrics.flatness > .5);
  assert.equal(Object.values(clap._state).includes(frame.spectrum), false);
  assert.equal(Object.values(clap._state).includes(frame), false);
});

test('calibrated broad-band transient passes while voice-like low-band sound is rejected', () => {
  const { clap } = setup();
  const rules = clap._defaultRules(.004);
  assert.equal(clap._candidate(clap._featuresFor(broadBandFrame()), rules, .004), true);
  assert.equal(clap._candidate(clap._featuresFor(broadBandFrame({ high: false })), rules, .004), false);
  assert.equal(clap._candidate(clap._featuresFor(broadBandFrame({ rms: .005, peak: .02 })), rules, .004), false);
});

function feed(clap, rules, at, values, onPair) {
  const frame = broadBandFrame(values);
  frame.at = at;
  clap._processTransient(clap._featuresFor(frame), rules, .004, onPair);
}

test('one clap with a multi-frame tail never becomes a double clap', () => {
  const { clap } = setup();
  const rules = clap._defaultRules(.004);
  let pairs = 0;
  const onPair = () => { pairs += 1; };
  for (const at of [0, 25, 50]) feed(clap, rules, at, { rms: .003, peak: .008 }, onPair);
  feed(clap, rules, 100, { rms: .09, peak: .30 }, onPair);
  feed(clap, rules, 125, { rms: .04, peak: .11 }, onPair);
  feed(clap, rules, 150, { rms: .018, peak: .05 }, onPair);
  for (const at of [175, 200, 225, 250, 500, 900]) feed(clap, rules, at, { rms: .003, peak: .008 }, onPair);
  assert.equal(pairs, 0);
  assert.equal(clap._state.pair.length, 1, 'the first event is armed but cannot fire alone');
});

test('a weaker delayed room echo cannot impersonate the second clap', () => {
  const { clap } = setup();
  const rules = clap._defaultRules(.004);
  let pairs = 0;
  const onPair = () => { pairs += 1; };
  for (const at of [0, 25, 50]) feed(clap, rules, at, { rms: .003, peak: .008 }, onPair);
  feed(clap, rules, 100, { rms: .12, peak: .38 }, onPair);
  for (const at of [125, 150, 175, 200]) feed(clap, rules, at, { rms: .003, peak: .008 }, onPair);
  feed(clap, rules, 430, { rms: .035, peak: .13 }, onPair);
  for (const at of [455, 480, 505, 530]) feed(clap, rules, at, { rms: .003, peak: .008 }, onPair);
  assert.equal(pairs, 0);
  assert.equal(clap._state.pair.length, 1, 'the echo is rejected and becomes no completed pair');
});

test('two separate released clap envelopes produce exactly one pair', () => {
  const { clap } = setup();
  const rules = clap._defaultRules(.004);
  let pairs = 0;
  const onPair = () => { pairs += 1; };
  for (const at of [0, 25, 50]) feed(clap, rules, at, { rms: .003, peak: .008 }, onPair);
  for (const clapAt of [100, 500]) {
    feed(clap, rules, clapAt, { rms: .09, peak: .30 }, onPair);
    feed(clap, rules, clapAt + 25, { rms: .035, peak: .09 }, onPair);
    for (const offset of [50, 75, 100, 125]) feed(clap, rules, clapAt + offset, { rms: .003, peak: .008 }, onPair);
  }
  assert.equal(pairs, 1);
  assert.equal(clap._state.pair.length, 0);
});

test('a sustained broad-band cough-shaped envelope is rejected by duration', () => {
  const { clap } = setup();
  const rules = clap._defaultRules(.004);
  let pairs = 0;
  const onPair = () => { pairs += 1; };
  for (const at of [0, 25, 50]) feed(clap, rules, at, { rms: .003, peak: .008 }, onPair);
  for (let at = 100; at <= 425; at += 25) feed(clap, rules, at, { rms: .07, peak: .24 }, onPair);
  for (const at of [450, 475, 500, 525, 550]) feed(clap, rules, at, { rms: .003, peak: .008 }, onPair);
  assert.equal(pairs, 0);
  assert.equal(clap._state.pair.length, 0, 'a long transient cannot arm the first clap');
});

test('no analyser frames are requested until calibration or a saved profile is active on ATLAS', () => {
  const { clap } = setup();
  assert.equal(clap.needsFrames(), false);
  clap._state.phase = 'trial';
  assert.equal(clap.needsFrames(), true);
  clap._state.phase = 'idle';
  clap._state.profile = { detector: {} };
  clap.onViewChanged('settings');
  assert.equal(clap.needsFrames(), false);
  clap.onViewChanged('atlas');
  assert.equal(clap.needsFrames(), true);
});

test('starting calibration prepares an already-authorized microphone through the app bridge', async () => {
  const { clap, window, nodes } = setup();
  let requested = 0;
  window.AtlasClapBridge = {
    async ensureMicrophone() {
      requested += 1;
      clap.microphone({ available: true, sampleRate: 48000 });
      return true;
    },
  };
  nodes.get('#clap-start').listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requested, 1);
  assert.equal(clap._state.phase, 'ready');
  assert.equal(nodes.get('#clap-start').disabled, false);
});
