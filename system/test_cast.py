#!/usr/bin/env python3
"""Static contracts for the cast-to-WebScreen shortcut."""

from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
CAST = ROOT / "atlas-commands/atlas-cast"
DEPLOY = ROOT / "system/deploy-runtime-update.sh"


class CastWebScreenTests(unittest.TestCase):
    def test_scripts_are_valid_shell(self) -> None:
        subprocess.run(["bash", "-n", str(CAST)], check=True)
        subprocess.run(["bash", "-n", str(DEPLOY)], check=True)

    def test_webscreen_requires_an_active_cast_and_uses_new_surface(self) -> None:
        source = CAST.read_text(encoding="utf-8")
        self.assertIn("http://localhost:5000/new/", source)
        branch = source.split("  webscreen)", 1)[1].split("  status)", 1)[0]
        self.assertIn("if ! is_running", branch)
        self.assertIn('start_desktop_if_needed', branch)
        self.assertIn('as_atlas "$ROOT/bin/open-chrome" "$WEBSCREEN_URL"', branch)

    def test_runtime_deploy_installs_command_and_both_context_docs(self) -> None:
        source = DEPLOY.read_text(encoding="utf-8")
        self.assertIn('install -m 755 "$repo/atlas-commands/atlas-cast" /usr/local/bin/atlas-cast', source)
        self.assertIn("ATLAS-CAST.md", source)
        self.assertIn("ATLAS-DESKTOP.md", source)


if __name__ == "__main__":
    unittest.main()
