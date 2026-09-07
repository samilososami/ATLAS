const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'static/navigation.js'), 'utf8');

function renderNavigation(href, design, count = 2) {
  const forbidden = () => { throw new Error('Navigation must not access auth, storage, network or lifecycle'); };
  const links = Array.from({ length: count }, () => ({
    attrs: {}, textContent: '', setAttribute(name, value) { this.attrs[name] = value; },
    addEventListener: forbidden,
  }));
  vm.runInNewContext(source, {
    URL,
    window: { location: { href }, open: forbidden, addEventListener: forbidden,
      fetch: forbidden, sessionStorage: { setItem: forbidden },
      localStorage: { setItem: forbidden }, atlasAccess: new Proxy({}, { get: forbidden }) },
    document: { body: { dataset: { design } }, querySelectorAll(selector) {
      assert.equal(selector, '[data-webscreen-design-switch]');
      return links;
    } },
    fetch: forbidden,
  });
  return links;
}

test('classic links open the new design in the same tab with only useful flags', () => {
  const links = renderNavigation('http://192.168.1.142:5000/?kiosk=1&remote=0&token=secret#credential', undefined);
  for (const link of links) {
    assert.equal(link.textContent, 'New Webscreen');
    assert.deepEqual(link.attrs, { href: '/new/?kiosk=1&remote=0', target: '_self' });
  }
});

test('new drawer and blocked-page links return to classic without token or hash', () => {
  for (const url of [
    'http://atlas-a1.local:5000/new/?remote=1&kiosk=1&access_token=secret#token=secret',
    'https://atlas.example/new?remote=1&kiosk=1',
    'http://[fd00::1]:5000/new/?remote=1&kiosk=1',
  ]) {
    for (const link of renderNavigation(url, 'new')) {
      assert.equal(link.textContent, 'Debugging Webscreen');
      assert.deepEqual(link.attrs, { href: '/?kiosk=1&remote=1', target: '_self' });
    }
  }
});

test('unknown or non-boolean queries are not copied to the other design', () => {
  for (const suffix of ['?kiosk=secret&remote=token', '?remote=true&next=https://example.com', '?kiosk=1secret&remote=-1']) {
    assert.equal(renderNavigation(`http://127.0.0.1:5000/${suffix}`, '')[0].attrs.href, '/new/');
  }
  assert.equal(renderNavigation('http://127.0.0.1:5000/?kiosk=0&kiosk=secret&remote=1', '')[0].attrs.href,
    '/new/?kiosk=0&remote=1');
});

test('pages without design links are a no-op', () => {
  assert.deepEqual(renderNavigation('http://127.0.0.1:5000/', '', 0), []);
});

test('view controller only binds real view buttons, not native navigation links', () => {
  const app = fs.readFileSync(path.join(__dirname, 'static/app.js'), 'utf8');
  assert.match(app, /const toolTabs = \[\.\.\.document\.querySelectorAll\("\.tool-tab\[data-view\]"\)\];/u);
});
