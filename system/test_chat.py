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


if __name__ == "__main__":
    unittest.main()
