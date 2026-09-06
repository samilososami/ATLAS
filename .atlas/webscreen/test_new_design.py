import http.client
import threading
import unittest
from functools import partial
from html.parser import HTMLParser
from http.server import ThreadingHTTPServer

import server as app


class ShellParser(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.ids, self.scripts = [], []
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'script':
            self.scripts.append(attrs.get('src', ''))


class NewDesignTests(unittest.TestCase):
    def test_new_presentation_keeps_every_existing_control_and_one_controller(self):
        source = (app.STATIC_DIR / 'index.html').read_text()
        rendered = app.render_new_design_shell(source).decode()
        original, new = ShellParser(source), ShellParser(rendered)
        self.assertEqual(original.ids, new.ids)
        self.assertEqual(len(new.ids), len(set(new.ids)))
        self.assertIn('body data-design="new"', rendered)
        self.assertNotIn('data-design="new"', source)
        self.assertEqual([s for s in new.scripts if not s.startswith('/new/')], original.scripts)
        self.assertTrue(new.scripts[0].startswith('/new/face.js?'))
        self.assertTrue(new.scripts[1].startswith('/new/audio.js?'))
        self.assertIn('/new/face.css?', rendered)
        self.assertEqual(sum(s.startswith('/realtime.js') for s in new.scripts), 1)

    def test_get_head_and_debug_keep_the_same_security_boundary(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0),
            partial(app.AtlasScreenHandler, directory=str(app.STATIC_DIR)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            for path, method, is_new in [('/new', 'GET', True),
                    ('/new/?kiosk=1', 'GET', True), ('/', 'GET', False),
                    ('/new/', 'HEAD', True)]:
                with self.subTest(path=path, method=method):
                    connection = http.client.HTTPConnection(*server.server_address, timeout=2)
                    connection.request(method, path)
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
                    connection.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
