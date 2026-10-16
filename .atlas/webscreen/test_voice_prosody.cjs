const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const prosody = require('./static/voice-prosody.js');
const source = fs.readFileSync(`${__dirname}/static/app.js`, 'utf8');

test('Spanish voice preference is deterministic and explicit selections win', () => {
  const mexico = { lang: 'es-MX', name: 'Mexico', voiceURI: 'mexico' };
  const spain = { lang: 'es_ES', name: 'Spain', voiceURI: 'spain' };
  assert.equal(prosody.chooseVoice([mexico, spain]), spain);
  assert.equal(prosody.chooseVoice([spain, mexico], 'mexico'), mexico);
  assert.equal(prosody.chooseVoice([spain, mexico], 'Mexico'), mexico);
  assert.equal(prosody.chooseVoice([mexico], 'removed-voice'), mexico);
  assert.equal(prosody.chooseVoice([{ lang: 'en-US' }]), null);
  assert.equal(prosody.chooseVoice(undefined), null);
});

test('delivery is restrained, deterministic and never changes volume', () => {
  for (const expression of ['neutral', 'sad', 'worried', 'empathetic', 'happy', 'delighted',
    'curious', 'angry', 'defiant', 'asleep', 'unknown']) {
    const options = { expression, text: '¿Lo probamos?' };
    const delivery = prosody.browserDelivery(options);
    assert.deepEqual(delivery, prosody.browserDelivery(options));
    assert.ok(delivery.rate >= .96 && delivery.rate <= 1.03);
    assert.ok(delivery.pitch >= 1 && delivery.pitch <= 1.02);
    assert.equal(delivery.volume, 1);
  }
  assert.ok(prosody.browserDelivery({ expression: 'sad' }).rate < 1);
  assert.ok(prosody.browserDelivery({ expression: 'delighted' }).rate > 1);
  assert.deepEqual(prosody.browserDelivery({ expression: 'unknown' }), { rate: 1, pitch: 1, volume: 1 });
});

test('catalog family applies without guessing emotions from user content', () => {
  assert.deepEqual(prosody.browserDelivery({ expression: 'new_face_123', family: 'empathetic' }),
    prosody.browserDelivery({ expression: 'empathetic' }));
  assert.deepEqual(prosody.browserDelivery({ text: 'Estoy enfadado.' }),
    { rate: 1, pitch: 1, volume: 1 });
});

test('naturalness opt-out reproduces the prior browser delivery', () => {
  assert.deepEqual(prosody.browserDelivery({ enabled: false, expression: 'happy', text: '¿Sí?' }),
    { rate: 1.02, pitch: 1, volume: 1 });
});

test('real utterance configuration preserves text, punctuation, selected voice and locale', () => {
  const block = source.slice(source.indexOf('function configureBrowserUtterance('),
    source.indexOf('function browserSpeechSegments('));
  const context = vm.createContext({ window: { AtlasVoiceProsody: prosody },
    document: { querySelector: () => ({ dataset: { expression: 'sad' } }) },
    LANGUAGE: 'es-ES', voiceNaturalness: true });
  vm.runInContext(block, context);
  const voice = { name: 'Selected', lang: 'es-MX' };
  const text = '¿En serio…? Son 48,3 °C. «Prueba». No cambio el texto.';
  const utterance = { text };
  context.configureBrowserUtterance(utterance, voice);
  assert.equal(utterance.text, text);
  assert.equal(utterance.lang, 'es-MX');
  assert.equal(utterance.voice, voice);
  assert.equal(utterance.rate, .96);
  assert.equal(utterance.volume, 1);
  context.voiceNaturalness = false;
  context.configureBrowserUtterance(utterance, voice);
  assert.equal(utterance.rate, 1.02);
});

test('older bundles without the helper use bounded fallback and do not break playback', () => {
  const block = source.slice(source.indexOf('function configureBrowserUtterance('),
    source.indexOf('function browserSpeechSegments('));
  const context = vm.createContext({ window: {}, document: { querySelector: () => null },
    LANGUAGE: 'es-ES', voiceNaturalness: true });
  vm.runInContext(block, context);
  const utterance = { text: 'Hola.' };
  context.configureBrowserUtterance(utterance, null);
  assert.deepEqual(utterance, { text: 'Hola.', lang: 'es-ES', rate: 1, pitch: 1, volume: 1 });
});

test('follow-up is only opted into by the normal visible unmuted voice screen', () => {
  const match = source.match(/canFollowUp: (\(\) => [\s\S]*?),\n\s*getInputAdmission/u);
  assert.ok(match, 'normal voice callback must be explicitly present');
  const defaults = { hasControl: () => true, activeView: 'atlas', microphoneMuted: false,
    document: { hidden: false }, realtimeFallbackActive: false, recordingMode: 'wake',
    nativeTranscribing: false, dictationRunning: false, dictationShouldRestart: false, ttsLabBusy: false };
  const allowed = changes => vm.runInNewContext(`(${match[1]})()`, { ...defaults, ...changes });
  assert.equal(allowed({}), true);
  for (const change of [{ hasControl: () => false }, { activeView: 'chat' },
    { microphoneMuted: true }, { document: { hidden: true } }, { recordingMode: 'manual' },
    { recordingMode: 'hold' }, { realtimeFallbackActive: true }, { nativeTranscribing: true },
    { dictationRunning: true }, { dictationShouldRestart: true }, { ttsLabBusy: true }]) {
    assert.equal(allowed(change), false);
  }
  assert.match(source, /if \(microphoneMuted\) realtimeController\?\.closeFollowUp\?\.\(\)/u);
  assert.match(source, /if \(document.hidden\) realtimeController\?\.closeFollowUp\?\.\(\)/u);
});
