"""Local-only HTTP and CLI checks. No broker, model or live credentials."""
import http.client
import copy
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import server as app
from access_control import AccessControl
from display_state import DisplayState
from face_state import (CATALOG_MAX_BYTES, CATALOG_PATH, EXPRESSION_DETAILS,
                        EXPRESSIONS, LEGACY_EXPRESSIONS, FaceState,
                        load_expression_catalog)


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.canonical = json.loads((Path(__file__).resolve().parents[2] /
                                    'expressions/catalog.json').read_text(encoding='utf-8'))

    def load_fixture(self, value):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'catalog.json'
            path.write_text(json.dumps(value), encoding='utf-8')
            return load_expression_catalog(path)

    def test_shipped_catalog_has_150_new_and_23_preserved_without_geometry_in_api(self):
        self.assertTrue(CATALOG_PATH.is_file(), 'Generate the deployment JSON asset before shipping')
        self.assertEqual(json.loads(CATALOG_PATH.read_text(encoding='utf-8')), self.canonical)
        self.assertEqual(len(EXPRESSIONS), 173)
        self.assertEqual(set(EXPRESSIONS), {entry['id'] for entry in self.canonical['expressions']})
        self.assertEqual(sum(entry['legacy'] for entry in EXPRESSION_DETAILS), 23)
        self.assertEqual(sum(not entry['legacy'] for entry in EXPRESSION_DETAILS), 150)
        listing = FaceState().action({'action': 'list'})
        self.assertLess(len(json.dumps(listing).encode()), 64 * 1024)
        self.assertTrue(all(set(entry) == {'id', 'label', 'category', 'legacy'}
                            for entry in listing['expressionDetails']))
        listing['expressionDetails'][0]['id'] = 'tampered'
        self.assertNotEqual(FaceState().action({'action': 'list'})['expressionDetails'][0]['id'], 'tampered')

    def test_only_missing_catalog_falls_back_to_legacy(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'missing.json'
            self.assertEqual(tuple(item['id'] for item in load_expression_catalog(path)), LEGACY_EXPRESSIONS)
            path.write_bytes(b'{malformed')
            with self.assertRaisesRegex(ValueError, 'valid UTF-8 JSON'):
                load_expression_catalog(path)
            path.write_bytes(b' ' * (CATALOG_MAX_BYTES + 1))
            with self.assertRaisesRegex(ValueError, '1 MiB'):
                load_expression_catalog(path)
            path.write_bytes(b'\xff')
            with self.assertRaises(ValueError):
                load_expression_catalog(path)
            path.write_text('{"schemaVersion":1,"schemaVersion":1}', encoding='utf-8')
            with self.assertRaises(ValueError):
                load_expression_catalog(path)
            with self.assertRaisesRegex(ValueError, 'cannot be read'):
                load_expression_catalog(Path(directory))

    def test_catalog_rejects_unsupported_schema_duplicate_ids_and_unbounded_metadata(self):
        modifications = [
            lambda data: data.update(schemaVersion=2),
            lambda data: data.update(schemaVersion=True),
            lambda data: data.update(expressions=[]),
            lambda data: data.update(expressions=data['expressions'] * 2),
            lambda data: data['expressions'].__setitem__(23, copy.deepcopy(data['expressions'][0])),
            lambda data: data['expressions'][23].update(id='../arbitrary'),
            lambda data: data['expressions'][23].update(id='happy'),
            lambda data: data['expressions'][23].update(id=[]),
            lambda data: data['expressions'][23].update(label='bad\nlabel'),
            lambda data: data['expressions'][23].update(label='x' * 81),
            lambda data: data['expressions'][23].update(category='x' * 33),
            lambda data: data['expressions'][23].update(legacy=True),
            lambda data: data['expressions'][0].update(legacy=1),
            lambda data: data['expressions'].__delitem__(0),
        ]
        for mutate in modifications:
            data = copy.deepcopy(self.canonical)
            mutate(data)
            with self.subTest(mutation=modifications.index(mutate)), self.assertRaises(ValueError):
                self.load_fixture(data)
        # File size can be valid while escaped metadata would overflow CLI
        # transport: reject that catalogue before exposing the list endpoint.
        huge_labels = copy.deepcopy(self.canonical)
        for entry in huge_labels['expressions']:
            entry['label'] = '\u754c' * 80
        with self.assertRaisesRegex(ValueError, 'response budget'):
            self.load_fixture(huge_labels)

    def test_cli_response_bound_is_explicit_not_silent_json_truncation(self):
        command = Path(__file__).resolve().parents[2] / 'atlas-commands/atlas-face'
        read_response = runpy.run_path(str(command))['read_response']
        listing = FaceState().action({'action': 'list'})
        self.assertEqual(read_response(io.BytesIO(json.dumps(listing).encode())), listing)
        with self.assertRaisesRegex(ValueError, '64 KiB'):
            read_response(io.BytesIO(b' ' * (64 * 1024 + 1)))
        for raw in (b'[]', b'null', b'{'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                read_response(io.BytesIO(raw))


class StateTests(unittest.TestCase):
    def test_validation_aliases_expiry_and_restart(self):
        now = [10.0]
        face = FaceState(clock=lambda: now[0], wall=lambda: 1000)
        self.assertEqual(len(face.action({'action': 'list'})['expressions']), 173)
        first = face.action({'action': 'set', 'expression': 'happy', 'duration': 1})
        self.assertEqual(first['expression'], 'delighted')
        self.assertEqual(first['expiresAt'], 1001000)
        now[0] += 1
        expired = face.action({'action': 'status'})
        self.assertEqual(expired['operation'], 'expired')
        self.assertEqual(expired['expression'], 'neutral')
        self.assertGreater(expired['sequence'], first['sequence'])
        asleep = face.action({'action': 'set', 'expression': 'sleep'})
        self.assertEqual(asleep['remainingMs'], 3600000)
        self.assertNotEqual(FaceState().action({'action': 'status'})['cursor'], expired['cursor'])
        invalid = [[], {}, {'action': []}, {'action': 'no'}, {'action': 'reset', 'expression': 'sad'},
                   {'action': 'set', 'expression': 'no'}, {'action': 'set', 'expression': []},
                   {'action': 'set', 'expression': 'sad', 'extra': 1}]
        invalid += [{'action': 'set', 'expression': 'sad', 'duration': d}
                    for d in (0, 31, True, '2', float('nan'), float('inf'))]
        for payload in invalid:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                face.action(payload)

    def test_condition_wakes_immediately_with_latest_state_and_releases_capacity(self):
        face = FaceState()
        first = face.action({'action': 'status'})
        admitted = threading.Event()
        with ThreadPoolExecutor(1) as pool:
            result = pool.submit(face.wait, first['cursor'], admitted.set)
            self.assertTrue(admitted.wait(1))
            started = time.monotonic()
            face.action({'action': 'set', 'expression': 'excited'})
            self.assertEqual(result.result(1)['expression'], 'excited')
            self.assertLess(time.monotonic() - started, .5)
        for _ in range(8):
            self.assertTrue(face.waiters.acquire(blocking=False))
        with self.assertRaises(RuntimeError):
            face.wait('', lambda: None)
        for _ in range(8):
            face.waiters.release()
        with self.assertRaises(ValueError):
            face.wait('invalid', lambda: None)
        with self.assertRaises(PermissionError):
            face.wait('', lambda: (_ for _ in ()).throw(PermissionError()))
        self.assertTrue(face.waiters.acquire(blocking=False))
        face.waiters.release()


class DisplayStateTests(unittest.TestCase):
    def test_clock_preference_is_small_durable_and_wakes_event_waiters(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "webscreen-display-mode.json"
            display = DisplayState(path)
            initial = display.action({'action': 'status'})
            self.assertEqual(initial['mode'], 'face')
            self.assertFalse(initial['clockModeActive'])

            admitted = threading.Event()
            with ThreadPoolExecutor(1) as pool:
                waiting = pool.submit(display.wait, initial['cursor'], admitted.set)
                self.assertTrue(admitted.wait(1))
                changed = display.action({'action': 'set', 'mode': 'clock'})
                self.assertEqual(waiting.result(1)['mode'], 'clock')
            self.assertTrue(changed['clockModeActive'])
            self.assertEqual(json.loads(path.read_text()), {'version': 1, 'clockModeActive': True})

            restarted = DisplayState(path)
            self.assertEqual(restarted.action({'action': 'status'})['mode'], 'clock')
            self.assertFalse(restarted.action({'action': 'set', 'mode': 'face'})['clockModeActive'])
            self.assertEqual(DisplayState(path).action({'action': 'status'})['mode'], 'face')

            for payload in [[], {}, {'action': 'set'}, {'action': 'set', 'mode': 'off'},
                            {'action': 'status', 'mode': 'clock'}, {'action': 'status', 'extra': True}]:
                with self.subTest(payload=payload), self.assertRaises(ValueError):
                    restarted.action(payload)

    def test_clock_state_releases_listener_capacity_after_bad_cursor_or_authorization(self):
        with tempfile.TemporaryDirectory() as directory:
            display = DisplayState(Path(directory) / "display.json")
            with self.assertRaises(ValueError):
                display.wait('not-a-cursor', lambda: None)
            with self.assertRaises(PermissionError):
                display.wait('', lambda: (_ for _ in ()).throw(PermissionError()))
            for _ in range(8):
                self.assertTrue(display.waiters.acquire(blocking=False))
            with self.assertRaises(RuntimeError):
                display.wait('', lambda: None)
            for _ in range(8):
                display.waiters.release()


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), partial(app.AtlasScreenHandler, directory=str(app.STATIC_DIR)))
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()

    def setUp(self):
        self.state = patch.object(app, 'FACE_STATE', FaceState())
        self.display_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.display_directory.cleanup)
        self.display = patch.object(app, 'DISPLAY_STATE', DisplayState(
            Path(self.display_directory.name) / 'webscreen-display-mode.json'))
        self.access = patch.object(app, 'ACCESS', AccessControl())
        self.state.start(); self.display.start(); self.access.start()
        self.addCleanup(self.state.stop); self.addCleanup(self.display.stop); self.addCleanup(self.access.stop)

    def request(self, method='POST', path='/api/internal/face', payload=None, headers=None):
        connection = http.client.HTTPConnection(*self.http.server_address, timeout=3)
        body = json.dumps(payload or {'action': 'status'}) if method == 'POST' else None
        connection.request(method, path, body, {'Content-Type': 'application/json', **(headers or {})})
        response = connection.getresponse()
        data = json.loads(response.read())
        connection.close()
        return response.status, data

    def test_cli_root_and_normal_user_share_loopback_route(self):
        command = Path(__file__).resolve().parents[2] / 'atlas-commands/atlas-face'
        environment = {**os.environ, 'ATLAS_WEBSCREEN_PORT': str(self.http.server_port), 'http_proxy': 'http://127.0.0.1:1'}
        commands = [[str(command), 'happy', '--json']]
        if os.geteuid() == 0:
            commands.append(['runuser', '-u', 'kali', '--', str(command), 'ambitious', '--json'])
        else:
            commands.append(['sudo', '-n', 'env', f'ATLAS_WEBSCREEN_PORT={self.http.server_port}', str(command), 'ambitious', '--json'])
        for cmd in commands:
            result = subprocess.run(cmd, env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(json.loads(result.stdout)['expression'], ('delighted', 'ambitious'))
        # The complete catalogue survives the HTTP/CLI hop (the old 8 KiB cap
        # silently truncated larger JSON replies).
        for cmd in ([str(command), 'list', '--json'],
                    ['sudo', '-n', 'env', f'ATLAS_WEBSCREEN_PORT={self.http.server_port}',
                     str(command), 'list', '--json'] if os.geteuid() != 0 else
                    ['runuser', '-u', 'kali', '--', str(command), 'list', '--json']):
            listed = subprocess.run(cmd, env=environment, capture_output=True, text=True)
            self.assertEqual(listed.returncode, 0, listed.stderr)
            data = json.loads(listed.stdout)
            self.assertEqual(len(data['expressions']), 173)
            self.assertEqual(len(data['expressionDetails']), 173)
        detailed = subprocess.run([str(command), 'list', '--details'], env=environment, capture_output=True, text=True)
        self.assertEqual(detailed.returncode, 0, detailed.stderr)
        self.assertIn('back_to_you', detailed.stdout)
        self.assertIn('[assistance]', detailed.stdout)
        new_face = subprocess.run([str(command), 'back_to_you', '--json'], env=environment, capture_output=True, text=True)
        self.assertEqual(new_face.returncode, 0, new_face.stderr)
        self.assertEqual(json.loads(new_face.stdout)['expression'], 'back_to_you')
        result = subprocess.run([str(command), 'sleep', '--duration', '45', '--json'], env=environment, capture_output=True, text=True)
        self.assertEqual(json.loads(result.stdout)['expression'], 'asleep')
        result = subprocess.run([str(command), 'angry', '--duration', '45'], env=environment, capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)

        for cmd, expected in [([str(command), 'clock', '--json'], 'clock'),
                              ([str(command), 'mode', '--json'], 'clock'),
                              ([str(command), 'usb', '--json'], 'clock'),
                              ([str(command), 'usb', 'detach', '--json'], 'clock'),
                              ([str(command), 'clock', 'off', '--json'], 'face')]:
            result = subprocess.run(cmd, env=environment, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)['mode'], expected)

    def test_internal_rejects_browser_rebinding_oversize_and_invalid_payloads(self):
        for headers, status in [({'Origin': f'http://127.0.0.1:{self.http.server_port}'}, 403),
                                ({'Origin': ''}, 403), ({'Sec-Fetch-Site': 'same-origin'}, 403),
                                ({'Host': 'malicious.invalid'}, 403), ({'Content-Length': '1025'}, 400),
                                ({'Content-Type': 'text/plain'}, 400), ({'Transfer-Encoding': 'chunked'}, 400)]:
            self.assertEqual(self.request(headers=headers)[0], status, headers)
        self.assertEqual(self.request(payload={'action': 'set', 'expression': 'unknown'})[0], 400)
        self.assertEqual(self.request(payload={'action': 'reset', 'unknown': True})[0], 400)

    def test_nonloopback_peer_cannot_invoke_internal_route(self):
        handler = object.__new__(app.AtlasScreenHandler)
        handler.client_address = ('192.0.2.1', 1234)
        handler.server = self.http
        handler.headers = {}
        result = []
        handler.send_json = lambda status, body: result.append(status)
        handler.handle_internal_face()
        self.assertEqual(result, [403])

    def test_event_auth_latest_state_and_expiry(self):
        self.assertEqual(self.request('GET', '/api/face/events')[0], 401)
        token = app.ACCESS.connect()['token']
        headers = {'X-Atlas-Client': token}
        for name in EXPRESSIONS:
            self.assertEqual(self.request(payload={'action': 'set', 'expression': name, 'duration': 1})[0], 200)
        status, state = self.request('GET', '/api/face/events', headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(state['expression'], EXPRESSIONS[-1])
        status, expired = self.request('GET', f"/api/face/events?after={state['cursor']}", headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(expired['operation'], 'expired')
        self.assertEqual(expired['expression'], 'neutral')
        self.assertEqual(self.request('GET', '/api/face/events?unknown=1', headers=headers)[0], 400)
        self.assertEqual(self.request('GET', '/api/face/events?after=bad', headers=headers)[0], 400)
        app.ACCESS.release(token)
        self.assertEqual(self.request('GET', '/api/face/events', headers=headers)[0], 401)

    def test_display_mode_is_authenticated_for_pages_and_local_for_cli(self):
        self.assertEqual(self.request('GET', '/api/display-mode')[0], 401)
        token = app.ACCESS.connect()['token']
        headers = {'X-Atlas-Client': token}
        self.assertEqual(self.request('GET', '/api/display-mode', headers=headers),
                         (200, app.DISPLAY_STATE.action({'action': 'status'})))
        status, changed = self.request(path='/api/display-mode', payload={'mode': 'clock'}, headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(changed['mode'], 'clock')
        status, event = self.request('GET', '/api/display-mode/events', headers=headers)
        self.assertEqual(status, 200)
        self.assertEqual(event['cursor'], changed['cursor'])
        self.assertEqual(self.request('GET', '/api/display-mode/events?unknown=1', headers=headers)[0], 400)
        self.assertEqual(self.request('POST', '/api/internal/display-mode', {'action': 'set', 'mode': 'face'})[0], 200)
        self.assertEqual(self.request('POST', '/api/internal/display-mode', {'mode': 'invalid'})[0], 400)
        self.assertEqual(self.request('POST', '/api/internal/display-mode', {'action': 'set', 'mode': 'clock'},
                                      {'Origin': f'http://127.0.0.1:{self.http.server_port}'})[0], 403)


if __name__ == '__main__':
    unittest.main()
