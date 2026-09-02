import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import server as app


class RealtimeBackendTests(unittest.TestCase):
    def test_reasoning_levels_survive_save_and_reservation_without_changing_voice(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(app, "RUNTIME_DIR", Path(directory)), \
             patch.object(app, "SETTINGS_FILE", Path(directory) / "settings.json"), \
             patch.object(app, "get_tts_settings", return_value=("", "test-voice")), \
             patch.object(app, "current_session", return_value=("test-session", False, 0)), \
             patch.object(app, "build_realtime_context", return_value=("test context", {})), \
             patch.object(app, "read_realtime_instructions", return_value="test instructions"):
            app.save_webscreen_settings(realtime_voice="cedar")
            app.save_webscreen_settings(realtime_voice="elevenlabs", elevenlabs_voice_id="custom-test-voice")
            # Default after Xhigh must remove the override, not reuse it.
            for effort in (*app.REALTIME_REASONING_CHOICES, "default"):
                with self.subTest(effort=effort):
                    handler = self.handler()
                    handler.read_json_payload = Mock(return_value={"realtimeReasoningEffort": effort})
                    handler.handle_settings()
                    self.assertEqual(handler.send_json.call_args.args[0], 200)
                    settings = app.get_webscreen_settings()
                    self.assertEqual(settings["realtimeVoice"], "elevenlabs")
                    self.assertEqual(settings["realtimeNativeVoice"], "cedar")
                    self.assertEqual(settings["realtimeReasoningEffort"], effort)
                    self.assertEqual(json.loads(app.SETTINGS_FILE.read_text())["elevenlabsVoiceId"], "custom-test-voice")
                    handler = self.handler()
                    handler.read_json_payload = Mock(return_value={})
                    with patch.object(app.BRIDGE, "create_talk_session", return_value={
                        "transport": "webrtc", "clientSecret": "test-only",
                    }) as create:
                        handler.handle_realtime_session()
                    params = create.call_args.args[0]
                    self.assertEqual(params["voice"], "cedar")
                    if effort == "default":
                        self.assertNotIn("reasoningEffort", params)
                    else:
                        self.assertEqual(params["reasoningEffort"], effort)
                    result = handler.send_json.call_args.args[1]["session"]
                    self.assertEqual(result["atlasReasoningEffort"], effort)
                    self.assertEqual(result["atlasContext"], "test context")
                    self.assertEqual(result["atlasOutput"], "elevenlabs")
            self.assertEqual(app.SETTINGS_FILE.stat().st_mode & 0o777, 0o600)

    def test_invalid_reasoning_is_rejected_without_saving_or_reserving(self):
        for value in ("ultra", "none", "", None, {"effort": "low"}):
            for method, key in (("handle_settings", "realtimeReasoningEffort"),
                                ("handle_realtime_session", "reasoningEffort")):
                with self.subTest(value=value, method=method), \
                     patch.object(app, "current_session", return_value=("test", False, 0)), \
                     patch.object(app, "get_webscreen_settings", return_value={"realtimeReasoningEffort": "default"}), \
                     patch.object(app, "save_webscreen_settings") as save, \
                     patch.object(app.BRIDGE, "create_talk_session") as create:
                    handler = self.handler()
                    handler.read_json_payload = Mock(return_value={key: value})
                    getattr(handler, method)()
                    self.assertEqual(handler.send_json.call_args.args[0], 400)
                    save.assert_not_called()
                    create.assert_not_called()

    def test_playback_telemetry_keeps_monotonic_times_and_actual_voice(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(app, "LOG_DIR", Path(directory)):
            path = app.append_realtime_event({
                "interactionId": "latency-check", "stage": "tts.playback_started",
                "voice": "browser", "effectiveVoice": "Google español",
                "outputMode": "browser", "responseId": "response-test",
                "requestId": "request-test", "clientBuild": "2026-09-02-latency-1",
                "clientMonotonicMs": 10420.5, "sinceSpeechStoppedMs": 420.5,
                "durationMs": 80, "chunkIndex": 1,
                "reasoningEffort": "high", "effectiveReasoningEffort": "high",
            }, {"client_kind": "atlas-a1"})
            record = json.loads(path.read_text())
        self.assertEqual(record["voice"], "browser")
        self.assertEqual(record["effectiveVoice"], "Google español")
        self.assertEqual(record["sinceSpeechStoppedMs"], 420.5)
        self.assertEqual(record["clientMonotonicMs"], 10420.5)
        self.assertEqual(record["duration_ms"], 80)
        self.assertEqual(record["client_kind"], "atlas-a1")
        self.assertEqual(record["responseId"], "response-test")
        self.assertEqual(record["chunkIndex"], 1)
        self.assertEqual(record["reasoningEffort"], "high")
        self.assertEqual(record["effectiveReasoningEffort"], "high")

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
             patch.object(app.BRIDGE, "create_talk_session", return_value=session) as create, \
             patch.object(app, "build_realtime_context", return_value=(
                 "private atlas context", {"chars": 21, "estimatedTokens": 5, "sources": []},
             )):
            handler.handle_realtime_session()
        params = create.call_args.args[0]
        self.assertEqual(params["model"], "gpt-realtime-2.1")
        # This is the only value accepted by the OpenClaw reservation schema;
        # the actual Realtime runtime tool remains atlas_shell.
        self.assertEqual(params["brain"], "agent-consult")
        self.assertEqual(params["transport"], "webrtc")
        self.assertNotIn("reasoningEffort", params)
        handler.send_json.assert_called_once_with(200, {
            "session": session, "sessionKey": "agent:main:test", "legacyFallback": False,
        })
        self.assertEqual(session["atlasOutput"], "native")
        self.assertEqual(session["atlasSelection"], "marin")
        self.assertIn("# ATLAS Realtime", session["atlasInstructions"])
        self.assertEqual(session["atlasContext"], "private atlas context")
        self.assertEqual(session["atlasContextStats"]["estimatedTokens"], 5)

    def test_legacy_openclaw_conversation_endpoints_are_disabled(self):
        for path in app.LEGACY_AGENT_API_PATHS:
            with self.subTest(path=path):
                handler = self.handler()
                handler.path = path
                handler.handle_controlled_post()
                handler.send_json.assert_called_once_with(410, {
                    "error": "El pipeline legacy de OpenClaw está desactivado; usa OpenAI Realtime",
                    "realtimeOnly": True,
                })

    def test_realtime_context_loads_identity_user_full_agents_and_commands(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            workspace = root / "workspace"
            workspace.mkdir()
            adb_reports = root / "adb-reports"
            adb_reports.mkdir()
            (workspace / "IDENTITY.md").write_text("identity-full", encoding="utf-8")
            (workspace / "SOUL.md").write_text("soul-full", encoding="utf-8")
            (workspace / "USER.md").write_text("user-full", encoding="utf-8")
            (workspace / "TOOLS.md").write_text("tools-full", encoding="utf-8")
            (workspace / "MEMORY.md").write_text("memory-map", encoding="utf-8")
            (workspace / "AGENTS.md").write_text(
                "# AGENTS\n\n## Red Lines\nkeep-red-lines\n\n"
                "## Heartbeats\ndo-not-load-heartbeats\n\n"
                "## Tools\nuse-atlas-commands\n",
                encoding="utf-8",
            )
            commands = workspace / "atlas-commands"
            commands.mkdir()
            (commands / "ATLAS-STATUS.md").write_text("atlas-status-full", encoding="utf-8")
            memories = workspace / "memory"
            memories.mkdir()
            (memories / "2026-08-30.md").write_text("episodic-secret", encoding="utf-8")
            report_name = "AA-BB-CC_test-tv_tv.md"
            (adb_reports / report_name).write_text(
                "# Test TV\n\n# NOTES\n\nUse the working TV route.",
                encoding="utf-8",
            )
            context, stats = app.build_realtime_context(workspace, adb_reports)
        self.assertIn("identity-full", context)
        self.assertIn("soul-full", context)
        self.assertIn("user-full", context)
        self.assertIn("keep-red-lines", context)
        self.assertIn("use-atlas-commands", context)
        self.assertIn("atlas-status-full", context)
        self.assertIn("tools-full", context)
        self.assertIn("memory-map", context)
        self.assertNotIn("episodic-secret", context)
        self.assertIn("do-not-load-heartbeats", context)
        self.assertIn("Use the working TV route.", context)
        self.assertIn(f"runtime/adb/devices/{report_name}", context)
        self.assertIn("AGENTS.md is the canonical master map", context)
        self.assertFalse(stats["truncated"])

    def test_realtime_context_separates_crucial_and_persistent_memory(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(app, "CONTEXT_DIR", Path(directory) / "context"), \
             patch.object(app, "PERSISTENT_CONTEXT_FILE", Path(directory) / "context" / "CONTEXT.md"), \
             patch.object(app, "CONTEXT_REVISION_FILE", Path(directory) / "context" / "REVISION"), \
             patch.object(app, "CONTEXT_COMPACT_REQUEST_FILE", Path(directory) / "context" / "COMPACT_REQUEST"):
            revision = app.replace_persistent_context("Sami prefiere respuestas breves.")
            context, stats = app.build_realtime_context(
                Path(directory) / "missing-workspace", Path(directory) / "missing-adb",
            )
            self.assertIn("Sami prefiere respuestas breves.", context)
            self.assertGreater(stats["crucialEstimatedTokens"], 0)
            self.assertGreater(stats["fillerEstimatedTokens"], 0)
            self.assertEqual(stats["revision"], revision)
            self.assertEqual(stats["availableFillerTokens"],
                             app.REALTIME_CONTEXT_LIMIT_TOKENS - stats["crucialEstimatedTokens"])
            app.empty_persistent_context()
            _, cleared = app.build_realtime_context(
                Path(directory) / "missing-workspace", Path(directory) / "missing-adb",
            )
            self.assertEqual(cleared["fillerEstimatedTokens"], 0)

    def test_persistent_turn_requests_compaction_before_window_is_full(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(app, "CONTEXT_DIR", Path(directory) / "context"), \
             patch.object(app, "PERSISTENT_CONTEXT_FILE", Path(directory) / "context" / "CONTEXT.md"), \
             patch.object(app, "CONTEXT_REVISION_FILE", Path(directory) / "context" / "REVISION"), \
             patch.object(app, "CONTEXT_COMPACT_REQUEST_FILE", Path(directory) / "context" / "COMPACT_REQUEST"), \
             patch.object(app, "REALTIME_CONTEXT_LIMIT_TOKENS", 80), \
             patch.object(app, "REALTIME_CONTEXT_MAX_CHARS", 10000):
            stats, auto_compact = app.append_persistent_turn("hola " * 80, "respuesta " * 80)
            self.assertTrue(auto_compact)
            self.assertGreaterEqual(stats["fillerEstimatedTokens"], stats["autoCompactAtTokens"])

    def test_saving_turns_does_not_invalidate_the_active_session(self):
        with tempfile.TemporaryDirectory() as directory, \
             patch.object(app, "CONTEXT_DIR", Path(directory)), \
             patch.object(app, "PERSISTENT_CONTEXT_FILE", Path(directory) / "CONTEXT.md"), \
             patch.object(app, "CONTEXT_REVISION_FILE", Path(directory) / "REVISION"), \
             patch.object(app, "CONTEXT_COMPACT_REQUEST_FILE", Path(directory) / "COMPACT_REQUEST"):
            revision = app.empty_persistent_context()
            first, _ = app.append_persistent_turn("Qué temperatura hace", "Cuarenta grados")
            app.request_persistent_context_compaction()
            second, _ = app.append_persistent_turn("Gracias", "De nada")
            self.assertEqual(first["revision"], revision)
            self.assertEqual(second["revision"], revision)
            self.assertGreater(second["fillerChars"], first["fillerChars"])
            self.assertTrue(second["compactionRequested"])
            self.assertIn("Cuarenta grados", app.persistent_context_snapshot()[0])
            replaced = app.replace_persistent_context("Resumen de la conversación")
            self.assertNotEqual(replaced, revision)
            self.assertFalse(app.CONTEXT_COMPACT_REQUEST_FILE.exists())
            self.assertNotEqual(app.empty_persistent_context(), replaced)

    def test_realtime_instructions_treat_clear_orders_as_authorization(self):
        instructions = app.read_realtime_instructions()
        self.assertIn("clear, direct order", instructions)
        self.assertIn("delete them", instructions)
        self.assertIn("shut down or restart", instructions)
        self.assertIn("real ambiguity", instructions)

    def test_external_tts_selection_keeps_a_valid_realtime_voice(self):
        handler = self.handler()
        handler.read_json_payload = Mock(return_value={"voice": "elevenlabs"})
        session = {
            "provider": "openai", "transport": "webrtc",
            "clientSecret": "ephemeral-test-only",
        }
        settings = {
            "realtimeVoice": "elevenlabs",
            "realtimeNativeVoice": "verse",
        }
        with patch.object(app, "current_session", return_value=("agent:main:test", False, 0)), \
             patch.object(app, "get_webscreen_settings", return_value=settings), \
             patch.object(app.BRIDGE, "create_talk_session", return_value=session) as create:
            handler.handle_realtime_session()
        params = create.call_args.args[0]
        self.assertEqual(params["voice"], "verse")
        self.assertEqual(session["atlasOutput"], "elevenlabs")
        self.assertEqual(session["atlasSelection"], "elevenlabs")

    def test_elevenlabs_uses_maximum_free_format_and_conversational_model(self):
        with patch.object(app, "get_tts_settings", return_value=("test-key", "test-voice")):
            request = app.elevenlabs_speech_request("Hola, sami")
        self.assertIn("output_format=mp3_44100_128", request.full_url)
        self.assertNotIn("optimize_streaming_latency", request.full_url)
        payload = request.data.decode("utf-8")
        self.assertIn('"model_id": "eleven_v3"', payload)

    def test_tts_stream_ticket_is_opaque_and_expires(self):
        now = 100.0
        with patch.object(app.time, "monotonic", return_value=now):
            token = app.create_tts_stream_ticket("Respuesta progresiva")
            self.assertRegex(token, r"^[0-9a-f]{32}$")
            self.assertEqual(app.resolve_tts_stream_ticket(token), "Respuesta progresiva")
        with patch.object(app.time, "monotonic", return_value=now + app.TTS_STREAM_TICKET_SECONDS + 1):
            with self.assertRaises(KeyError):
                app.resolve_tts_stream_ticket(token)

    def test_realtime_direct_event_creates_its_own_log(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(app, "LOG_DIR", Path(directory)):
            path = app.append_realtime_event({
                "interactionId": "voice-turn-1", "stage": "input.transcript",
                "message": "Transcripción", "text": "Atlas hola", "role": "user",
                "echoCancellation": True, "sampleRate": 48000,
            }, {
                "client_kind": "atlas-a1", "client_ip": "127.0.0.1",
                "client_id": "0123456789ab",
            })
            self.assertTrue(path.exists())
            text = path.read_text(encoding="utf-8")
            self.assertIn('"stage":"realtime.input.transcript"', text)
            self.assertIn('"text":"Atlas hola"', text)
            self.assertIn('"client_kind":"atlas-a1"', text)
            self.assertIn('"client_ip":"127.0.0.1"', text)
            self.assertIn('"echoCancellation":true', text)
            self.assertIn('"sampleRate":48000', text)

    def test_legacy_interaction_log_carries_verified_client_origin(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(app, "LOG_DIR", Path(directory)):
            log = app.InteractionLog("legacy-turn-1", {
                "client_kind": "browser", "client_ip": "192.168.1.141",
                "client_id": "abcdef012345",
            })
            log.add("input.transcript", "Transcripción", text="Hola")
            text = log.path.read_text(encoding="utf-8")
            self.assertIn('"client_kind":"browser"', text)
            self.assertIn('"client_ip":"192.168.1.141"', text)

    def test_realtime_shell_runs_as_a_bounded_tool(self):
        with patch.object(app, "REALTIME_SHELL_TIMEOUT_SECONDS", 3):
            result = app.execute_realtime_shell("printf atlas-shell-test", "test-shell-run", 3)
        self.assertTrue(result["ok"])
        self.assertEqual(result["exitCode"], 0)
        self.assertEqual(result["output"], "atlas-shell-test")

    def test_realtime_shell_permanently_blocks_forced_recursive_rm(self):
        forbidden = (
            "rm -rf /",
            "sudo rm -fr /home/atlas",
            "/bin/rm --recursive --force /tmp/example",
            "bash -lc 'rm -R -f /'",
            "rm -r --no-preserve-root /",
            "rm --force-root /",
        )
        for command in forbidden:
            with self.subTest(command=command), self.assertRaisesRegex(ValueError, "bloqueado"):
                app.validate_realtime_shell_command(command)

    def test_realtime_shell_allows_non_forced_scoped_operations(self):
        for command in ("rm -r relative-directory", "rm -f one-file.txt", "printf safe"):
            with self.subTest(command=command):
                app.validate_realtime_shell_command(command)

    def test_tavily_search_reuses_private_openclaw_key_without_returning_it(self):
        secret = "tvly-test-secret-that-must-never-leave-the-backend"

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self, _maximum):
                return json.dumps({
                    "results": [{
                        "title": "ATLAS result",
                        "url": "https://example.com/atlas",
                        "content": "Current external evidence.",
                        "score": 0.98,
                    }],
                }).encode()

        config = {
            "plugins": {"entries": {"tavily": {
                "enabled": True,
                "config": {"webSearch": {"apiKey": secret}},
            }}},
        }
        with patch.object(app, "load_openclaw_config", return_value=config), \
             patch.object(app.urllib.request, "urlopen", return_value=Response()) as request:
            result = app.execute_tavily_search("latest ATLAS information")
        sent = request.call_args.args[0]
        self.assertEqual(sent.get_header("Authorization"), f"Bearer {secret}")
        self.assertEqual(json.loads(sent.data)["search_depth"], "basic")
        self.assertEqual(result["provider"], "tavily")
        self.assertEqual(result["count"], 1)
        self.assertNotIn(secret, json.dumps(result))

    def test_tavily_search_requires_existing_openclaw_configuration(self):
        with patch.object(app, "load_openclaw_config", return_value={}):
            with self.assertRaisesRegex(RuntimeError, "Tavily no está configurado"):
                app.execute_tavily_search("ATLAS")


if __name__ == "__main__":
    unittest.main()
