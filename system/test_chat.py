import importlib.util
import base64
import json
import os
import subprocess
import sys
import tempfile
import unittest
import io
import asyncio
from types import SimpleNamespace
from unittest.mock import Mock, patch
from pathlib import Path
from prompt_toolkit.document import Document
from prompt_toolkit.completion import CompleteEvent
from prompt_toolkit.input import create_pipe_input
from prompt_toolkit.output import DummyOutput
from prompt_toolkit.application import create_app_session
from rich.console import Console


ROOT = Path(__file__).resolve().parents[1]
CLIENT = ROOT / ".atlas/chat/atlas_chat.py"
WRAPPER = ROOT / "atlas-commands/atlas-chat"
INSTALLER = ROOT / "system/install-chat.sh"
DOC_INSTALLER = ROOT / "system/install-chat-docs.py"


class AtlasChatTests(unittest.TestCase):
    def load_client(self):
        spec = importlib.util.spec_from_file_location("atlas_chat", CLIENT)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        return module

    def test_python_and_wrapper_syntax(self):
        subprocess.run([sys.executable, "-m", "py_compile", str(CLIENT)], check=True)
        subprocess.run(["bash", "-n", str(WRAPPER)], check=True)
        subprocess.run(["bash", "-n", str(INSTALLER)], check=True)
        subprocess.run([sys.executable, "-m", "py_compile", str(DOC_INSTALLER)], check=True)

    def test_tool_contract_matches_webscreen_names(self):
        module = self.load_client()
        tools = {entry["name"]: entry for entry in module.REALTIME_TOOLS}
        self.assertEqual(set(tools), {
            "atlas_shell", "atlas_web_search", "atlas_routine",
            "atlas_phone", "atlas_android",
        })
        self.assertEqual(tools["atlas_shell"]["parameters"]["required"], ["command"])
        self.assertEqual(tools["atlas_web_search"]["parameters"]["required"], ["query"])
        self.assertEqual(tools["atlas_routine"]["parameters"]["required"], ["action"])
        self.assertEqual(tools["atlas_phone"]["parameters"]["required"], ["operation"])
        self.assertEqual(tools["atlas_android"]["parameters"]["required"], ["operation"])
        self.assertIn(
            "androiduse.key",
            tools["atlas_android"]["parameters"]["properties"]["operation"]["enum"],
        )
        browser = (ROOT / ".atlas/webscreen/static/realtime.js").read_text()
        for name in tools:
            self.assertIn(f'name: "{name}"', browser)

    def test_phone_tool_uses_closed_webscreen_contract_and_aliases(self):
        module = self.load_client()
        chat = object.__new__(module.AtlasChat)
        capture = io.StringIO()
        chat.console = Console(file=capture, width=80, color_system=None)
        chat.tool_details = []
        chat.compact = True
        chat.log = Mock()
        execute = Mock(return_value={"ok": True, "accuracy": 8})
        aliases = {"get_location": "location.get"}
        allowed = frozenset({"location.get"})
        chat.webscreen = SimpleNamespace(
            execute_atlas_app_control=execute,
            ATLAS_PHONE_OPERATIONS=allowed,
            ATLAS_PHONE_OPERATION_ALIASES=aliases,
            ATLAS_APP_CONTROL_MAX_PHONE_RESULT_CHARS=4096,
        )

        result = chat._run_tool("atlas_phone", {
            "operation": "get_location", "params": {"fresh": True},
        }, "phone-test")

        execute.assert_called_once_with("get_location", {"fresh": True}, allowed, aliases)
        self.assertEqual(result["result"]["accuracy"], 8)
        self.assertIsNone(chat._last_tool_image)
        self.assertIn("TELÉFONO", capture.getvalue())

    def test_android_tool_auto_inspects_without_leaking_capture_bytes(self):
        module = self.load_client()
        chat = object.__new__(module.AtlasChat)
        capture = io.StringIO()
        chat.console = Console(file=capture, width=80, color_system=None)
        chat.tool_details = []
        chat.compact = True
        chat.log = Mock()
        chat._android_control_active = False
        png = base64.b64encode(b"\x89PNG\r\n\x1a\nmock").decode()
        raw_capture = {"ok": True, "pngBase64": png, "width": 1080, "height": 2316}
        allowed = frozenset({"androiduse.start", "androiduse.screenshot", "androiduse.stop"})
        execute = Mock(side_effect=[{"ok": True}, raw_capture])
        chat.webscreen = SimpleNamespace(
            execute_atlas_app_control=execute,
            ATLAS_ANDROID_OPERATIONS=allowed,
            ATLAS_ANDROID_AUTO_INSPECT=frozenset({"androiduse.start"}),
            normalize_android_screenshot=Mock(return_value={
                "pngBase64": png, "width": 1080, "height": 2316, "mime": "image/png",
            }),
            public_android_result=lambda value: {
                key: item for key, item in value.items() if key != "pngBase64"
            },
        )

        result = chat._run_tool("atlas_android", {
            "operation": "androiduse.start", "params": {},
        }, "android-test")

        self.assertTrue(chat._android_control_active)
        self.assertNotIn("pngBase64", json.dumps(result))
        self.assertTrue(result["screenshot"]["attached"])
        self.assertEqual(chat._last_tool_image["pngBase64"], png)
        self.assertNotIn(png, capture.getvalue())

    def test_android_screenshot_retries_short_interval_once_only(self):
        module = self.load_client()
        chat = object.__new__(module.AtlasChat)
        raw = {"ok": True, "pngBase64": "encoded", "width": 10, "height": 20}
        execute = Mock(side_effect=[
            RuntimeError("No se pudo capturar la pantalla (3)"), raw,
        ])
        chat.webscreen = SimpleNamespace(
            execute_atlas_app_control=execute,
            ATLAS_ANDROID_OPERATIONS=frozenset({"androiduse.screenshot"}),
            normalize_android_screenshot=Mock(return_value={
                "pngBase64": "encoded", "width": 10, "height": 20, "mime": "image/png",
            }),
        )
        with patch.object(module.time, "sleep") as sleep:
            returned, screenshot = chat._capture_android_screenshot()
        self.assertIs(returned, raw)
        self.assertEqual(screenshot["width"], 10)
        self.assertEqual(execute.call_count, 2)
        sleep.assert_called_once_with(module.SCREENSHOT_RETRY_SECONDS)

    def test_image_is_a_separate_realtime_input(self):
        module = self.load_client()
        chat = object.__new__(module.AtlasChat)
        chat._send = Mock()
        screenshot = {"pngBase64": "YWJj", "width": 10, "height": 20}
        result = {
            "operation": "androiduse.screenshot",
            "result": {"ok": True, "captureAttached": True},
        }
        chat._send_tool_result("call-1", result, screenshot)
        self.assertEqual(chat._send.call_count, 2)
        function_output = chat._send.call_args_list[0].args[0]
        self.assertNotIn("YWJj", function_output["item"]["output"])
        image_message = chat._send.call_args_list[1].args[0]
        content = image_message["item"]["content"]
        self.assertEqual(content[1], {
            "type": "input_image", "image_url": "data:image/png;base64,YWJj",
        })

    def test_close_stops_active_android_control_before_realtime(self):
        module = self.load_client()
        chat = object.__new__(module.AtlasChat)
        ws = Mock()
        chat.ws = ws
        chat._android_control_active = True
        chat.log = Mock()
        execute = Mock(return_value={"ok": True})
        allowed = frozenset({"androiduse.stop"})
        chat.webscreen = SimpleNamespace(
            execute_atlas_app_control=execute,
            ATLAS_ANDROID_OPERATIONS=allowed,
        )
        chat.close()
        execute.assert_called_once_with("androiduse.stop", {}, allowed)
        ws.close.assert_called_once_with()
        self.assertFalse(chat._android_control_active)
        self.assertIsNone(chat.ws)

    def test_failed_auto_inspection_preserves_completed_action_and_control(self):
        module = self.load_client()
        chat = object.__new__(module.AtlasChat)
        capture = io.StringIO()
        chat.console = Console(file=capture, width=80, color_system=None)
        chat.tool_details = []
        chat.compact = True
        chat.log = Mock()
        chat._android_control_active = False
        allowed = frozenset({"androiduse.start", "androiduse.screenshot", "androiduse.stop"})
        execute = Mock(side_effect=[{"ok": True}, RuntimeError("captura fallida")])
        chat.webscreen = SimpleNamespace(
            execute_atlas_app_control=execute,
            ATLAS_ANDROID_OPERATIONS=allowed,
            ATLAS_ANDROID_AUTO_INSPECT=frozenset({"androiduse.start"}),
            normalize_android_screenshot=Mock(),
            public_android_result=lambda value: value,
        )

        result = chat._run_tool("atlas_android", {
            "operation": "androiduse.start", "params": {},
        }, "failed-inspection")

        self.assertTrue(result["ok"])
        self.assertEqual(result["result"]["inspectionError"], "captura fallida")
        self.assertTrue(chat._android_control_active)
        self.assertEqual(
            [call.args[0] for call in execute.call_args_list],
            ["androiduse.start", "androiduse.screenshot"],
        )

    def test_logs_never_receive_provider_secret_field(self):
        source = CLIENT.read_text()
        self.assertNotIn('log("clientSecret"', source)
        self.assertNotIn('clientSecret=secret', source)

    def test_wrapper_drops_root_to_service_user(self):
        source = WRAPPER.read_text()
        self.assertIn('sudo -u "$ATLAS_USER" -H', source)
        self.assertIn('ATLAS_HOME=${ATLAS_HOME:-/home/atlas}', source)

    def test_ephemeral_context_does_not_read_persistent_history(self):
        module = self.load_client()
        chat = object.__new__(module.AtlasChat)
        calls = []

        class WebScreen:
            @staticmethod
            def build_realtime_context(**kwargs):
                calls.append(kwargs)
                return "context", {}

        chat.webscreen = WebScreen()
        chat.persist = False
        self.assertEqual(chat._build_context(), ("context", {}))
        self.assertEqual(calls, [{"persistent_context": ""}])

        chat.persist = True
        chat._build_context()
        self.assertEqual(calls[-1], {"persistent_context": None})

    def test_terminal_overlay_and_installer_contract_are_complete(self):
        terminal = (ROOT / ".atlas/chat/TERMINAL_INSTRUCTIONS.md").read_text()
        self.assertIn("text-only terminal conversation", terminal)
        self.assertIn("concise Markdown", terminal)
        installer = INSTALLER.read_text()
        for required in (
            "TERMINAL_INSTRUCTIONS.md",
            "requirements.txt",
            "install-chat-docs.py",
            "ATLAS-CHAT.md",
        ):
            self.assertIn(required, installer)

    def test_command_surface_is_documented(self):
        manuals = (
            ROOT / ".atlas/chat/README.md",
            ROOT / "openclaw/workspace/atlas-commands/ATLAS-CHAT.md",
        )
        for manual in manuals:
            text = manual.read_text()
            for option in ("-p", "--ephemeral", "--verbose", "--help", "--version"):
                self.assertIn(option, text, f"{option} missing from {manual}")
            for command in self.load_client().COMMANDS:
                self.assertIn(command, text, f"{command} missing from {manual}")

    def test_document_merger_preserves_existing_workspace_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            home = root / "home"
            workspace = home / ".openclaw/workspace"
            webscreen = home / ".atlas/webscreen"
            backup = home / ".atlas/backups/test"
            (workspace / "atlas-commands").mkdir(parents=True)
            webscreen.mkdir(parents=True)
            for path in (
                workspace / "AGENTS.md",
                workspace / "NOTES.md",
                workspace / "README.md",
                workspace / "atlas-commands/ATLAS-CONTEXT.md",
                workspace / "atlas-commands/ATLAS-WEBSCREEN.md",
                webscreen / "README.md",
            ):
                path.write_text("private-line\n", encoding="utf-8")
            subprocess.run(
                [sys.executable, str(DOC_INSTALLER), str(ROOT), str(home), str(backup)],
                check=True,
                capture_output=True,
                text=True,
            )
            for path in (
                workspace / "AGENTS.md",
                workspace / "NOTES.md",
                workspace / "README.md",
                workspace / "atlas-commands/ATLAS-CONTEXT.md",
                workspace / "atlas-commands/ATLAS-WEBSCREEN.md",
                webscreen / "README.md",
            ):
                text = path.read_text()
                self.assertIn("private-line", text)
                self.assertIn("atlas-chat", text.lower())

    def test_completion_and_mentions_with_spaces_and_directories(self):
        module = self.load_client()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'AGENTS.md').touch()
            (root / 'my notes.md').touch()
            (root / 'atlas-commands').mkdir()
            (root / 'atlas-commands/ATLAS-CHAT.md').touch()
            completer = module.AtlasCompleter(root)
            for typed, expected in [('/h', '/help'), ('read @AG', '@AGENTS.md'),
                                     ('@my', '@"my notes.md"'),
                                     ('@atlas-commands/', '@atlas-commands/ATLAS-CHAT.md')]:
                results = list(completer.get_completions(Document(typed), CompleteEvent()))
                self.assertIn(expected, [r.text for r in results])
            self.assertIn(str(root / 'my notes.md'), module.resolve_mentions('Read @"my notes.md"', root))
            self.assertEqual(module.resolve_mentions('contact person@example.com @missing', root),
                             'contact person@example.com @missing')

    def test_editor_deletion_multiline_and_completion(self):
        module = self.load_client()

        async def exercise(editor, pipe, keys):
            task = asyncio.create_task(editor.prompt_async())
            await asyncio.sleep(0.06)
            pipe.send_text(keys)
            return await asyncio.wait_for(task, 3)

        with tempfile.TemporaryDirectory() as directory, create_pipe_input() as pipe, \
             patch.object(module, 'HISTORY_FILE', Path(directory) / 'history'), \
             create_app_session(input=pipe, output=DummyOutput()):
            editor = module.input_session(SimpleNamespace(persist=False))
            result = asyncio.run(exercise(editor, pipe, 'delete me\x15\x7fhello\x1b\rworld\r'))
            self.assertEqual(result, 'hello\nworld')
            self.assertEqual(editor.message, [('class:user', 'sami'), ('class:prompt', ' › ')])

    def test_tool_preview_never_changes_executed_command_or_returned_output(self):
        module = self.load_client()
        command = 'printf ' + 'x' * 300
        output = '\n'.join('result ' + str(i) for i in range(40))
        chat = object.__new__(module.AtlasChat)
        capture = io.StringIO()
        chat.console = Console(file=capture, width=52, color_system=None)
        chat.tool_details = []
        chat.compact = True
        chat.webscreen = SimpleNamespace(execute_realtime_shell=Mock(return_value={'output': output, 'ok': True}))
        chat.log = Mock()
        result = chat._run_tool('atlas_shell', {'command': command}, 'test')
        chat.webscreen.execute_realtime_shell.assert_called_once_with(command, 'test', None)
        self.assertEqual(result['output'], output)
        self.assertEqual(chat.tool_details[0][1], '$ ' + command)
        self.assertIn('/expand', capture.getvalue())
        self.assertNotIn('result 39', capture.getvalue())

    def test_control_sequences_are_removed_from_tool_previews(self):
        module = self.load_client()
        preview, clipped = module.compact_text('\x1b[2Jhello\x1b]0;title\x07\n' + '界' * 60, 30, 2)
        self.assertNotIn('\x1b', preview)
        self.assertNotIn('title', preview)
        self.assertTrue(clipped)
        self.assertLessEqual(module.Text(preview.splitlines()[1]).cell_len, 30)

    def test_streamed_text_is_not_duplicated_by_done_event(self):
        module = self.load_client()
        chat = object.__new__(module.AtlasChat)
        capture = io.StringIO()
        chat.console = Console(file=capture, color_system=None)
        chat.ws = Mock()
        chat.tool_buffers = {}
        chat.tool_details = []
        chat.persist = False
        chat.verbose = False
        chat.log = Mock()
        chat._recv = Mock(side_effect=[
            {'type': 'response.output_text.delta', 'item_id': '1', 'delta': 'Respuesta única'},
            {'type': 'response.output_text.done', 'item_id': '1', 'text': 'Respuesta única'},
            {'type': 'response.done', 'response': {'status': 'completed'}},
        ])
        self.assertEqual(chat.ask('test'), 'Respuesta única')
        self.assertEqual(capture.getvalue().count('Respuesta única'), 1)

        chat._recv = Mock(side_effect=TimeoutError('timeout'))
        with self.assertRaises(module.AtlasChatError):
            chat.ask('timeout test')
        self.assertIsNone(chat.ws)


if __name__ == "__main__":
    unittest.main()
