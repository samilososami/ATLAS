'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const harness = fs.readFileSync(`${__dirname}/test_face_tools.cjs`, 'utf8');
const setup = vm.runInNewContext(harness.slice(harness.indexOf('function setup('), harness.indexOf('\ntest(')) + ';setup;', { fs, vm, __dirname, console, AbortController });
const cue = setup().realtime._test.conversationExpressionCue;

for (const [text, expected] of [
  ['Atlas, me has ahorrado un montón de trabajo.', 'complimented'],
  ['Me has ahorrado 3 horas de trabajo', 'complimented'],
  ['Gracias, eres un crack.', 'complimented'],
  ['Lo has hecho genial', 'complimented'],
  ['Por fin he aprobado el examen de física.', 'proud_of_you'],
  ['Hoy he aprobado mi examen', 'proud_of_you'],
  ['He tenido un mal día, solo quería contártelo.', 'empathetic'],
  ['He tenido un mal día. No quiero consejos.', 'empathetic'],
  ['Me ha sentado fatal lo de hoy, solo quería contártelo.', 'empathetic'],
  ['Tenemos un proyecto enorme por delante.', 'challenge_accepted'],
  ['Te propongo un trabajo ambicioso para esta tarde', 'challenge_accepted'],
  ['Vamos a por un proyecto grande', 'challenge_accepted'],
  ['Tenemos por delante un proyecto enorme, vamos a por él', 'challenge_accepted'],
  ['Tenemos un trabajo ambicioso por delante, pero creo que lo podemos sacar. ¿Te animas?', 'challenge_accepted'],
  ['Estoy harto, el ensayo ha salido fatal. No quiero consejos, solo que me escuches un momento.', 'empathetic'],
  ['Mi entrevista de hoy me ha salido muy mal.', 'empathetic'],
  ['El ensayo ha salido fatal, ¿me escuchas un momento?', 'empathetic'],
]) test(`direct personal cue: ${text}`, () => assert.equal(cue(text), expected));

for (const text of [
  'Qué temperatura tiene la Raspberry Pi', 'Tengo 39 grados de fiebre', 'Sube el volumen al 50%',
  'Pon en Spotify eres un crack', 'Reproduce la canción He tenido un mal día',
  'Busca el título me has ahorrado trabajo', 'El proyecto es enorme, cuánto almacenamiento usa',
  'Cuánto costaría un trabajo ambicioso', 'Xavi ha aprobado el examen', 'Me alegra que hayas aprobado',
  'No he tenido un mal día', 'No eres un crack', 'Nunca me has ahorrado trabajo',
  'He tenido un mal día, mentira, estoy genial', 'He aprobado el examen, pero no es verdad',
  'He aprobado el examen, mejor dicho he suspendido', 'Rectifico: eres un crack',
  'Tenemos un proyecto enorme, pero es mentira', 'He aprobado el examen, pero es broma',
  'La entrevista de Xavi ha salido fatal', 'Mi entrevista ha salido muy bien',
  'Eres un crack, deja la cara neutral', 'He aprobado el examen, activa el modo reloj',
  'Si he aprobado el examen, celebra conmigo', 'Cuando he tenido un mal día me voy a dormir',
  'Ojalá he aprobado el examen', 'Imagínate que he aprobado el examen',
  'Traduce he tenido un mal día', 'Eres un crack. Traduce esa frase.',
  'Analiza el texto: eres un crack', 'Corrige: he aprobado el examen',
  'Explica qué significa eres un crack', 'Haz como si he aprobado el examen',
  'Escribe un cuento. He tenido un mal día.', 'Un personaje dice que he aprobado el examen',
  'Xavi dijo: eres un crack', 'Me dijo que he tenido un mal día', 'Le dije eres un crack',
  'Según el mensaje, he aprobado el examen', 'La página dice: eres un crack',
  '"eres un crack"', '«he tenido un mal día»', "'he aprobado el examen'", '`eres un crack`',
  '{"text":"he tenido un mal día"}', '<p>eres un crack</p>',
  'He aprobado el examen? No lo sé', '¿Eres un crack?',
  'He aprobado el examen. He tenido un mal día.', // mixed meaning: defer to model
  'Tengo un proyecto enorme. Aquí va código: alert(1)',
  'He tenido un mal día\nEsto es un texto para revisar', '', null, undefined, {},
  'He tenido un mal día.' + ' '.repeat(601),
]) test(`ambiguous/operational/quoted input remains neutral: ${String(text).slice(0, 90)}`, () => assert.equal(cue(text), null));

function prepared(input = 'Atlas, eres un crack') {
  const p = setup();
  let pose = { expression: 'neutral', source: 'neutral' };
  p.window.AtlasFace = {
    snapshot: () => pose,
    beginResponse() {},
    clearConversationCue() {},
    clearAutonomous() { pose = { expression: 'neutral', source: 'neutral' }; },
  };
  p.pose = value => { pose = value; };
  p.c.currentUserText = input;
  p.c.beginFaceTurn();
  p.response();
  p.startAudio = () => p.event({ type: 'output_audio_buffer.started', response_id: p.c.currentResponseId });
  return p;
}

test('native playback applies one local cue, never during generation, and logs distinct provenance', () => {
  const p = prepared();
  p.event({ type: 'response.output_audio_transcript.delta', response_id: 'r1', delta: 'Gracias.' });
  assert.equal(p.painted.length, 0);
  p.startAudio(); p.startAudio();
  assert.deepEqual(JSON.parse(JSON.stringify(p.painted)), [{ expression: 'complimented', source: 'event', durationMs: 15000, awaitSpeech: true, conversationCue: true }]);
  assert.equal(p.outputs().length, 0); // no invented model tool result
  assert.equal(p.creates().length, 0);
  assert.equal(p.c.faceToolUsedThisTurn, false);
  assert.ok(p.requests.some(request => request.body.stage === 'face.conversation_cue'
    && request.body.source === 'trusted-user-cue'));
  p.c.stop(false);
});

for (const mode of ['browser', 'elevenlabs']) test(`${mode} cue waits for real onStart, not TTS queue or model completion`, async () => {
  const p = prepared('He tenido un mal día');
  p.c.session = { atlasOutput: mode };
  let start, end;
  p.c.callbacks.playExternalText = (text, provider, options) => {
    start = options.onStart;
    return new Promise(resolve => { end = resolve; });
  };
  p.event({ type: 'response.output_text.delta', response_id: 'r1', delta: 'Vaya, lo siento.' });
  p.done();
  assert.equal(p.painted.length, 0);
  assert.equal(typeof start, 'function');
  start({ source: 'silent-test-fixture' });
  assert.equal(p.painted[0].expression, 'empathetic');
  start();
  assert.equal(p.painted.length, 1);
  end(true);
  await new Promise(resolve => setImmediate(resolve));
  p.c.stop(false);
});

test('model choice wins even if model explicitly selected neutral', () => {
  const p = prepared(); p.call({ expression: 'neutral' });
  const before = p.painted.length;
  p.startAudio();
  assert.equal(p.painted.length, before);
  p.c.stop(false);
});

for (const settings of [{ muted: true }, { paused: true }, { volume: 0 }]) test(`inaudible native output cannot trigger a local pose: ${JSON.stringify(settings)}`, () => {
  const p = prepared();
  p.c.remoteAudio = { ...settings, pause() {}, srcObject: null };
  p.startAudio();
  assert.equal(p.painted.length, 0);
  p.c.stop(false);
});

test('a cancelled external TTS callback cannot apply a stale cue later', async () => {
  const p = prepared(); p.c.session = { atlasOutput: 'browser' };
  let start, finish;
  p.c.callbacks.playExternalText = (text, provider, options) => {
    start = options.onStart; return new Promise(resolve => { finish = resolve; });
  };
  p.event({ type: 'response.output_text.delta', response_id: 'r1', delta: 'Gracias.' }); p.done();
  p.c.cancel();
  const count = p.painted.length;
  start(); finish(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.painted.length, count);
  p.c.stop(false);
});

for (const source of ['command', 'model', 'event', 'clap', 'petting']) test(`local cue preserves existing ${source} pose`, () => {
  const p = prepared(); p.pose({ expression: 'angry', source });
  p.startAudio();
  assert.equal(p.painted.length, 0);
  p.pose({ expression: 'neutral', source: 'neutral' }); p.startAudio();
  assert.equal(p.painted.length, 0); // no delayed retry after protected pose expires
  p.c.stop(false);
});

test('assistant/tool wording cannot create a cue for a factual user request', () => {
  const p = prepared('Dime la temperatura');
  p.c.currentAssistantText = 'Eres un crack, he aprobado el examen';
  p.startAudio();
  assert.equal(p.painted.length, 0);
  p.c.stop(false);
});

for (const action of ['replacement', 'pending-input', 'cancel', 'stop']) test(`${action} retires stale local cues`, () => {
  const p = prepared();
  if (action === 'replacement') p.c.currentUserText = 'Dime la temperatura';
  if (action === 'pending-input') p.c.turnInputPending = true;
  if (action === 'cancel') p.c.cancel();
  if (action === 'stop') p.c.stop(false);
  const before = p.painted.length;
  p.c.showConversationCueAtPlayback();
  assert.equal(p.painted.length, before);
  p.c.stop(false);
});

test('new committed input resets local cue once and clears only its prior fallback lease', () => {
  const p = prepared(); let cleared = 0;
  p.window.AtlasFace.clearConversationCue = () => { cleared++; };
  p.startAudio();
  p.c.currentUserText = 'He aprobado el examen'; p.c.beginFaceTurn();
  p.startAudio();
  assert.equal(cleared, 1);
  assert.deepEqual(Array.from(p.painted, value => value.expression), ['complimented', 'proud_of_you']);
  p.c.stop(false);
});
