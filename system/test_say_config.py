"""atlas-say configuration contracts; no network or audio calls."""

from __future__ import annotations

import importlib.machinery
import importlib.util
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "atlas-commands" / "atlas-say"


def load_module():
    loader = importlib.machinery.SourceFileLoader("atlas_say_test", str(SOURCE))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class SayConfigTests(unittest.TestCase):
    def test_source_only_references_standalone_private_layout(self) -> None:
        source = SOURCE.read_text(encoding="utf-8")
        self.assertIn(".atlas/config/secrets.json", source)
        self.assertIn(".atlas/runtime/tmp", source)
        self.assertNotIn(".openclaw", source)

    def test_new_elevenlabs_shape_resolves(self) -> None:
        module = load_module()
        self.assertEqual(
            module.resolve_elevenlabs_config(
                {"elevenlabs": {"apiKey": "test-key", "voiceId": "test-voice"}}
            ),
            ("test-key", "test-voice"),
        )

    def test_world_readable_secret_file_is_rejected(self) -> None:
        module = load_module()
        with tempfile.TemporaryDirectory(prefix="atlas-say-") as directory:
            config = Path(directory) / "secrets.json"
            config.write_text('{"elevenlabs": {}}')
            config.chmod(0o644)
            module.CONFIG_PATH = config
            with self.assertRaises(SystemExit):
                module.load_config()


if __name__ == "__main__":
    unittest.main()
