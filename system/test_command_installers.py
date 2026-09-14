"""Focused install coverage for desktop/cast, Spotify and wake commands."""

from __future__ import annotations

import os
from pathlib import Path
import pwd
import shutil
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def executable(path: Path, body: str = "#!/bin/sh\nexit 0\n") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    path.chmod(0o755)


class CommandInstallerTests(unittest.TestCase):
    def setUp(self) -> None:
        if os.geteuid() != 0 and subprocess.run(
            ["sudo", "-n", "true"], capture_output=True
        ).returncode != 0:
            self.skipTest("root or noninteractive sudo required")
        self.user = pwd.getpwuid(os.getuid()).pw_name

    def root(self, *args: str) -> list[str]:
        return list(args) if os.geteuid() == 0 else ["sudo", "-n", *args]

    def install(self, name: str, home: Path, system_root: Path, path: str | None = None):
        env = [
            f"ATLAS_HOME={home}", f"ATLAS_USER={self.user}",
            f"ATLAS_SYSTEM_ROOT={system_root}", "ATLAS_SKIP_DEPENDENCY_CHECK=1",
        ]
        if path:
            env.append(f"PATH={path}")
        return subprocess.run(
            self.root("env", *env, "bash", str(ROOT / f"system/install-{name}.sh")),
            capture_output=True, text=True,
        )

    def fixture(self, prefix: str) -> Path:
        fixture = Path(tempfile.mkdtemp(prefix=prefix))
        def cleanup() -> None:
            subprocess.run(
                self.root("chown", "-R", f"{os.getuid()}:{os.getgid()}", str(fixture)),
                check=False, capture_output=True,
            )
            shutil.rmtree(fixture, ignore_errors=True)
        self.addCleanup(cleanup)
        return fixture

    def test_every_orphaned_surface_has_a_syntax_valid_installer(self) -> None:
        expected = {
            "desktop": ("atlas-desktop", "atlas-cast"),
            "spotify": ("atlas-spotify",),
            "wake": ("atlas-wake",),
        }
        for installer, commands in expected.items():
            path = ROOT / f"system/install-{installer}.sh"
            subprocess.run(["bash", "-n", str(path)], check=True)
            source = path.read_text(encoding="utf-8")
            for command in commands:
                self.assertIn(command, source)

    def test_desktop_and_spotify_install_to_global_paths_idempotently(self) -> None:
        fixture = self.fixture("atlas-command-install-")
        home, system_root = fixture / "home", fixture / "system"
        home.mkdir()
        executable(system_root / "usr/local/bin/spotifyd")
        for name in ("desktop", "spotify"):
            first = self.install(name, home, system_root)
            self.assertEqual(first.returncode, 0, first.stderr)
            before = sorted((home / ".atlas/backups").iterdir())
            second = self.install(name, home, system_root)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(before, sorted((home / ".atlas/backups").iterdir()))
        for command in ("atlas-desktop", "atlas-cast", "atlas-spotify"):
            target = system_root / "usr/local/bin" / command
            self.assertTrue(target.is_file())
            self.assertEqual(target.stat().st_mode & 0o777, 0o755)
        self.assertTrue((system_root / "etc/systemd/system/atlas-desktop.service").is_file())
        self.assertTrue((system_root / "etc/systemd/user/atlas-spotifyd.service").is_file())

    def test_wake_install_preserves_profiles_and_root_drops_privileges(self) -> None:
        fixture = self.fixture("atlas-wake-install-")
        home, system_root = fixture / "home", fixture / "system"
        runtime = home / ".atlas/wakeword"
        profile = runtime / "profiles/sami/sample.wav"
        profile.parent.mkdir(parents=True)
        profile.write_bytes(b"private sample")
        python = runtime / ".venv/bin/python"
        python.parent.mkdir(parents=True)
        python.symlink_to(sys.executable)
        (runtime / "models").mkdir()
        (runtime / "models/hey_atlas.tflite").write_bytes(b"fixture")
        fake_bin = fixture / "bin"
        executable(fake_bin / "sha256sum")
        result = self.install("wake", home, system_root, f"{fake_bin}:/usr/sbin:/usr/bin:/bin")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(profile.read_bytes(), b"private sample")
        wrapper = system_root / "usr/local/bin/atlas-wake"
        normal = subprocess.run(
            [str(wrapper), "status"],
            env={**os.environ, "ATLAS_HOME": str(home), "ATLAS_USER": self.user},
            capture_output=True, text=True,
        )
        self.assertEqual(normal.returncode, 0, normal.stderr)
        privileged = subprocess.run(
            self.root("env", f"ATLAS_HOME={home}", f"ATLAS_USER={self.user}",
                      str(wrapper), "status"),
            capture_output=True, text=True,
        )
        self.assertEqual(privileged.returncode, 0, privileged.stderr)
        self.assertIn("ATLAS Wake", privileged.stdout)


if __name__ == "__main__":
    unittest.main()
