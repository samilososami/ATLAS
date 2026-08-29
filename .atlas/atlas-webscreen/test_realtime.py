import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import server as app


class RealtimeBackendTests(unittest.TestCase):
    def handler(self):
        handler = object.__new__(app.AtlasScreenHandler)
        handler.headers = {}
        handler.send_json = Mock()
        return handler

    def test_session_uses_ephemeral_webrtc_reservation(self):
        handler = self.handler()
        handler.read_json_payload = Mock(return_value={"voice": "marin"})
        session = {
            "provider": "openai", "transport": "webrtc",
            "clientSecret": "ephemeral-test-only", "offerUrl": "https://api.openai.com/v1/realtime/calls",
        }
        with patch.object(app, "current_session", return_value=("agent:main:test", False, 0)), \
             patch.object(app.BRIDGE, "create_talk_session", return_value=session) as create:
            handler.handle_realtime_session()
        params = create.call_args.args[0]
        self.assertEqual(params["model"], "gpt-realtime-2.1")
        self.assertEqual(params["brain"], "agent-consult")
        self.assertEqual(params["transport"], "webrtc")
        self.assertNotIn("reasoningEffort", params)
        handler.send_json.assert_called_once_with(200, {
            "session": session, "sessionKey": "agent:main:test", "legacyFallback": True,
        })

    def test_realtime_direct_event_creates_its_own_log(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(app, "LOG_DIR", Path(directory)):
            path = app.append_realtime_event({
                "interactionId": "voice-turn-1", "stage": "input.transcript",
                "message": "Transcripción", "text": "Atlas hola", "role": "user",
            })
            self.assertTrue(path.exists())
            text = path.read_text(encoding="utf-8")
            self.assertIn('"stage":"realtime.input.transcript"', text)
            self.assertIn('"text":"Atlas hola"', text)


if __name__ == "__main__":
    unittest.main()
