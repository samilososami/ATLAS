"""Static and temporary-root contracts for the standalone ATLAS installers."""

from __future__ import annotations

from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


class StandaloneInstallerTests(unittest.TestCase):
    def test_shell_installers_are_valid_and_do_not_invoke_legacy_runtime(self) -> None:
        paths = (
            ROOT / "system/deploy-runtime-update.sh",
            ROOT / "system/install-chat.sh",
            ROOT / "system/install-routines.sh",
            ROOT / "system/install-companion.sh",
            ROOT / "system/install-device-connections.sh",
            ROOT / "system/install-webscreen-resilience.sh",
            ROOT / "system/install-native-broker.sh",
            ROOT / "system/install-context.sh",
            ROOT / "system/rebuild-whisper-runtime.sh",
        )
        for path in paths:
            subprocess.run(["bash", "-n", str(path)], check=True)
            source = path.read_text(encoding="utf-8")
            self.assertNotIn(".openclaw/workspace", source, path)
            if path.name != "rebuild-whisper-runtime.sh":
                self.assertNotIn("openclaw", source.casefold(), path)
                self.assertNotIn("gateway_bridge", source.casefold(), path)
                self.assertNotIn("migrate-openclaw-runtime.py", source, path)

    def test_active_services_never_invoke_the_retired_runtime(self) -> None:
        for path in (ROOT / "system/systemd").glob("*.service"):
            source = path.read_text(encoding="utf-8").casefold()
            self.assertNotIn("openclaw", source, path)
            self.assertNotIn("gateway_bridge", source, path)

    def test_runtime_deploy_installs_canonical_knowledge_directly(self) -> None:
        source = (ROOT / "system/deploy-runtime-update.sh").read_text(encoding="utf-8")
        self.assertIn("list-context-manifest-files.py", source)
        self.assertIn("--channel-instructions", source)
        self.assertIn(".atlas/context/conversation", source)
        self.assertIn(".atlas/runtime/tmp", source)
        self.assertIn(".atlas/config", source)
        self.assertIn('bash "$repo/system/install-context.sh"', source)
        self.assertIn('bash "$repo/system/install-device-connections.sh"', source)
        native = source.index("install-native-broker.sh")
        webscreen = source.index("install-webscreen-resilience.sh")
        self.assertLess(native, webscreen)

    def test_manifest_listing_covers_every_canonical_context_file(self) -> None:
        knowledge = ROOT / ".atlas/context/knowledge"
        result = subprocess.run(
            [sys.executable, str(ROOT / "system/list-context-manifest-files.py"),
             str(knowledge)],
            check=True,
            capture_output=True,
            text=True,
        )
        listed = set(result.stdout.splitlines())
        manifest = json.loads((knowledge / "manifest.json").read_text(encoding="utf-8"))
        runtime_local = set(manifest["runtimeLocalPaths"])
        expected = {"manifest.json"}
        for group in manifest["groups"]:
            for relative in group.get("paths", []):
                if relative not in runtime_local:
                    expected.add(relative)
            for pattern in group.get("globs", []):
                expected.update(
                    path.relative_to(knowledge).as_posix()
                    for path in knowledge.glob(pattern)
                    if path.is_file()
                    and path.relative_to(knowledge).as_posix() not in runtime_local
                )
        self.assertEqual(listed, expected)
        for required in (
            "SOUL.md", "VARIABLES.md",
            "atlas-commands/ATLAS-BROKER.md",
            "atlas-commands/ATLAS-SAY.md",
            "atlas-commands/ATLAS-SCREEN.md",
            "atlas-commands/ATLAS-STATUS.md",
        ):
            self.assertIn(required, listed)

        channel = subprocess.run(
            [sys.executable, str(ROOT / "system/list-context-manifest-files.py"),
             "--channel-instructions", str(knowledge)],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        self.assertEqual(channel, manifest["channelInstructions"])
        self.assertTrue((ROOT / ".atlas/webscreen" / channel).is_file())

    def test_whisper_installer_builds_a_portable_runtime(self) -> None:
        source = (ROOT / "system/rebuild-whisper-runtime.sh").read_text(encoding="utf-8")
        self.assertIn("-DBUILD_SHARED_LIBS=OFF", source)
        self.assertIn("-DCMAKE_BUILD_RPATH=\\$ORIGIN", source)
        self.assertIn('readelf -d "$candidate"', source)
        self.assertIn('ldd "$candidate"', source)
        self.assertIn("Refusing a Whisper root outside", source)

    def test_companion_document_merge_targets_canonical_knowledge(self) -> None:
        with tempfile.TemporaryDirectory(prefix="atlas-companion-docs-") as directory:
            home = Path(directory) / "home"
            workspace = home / ".atlas/context/knowledge"
            backup = home / ".atlas/backups/test"
            (workspace / "atlas-commands").mkdir(parents=True)
            (workspace / "AGENTS.md").write_text("private line\n")
            subprocess.run(
                [sys.executable, str(ROOT / "system/install-companion-docs.py"),
                 str(ROOT), str(home), str(backup)],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertIn("private line", (workspace / "AGENTS.md").read_text())
            self.assertTrue((workspace / "atlas-commands/ATLAS-APP.md").is_file())
            self.assertFalse((home / ".openclaw").exists())

    def test_audio_installer_installs_both_commands_and_private_tmp(self) -> None:
        source = (ROOT / "system/install-device-connections.sh").read_text(encoding="utf-8")
        self.assertIn("/usr/local/bin/atlas-audio", source)
        self.assertIn("/usr/local/bin/atlas-say", source)
        self.assertIn(".atlas/runtime/tmp", source)

    def test_webscreen_generated_and_tracked_units_use_same_network_dependency(self) -> None:
        wrapper = (ROOT / "atlas-commands/atlas-webscreen").read_text(encoding="utf-8")
        unit = (ROOT / "system/systemd/atlas-webscreen.service").read_text(encoding="utf-8")
        for line in ("Wants=NetworkManager.service", "After=NetworkManager.service"):
            self.assertIn(line, wrapper)
            self.assertIn(line, unit)

    def test_status_and_rafas_report_standalone_runtime(self) -> None:
        status = (ROOT / "atlas-commands/atlas-status").read_text(encoding="utf-8")
        rafas = (ROOT / "atlas-commands/atlas-rafas").read_text(encoding="utf-8")
        self.assertNotIn("OpenClaw Gateway", status)
        self.assertIn("Atlas Runtime", status)
        for required in (".atlas/context/knowledge", ".atlas/context/conversation",
                         ".atlas/runtime/tmp", ".atlas/config/secrets.json"):
            self.assertIn(required, status + rafas)

    def test_private_config_and_runtime_state_are_ignored(self) -> None:
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("/.atlas/config/secrets.json", ignore)
        self.assertIn("/.atlas/runtime/tmp/", ignore)
        self.assertIn(".atlas/context/conversation/*", ignore)
        self.assertIn("/.atlas/context/.openclaw-workspace-migrated-v1", ignore)


if __name__ == "__main__":
    unittest.main()
