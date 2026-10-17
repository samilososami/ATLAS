// Derived, separately labelled probe. Never overwrites the frozen 400-case bank.
const fs = require('node:fs');
const path = require('node:path');
const directory = __dirname;
const bank = JSON.parse(fs.readFileSync(path.join(directory, 'questions.json'), 'utf8'));
const originals = ['I090', 'I094', 'I349'];
const expressions = ['complimented', 'empathetic', 'challenge_accepted', 'proud_of_you', 'empathetic', 'challenge_accepted', 'neutral', 'neutral', 'neutral'];
const prompts = [...originals.map(id => bank.questions.find(q => q.id === id).prompt),
  'he aprobado el examen que tanto me costaba',
  'me ha sentado fatal lo de hoy, solo quería contártelo',
  'tenemos por delante un proyecto enorme, vamos a por él',
  '¿Qué temperatura tiene el sistema ahora?',
  '¿Cuánto espacio libre queda en el disco?',
  '¿Cuánto es 17 por 23?'];
const questions = prompts.map((prompt, index) => ({
  id: `FP${String(index + 1).padStart(2, '0')}`,
  original_id: originals[index] ?? null,
  difficulty: 'focused_probe', category: index < 6 ? 'natural_affect' : 'neutral_control',
  prompt, initial_state: {},
  expect: {state: {'face.expression': expressions[index]}, no_mutations: true,
    ...(index < 6 ? {tools_any: ['atlas_face']} : {})},
  rubric: 'Una selección facial coherente cuando hay afecto; ninguna en datos neutros. Revisión humana de naturalidad independiente.'
}));
const contract = JSON.parse(fs.readFileSync(path.join(directory, 'contract.json'), 'utf8'));
contract.instructions += '\n\n' + fs.readFileSync(path.join(directory, 'face-policy-candidate.txt'), 'utf8');
for (const id of expressions) {
  if (!contract.tools.find(t => t.name === 'atlas_face').parameters.properties.expression.enum.includes(id)) {
    throw Error('Unknown expression: ' + id);
  }
}
fs.writeFileSync(path.join(directory, 'face-probe.json'), JSON.stringify({version: 1, kind: 'candidate_policy_probe_not_400_rescore', questions}, null, 2) + '\n');
fs.writeFileSync(path.join(directory, 'face-probe-contract.json'), JSON.stringify(contract, null, 2) + '\n');
console.log('Prepared 9 independent cases; frozen 400 bank unchanged.');
