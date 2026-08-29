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

    def request(self):
        self.control.claim(self.b)
        return self.control.heartbeat(self.a, True)['pendingRequest']

    def test_owner_only_and_no_tokens_in_status(self):
        self.control.authorize(self.a)
        self.error(423, self.control.authorize, self.b)
        self.error(401, self.control.authorize, '')
        snapshot = json.dumps(self.control.heartbeat(self.b))
        self.assertNotIn(self.a, snapshot)
        self.assertNotIn(self.b, snapshot)

    def test_delegation_and_reverse(self):
        request = self.request()
        self.error(423, self.control.delegate, self.b, request, True)
        self.error(409, self.control.delegate, self.a, request, False)
        self.control.delegate(self.a, request, True)
        self.error(423, self.control.authorize, self.a)
        self.control.authorize(self.b)
        self.control.claim(self.a)
        pending = self.control.heartbeat(self.b, True)['pendingRequest']
        self.control.delegate(self.b, pending, True)
        self.control.authorize(self.a)

    def test_busy_cannot_be_overridden_by_client(self):
        request = self.request()
        self.control.authorize(self.a, begin=True)
        self.control.heartbeat(self.a, True)
        self.error(409, self.control.delegate, self.a, request, True)
        self.control.finish()
        self.busy = True
        self.error(409, self.control.delegate, self.a, request, True)
        self.busy = False
        self.control.delegate(self.a, request, True)

    def test_request_rate_limit(self):
        self.control.claim(self.b)
        self.error(429, self.control.claim, self.b)
        self.now += 9.99
        self.error(429, self.control.claim, self.b)
        self.now += .01
        self.control.claim(self.b)

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

    def test_expiry_and_stale_claim(self):
        request = self.request()
        self.now += 19
        self.control.heartbeat(self.a, True)
        self.now += 2
        self.error(409, self.control.delegate, self.a, request, True)
        self.now += 21
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

    def test_real_http_handoff_and_rate_limit(self):
        self.assertEqual(self.request('/api/access/claim', self.b)[0], 200)
        self.assertEqual(self.request('/api/access/claim', self.b)[0], 429)
        status = self.request('/api/access/heartbeat', self.a, {'idle': True})[1]
        self.assertTrue(status['canDelegate'])
        result = self.request('/api/access/delegate', self.a,
                              {'idle': True, 'requestId': status['pendingRequest']})
        self.assertEqual(result[0], 200)
        self.assertFalse(result[1]['owner'])
        self.assertEqual(self.request('/api/settings', self.a, method='GET')[0], 423)

    def test_cross_origin_and_browser_internal_route(self):
        self.assertEqual(self.request('/api/access/connect', extra={'Origin': 'http://other.test'})[0], 403)
        self.assertEqual(self.request('/api/access/connect', extra={'X-Atlas-Access': ''})[0], 403)
        self.assertEqual(self.request('/api/resident/wait?phase=next', method='GET',
                                     extra={'Sec-Fetch-Site': 'same-origin'})[0], 403)


if __name__ == '__main__':
    unittest.main()
