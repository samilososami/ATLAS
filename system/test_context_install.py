"""Isolated installer and user/root execution tests for atlas-context."""

from __future__ import annotations

import os
from pathlib import Path
import pwd
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ContextInstallerTests(unittest.TestCase):
    def setUp(self) -> None:
        if os.geteuid() != 0 and subprocess.run(
            ["sudo", "-n", "true"], capture_output=True
        ).returncode != 0:
            self.skipTest("root or noninteractive sudo required for installer fixture")

    def root_command(self, *arguments: str) -> list[str]:
        if os.geteuid() == 0:
            return list(arguments)
        return ["sudo", "-n", *arguments]

    def test_installs_helper_and_wrapper_for_normal_user_and_root(self) -> None:
        runtime_user = pwd.getpwuid(os.getuid()).pw_name
        with tempfile.TemporaryDirectory(prefix="atlas-context-install-") as directory:
            fixture = Path(directory)
            home = fixture / "home"
            system_root = fixture / "system"
            home.mkdir()
            installer = self.root_command(
                "env",
                f"ATLAS_HOME={home}",
                f"ATLAS_USER={runtime_user}",
                f"ATLAS_SYSTEM_ROOT={system_root}",
                "bash",
                str(ROOT / "system/install-context.sh"),
            )
            result = subprocess.run(installer, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

            helper = system_root / "usr/local/lib/atlas/atlas-contextctl"
            wrapper = system_root / "usr/local/bin/atlas-context"
            self.assertEqual(helper.stat().st_mode & 0o777, 0o755)
            self.assertEqual(wrapper.stat().st_mode & 0o777, 0o755)

            conversation = home / ".atlas/context/conversation"
            environment = {
                **os.environ,
                "ATLAS_HOME": str(home),
                "ATLAS_USER": runtime_user,
                "ATLAS_CONTEXT_HELPER": str(helper),
                "ATLAS_CONVERSATION_DIR": str(conversation),
            }
            emptied = subprocess.run(
                [str(wrapper), "empty"], env=environment,
                capture_output=True, text=True,
            )
            self.assertEqual(emptied.returncode, 0, emptied.stderr)
            self.assertEqual((conversation / "CONTEXT.md").read_text(), "")
            self.assertEqual((conversation / "CONTEXT.md").stat().st_uid, os.getuid())

            root_status = subprocess.run(
                self.root_command(
                    "env",
                    f"ATLAS_HOME={home}",
                    f"ATLAS_USER={runtime_user}",
                    f"ATLAS_CONTEXT_HELPER={helper}",
                    f"ATLAS_CONVERSATION_DIR={conversation}",
                    str(wrapper),
                    "status",
                ),
                capture_output=True,
                text=True,
            )
            self.assertEqual(root_status.returncode, 0, root_status.stderr)
            self.assertIn("atlas-context status", root_status.stdout)

            if os.geteuid() != 0:
                subprocess.run(
                    ["sudo", "-n", "chown", "-R", f"{os.getuid()}:{os.getgid()}",
                     str(fixture)],
                    check=True,
                )

    def test_wrapper_uses_configured_runtime_user_instead_of_hardcoded_account(self) -> None:
        source = (ROOT / "atlas-commands/atlas-context").read_text(encoding="utf-8")
        self.assertIn('runuser -u "$ATLAS_USER"', source)
        self.assertNotIn("runuser -u sami", source)


if __name__ == "__main__":
    unittest.main()
