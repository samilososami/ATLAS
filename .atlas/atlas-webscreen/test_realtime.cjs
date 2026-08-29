const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(`${__dirname}/static/realtime.js`, 'utf8'), {
  window, crypto: { randomUUID: () => '00000000-0000-0000-0000-000000000000' },
  navigator: {}, RTCPeerConnection: undefined, MediaStream: class {}, AudioContext: class {},
  performance: { now: () => 0 }, fetch: async () => { throw new Error('not used'); },
  setTimeout, clearTimeout, console, JSON, String, Number, RegExp, Object, Array, Error,
});

const { wakeInvocation, silenceInvocation, withTurnSeparator } = window.AtlasRealtime._test;
assert.equal(wakeInvocation('Atlas, qué hora es'), true);
assert.equal(wakeInvocation('Oye Atlas, dime la hora'), true);
assert.equal(wakeInvocation('Estoy trabajando en el proyecto de Atlas'), false);
assert.equal(silenceInvocation('Atlas, calla calla'), true);
assert.equal(silenceInvocation('Atlas, nada nada nada'), true);
assert.equal(silenceInvocation('Atlas, no quiero que borres nada'), false);
assert.equal(withTurnSeparator('Dame un momento.'), 'Dame un momento. ');
assert.equal(withTurnSeparator('Dame un momento. '), 'Dame un momento. ');
assert.equal(withTurnSeparator(''), '');
console.log('realtime wake and silence filters: ok');
