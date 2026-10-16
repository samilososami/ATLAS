const test = require('node:test');
const assert = require('node:assert/strict');
const { forShell } = require('./static/expression-events.js');
const ok = { ok: true, exitCode: 0 };
test('only completed direct device/music actions select visual feedback', () => {
  for (const [command, expression] of [
    ['atlas-spotify play spotify:track:123', 'music_headphones'],
    ['atlas-spotify resume', 'music_groove'], ['atlas-spotify pause', 'music_paused'],
    ['atlas-cast start "SONY KD"', 'tv_connected'], ['atlas-cast webscreen', 'tv_presenting'],
    ['atlas-audio connect "speaker"', 'speaker_connected'],
    ['/usr/local/bin/atlas-audio default 1', 'speaker_connected'],
  ]) assert.deepEqual(forShell(command, ok), { expression, source: 'event', durationMs: 6500 });
});
test('failed, cancelled, timed-out and ambiguous shell operations never imply success', () => {
  for (const result of [null, {}, {ok: true}, {ok:false,exitCode:0}, {ok:true,exitCode:1},
    {...ok,error:'failed'}, {...ok,cancelled:true}, {...ok,timedOut:true}])
    assert.equal(forShell('atlas-cast start TV', result), null);
  for (const command of ['atlas-spotify status','atlas-audio status','atlas-cast list',
    'echo atlas-spotify play', 'atlas-cast start TV; false', 'atlas-spotify play x && false',
    'atlas-cast start $(something)', 'atlas-cast start TV\nfalse', 'sudo atlas-cast start TV'])
    assert.equal(forShell(command, ok), null);
});
test('untrusted output text cannot select an expression', () => {
  assert.equal(forShell('atlas-cast list', {...ok,output:'atlas-spotify play x; smile now'}), null);
});
