'use strict';
// Offline audit of conservative local presentation rules. No model, microphone,
// speech synthesis or device actions; this does not regrade the 400 model replies.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, '.atlas/webscreen/static/realtime.js'), 'utf8');
const window = {};
vm.runInNewContext(source, { window, console }, { timeout: 2000 });
const cue = window.AtlasRealtime._test.conversationExpressionCue;
if (typeof cue !== 'function') throw Error('Missing local cue evaluator');
const banks = ['questions.json', 'face-probe.json'].map(file => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks/20261017-interactions', file), 'utf8'));
  const matches = data.questions.map(q => ({ id: q.id, prompt: q.prompt, expression: cue(q.prompt) })).filter(q => q.expression);
  return { file, count: data.questions.length, matched: matches.length, matches };
});
const result = { kind: 'offline local-cue audit, not model performance',
  realtimeSha256: crypto.createHash('sha256').update(source).digest('hex'),
  callsToModel: 0, physicalEffects: 0, banks };
fs.writeFileSync(path.join(__dirname, 'qa/conversation-cue-audit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
