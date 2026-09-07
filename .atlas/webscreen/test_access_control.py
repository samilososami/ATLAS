import concurrent.futures
import http.client
import json
import threading
import tempfile
import unittest
from functools import partial
from http.server import ThreadingHTTPServer
from unittest.mock import patch

from access_control import AccessControl, AccessError
import server as app


def valid_clap_payload():
    event = {"rms": .08, "peak": .25, "highBandRatio": .38, "flatness": .46,
             "crestFactor": 3.1, "spectralCentroidHz": 3400,
             "onsetRatio": 6.2, "eventDurationMs": 75}
    return {
        "version": 2, "createdAt": "2026-09-07T17:00:00Z", "trialCount": 5,
        "privacy": "summary-features-only-no-audio",
        "detector": {"minPeak": .12, "minRms": .03, "minRmsDb": -30.4,
                     "minHighBandRatio": .21, "minFlatness": .24,
                     "minCrestFactor": 2.1, "minSpectralCentroidHz": 2200,
                     "minOnsetRatio": 2.0, "maxEventMs": 210, "releaseMs": 75,
                     "maxPairLevelRatio": 2.2, "maxPairCentroidRatio": 1.5,
                     "maxPairHighBandDelta": .2, "maxPairDurationRatio": 2.4,
                     "maxPairCrestRatio": 2.1, "noiseMultiplier": 4.8,
                     "minPairGapMs": 280, "maxPairGapMs": 900},
        "trials": [{"first": event, "second": event, "pairGapMs": 420, "noiseFloorRms": .006} for _ in range(5)],
    }


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
        self.assertEqual(self.control.authorize(self.a), {'kind': 'browser'})
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

    def test_remote_page_can_activate_live_atlas_a1(self):
        kiosk = self.control.connect('atlas-a1')['token']
        result = self.control.activate_atlas_a1(self.b)
        self.assertTrue(result['activated'])
        self.assertFalse(result['owner'])
        self.assertTrue(result['atlasA1Available'])
        self.assertEqual(self.control.authorize(kiosk), {'kind': 'atlas-a1'})
        self.error(423, self.control.authorize, self.b)

    def test_remote_activation_requires_a_live_atlas_a1(self):
        self.error(409, self.control.activate_atlas_a1, self.b)

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

    def test_authorized_activity_renews_lease_without_reviving_expired_tokens(self):
        self.now += 15
        self.control.authorize(self.a)
        self.now += 15
        self.assertTrue(self.control.heartbeat(self.a)['owner'])
        self.error(401, self.control.authorize, self.b)
        self.now += 21
        self.error(401, self.control.authorize, self.a)

    def test_finish_cannot_make_inflight_negative(self):
        self.control.finish()
        self.assertEqual(self.control.inflight, 0)

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
        headers = {'Content-Type': 'application/json', 'X-Atlas-Access': '1',
                   'X-Atlas-Client': token, 'Host': 'atlas.test'}
        headers.update(extra or {})
        connection.request(method, path, json.dumps(payload or {}) if method == 'POST' else None, headers)
        response = connection.getresponse()
        status, data = response.status, response.read()
        connection.close()
        return status, json.loads(data)

    def test_all_control_routes_reject_other_client_before_work(self):
        for path in ('text', 'voice', 'starter', 'cancel', 'settings', 'tts', 'client-event', 'wake/sample', 'clap/profile',
                     'tts/stream-ticket', 'realtime/session', 'realtime/consult',
                     'realtime/shell', 'realtime/web-search', 'realtime/event'):
            for token, status in ((self.b, 423), ('', 401)):
                with self.subTest(path=path, token=bool(token)):
                    self.assertEqual(self.request('/api/' + path, token)[0], status)
        for path in ('settings', 'codex-usage', 'wake/profiles', 'clap/profile'):
            self.assertEqual(self.request('/api/' + path, self.b, method='GET')[0], 423)

    def test_real_http_direct_takeover(self):
        result = self.request('/api/access/takeover', self.b)
        self.assertEqual(result[0], 200)
        self.assertTrue(result[1]['owner'])
        self.assertTrue(result[1]['replacedOwner'])
        self.assertEqual(self.request('/api/settings', self.a, method='GET')[0], 423)
        self.assertEqual(self.request('/api/settings', self.b, method='GET')[0], 200)

    def test_real_http_remote_activation_targets_kiosk(self):
        kiosk = self.request('/api/access/connect', payload={'clientKind': 'atlas-a1'},
                             extra={'Host': 'localhost'})[1]['token']
        result = self.request('/api/access/activate-atlas-a1', self.b)
        self.assertEqual(result[0], 200)
        self.assertTrue(result[1]['activated'])
        self.assertEqual(self.request('/api/settings', kiosk, method='GET')[0], 200)
        self.assertEqual(self.request('/api/settings', self.b, method='GET')[0], 423)

    def test_lan_client_cannot_impersonate_physical_kiosk_by_payload(self):
        self.assertFalse(app.is_physical_a1_client(
            '192.168.1.50', '192.168.1.142:5000', 'atlas-a1',
        ))
        self.assertTrue(app.is_physical_a1_client('127.0.0.1', 'localhost:5000'))

    def test_cross_origin_and_browser_internal_route(self):
        self.assertEqual(self.request('/api/access/connect', extra={'Origin': 'http://other.test'})[0], 403)
        self.assertEqual(self.request('/api/access/connect', extra={'X-Atlas-Access': ''})[0], 403)
        self.assertEqual(self.request('/api/resident/wait?phase=next', method='GET',
                                     extra={'Sec-Fetch-Site': 'same-origin'})[0], 403)

    def test_context_empty_consumes_body_before_next_keepalive_request(self):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        headers = {'Content-Type': 'application/json', 'X-Atlas-Client': self.a}
        with patch.object(app, 'empty_persistent_context') as empty, \
             patch.object(app, 'build_realtime_context', return_value=('', {})):
            connection.request('POST', '/api/realtime/context-empty', '{}', headers)
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            response.read()
            # Previously the unread {} prefixed this next request as {}GET.
            connection.request('GET', '/api/settings', headers=headers)
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            response.read()
            empty.assert_called_once()
        connection.close()

    def test_clap_profile_is_owner_protected_and_round_trips_without_audio(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = app.Path(temporary) / "clap-profile.json"
            with patch.object(app, 'CLAP_DIR', target.parent), patch.object(app, 'CLAP_PROFILE_FILE', target):
                status, saved = self.request('/api/clap/profile', self.a, valid_clap_payload())
                self.assertEqual(status, 200)
                self.assertEqual(saved['profile']['privacy'], 'summary-features-only-no-audio')
                status, fetched = self.request('/api/clap/profile', self.a, method='GET')
                self.assertEqual(status, 200)
                self.assertEqual(fetched['profile']['trialCount'], 5)
                self.assertNotIn('"audio":', target.read_text(encoding='utf-8'))

    def test_oversized_json_closes_socket_without_executing(self):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        connection.request('POST', '/api/realtime/context-empty', 'x' * 3000,
                           {'X-Atlas-Client': self.a})
        with patch.object(app, 'empty_persistent_context') as empty:
            response = connection.getresponse()
            self.assertEqual(response.status, 400)
            self.assertTrue(response.will_close)
            response.read()
            empty.assert_not_called()
        connection.close()

class WakeProfileTests(unittest.TestCase):
    def test_profile_names_are_bounded_and_safe(self):
        self.assertEqual(app.wake_profile_name(' Sami González '), 'sami-gonz-lez')
        self.assertEqual(app.wake_profile_name('../../root'), 'root')
        with self.assertRaises(ValueError):
            app.wake_profile_name('***')

    def test_snapshot_reports_counts_without_audio(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = app.Path(temporary)
            profile = root / 'sami'
            (profile / 'wake-positives').mkdir(parents=True)
            (profile / 'normal-speech').mkdir()
            for index in range(1, 6):
                (profile / 'wake-positives' / f'take-{index:02d}.wav').write_bytes(b'not read')
            (profile / 'normal-speech' / 'reference-01.wav').write_bytes(b'not read')
            with patch.object(app, 'WAKEWORD_PROFILES_DIR', root):
                snapshot = app.wake_profiles_snapshot()
            self.assertEqual(snapshot['phrase'], 'Atlas')
            self.assertEqual(snapshot['profiles'][0]['profile'], 'sami')
            self.assertTrue(snapshot['profiles'][0]['readyForVerifier'])


class ClapProfileTests(unittest.TestCase):
    def payload(self):
        return valid_clap_payload()

    def test_profile_is_summary_only_and_atomically_round_trips(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = app.Path(temporary) / "clap-profile.json"
            with patch.object(app, 'CLAP_DIR', target.parent), patch.object(app, 'CLAP_PROFILE_FILE', target):
                saved = app.save_clap_profile(self.payload())
                self.assertEqual(saved['profile']['trialCount'], 5)
                self.assertEqual(app.clap_profile_snapshot()['profile']['privacy'], 'summary-features-only-no-audio')
                self.assertEqual(oct(target.stat().st_mode & 0o777), '0o600')

    def test_profile_accepts_legacy_onsetratio_keys(self):
        payload = self.payload()
        payload['trials'][0]['first'] = {**payload['trials'][0]['first']}
        payload['trials'][1]['first'] = {**payload['trials'][1]['first']}
        payload['trials'][0]['first']['onsetratio'] = payload['trials'][0]['first'].pop('onsetRatio')
        payload['trials'][1]['first']['onsetratio'] = payload['trials'][1]['first'].pop('onsetRatio')
        expected_ratio = 6.2
        with tempfile.TemporaryDirectory() as temporary:
            target = app.Path(temporary) / "clap-profile.json"
            with patch.object(app, 'CLAP_DIR', target.parent), patch.object(app, 'CLAP_PROFILE_FILE', target):
                saved = app.save_clap_profile(payload)
            self.assertEqual(saved['profile']['trials'][0]['first']['onsetRatio'], expected_ratio)
            self.assertEqual(saved['profile']['trials'][1]['first']['onsetRatio'], expected_ratio)

    def test_profile_rejects_audio_and_invalid_pair_window(self):
        payload = self.payload()
        payload['audio'] = 'not accepted by the normalizer'
        # Unknown data never survives the normalized persistent representation.
        self.assertNotIn('audio', app.validate_clap_profile(payload))
        payload['detector']['minPairGapMs'] = 950
        payload['detector']['maxPairGapMs'] = 400
        with self.assertRaises(ValueError):
            app.validate_clap_profile(payload)


if __name__ == '__main__':
    unittest.main()
