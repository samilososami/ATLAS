"""Standalone runtime migration fixtures; never inspect the live Pi account."""

from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MIGRATOR = ROOT / "system" / "migrate-openclaw-runtime.py"


class RuntimeMigrationTests(unittest.TestCase):
    def run_migration(self, home: Path, *arguments: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(MIGRATOR), *arguments],
            env={**os.environ, "ATLAS_HOME": str(home)},
            capture_output=True,
            text=True,
        )

    def test_full_workspace_state_and_secrets_migrate_without_leaking_values(self) -> None:
        sentinels = ("tavily-private-value", "eleven-private-value", "voice-private-value")
        unrelated = "must-not-be-migrated"
        with tempfile.TemporaryDirectory(prefix="atlas-migration-") as directory:
            home = Path(directory)
            legacy_workspace = home / ".openclaw" / "workspace"
            legacy_workspace.mkdir(parents=True)
            (legacy_workspace / "AGENTS.md").write_text("legacy private context\n")
            (legacy_workspace / ".private-note").write_text("keep hidden files\n")
            (legacy_workspace / "nested").mkdir()
            (legacy_workspace / "nested" / "NOTE.md").write_text("nested\n")
            (legacy_workspace / "AGENTS.link").symlink_to("AGENTS.md")
            legacy_whisper = home / ".openclaw" / "tools" / "whisper.cpp"
            (legacy_whisper / "models").mkdir(parents=True)
            (legacy_whisper / "models/ggml-tiny.bin").write_bytes(b"tiny-model")
            (legacy_whisper / "main.c").write_text("int main(void) { return 0; }\n")
            (legacy_whisper / "CMakeLists.txt").write_text(
                "cmake_minimum_required(VERSION 3.10)\n"
                "project(whisper_fixture C)\n"
                "set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)\n"
                "add_executable(whisper-cli main.c)\n"
            )
            (legacy_whisper / "build/bin").mkdir(parents=True)
            # A copied legacy build must be ignored rather than trusted.
            (legacy_whisper / "build/bin/legacy-lib").symlink_to(
                "/home/atlas/.openclaw/tools/whisper.cpp/build/bin/libwhisper.so"
            )
            legacy_config = {
                "agents": {"defaults": {"model": {"primary": "openai/gpt-realtime-2.1"}}},
                "plugins": {
                    "entries": {
                        "tavily": {
                            "enabled": True,
                            "config": {"webSearch": {
                                "apiKey": sentinels[0], "baseUrl": "https://api.tavily.test",
                            }},
                        }
                    }
                },
                "skills": {
                    "entries": {
                        "sag": {
                            "apiKey": sentinels[1],
                            "env": {"ELEVENLABS_VOICE_ID": sentinels[2]},
                        }
                    }
                },
                "auth": {"token": unrelated},
            }
            config_path = home / ".openclaw" / "openclaw.json"
            config_path.write_text(json.dumps(legacy_config))
            codex_auth = home / ".codex" / "auth.json"
            codex_auth.parent.mkdir(parents=True)
            codex_auth.write_text('{"account": "untouched"}\n')
            old_context = home / ".atlas" / "context"
            old_context.mkdir(parents=True)
            (old_context / "CONTEXT.md").write_text("conversation\n")
            (old_context / "REVISION").write_text("8\n")
            secrets = home / ".atlas" / "config" / "secrets.json"
            secrets.parent.mkdir(parents=True)
            secrets.write_text(json.dumps({"version": 1, "local": {"preserved": True}}))

            result = self.run_migration(home)
            self.assertEqual(result.returncode, 0, result.stderr)
            combined = result.stdout + result.stderr
            for sentinel in sentinels:
                self.assertNotIn(sentinel, combined)
            self.assertNotIn(unrelated, combined)

            knowledge = old_context / "knowledge"
            conversation = old_context / "conversation"
            self.assertEqual((knowledge / "AGENTS.md").read_text(), "legacy private context\n")
            self.assertEqual((knowledge / ".private-note").read_text(), "keep hidden files\n")
            self.assertEqual((knowledge / "nested" / "NOTE.md").read_text(), "nested\n")
            self.assertTrue((knowledge / "AGENTS.link").is_symlink())
            self.assertEqual(os.readlink(knowledge / "AGENTS.link"), "AGENTS.md")
            self.assertEqual((conversation / "CONTEXT.md").read_text(), "conversation\n")
            self.assertEqual((conversation / "REVISION").read_text(), "8\n")
            self.assertTrue((old_context / ".openclaw-workspace-migrated-v1").is_file())
            self.assertTrue((home / ".openclaw" / "workspace" / "AGENTS.md").is_file())
            self.assertTrue((home / ".openclaw" / "openclaw.json").is_file())
            whisper = home / ".atlas" / "tools" / "whisper.cpp"
            self.assertEqual((whisper / "models/ggml-tiny.bin").read_bytes(), b"tiny-model")
            self.assertTrue((whisper / "build/bin/whisper-cli").is_file())
            self.assertFalse((whisper / "build/bin/legacy-lib").exists())
            dynamic = subprocess.run(
                ["readelf", "-d", str(whisper / "build/bin/whisper-cli")],
                capture_output=True, text=True, check=True,
            ).stdout
            resolved = subprocess.run(
                ["ldd", str(whisper / "build/bin/whisper-cli")],
                capture_output=True, text=True, check=False,
            )
            self.assertNotIn(".openclaw", dynamic.casefold())
            self.assertNotIn(".openclaw", (resolved.stdout + resolved.stderr).casefold())

            migrated = json.loads(secrets.read_text())
            self.assertTrue(migrated["local"]["preserved"])
            self.assertEqual(migrated["tavily"]["apiKey"], sentinels[0])
            self.assertEqual(migrated["elevenlabs"]["apiKey"], sentinels[1])
            self.assertEqual(migrated["elevenlabs"]["voiceId"], sentinels[2])
            self.assertNotIn("openai", migrated)
            self.assertNotIn("auth", migrated)
            self.assertNotIn("baseUrl", migrated["tavily"])
            self.assertNotIn("enabled", migrated["tavily"])
            self.assertEqual(codex_auth.read_text(), '{"account": "untouched"}\n')
            self.assertEqual(stat.S_IMODE(secrets.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE((home / ".atlas/config").stat().st_mode), 0o700)
            self.assertEqual(stat.S_IMODE((home / ".atlas/runtime/tmp").stat().st_mode), 0o700)

            forced = self.run_migration(home, "--force")
            self.assertEqual(forced.returncode, 0, forced.stderr)

            # The marker makes a normal rerun non-destructive for the new tree.
            (knowledge / "AGENTS.md").write_text("new standalone context\n")
            second = self.run_migration(home)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual((knowledge / "AGENTS.md").read_text(), "new standalone context\n")

            # A standalone verification can be used as a deletion gate later.
            failed_verification = self.run_migration(home, "--verify")
            self.assertNotEqual(failed_verification.returncode, 0)
            self.assertIn("knowledge verification failed", failed_verification.stderr)
            self.assertNotIn("AGENTS.md", failed_verification.stderr)
            (knowledge / "AGENTS.md").write_text("legacy private context\n")
            verified = self.run_migration(home, "--verify")
            self.assertEqual(verified.returncode, 0, verified.stderr)
            self.assertIn("Legacy knowledge verification: ok", verified.stdout)
            self.assertIn("Legacy whisper.cpp source/model verification: ok", verified.stdout)
            self.assertIn("Standalone Whisper ELF/link verification: ok", verified.stdout)

    def test_dry_run_does_not_create_atlas_tree(self) -> None:
        with tempfile.TemporaryDirectory(prefix="atlas-migration-dry-") as directory:
            home = Path(directory)
            workspace = home / ".openclaw" / "workspace"
            workspace.mkdir(parents=True)
            (workspace / "README.md").write_text("legacy\n")
            result = self.run_migration(home, "--dry-run")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((home / ".atlas").exists())

    def test_verify_rejects_legacy_whisper_symlink_and_runpath(self) -> None:
        with tempfile.TemporaryDirectory(prefix="atlas-whisper-audit-") as directory:
            home = Path(directory)
            legacy_workspace = home / ".openclaw/workspace"
            knowledge = home / ".atlas/context/knowledge"
            legacy_workspace.mkdir(parents=True)
            knowledge.mkdir(parents=True)
            (legacy_workspace / "README.md").write_text("context\n")
            (knowledge / "README.md").write_text("context\n")

            legacy_whisper = home / ".openclaw/tools/whisper.cpp"
            standalone = home / ".atlas/tools/whisper.cpp"
            for root in (legacy_whisper, standalone):
                (root / "models").mkdir(parents=True)
                (root / "models/ggml-tiny.bin").write_bytes(b"tiny-model")
                (root / "CMakeLists.txt").write_text("source\n")
            (standalone / "build/bin").mkdir(parents=True)
            shutil.copy2("/bin/true", standalone / "build/bin/whisper-cli")

            clean = self.run_migration(home, "--verify")
            self.assertEqual(clean.returncode, 0, clean.stderr)

            poisoned = standalone / "build/bin/libwhisper.so"
            poisoned.symlink_to(
                "/home/atlas/.openclaw/tools/whisper.cpp/build/bin/libwhisper.so"
            )
            linked = self.run_migration(home, "--verify")
            self.assertNotEqual(linked.returncode, 0)
            self.assertIn("unsafe symbolic link", linked.stderr)
            poisoned.unlink()

            source = standalone / "legacy-runpath.c"
            source.write_text("int main(void) { return 0; }\n")
            compiled = subprocess.run([
                "cc", str(source), "-Wl,-rpath,/home/atlas/.openclaw/tools/whisper.cpp/build/bin",
                "-o", str(standalone / "build/bin/whisper-cli"),
            ], capture_output=True, text=True)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            runpath = self.run_migration(home, "--verify")
            self.assertNotEqual(runpath.returncode, 0)
            self.assertIn("OpenClaw RUNPATH", runpath.stderr)

    def test_webscreen_default_model_is_owned_by_atlas_tools(self) -> None:
        server = (ROOT / ".atlas/webscreen/server.py").read_text(encoding="utf-8")
        model_block = server.partition("WHISPER_CPP_MODEL =")[2].partition(
            "WHISPER_CPP_THREADS"
        )[0]
        self.assertIn('ATLAS_HOME / ".atlas" / "tools" / "whisper.cpp" / "models"',
                      " ".join(model_block.split()))
        self.assertNotIn('"ATLAS_WHISPER_CPP_MODEL", MODEL_DIR', server)


if __name__ == "__main__":
    unittest.main()
