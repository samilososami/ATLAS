import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

import server as app


class FastLaneTests(unittest.TestCase):
    def test_explicit_routing(self):
        route, text, state = app.parse_resident_reply(json.dumps({
            "route": "direct", "text": "Veo veo. ¿Qué ves?",
            "expectsReply": True, "state": "object=teclado; user turn",
        }))
        self.assertEqual(route, "direct")
        self.assertIn(app.FOLLOW_UP_MARKER, text)
        self.assertIn("teclado", state)
        for invalid in ["Hola", "[OMITIR]", "[]", '{"route":"direct","text":""}',
                        '{"route":"wrong","text":"sí"}']:
            self.assertEqual(app.parse_resident_reply(invalid), ("delegate", "", ""))

    def test_private_actions_delegate(self):
        for text in ["lee mi correo", "quien soy", "preséntate", "cuánta ram queda",
                     "apaga la pantalla", "abre el archivo", "envía un mensaje"]:
            self.assertTrue(app.requires_main_agent(text), text)
        for text in ["jugamos al veo veo", "es el teclado", "cuánto es dos más dos"]:
            self.assertFalse(app.requires_main_agent(text), text)

    def test_date(self):
        self.assertEqual(app.spanish_number(2026), "dos mil veintiséis")
        self.assertEqual(app.spanish_number(500), "quinientos")
        self.assertTrue(app.local_utility_answer("a qué día estamos").startswith("Hoy es "))
        self.assertEqual(app.local_utility_answer("qué día tengo cita"), "")

    def test_context_expiry_and_handoff(self):
        with patch.object(app, "current_session", return_value=("test-session", False, 0)):
            app.remember_voice_exchange("test-session", "jugamos", "Empieza por te.", "teclado")
            context = app.fast_context_snapshot()
            self.assertEqual(context["state"], "teclado")
            self.assertIn("Empieza por te.", app.build_agent_prompt("dame una pista"))
        with patch.object(app, "current_session", return_value=("new-session", True, 0)):
            self.assertEqual(app.fast_context_snapshot(), {"turns": [], "state": ""})

    def test_partial_answer_not_reused(self):
        pool = app.ResidentStarterPool()
        state = app.SpeculativeStarter("partial", "hola", "browser")
        state.route, state.text = "direct", "Hola."
        state.done.set()
        pool.pending["partial"] = state
        self.assertEqual(pool.take("partial", "hola lee mis correos", "browser", threading.Event()),
                         (True, None))

    def test_direct_handler_skips_main(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            handler = object.__new__(app.AtlasScreenHandler)
            handler.headers = {"X-Atlas-Request-Id": "test-direct", "X-Atlas-TTS-Provider": "browser"}
            handler.send_response = handler.send_header = handler.end_headers = Mock()
            events = []
            handler.write_event = lambda kind, **data: events.append((kind, data))
            state = app.SpeculativeStarter("test-direct", "jugamos al veo veo", "browser")
            state.route, state.text, state.conversation_state = "direct", "Veo veo. ¿Qué ves?", "teclado"
            state.done.set()
            with patch.object(app, "ROOT_DIR", root), patch.object(app, "LOG_DIR", root / "logs"), \
                 patch.object(app, "RUNTIME_DIR", root), \
                 patch.object(app, "current_session", return_value=("test-session", False, 0)), \
                 patch.object(app.RESIDENT_STARTERS, "has", return_value=True), \
                 patch.object(app.RESIDENT_STARTERS, "take", return_value=(True, state)), \
                 patch.object(app, "inject_fast_exchange"), \
                 patch.object(app, "stream_openclaw_agent") as main:
                handler.handle_voice(provided_transcript="jugamos al veo veo")
                main.assert_not_called()
            self.assertIn("response", [kind for kind, _ in events])
            self.assertNotIn("error", [kind for kind, _ in events])
            self.assertTrue(next(data for kind, data in events if kind == "done")["expectsReply"])


if __name__ == "__main__":
    unittest.main()
