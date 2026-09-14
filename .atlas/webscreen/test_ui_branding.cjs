const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STATIC_DIR = path.join(__dirname, 'static');

function activeUiSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return activeUiSources(absolute);
    return /\.(?:html|js|css)$/u.test(entry.name) ? [absolute] : [];
  });
}

test('active WebScreen UI describes only the native ATLAS runtime', () => {
  const offenders = activeUiSources(STATIC_DIR).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    return /openclaw|gateway/iu.test(source) ? [path.relative(STATIC_DIR, file)] : [];
  });
  assert.deepEqual(offenders, []);
});

test('diagnostics and voice settings name the native ATLAS stack', () => {
  const html = fs.readFileSync(path.join(STATIC_DIR, 'index.html'), 'utf8');
  assert.match(html, /broker nativo de ATLAS/u);
  assert.match(html, /voz configurada en ATLAS/u);
});
