"""Isolated installer fixtures; no network and no writes to the real system."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PINNED_VERSION = "0.147.0"


def write_executable(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    path.chmod(0o755)


class NativeBrokerInstallerTests(unittest.TestCase):
    def _run_installer(self, home: Path, system_root: Path, fake_npm: Path):
        command = [
            "env",
            f"ATLAS_HOME={home}",
            f"ATLAS_USER={os.environ.get('USER', 'kali')}",
            f"ATLAS_SYSTEM_ROOT={system_root}",
            f"ATLAS_NPM_BIN={fake_npm}",
            "bash",
            str(ROOT / "system/install-native-broker.sh"),
        ]
        if os.geteuid() != 0:
            command = ["sudo", "-n", *command]
        return subprocess.run(command, capture_output=True, text=True)

    def test_installs_pinned_cli_runtime_and_never_changes_oauth(self) -> None:
        if os.geteuid() != 0 and subprocess.run(
            ["sudo", "-n", "true"], capture_output=True
        ).returncode != 0:
            self.skipTest("root or noninteractive sudo required for ownership fixture")
        with tempfile.TemporaryDirectory(prefix="atlas-native-broker-") as directory:
            fixture = Path(directory)
            home = fixture / "home"
            system_root = fixture / "system"
            fake_bin = fixture / "fake-bin"
            oauth = home / ".codex/auth.json"
            oauth.parent.mkdir(parents=True)
            oauth.write_text("private-oauth-marker", encoding="utf-8")
            oauth.chmod(0o600)
            npm_log = fixture / "npm.log"
            fake_npm = fake_bin / "npm"
            write_executable(
                fake_npm,
                """#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >"${ATLAS_TEST_NPM_LOG:?}"
mkdir -p "$NPM_CONFIG_PREFIX/bin"
cat >"$NPM_CONFIG_PREFIX/bin/codex" <<'EOF'
#!/usr/bin/env bash
printf 'codex-cli 0.147.0\\n'
EOF
chmod 755 "$NPM_CONFIG_PREFIX/bin/codex"
""",
            )
            environment = os.environ.copy()
            environment["ATLAS_TEST_NPM_LOG"] = str(npm_log)
            command = [
                "env",
                f"ATLAS_TEST_NPM_LOG={npm_log}",
                f"ATLAS_HOME={home}",
                f"ATLAS_USER={os.environ.get('USER', 'kali')}",
                f"ATLAS_SYSTEM_ROOT={system_root}",
                f"ATLAS_NPM_BIN={fake_npm}",
                "bash",
                str(ROOT / "system/install-native-broker.sh"),
            ]
            if os.geteuid() != 0:
                command = ["sudo", "-n", *command]
            result = subprocess.run(command, capture_output=True, text=True, env=environment)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(oauth.read_text(encoding="utf-8"), "private-oauth-marker")
            self.assertEqual(oauth.stat().st_mode & 0o777, 0o600)
            self.assertIn(f"@openai/codex@{PINNED_VERSION}", npm_log.read_text())

            broker = home / ".atlas/broker"
            for filename in ("__init__.py", "__main__.py", "cli.py", "native_broker.py"):
                self.assertTrue((broker / filename).is_file())
                self.assertEqual((broker / filename).stat().st_mode & 0o777, 0o600)
            codex_link = system_root / "usr/local/bin/codex"
            self.assertTrue(codex_link.is_symlink())
            self.assertEqual(codex_link.resolve(), home / ".npm-global/bin/codex")
            wrapper = system_root / "usr/local/bin/atlas-broker"
            self.assertEqual(wrapper.stat().st_mode & 0o777, 0o755)

            help_result = subprocess.run(
                [
                    "env",
                    f"ATLAS_HOME={home}",
                    f"ATLAS_USER={os.environ.get('USER', 'kali')}",
                    str(wrapper),
                    "--help",
                ],
                capture_output=True,
                text=True,
            )
            self.assertEqual(help_result.returncode, 0, help_result.stderr)
            self.assertIn("atlas-broker", help_result.stdout)

            root_command = [
                "env",
                f"ATLAS_HOME={home}",
                f"ATLAS_USER={os.environ.get('USER', 'kali')}",
                str(wrapper),
                "--help",
            ]
            if os.geteuid() != 0:
                root_command = ["sudo", "-n", *root_command]
            root_help = subprocess.run(
                root_command,
                capture_output=True,
                text=True,
            )
            self.assertEqual(root_help.returncode, 0, root_help.stderr)
            self.assertIn("atlas-broker", root_help.stdout)

            # Root-owned fixture descendants must be returned to the test user.
            if os.geteuid() != 0:
                subprocess.run(
                    ["sudo", "-n", "chown", "-R", f"{os.getuid()}:{os.getgid()}", str(fixture)],
                    check=True,
                )

    def test_existing_pinned_codex_does_not_invoke_npm(self) -> None:
        if os.geteuid() != 0 and subprocess.run(
            ["sudo", "-n", "true"], capture_output=True
        ).returncode != 0:
            self.skipTest("root or noninteractive sudo required for ownership fixture")
        with tempfile.TemporaryDirectory(prefix="atlas-native-broker-existing-") as directory:
            fixture = Path(directory)
            home = fixture / "home"
            system_root = fixture / "system"
            codex = home / ".npm-global/bin/codex"
            write_executable(codex, "#!/usr/bin/env bash\nprintf 'codex-cli 0.147.0\\n'\n")
            npm_marker = fixture / "npm-was-called"
            fake_npm = fixture / "npm"
            write_executable(fake_npm, f"#!/usr/bin/env bash\ntouch {npm_marker}\nexit 99\n")
            home.mkdir(parents=True, exist_ok=True)
            result = self._run_installer(home, system_root, fake_npm)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(npm_marker.exists())
            if os.geteuid() != 0:
                subprocess.run(
                    ["sudo", "-n", "chown", "-R", f"{os.getuid()}:{os.getgid()}", str(fixture)],
                    check=True,
                )

    def test_scripts_are_syntactically_valid_and_wrapper_never_runs_as_root(self) -> None:
        for path in (
            ROOT / "system/install-native-broker.sh",
            ROOT / "atlas-commands/atlas-broker",
        ):
            subprocess.run(["bash", "-n", str(path)], check=True)
        wrapper = (ROOT / "atlas-commands/atlas-broker").read_text(encoding="utf-8")
        self.assertIn('runuser -u "$ATLAS_USER"', wrapper)
        self.assertIn('CODEX_HOME="$ATLAS_HOME/.codex"', wrapper)
        installer = (ROOT / "system/install-native-broker.sh").read_text(encoding="utf-8")
        self.assertNotIn("auth.json", "\n".join(
            line for line in installer.splitlines() if not line.lstrip().startswith("#")
        ))


if __name__ == "__main__":
    unittest.main()
