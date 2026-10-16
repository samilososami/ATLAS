const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(`${__dirname}/static/app.js`, 'utf8');
const block = source.slice(source.indexOf('let cachedBrowserVoice'), source.indexOf('function browserSpeechSegments'));
function setup(initial = []) {
  let voices = initial, reads = 0;
  const events = {};
  const ctx = vm.createContext({ window: { speechSynthesis: {
    getVoices() { reads++; return voices; },
    addEventListener(name, fn) { events[name] = fn; },
  } } });
  vm.runInContext(block, ctx);
  return { voice: () => ctx.browserVoice(), reads: () => reads,
    set(next, notify = true) { voices = next; if (notify) events.voiceschanged(); } };
}
test('same es-ES preference is cached across streamed clauses', () => {
  const mexico = { lang: 'es-MX' }, spain = { lang: 'es-ES' };
  const p = setup([mexico, spain]);
  assert.equal(p.voice(), spain);
  assert.equal(p.voice(), spain);
  assert.equal(p.reads(), 1);
});
test('voiceschanged invalidates choice and preserves Spanish fallback', () => {
  const spain = { lang: 'es-ES' }, mexico = { lang: 'es-MX' };
  const p = setup([spain]);
  p.voice(); p.set([mexico]);
  assert.equal(p.voice(), mexico);
  assert.equal(p.reads(), 2);
});
test('empty or non-Spanish catalogue never freezes asynchronous loading', () => {
  const p = setup();
  assert.equal(p.voice(), null);
  p.set([{ lang: 'en-US' }], false);
  assert.equal(p.voice(), null);
  const spain = { lang: 'es-ES' };
  p.set([spain], false);
  assert.equal(p.voice(), spain);
});
test('unavailable speech synthesis remains supported', () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(block, ctx);
  assert.equal(ctx.browserVoice(), null);
});
