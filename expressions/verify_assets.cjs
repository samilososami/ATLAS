#!/usr/bin/env node
'use strict';
// Offline integrity checks for the published image library, without providers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const catalog = read('catalog.json').expressions;
const allIds = catalog.map(e => e.id).sort();
// AI concepts belong to the first authored collection. New runtime poses do
// not retroactively turn those150 historical concepts into300 generated files.
const referenceIds = catalog.filter(e => e.source?.collection === '2026-10-16').map(e => e.id).sort();
const authoredIds = catalog.filter(e => !e.legacy).map(e => e.id).sort();
assert.equal(new Set(allIds).size, allIds.length, 'unique catalogue IDs');
assert.ok(referenceIds.length > 0 && authoredIds.length >= referenceIds.length);
assert.ok(catalog.every(e => e.source?.collection), 'source collection is explicit');

function inspect(folder, ids) {
  const files = fs.readdirSync(path.join(root, folder)).filter(f => f.endsWith('.png')).sort();
  assert.deepEqual(files, ids.map(id => id + '.png').sort(), `${folder}: exact ID coverage`);
  const hashes = new Map();
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, folder, file));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${file}: PNG`);
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', `${file}: IHDR`);
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    assert(width > 0 && width <= 8192 && height > 0 && height <= 8192, `${file}: dimensions`);
    if (folder === 'renders') assert.deepEqual([width, height], [1591, 989]);
    hashes.set(path.basename(file, '.png'), crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(new Set(hashes.values()).size, ids.length, `${folder}: no duplicate image bytes`);
  return hashes;
}

const metadataOnly = process.argv.includes('--metadata-only');
let renders = null;
if (!metadataOnly) {
  renders = inspect('renders', allIds);
  const captures = read('renders/manifest.json');
  assert.deepEqual(captures.errors, []);
  for(const file of ['face.js','face.css','audio.js']) {
    assert.equal(captures.rendererSha256?.[file], crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(root,'../.atlas/webscreen/static/new',file))).digest('hex'),
      `render manifest must belong to the current renderer: ${file}`);
  }
  assert.equal(captures.catalogSha256,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'catalog.json'))).digest('hex'),
    'render manifest must belong to the current catalogue geometry');
  assert.deepEqual(captures.captures.map(item => item.expression).sort(), allIds);
  for (const item of captures.captures) {
    assert.equal(item.file, item.expression + '.png');
    assert.equal(item.collection,catalog.find(entry=>entry.id===item.expression).source.collection);
    assert.equal(item.sha256, renders.get(item.expression), item.file + ': checksum');
  }
}

const references = inspect('references', referenceIds);
const manifest = read('references/manifest.json');
assert.deepEqual(manifest.generated.map(item => item.id).sort(), referenceIds);
assert.equal(manifest.pending.length, 0);
for (const item of manifest.generated) {
  assert.equal(item.path, 'expressions/references/' + item.id + '.png');
  assert.equal(item.sha256, references.get(item.id), item.id + ': reference checksum');
}
console.log(JSON.stringify({ catalogExpressions: allIds.length, authoredExpressions: authoredIds.length,
  canonicalRenders: renders?.size ?? null, renderVerification: metadataOnly ? 'not-run' : 'verified',
  generatedReferences: references.size, referenceCollection: '2026-10-16',
  expressionsWithoutAIReferences: authoredIds.length-referenceIds.length,
  duplicateFiles: 0, checksums: metadataOnly ? 'references verified; renders not checked' : 'verified', providerCalls: 0 }));
