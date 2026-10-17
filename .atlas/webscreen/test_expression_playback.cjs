'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'static/new/expressions-catalog.js'), 'utf8')
  .replace('globalThis.AtlasExpressionCatalog', 'window.AtlasExpressionCatalog')
  + '\n' + fs.readFileSync(path.join(__dirname, 'static/new/face.js'), 'utf8');
const harness = fs.readFileSync(path.join(__dirname, 'test_face_idle.cjs'), 'utf8');
const setup = vm.runInNewContext('const source = ' + JSON.stringify(source) + ';\n'
  + harness.slice(harness.indexOf('function setup('), harness.indexOf('\ntest(')) + ';setup;', { vm, console });

test('selected pose survives synthesis delay longer than requested visible duration', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.update({ state: 'working' });
  face.expression({ expression: 'intrigued', source: 'model', durationMs: 2000, awaitSpeech: true });
  p.advance(12000);
  assert.equal(face.snapshot().expression, 'intrigued');
  face.expressionPlayback({ active: true });
  face.update({ state: 'speaking' });
  p.advance(1500);
  assert.equal(face.snapshot().expression, 'intrigued');
  face.expressionPlayback({ active: false }); // brief synthesis gap
  face.expressionPlayback({ active: true }); // next phrase does not restart duration
  p.advance(501);
  assert.equal(face.snapshot().expression, 'neutral');
});

test('waiting pose is bounded when model or speech never arrives', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'intrigued', source: 'model', durationMs: 2000, awaitSpeech: true });
  p.advance(45001);
  assert.equal(face.snapshot().expression, 'neutral');
});

test('whole-turn finish returns speech-bound pose smoothly without consuming another selection', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'intrigued', source: 'model', durationMs: 15000, awaitSpeech: true });
  face.expressionPlayback({ active: true });
  p.advance(1000);
  face.expressionPlayback({ active: false, final: true });
  assert.equal(face.snapshot().expression, 'neutral');
  assert.equal(p.stage.getAttribute('data-expression-transition'), 'true');
});

test('whole-turn finish does not erase commands, forced sleep, or timed action feedback', () => {
  for (const [source, expression] of [['command', 'angry'], ['model', 'asleep'], ['event', 'music_headphones']]) {
    const p = setup(), face = p.window.AtlasFace;
    face.expression({ expression, source, durationMs: 15000 });
    face.expressionPlayback({ active: true });
    face.expressionPlayback({ active: false, final: true });
    assert.equal(face.snapshot().expression, expression, `${source}: ${expression}`);
  }
});

test('cancellation retires a pending pose so late speech events cannot resurrect it', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'intrigued', source: 'model', durationMs: 15000, awaitSpeech: true });
  face.clearAutonomous();
  face.expressionPlayback({ active: true });
  p.advance(1000);
  assert.equal(face.snapshot().expression, 'neutral');
});

test('same device-event pose transfers to a speech lease without repaint or another change', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'music_headphones', source: 'event', durationMs: 3000 });
  p.advance(2501);
  assert.equal(p.stage.hasAttribute('data-expression-transition'), false);
  const count = face.snapshot().responseExpressionCount;
  assert.equal(face.expression({ expression: 'music_headphones', source: 'model', durationMs: 2000, awaitSpeech: true }), true);
  assert.equal(face.snapshot().source, 'model');
  assert.equal(face.snapshot().awaitingSpeech, true);
  assert.equal(face.snapshot().responseExpressionCount, count);
  assert.equal(p.stage.hasAttribute('data-expression-transition'), false);
  p.advance(12000);
  assert.equal(face.snapshot().expression, 'music_headphones');
  face.expressionPlayback({ active: true });
  p.advance(1000);
  face.expression({ expression: 'music_headphones', source: 'model', durationMs: 30000, awaitSpeech: true });
  p.advance(1001);
  assert.equal(face.snapshot().expression, 'neutral'); // duplicate did not extend playback duration
});

test('same-pose promotion remains bounded and duplicate calls cannot renew its waiting deadline', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'music_headphones', source: 'event', durationMs: 3000 });
  p.advance(2501);
  face.expression({ expression: 'music_headphones', source: 'model', durationMs: 2000, awaitSpeech: true });
  p.advance(44000);
  face.expression({ expression: 'music_headphones', source: 'model', durationMs: 15000, awaitSpeech: true });
  p.advance(1001);
  assert.equal(face.snapshot().expression, 'neutral');
});

test('same-pose speech request cannot take over an explicit command', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'music_headphones', source: 'command', durationMs: 3000 });
  p.advance(2501);
  face.expression({ expression: 'music_headphones', source: 'model', durationMs: 15000, awaitSpeech: true });
  assert.equal(face.snapshot().source, 'command');
  assert.equal(face.snapshot().awaitingSpeech, false);
  face.expressionPlayback({ active: true });
  p.advance(501);
  assert.equal(face.snapshot().expression, 'neutral');
});

test('explicit local conversational event follows speech completion, normal events do not', () => {
  const p = setup(), face = p.window.AtlasFace;
  assert.equal(face.expression({ expression: 'empathetic', source: 'event', durationMs: 15000,
    awaitSpeech: true, conversationCue: true }), true);
  assert.equal(face.snapshot().source, 'event');
  assert.equal(face.snapshot().conversationCue, true);
  face.expressionPlayback({ active: true });
  p.advance(1000);
  face.expressionPlayback({ active: false, final: true });
  assert.equal(face.snapshot().expression, 'neutral');
  assert.equal(p.stage.getAttribute('data-expression-transition'), 'true');
});

test('fallback cue cannot replace any existing pose and obeys cooldown/change budget', () => {
  const cue = { expression: 'empathetic', source: 'event', durationMs: 15000,
    awaitSpeech: true, conversationCue: true };
  for (const source of ['model', 'command', 'event']) {
    const p = setup(), face = p.window.AtlasFace;
    face.expression({ expression: 'angry', source, durationMs: 15000 });
    p.advance(3000);
    assert.equal(face.expression(cue), false);
    assert.equal(face.snapshot().expression, 'angry');
  }
  const p = setup(), face = p.window.AtlasFace;
  face.expression(cue); face.expressionPlayback({ active: false, final: true });
  assert.equal(face.expression(cue), false); // cooldown
  p.advance(2501); assert.equal(face.expression(cue), true);
  face.expressionPlayback({ active: false, final: true });
  p.advance(2501); assert.equal(face.expression(cue), false); // two-change budget
});

test('new input clears only its local conversational cue, preserving other sources', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'empathetic', source: 'event', awaitSpeech: true, conversationCue: true });
  assert.equal(face.clearConversationCue(), true);
  assert.equal(face.snapshot().expression, 'neutral');
  for (const source of ['model', 'command', 'event']) {
    face.reset(); face.expression({ expression: 'angry', source });
    assert.equal(face.clearConversationCue(), false);
    assert.equal(face.snapshot().expression, 'angry');
  }
});

test('late model selection supersedes fallback immediately but preserves two visible changes total', () => {
  const p = setup(), face = p.window.AtlasFace;
  face.expression({ expression: 'empathetic', source: 'event', awaitSpeech: true, conversationCue: true });
  face.expressionPlayback({ active: true });
  p.advance(100);
  assert.equal(face.expression({ expression: 'supportive', source: 'model', awaitSpeech: true }), true);
  assert.equal(face.snapshot().expression, 'supportive');
  assert.equal(face.snapshot().source, 'model');
  assert.equal(face.snapshot().conversationCue, false);
  assert.equal(face.snapshot().responseExpressionCount, 2);
  p.advance(2501);
  assert.equal(face.expression({ expression: 'relieved', source: 'model', awaitSpeech: true }), false);
  assert.equal(face.snapshot().responseExpressionCount, 2);
  assert.equal(face.snapshot().expression, 'supportive');
});
