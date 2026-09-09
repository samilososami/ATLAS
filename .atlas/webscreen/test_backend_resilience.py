import io
import json
import queue
import threading
import unittest
from unittest.mock import Mock, patch

import server as app


class BackendResilienceTests(unittest.TestCase):
    def test_gateway_health_tracks_disconnect_and_reconnect_events(self):
        bridge = app.PersistentGatewayBridge()
        process = Mock()
        bridge.process = process
        process.poll.return_value = 0

        def events():
            yield json.dumps({'type': 'bridge_ready'})
            self.assertTrue(bridge.ready.is_set())
            yield json.dumps({'type': 'bridge_status', 'state': 'disconnected', 'message': 'offline'})
            self.assertFalse(bridge.ready.is_set())
            self.assertEqual(bridge.last_error, 'offline')
            yield json.dumps({'type': 'bridge_ready'})
            self.assertTrue(bridge.ready.is_set())
            self.assertEqual(bridge.last_error, '')

        process.stdout = events()
        bridge._reader(process)
        self.assertIsNone(bridge.process)

    def test_old_reader_cannot_erase_replacement_state(self):
        bridge = app.PersistentGatewayBridge()
        old = Mock(stdout=iter([]))
        old.poll.return_value = 0
        replacement = Mock()
        bridge.process = replacement
        bridge.ready.set()
        pending = queue.Queue()
        bridge.pending['current-request'] = pending
        bridge._reader(old)
        self.assertIs(bridge.process, replacement)
        self.assertTrue(bridge.ready.is_set())
        self.assertIs(bridge.pending['current-request'], pending)
        self.assertTrue(pending.empty())

    def test_initial_gateway_failure_is_retried_in_background(self):
        stop = Mock(spec=threading.Event())
        stop.is_set.side_effect = [False, False, True]
        with patch.object(app.BRIDGE, 'health', return_value={'ready': False}), \
             patch.object(app.BRIDGE, 'start', side_effect=[RuntimeError('offline'), None]) as start:
            app.maintain_gateway_connection(stop)
        self.assertEqual(start.call_count, 2)
        self.assertEqual(stop.wait.call_count, 2)

    def test_live_bridge_waits_for_gateway_recovery_before_reserving(self):
        """A reconnecting Node bridge is not equivalent to a dead bridge."""
        bridge = app.PersistentGatewayBridge()
        process = Mock()
        process.poll.return_value = None
        bridge.process = process
        bridge.ready = Mock(spec=threading.Event)
        bridge.ready.is_set.return_value = False
        bridge.ready.wait.return_value = True

        bridge.start(timeout=7.5)

        bridge.ready.wait.assert_called_once_with(7.5)
        self.assertIs(bridge.process, process)

    def test_live_bridge_recovery_timeout_retires_stale_process(self):
        bridge = app.PersistentGatewayBridge()
        process = Mock()
        process.poll.return_value = None
        bridge.process = process
        bridge.ready = Mock(spec=threading.Event)
        bridge.ready.is_set.return_value = False
        bridge.ready.wait.return_value = False
        bridge.last_error = 'gateway offline'
        bridge.stop = Mock()

        with self.assertRaisesRegex(RuntimeError, 'gateway offline'):
            bridge.start(timeout=1.0)

        bridge.stop.assert_called_once_with(expected_process=process)

    def test_stop_fails_waiting_requests_without_touching_a_new_process(self):
        bridge = app.PersistentGatewayBridge()
        process = Mock()
        process.poll.return_value = 0
        bridge.process = process
        pending = queue.Queue()
        bridge.pending['request'] = pending
        bridge.stop(expected_process=Mock())
        self.assertIs(bridge.process, process)
        self.assertTrue(pending.empty())
        bridge.stop(expected_process=process)
        self.assertIsNone(bridge.process)
        self.assertEqual(pending.get_nowait()['type'], 'error')
        self.assertEqual(bridge.pending, {})

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
        with patch.object(app.BRIDGE, 'create_talk_session') as create:
            handler.handle_realtime_session()
        create.assert_not_called()
        self.assertEqual(handler.send_json.call_args.args[0], 400)


if __name__ == '__main__':
    unittest.main()
