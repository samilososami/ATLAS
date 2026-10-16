import http.client
import json
import tempfile
import threading
import unittest
from functools import partial
from html.parser import HTMLParser
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

import server as app


class ShellParser(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.ids, self.scripts, self.design_links = [], [], []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'script':
            self.scripts.append(attrs.get('src', ''))
        if tag == 'a' and 'data-webscreen-design-switch' in attrs:
            self.design_links.append(attrs)


class NewDesignTests(unittest.TestCase):
    def test_whatsapp_display_exposes_only_bounded_presentation_state(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder) / 'ui-state.json'
            with patch.object(app, 'WHATSAPP_UI_STATE_FILE', state):
                state.write_text(json.dumps({
                    'mode': 'qr', 'sequence': 7,
                    'matrix': ['0' * 21 for _ in range(21)],
                    'credential': 'never expose this',
                }))
                self.assertEqual(app.whatsapp_display_snapshot(), {
                    'version': 1, 'mode': 'qr', 'sequence': 7,
                    'matrix': ['0' * 21 for _ in range(21)],
                })
                state.write_text(json.dumps({'mode': 'qr', 'matrix': ['x']}))
                self.assertEqual(app.whatsapp_display_snapshot()['mode'], 'idle')

    def test_new_presentation_keeps_every_existing_control_and_one_controller(self):
        source = (app.STATIC_DIR / 'index.html').read_text()
        rendered = app.render_new_design_shell(source).decode()
        original, new = ShellParser(source), ShellParser(rendered)
        self.assertEqual(original.ids, new.ids)
        self.assertEqual(len(new.ids), len(set(new.ids)))
        self.assertIn('body data-design="new"', rendered)
        self.assertNotIn('data-design="new"', source)
        shared = lambda scripts: [s for s in scripts if not s.startswith('/new/') or s.startswith('/new/expressions-catalog.js?')]
        self.assertEqual(shared(new.scripts), original.scripts)
        self.assertTrue(new.scripts[0].startswith('/new/expressions-catalog.js?'))
        self.assertTrue(new.scripts[1].startswith('/new/face.js?'))
        self.assertTrue(new.scripts[2].startswith('/new/audio.js?'))
        self.assertTrue(new.scripts[3].startswith('/new/petting.js?'))
        self.assertEqual(sum(s.startswith('/new/petting.js?') for s in new.scripts), 1)
        self.assertEqual(sum(s.startswith('/new/expressions-catalog.js?') for s in original.scripts), 1)
        self.assertFalse(any(s.startswith('/new/face.js?') for s in original.scripts))
        self.assertLess(new.scripts.index(next(s for s in new.scripts if s.startswith('/voice-prosody.js?'))),
                        new.scripts.index(next(s for s in new.scripts if s.startswith('/app.js?'))))
        self.assertIn('/new/face.css?', rendered)
        self.assertEqual(sum(s.startswith('/realtime.js') for s in new.scripts), 1)

    def test_design_links_work_before_javascript_and_are_public_navigation_only(self):
        source = (app.STATIC_DIR / 'index.html').read_text()
        for is_new, markup, label, destination in [
                (False, source, 'New Webscreen', '/new/'),
                (True, app.render_new_design_shell(source).decode(), 'Debugging Webscreen', '/')]:
            with self.subTest(new=is_new):
                parsed = ShellParser(markup)
                self.assertEqual(len(parsed.design_links), 2)
                for link in parsed.design_links:
                    self.assertEqual(link['href'], destination)
                    self.assertEqual(link['target'], '_self')
                    self.assertNotIn('data-view', link)
                    self.assertNotIn('onclick', link)
                self.assertEqual(markup.count(f'>{label}</a>'), 2)
                blocked = markup.split('id="access-blocked"', 1)[1].split('</section>', 1)[0]
                drawer = markup.split('class="tool-tabs"', 1)[1].split('</nav>', 1)[0]
                self.assertIn(f'>{label}</a>', blocked)
                self.assertIn(f'>{label}</a>', drawer)
                self.assertEqual(sum(s.startswith('/navigation.js?') for s in parsed.scripts), 1)

    def test_get_head_and_debug_keep_the_same_security_boundary(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0),
            partial(app.AtlasScreenHandler, directory=str(app.STATIC_DIR)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for path, method, is_new in [('/new', 'GET', True),
                    ('/new/?kiosk=1&remote=1', 'GET', True), ('/', 'GET', False),
                    ('/new/', 'HEAD', True), ('/index.html?remote=1', 'GET', False)]:
                with self.subTest(path=path, method=method):
                    connection = http.client.HTTPConnection(*server.server_address, timeout=2)
                    # Routing is identical for a LAN IP, mDNS hostname or loopback;
                    # the presentation route must not introduce a new auth/port.
                    connection.request(method, path, headers={'Host': 'atlas-a1.local:5000'})
                    response = connection.getresponse()
                    body = response.read().decode()
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.getheader('Cache-Control'), 'no-store')
                    self.assertEqual(response.getheader('X-Frame-Options'), 'DENY')
                    csp = response.getheader('Content-Security-Policy')
                    self.assertIn("script-src 'self'", csp)
                    self.assertNotIn('unsafe-inline', csp)
                    if method == 'HEAD':
                        self.assertEqual(body, '')
                        self.assertGreater(int(response.getheader('Content-Length')), 0)
                    else:
                        self.assertEqual('data-design="new"' in body, is_new)
                        self.assertIn('id="access-blocked"', body)
                        self.assertIn('id="webscreen-content" hidden inert', body)
                        self.assertIn('Debugging Webscreen' if is_new else 'New Webscreen', body)
                    connection.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
