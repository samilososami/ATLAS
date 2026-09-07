const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(`${__dirname}/static/clap.js`, 'utf8');

function setup() {
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
    addEventListener() {}, setTimeout() { return 0; }, clearTimeout() {}, AtlasFace: { clap() { return true; } },
  };
  vm.runInNewContext(source, { window, document, performance: { now: () => 1000 }, Math, Number, Date, JSON, console });
  return { clap: window.AtlasClap, window, nodes };
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
