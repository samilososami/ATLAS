import io
import threading
import unittest
from unittest.mock import Mock, patch

import server as app


class BackendResilienceTests(unittest.TestCase):
    def test_start_initializes_codex_app_server_and_authenticated_account(self):
        bridge = app.AtlasNativeBroker()
        bridge.native = Mock()
        bridge.native.account.return_value = {
            'authenticated': True,
            'type': 'chatgpt',
            'planType': 'pro',
        }

        bridge.start(timeout=0.01)

        bridge.native.app_server.start.assert_called_once_with()
        bridge.native.account.assert_called_once_with(refresh=False)
        self.assertTrue(bridge.ready.is_set())
        self.assertEqual(bridge.last_error, '')

    def test_start_rejects_an_unauthenticated_codex_account(self):
        bridge = app.AtlasNativeBroker()
        bridge.native = Mock()
        bridge.native.account.return_value = {
            'authenticated': False,
            'type': None,
            'planType': None,
        }

        with self.assertRaisesRegex(RuntimeError, 'sesión ChatGPT autenticada'):
            bridge.start()

        self.assertFalse(bridge.ready.is_set())
        self.assertIn('sesión ChatGPT autenticada', bridge.last_error)

    def test_native_broker_start_error_is_exposed_without_marking_ready(self):
        bridge = app.AtlasNativeBroker()
        bridge.native = Mock()
        bridge.native.app_server.start.side_effect = app.BrokerError('codex offline')

        with self.assertRaisesRegex(RuntimeError, 'codex offline'):
            bridge.start()

        self.assertFalse(bridge.ready.is_set())
        self.assertEqual(bridge.last_error, 'codex offline')
        bridge.native.account.assert_not_called()

    def test_initial_broker_failure_is_retried_in_background(self):
        stop = Mock(spec=threading.Event())
        stop.is_set.side_effect = [False, False, True]
        with patch.object(app.BROKER, 'health', return_value={'ready': False}), \
             patch.object(app.BROKER, 'start', side_effect=[RuntimeError('offline'), None]) as start:
            app.maintain_broker_connection(stop)
        self.assertEqual(start.call_count, 2)
        self.assertEqual(stop.wait.call_count, 2)

    def test_health_reports_codex_app_server_state(self):
        bridge = app.AtlasNativeBroker()
        bridge.native = Mock()
        bridge.native.health.return_value = {
            'ok': True,
            'oauthConfigured': True,
            'appServer': {
                'running': True,
                'initialized': True,
                'pid': 4321,
                'pendingRequests': 2,
            },
            'error': None,
        }
        bridge.ready.set()

        health = bridge.health()

        bridge.native.health.assert_called_once_with(probe=False)
        self.assertEqual(health, {
            'ready': True,
            'persistent': True,
            'provider': 'codex-app-server',
            'pid': 4321,
            'pending': 2,
            'error': None,
        })

    def test_health_requires_oauth_and_initialized_app_server(self):
        bridge = app.AtlasNativeBroker()
        bridge.native = Mock()
        bridge.native.health.return_value = {
            'ok': False,
            'oauthConfigured': False,
            'appServer': {'running': True, 'initialized': False},
            'error': 'OAuth ausente',
        }
        bridge.ready.set()

        health = bridge.health()

        self.assertFalse(health['ready'])
        self.assertEqual(health['error'], 'OAuth ausente')

    def test_stop_closes_native_broker_and_clears_readiness(self):
        bridge = app.AtlasNativeBroker()
        bridge.native = Mock()
        bridge.ready.set()

        bridge.stop()

        self.assertFalse(bridge.ready.is_set())
        bridge.native.close.assert_called_once_with()

    def test_only_idle_keepalive_timeout_is_quiet(self):
        handler = object.__new__(app.AtlasScreenHandler)
        handler.address_string = lambda: 'test'
        with patch('builtins.print') as output:
            handler._request_active = False
            handler.log_message('Request timed out: %r', TimeoutError('idle'))
            output.assert_not_called()
            handler._request_active = True
            handler.log_message('Request timed out: %r', TimeoutError('body incomplete'))
            output.assert_called_once()

    def test_peer_reset_is_normal_but_programming_errors_are_not_hidden(self):
        handler = object.__new__(app.AtlasScreenHandler)
        with patch.object(app.SimpleHTTPRequestHandler, 'handle', side_effect=ConnectionResetError):
            handler.handle()
        self.assertTrue(handler.close_connection)
        with patch.object(app.SimpleHTTPRequestHandler, 'handle', side_effect=RuntimeError('bug')):
            with self.assertRaisesRegex(RuntimeError, 'bug'):
                handler.handle()

    def test_truncated_request_closes_connection(self):
        handler = object.__new__(app.AtlasScreenHandler)
        handler.headers = {'Content-Length': '20'}
        handler.rfile = io.BytesIO(b'{}')
        with self.assertRaisesRegex(ValueError, 'incompleta'):
            handler.read_json_payload()
        self.assertTrue(handler.close_connection)

    def test_invalid_session_request_does_not_reserve_upstream(self):
        handler = object.__new__(app.AtlasScreenHandler)
        handler.read_json_payload = Mock(side_effect=ValueError('JSON inválido'))
        handler.send_json = Mock()
        with patch.object(app.BROKER, 'create_talk_session') as create:
            handler.handle_realtime_session()
        create.assert_not_called()
        self.assertEqual(handler.send_json.call_args.args[0], 400)


if __name__ == '__main__':
    unittest.main()
