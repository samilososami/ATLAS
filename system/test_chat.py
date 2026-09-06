import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


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
        self.assertEqual(set(tools), {"atlas_shell", "atlas_web_search"})
        self.assertEqual(tools["atlas_shell"]["parameters"]["required"], ["command"])
        self.assertEqual(tools["atlas_web_search"]["parameters"]["required"], ["query"])
        browser = (ROOT / ".atlas/webscreen/static/realtime.js").read_text()
        for name in tools:
            self.assertIn(f'name: "{name}"', browser)

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
            for command in ("/help", "/new", "/context", "/model", "/logs", "/clear", "/quit"):
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


if __name__ == "__main__":
    unittest.main()
