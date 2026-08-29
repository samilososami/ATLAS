import concurrent.futures
import http.client
import json
import threading
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from access_control import AccessControl, AccessError
import server as app


class AccessTests(unittest.TestCase):
    def setUp(self):
        self.now = 100
        self.busy = False
        self.control = AccessControl(clock=lambda: self.now, busy=lambda: self.busy)
        self.a = self.control.connect()['token']
        self.b = self.control.connect()['token']

    def error(self, status, fn, *args):
        with self.assertRaises(AccessError) as result:
            fn(*args)
        self.assertEqual(result.exception.status, status)

    def test_owner_only_and_no_tokens_in_status(self):
        self.control.authorize(self.a)
        self.error(423, self.control.authorize, self.b)
        self.error(401, self.control.authorize, '')
        snapshot = json.dumps(self.control.heartbeat(self.b))
        self.assertNotIn(self.a, snapshot)
        self.assertNotIn(self.b, snapshot)

    def test_direct_takeover_and_reverse(self):
        result = self.control.takeover(self.b)
        self.assertTrue(result['owner'])
        self.assertTrue(result['replacedOwner'])
        self.error(423, self.control.authorize, self.a)
        self.control.authorize(self.b)
        result = self.control.takeover(self.a)
        self.assertTrue(result['owner'])
        self.assertTrue(result['replacedOwner'])
        self.control.authorize(self.a)

    def test_takeover_is_immediate_even_during_work(self):
        self.control.authorize(self.a, begin=True)
        self.control.heartbeat(self.a, True)
        result = self.control.takeover(self.b)
        self.assertTrue(result['owner'])
        self.assertTrue(result['replacedOwner'])
        self.error(423, self.control.authorize, self.a)
        self.control.finish()
        self.busy = True
        result = self.control.takeover(self.a)
        self.assertTrue(result['owner'])

    def test_close_idle_owner_releases_immediately(self):
        self.control.release(self.a)
        self.assertTrue(self.control.heartbeat(self.b)['owner'])
        self.error(401, self.control.authorize, self.a)

    def test_disconnect_waits_for_inflight_work(self):
        self.control.authorize(self.a, begin=True)
        self.control.release(self.a)
        status = self.control.heartbeat(self.b)
        self.assertFalse(status['owner'])
        self.assertTrue(status['waitingForTurn'])
        self.control.finish()
        self.assertTrue(self.control.heartbeat(self.b)['owner'])

    def test_expiry_rejects_stale_takeover(self):
        self.now += 21
        self.error(401, self.control.takeover, self.b)
        new = self.control.connect()
        self.assertTrue(new['owner'])
        self.error(401, self.control.authorize, self.a)

    def test_concurrent_first_connections_have_one_owner(self):
        control = AccessControl()
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(lambda _: control.connect(), range(40)))
        self.assertEqual(sum(item['owner'] for item in results), 1)


class HTTPAccessTests(unittest.TestCase):
    def setUp(self):
        self.access_patch = patch.object(app, 'ACCESS', AccessControl())
        self.control = self.access_patch.start()
        self.server = ThreadingHTTPServer(('127.0.0.1', 0),
            partial(app.AtlasScreenHandler, directory=str(app.STATIC_DIR)))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.a = self.request('/api/access/connect')[1]['token']
        self.b = self.request('/api/access/connect')[1]['token']

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.access_patch.stop()

    def request(self, path, token='', payload=None, extra=None, method='POST'):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        headers = {'Content-Type': 'application/json', 'X-Atlas-Access': '1', 'X-Atlas-Client': token}
        headers.update(extra or {})
        connection.request(method, path, json.dumps(payload or {}) if method == 'POST' else None, headers)
        response = connection.getresponse()
        status, data = response.status, response.read()
        connection.close()
        return status, json.loads(data)

    def test_all_control_routes_reject_other_client_before_work(self):
        for path in ('text', 'voice', 'starter', 'cancel', 'settings', 'tts', 'client-event',
                     'realtime/session', 'realtime/consult', 'realtime/event'):
            for token, status in ((self.b, 423), ('', 401)):
                with self.subTest(path=path, token=bool(token)):
                    self.assertEqual(self.request('/api/' + path, token)[0], status)
        for path in ('settings', 'codex-usage'):
            self.assertEqual(self.request('/api/' + path, self.b, method='GET')[0], 423)

    def test_real_http_direct_takeover(self):
        result = self.request('/api/access/takeover', self.b)
        self.assertEqual(result[0], 200)
        self.assertTrue(result[1]['owner'])
        self.assertTrue(result[1]['replacedOwner'])
        self.assertEqual(self.request('/api/settings', self.a, method='GET')[0], 423)
        self.assertEqual(self.request('/api/settings', self.b, method='GET')[0], 200)

    def test_cross_origin_and_browser_internal_route(self):
        self.assertEqual(self.request('/api/access/connect', extra={'Origin': 'http://other.test'})[0], 403)
        self.assertEqual(self.request('/api/access/connect', extra={'X-Atlas-Access': ''})[0], 403)
        self.assertEqual(self.request('/api/resident/wait?phase=next', method='GET',
                                     extra={'Sec-Fetch-Site': 'same-origin'})[0], 403)


if __name__ == '__main__':
    unittest.main()
