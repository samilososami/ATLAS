const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'static/kiosk.js'), 'utf8');

function page(hostname, search) {
  const handlers = new Map();
  const classes = [];
  vm.runInNewContext(source, {
    location: { hostname, search }, URLSearchParams,
    document: {
      documentElement: { classList: { add: name => classes.push(name) } },
      addEventListener: (name, handler) => handlers.set(name, handler),
    },
  });
  return { handlers, classes };
}

test('LAN and ordinary localhost tabs keep their shortcuts', () => {
  for (const [host, search] of [['192.168.1.142', '?kiosk=1'], ['localhost', '']]) {
    assert.equal(page(host, search).handlers.size, 0);
  }
});

test('kiosk prevents common browser escapes without swallowing normal text', () => {
  const { handlers, classes } = page('localhost', '?kiosk=1');
  assert.deepEqual(classes, ['atlas-kiosk']);
  for (const [key, modifiers, blocked] of [
    ['F11', {}, true], ['F12', {}, true], ['l', { ctrlKey: true }, true],
    ['F4', { altKey: true }, true], ['i', { ctrlKey: true, shiftKey: true }, true],
    ['a', {}, false], ['Enter', {}, false], ['c', { ctrlKey: true }, false],
  ]) {
    let prevented = false;
    handlers.get('keydown')({ key, ...modifiers,
      preventDefault: () => { prevented = true; }, stopImmediatePropagation() {},
    });
    assert.equal(prevented, blocked, key);
  }
});
